import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { compare, hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { MembersRepository } from "../repositories/members.repository";
import { CreateMembersDto } from "../dto/create-members.dto";

type CreatedMemberResult = {
  memberId: string;
  role: string;
  password?: string;
};

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(private readonly repository: MembersRepository) {}

 public async createMembers(dto: CreateMembersDto, tenantId: string, userId: string): Promise<CreatedMemberResult[]> {
    const clinicSlug = this.normalizeClinicName(dto.clinicName);
    
    // Use clinic ID if provided, otherwise use clinic slug
    // This ensures unique member IDs even for clinics with the same name
    const clinicIdentifier = dto.clinicId 
      ? `clinic-${dto.clinicId}` 
      : clinicSlug;

    const definitions: Array<{
      role: string;
      label: string;
      password: string;
      isOwner: boolean;
    }> = [
      {
        role: "owner",
        label: "owner1",
        password: dto.ownerPassword,
        isOwner: true,
      },
      {
        role: "manager",
        label: "manager1",
        password: this.generateRandomPassword(),
        isOwner: false,
      },
      {
        role: "member",
        label: "member1",
        password: this.generateRandomPassword(),
        isOwner: false,
      },
    ];

    const memberIds = definitions.map(
      (definition) => `${definition.label}@${clinicIdentifier}`
    );

    const payload = await Promise.all(
      definitions.map(async (definition) => {
        const memberId = `${definition.label}@${clinicIdentifier}`;
        const passwordHash = await hash(definition.password, 12);

        const memberData = {
          member_id: memberId,
          role: definition.role,
          password_hash: passwordHash,
          tenant_id: tenantId,
          clinic_name: clinicSlug,
          created_by: userId,
          full_name: definition.isOwner ? dto.ownerName : undefined,
          phone_number: definition.isOwner ? dto.ownerPhoneNumber : undefined,
          id_card_number: definition.isOwner ? dto.ownerIdCardNumber : undefined,
          address: definition.isOwner ? dto.ownerAddress : undefined,
        };

        return {
          memberId,
          memberData,
          result: {
            memberId,
            role: definition.role,
            password: definition.isOwner ? undefined : definition.password,
          },
        };
      })
    );

    try {
      // If edit mode, update existing members; otherwise create new members
      if (dto.isEditMode === true) {
        // Edit mode: update existing members
        const existingMembers = await this.repository.findManyByMemberIds(memberIds, tenantId);
        const existingMemberIds = new Set(
          existingMembers.map((m: { member_id: string }) => m.member_id)
        );

        const membersToUpdate = payload.filter((item) =>
          existingMemberIds.has(item.memberId)
        );

        if (membersToUpdate.length > 0) {
          await this.repository.upsertMany(
            membersToUpdate.map((item) => ({
              where: { member_id: item.memberId, tenant_id: tenantId },
              create: item.memberData,
              update: {
                password_hash: item.memberData.password_hash,
                full_name: item.memberData.full_name,
                phone_number: item.memberData.phone_number,
                id_card_number: item.memberData.id_card_number,
                address: item.memberData.address,
              },
            })),
            tenantId
          );
        }
      } else {
        // Create mode: check if members already exist, if so throw error
        const existingMembers = await this.repository.findManyByMemberIds(memberIds, tenantId);
        if (existingMembers.length > 0) {
          const existingMemberIds = existingMembers.map((m: { member_id: string }) => m.member_id);
          throw new Error(
            `Members with IDs [${existingMemberIds.join(", ")}] already exist. Cannot create duplicate members.`
          );
        }
        
        // Create new members only if they don't exist
        await this.repository.createMany(
          payload.map((item) => ({
            data: item.memberData,
          })),
          tenantId
        );
      }
    } catch (error) {
      this.logger.error(
        dto.isEditMode
          ? "Failed to update members"
          : "Failed to create members",
        error instanceof Error ? error.stack : String(error)
      );
      throw error;
    }

    return payload.map((item) => item.result);
  }

  private normalizeClinicName(name: string): string {
    return name.replace(/[^a-zA-Z0-9]+/g, " ").trim().replace(/\s+/g, "");
  }

  private generateRandomPassword(): string {
    return randomBytes(8).toString("base64url");
  }

  public async login(memberId: string, password: string, tenantId?: string) {
    // Find member by member_id (which is unique globally)
    // If tenantId is provided, also filter by tenant_id for extra security
    const member = await this.repository.findByMemberId(memberId, tenantId);
  
    if (!member) {
      throw new UnauthorizedException("Invalid member ID or password");
    }
  
    const isValid = await compare(password, member.password_hash);
    if (!isValid) {
      throw new UnauthorizedException("Invalid member ID or password");
    }
  
    // Return member data including tenant_id for frontend to use
    return {
      message: "You successfully login",
      member: {
        id: member.id,
        member_id: member.member_id,
        role: member.role,
        tenant_id: member.tenant_id,
        clinic_name: member.clinic_name,
        full_name: member.full_name,
      },
    };
  }
}

