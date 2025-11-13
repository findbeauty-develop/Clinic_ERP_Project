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

    const payload = await Promise.all(
      definitions.map(async (definition) => {
        const memberId = `${definition.label}@${clinicSlug}`;
        const passwordHash = await hash(definition.password, 12);

        return {
          createArgs: {
            data: {
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
            },
          },
          result: {
            memberId,
            role: definition.role,
            password: definition.isOwner ? undefined : definition.password,
          },
        };
      })
    );

    try {
      await this.repository.createMany(payload.map((item) => item.createArgs));
    } catch (error) {
      this.logger.error("Failed to create members", error instanceof Error ? error.stack : String(error));
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

  public async login(memberId: string, password: string) {
    const member = await this.repository.findByMemberId(memberId);
  
    if (!member) {
      throw new UnauthorizedException("Invalid member ID or password");
    }
  
    const isValid = await compare(password, member.password_hash);
    if (!isValid) {
      throw new UnauthorizedException("Invalid member ID or password");
    }
  
    return { message: "You successfully login" };
  }
}

