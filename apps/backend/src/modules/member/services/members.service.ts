import {
  Injectable,
  Logger,
  UnauthorizedException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { compare, hash } from "bcryptjs";
import { sign, SignOptions, verify } from "jsonwebtoken";
import { Response } from "express";
import { MembersRepository } from "../repositories/members.repository";
import { CreateMembersDto } from "../dto/create-members.dto";
import { MessageService } from "./message.service";
import { EmailService } from "./email.service";

type CreatedMemberResult = {
  memberId: string;
  role: string;
  password?: string;
};

type MemberRoleDefinition = {
  role: string;
  label: string;
  password: string;
  isOwner: boolean;
  isTemporary: boolean;
};

/** `findByMemberId` natijasi — JWT va login javobi uchun kerakli maydonlar. */
type MemberAuthRecord = {
  id: string;
  member_id: string;
  tenant_id: string;
  role: string;
  clinic_name: string | null;
  full_name: string | null;
  must_change_password: boolean | null;
  password_hash: string;
};

type CreateMembersPayloadEntry = {
  memberId: string;
  memberData: {
    member_id: string;
    role: string;
    password_hash: string;
    tenant_id: string;
    clinic_name: string;
    created_by: string;
    must_change_password: boolean;
    full_name?: string;
    phone_number?: string;
    id_card_number?: string;
    address?: string;
  };
  result: CreatedMemberResult;
};

@Injectable()
export class MembersService {
  private static readonly PASSWORD_SALT_ROUNDS = 12;

  private readonly logger = new Logger(MembersService.name);

  constructor(
    private readonly repository: MembersRepository,
    private readonly messageService: MessageService,
    private readonly emailService: EmailService
  ) {}

  public async getMembers(tenantId: string) {
    return this.repository.findByTenant(tenantId);
  }

  public async createMembers(
    dto: CreateMembersDto,
    tenantId: string,
    userId: string
  ): Promise<CreatedMemberResult[]> {
    const clinicSlug = this.getClinicSlug(dto);
    const clinicIdentifier = this.getClinicIdentifier(dto, clinicSlug);
    const roleDefinitions = this.buildMemberRoleDefinitions(dto);
    const memberIds = roleDefinitions.map((d) =>
      this.buildMemberId(d.label, clinicIdentifier)
    );
    const payload = await this.buildCreateMembersPayload(
      roleDefinitions,
      dto,
      clinicIdentifier,
      clinicSlug,
      tenantId,
      userId
    );

    await this.saveCreatedOrUpdatedMembers(dto, payload, memberIds, tenantId);
    await this.sendOwnerCredentialsIfNeeded(
      dto,
      roleDefinitions,
      clinicIdentifier
    );

    return this.mapPayloadToCreatedResults(payload);
  }

  /** `clinic_name` maydoni uchun (member_id dagi identifier bilan farq qilishi mumkin). */
  private getClinicSlug(dto: CreateMembersDto): string {
    return this.normalizeClinicName(dto.clinicName);
  }

  /** `owner1@...` formatidagi suffix: ingliz nomi bo'lsa u, aks holda clinic slug. */
  private getClinicIdentifier(
    dto: CreateMembersDto,
    clinicSlug: string
  ): string {
    return dto.clinicEnglishName
      ? this.normalizeClinicName(dto.clinicEnglishName)
      : clinicSlug;
  }

  private buildMemberRoleDefinitions(
    dto: CreateMembersDto
  ): MemberRoleDefinition[] {
    return [
      {
        role: "owner",
        label: "owner1",
        password: dto.ownerPassword,
        isOwner: true,
        isTemporary: false,
      },
      {
        role: "manager",
        label: "manager1",
        password: this.generateTemporaryPassword(),
        isOwner: false,
        isTemporary: true,
      },
      {
        role: "member",
        label: "member1",
        password: this.generateTemporaryPassword(),
        isOwner: false,
        isTemporary: true,
      },
    ];
  }

  private async buildCreateMembersPayload(
    definitions: MemberRoleDefinition[],
    dto: CreateMembersDto,
    clinicIdentifier: string,
    clinicSlug: string,
    tenantId: string,
    userId: string
  ): Promise<CreateMembersPayloadEntry[]> {
    return Promise.all(
      definitions.map(async (definition) => {
        const memberId = this.buildMemberId(definition.label, clinicIdentifier);
        const passwordHash = await hash(
          definition.password,
          MembersService.PASSWORD_SALT_ROUNDS
        );

        const memberData: CreateMembersPayloadEntry["memberData"] = {
          member_id: memberId,
          role: definition.role,
          password_hash: passwordHash,
          tenant_id: tenantId,
          clinic_name: clinicSlug,
          created_by: userId,
          must_change_password: definition.isTemporary,
          full_name: definition.isOwner ? dto.ownerName : undefined,
          phone_number: definition.isOwner ? dto.ownerPhoneNumber : undefined,
          id_card_number: definition.isOwner
            ? dto.ownerIdCardNumber
            : undefined,
          address: definition.isOwner ? dto.ownerAddress : undefined,
        };

        return {
          memberId,
          memberData,
          result: {
            memberId,
            role: definition.role,
            password: definition.password,
          },
        };
      })
    );
  }

  private async saveCreatedOrUpdatedMembers(
    dto: CreateMembersDto,
    payload: CreateMembersPayloadEntry[],
    memberIds: string[],
    tenantId: string
  ): Promise<void> {
    try {
      if (dto.isEditMode === true) {
        const existingMembers = await this.repository.findManyByMemberIds(
          memberIds,
          tenantId
        );
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
        const existingMembers =
          await this.repository.findManyByMemberIdsGlobal(memberIds);
        if (existingMembers.length > 0) {
          const existingMemberIds = existingMembers.map(
            (m: { member_id: string; tenant_id: string }) =>
              `${m.member_id} (tenant: ${m.tenant_id})`
          );
          throw new Error(
            `Members with IDs already exist in database: [${existingMemberIds.join(
              ", "
            )}]. Cannot create duplicate members. member_id must be unique across all tenants.`
          );
        }

        await this.repository.createMany(
          payload.map((item) => item.memberData),
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
  }

  private async sendOwnerCredentialsIfNeeded(
    dto: CreateMembersDto,
    definitions: MemberRoleDefinition[],
    clinicIdentifier: string
  ): Promise<void> {
    if (dto.isEditMode || !dto.ownerPhoneNumber) {
      return;
    }

    const allMembers = definitions.map((definition) => {
      const memberId = this.buildMemberId(definition.label, clinicIdentifier);
      return {
        memberId,
        role: definition.role,
        temporaryPassword: definition.password,
      };
    });

    try {
      await this.messageService.sendMemberCredentials(
        dto.ownerPhoneNumber,
        dto.clinicName,
        allMembers
      );
    } catch (error) {
      this.logger.warn("Failed to send SMS to owner", error);
    }

    if (!dto.ownerEmail) {
      return;
    }

    try {
      const templateId = parseInt(
        process.env.BREVO_MEMBER_CREDENTIALS_TEMPLATE_ID || "0",
        10
      );

      if (templateId > 0) {
        await this.emailService.sendMemberCredentialsEmailWithTemplate(
          dto.ownerEmail,
          templateId,
          dto.clinicName,
          allMembers
        );
      } else {
        await this.emailService.sendMemberCredentialsEmail(
          dto.ownerEmail,
          dto.clinicName,
          allMembers
        );
      }
    } catch (error) {
      this.logger.warn("Failed to send email to owner", error);
    }
  }

  private mapPayloadToCreatedResults(
    payload: CreateMembersPayloadEntry[]
  ): CreatedMemberResult[] {
    return payload.map((item) => item.result);
  }

  private buildMemberId(label: string, clinicIdentifier: string): string {
    return `${label}@${clinicIdentifier}`;
  }

  private resolveAccessTokenSecret(): string | undefined {
    return (
      process.env.MEMBER_JWT_SECRET ??
      process.env.SUPABASE_JWT_SECRET ??
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  /** Login paytida refresh token imzolash — avvalgi `??` tartibi saqlangan. */
  private resolveRefreshSecretForNewTokens(
    accessSecret: string
  ): string | undefined {
    return (
      process.env.MEMBER_JWT_REFRESH_SECRET ??
      process.env.MEMBER_JWT_SECRET ??
      accessSecret
    );
  }

  /** Refresh endpoint verify — `login` dagi zanjirdan farq qiladi (to'liq fallback). */
  private resolveRefreshSecretForVerification(): string | undefined {
    return (
      process.env.MEMBER_JWT_REFRESH_SECRET ??
      process.env.MEMBER_JWT_SECRET ??
      process.env.SUPABASE_JWT_SECRET ??
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  private buildAccessTokenJwtPayload(member: MemberAuthRecord) {
    return {
      sub: member.id,
      member_id: member.member_id,
      tenant_id: member.tenant_id,
      roles: [member.role],
      clinic_name: member.clinic_name,
      must_change_password: member.must_change_password || false,
      type: "access" as const,
    };
  }

  private buildRefreshTokenJwtPayload(member: MemberAuthRecord) {
    return {
      sub: member.id,
      member_id: member.member_id,
      tenant_id: member.tenant_id,
      type: "refresh" as const,
    };
  }

  private mapMemberToAuthResponse(member: MemberAuthRecord) {
    return {
      id: member.id,
      member_id: member.member_id,
      role: member.role,
      tenant_id: member.tenant_id,
      clinic_name: member.clinic_name,
      full_name: member.full_name,
      mustChangePassword: member.must_change_password || false,
    };
  }

  private async validateMemberCredentialsForLogin(
    memberId: string,
    password: string,
    tenantId?: string
  ): Promise<MemberAuthRecord> {
    const member = (await this.repository.findByMemberId(
      memberId,
      tenantId
    )) as MemberAuthRecord | null;

    if (!member) {
      throw new UnauthorizedException("Invalid member ID or password");
    }

    const isValid = await compare(password, member.password_hash);
    if (!isValid) {
      throw new UnauthorizedException("Invalid member ID or password");
    }

    return member;
  }

  private signMemberAccessToken(member: MemberAuthRecord, secret: string): string {
    const accessTokenExpiresIn = process.env.MEMBER_JWT_EXPIRES_IN || "15m";
    return sign(
      this.buildAccessTokenJwtPayload(member),
      secret,
      { expiresIn: accessTokenExpiresIn } as SignOptions
    );
  }

  private signMemberRefreshToken(
    member: MemberAuthRecord,
    refreshSecret: string,
    refreshTokenExpiresIn: string
  ): string {
    return sign(
      this.buildRefreshTokenJwtPayload(member),
      refreshSecret,
      { expiresIn: refreshTokenExpiresIn } as SignOptions
    );
  }

  private computeRefreshTokenExpiry(refreshTokenExpiresIn: string): Date {
    const expiresAt = new Date();
    if (refreshTokenExpiresIn.endsWith("d")) {
      const days = parseInt(refreshTokenExpiresIn.replace("d", ""), 10);
      expiresAt.setDate(expiresAt.getDate() + days);
    } else if (refreshTokenExpiresIn.endsWith("h")) {
      const hours = parseInt(refreshTokenExpiresIn.replace("h", ""), 10);
      expiresAt.setHours(expiresAt.getHours() + hours);
    } else if (refreshTokenExpiresIn.endsWith("m")) {
      const minutes = parseInt(refreshTokenExpiresIn.replace("m", ""), 10);
      expiresAt.setMinutes(expiresAt.getMinutes() + minutes);
    } else {
      expiresAt.setDate(expiresAt.getDate() + 7);
    }
    return expiresAt;
  }

  private setLoginRefreshTokenCookie(res: Response, refreshToken: string): void {
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });
  }

  private buildLoginSuccessResponse(
    member: MemberAuthRecord,
    accessToken: string,
    refreshToken: string,
    opts?: { exposeRefreshTokenInBody?: boolean }
  ) {
    const base = {
      message: "You successfully login",
      access_token: accessToken,
      member: this.mapMemberToAuthResponse(member),
    };

    if (opts?.exposeRefreshTokenInBody) {
      return { ...base, refresh_token: refreshToken };
    }
    return base;
  }

  private normalizeClinicName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, "");
  }

  /**
   * Temporary password generate qilish (8-12 belgili, harflar va raqamlar)
   */
  private generateTemporaryPassword(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let password = "";
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  public async login(
    memberId: string,
    password: string,
    tenantId?: string,
    res?: Response,
    opts?: { exposeRefreshTokenInBody?: boolean }
  ) {
    try {
      const member = await this.validateMemberCredentialsForLogin(
        memberId,
        password,
        tenantId
      );

      const secret = this.resolveAccessTokenSecret();
      const refreshSecret = this.resolveRefreshSecretForNewTokens(secret ?? "");

      if (!secret) {
        this.logger.error(
          "Missing MEMBER_JWT_SECRET or Supabase secret for issuing member tokens"
        );
        throw new UnauthorizedException("Authentication not configured");
      }

      if (!refreshSecret) {
        this.logger.error(
          "Missing MEMBER_JWT_REFRESH_SECRET for issuing refresh tokens"
        );
        throw new UnauthorizedException("Refresh token secret not configured");
      }

      const accessToken = this.signMemberAccessToken(member, secret);
      const refreshTokenExpiresIn =
        process.env.MEMBER_JWT_REFRESH_EXPIRES_IN || "7d";
      const refreshToken = this.signMemberRefreshToken(
        member,
        refreshSecret,
        refreshTokenExpiresIn
      );
      const expiresAt = this.computeRefreshTokenExpiry(refreshTokenExpiresIn);

      await this.repository.saveRefreshToken(member.id, refreshToken, expiresAt);

      if (res) {
        this.setLoginRefreshTokenCookie(res, refreshToken);
      }

      return this.buildLoginSuccessResponse(
        member,
        accessToken,
        refreshToken,
        opts
      );
    } catch (error: any) {
      // Handle database connection errors
      const errorMessage = error?.message || String(error);
      if (
        errorMessage.includes("Can't reach database server") ||
        errorMessage.includes("P1001") ||
        errorMessage.includes("connect") ||
        errorMessage.includes("timeout") ||
        error?.code === "P1001"
      ) {
        this.logger.error(
          "Database connection error during login",
          errorMessage
        );
        throw new ServiceUnavailableException(
          "Database server is currently unavailable. Please try again later."
        );
      }
      // Re-throw other errors (UnauthorizedException, etc.)
      throw error;
    }
  }

  public async refreshAccessToken(refreshToken: string) {
    try {
      const refreshSecret = this.resolveRefreshSecretForVerification();

      if (!refreshSecret) {
        throw new UnauthorizedException("Refresh token secret not configured");
      }

      const payload = verify(refreshToken, refreshSecret) as any;

      if (payload.type !== "refresh") {
        throw new UnauthorizedException("Invalid token type");
      }

      const isValid = await this.repository.isRefreshTokenValid(
        payload.sub,
        refreshToken
      );

      if (!isValid) {
        throw new UnauthorizedException("Invalid or expired refresh token");
      }

      const member = (await this.repository.findByMemberId(
        payload.member_id
      )) as MemberAuthRecord | null;

      if (!member) {
        throw new UnauthorizedException("Member not found");
      }

      const secret = this.resolveAccessTokenSecret();

      if (!secret) {
        throw new UnauthorizedException("JWT secret not configured");
      }

      const accessToken = this.signMemberAccessToken(member, secret);

      const result = {
        access_token: accessToken,
        member: this.mapMemberToAuthResponse(member),
      };

      return result;
    } catch (error: any) {
      this.logger.error(
        "Refresh token error:",
        error?.message || String(error)
      );
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
  }

  public async logout(refreshToken: string) {
    const successBody = { message: "Successfully logged out" };
    try {
      await this.repository.revokeRefreshToken(refreshToken);
      return successBody;
    } catch (error: any) {
      this.logger.error("Logout error:", error?.message || String(error));
      return successBody;
    }
  }

  public async logoutAll(memberId: string) {
    try {
      // Barcha refresh token'larni invalid qilish
      await this.repository.revokeAllMemberTokens(memberId);
      return { message: "Successfully logged out from all devices" };
    } catch (error: any) {
      this.logger.error("Logout all error:", error?.message || String(error));
      throw error;
    }
  }

  /**
   * Password o'zgartirish (birinchi login'da temporary password'ni o'zgartirish uchun)
   */
  public async changePassword(
    memberId: string,
    currentPassword: string,
    newPassword: string,
    tenantId?: string
  ): Promise<void> {
    try {
      const member = await this.repository.findByMemberId(memberId, tenantId);

      if (!member) {
        throw new UnauthorizedException("Member not found");
      }

      // ✅ Current password'ni tekshirish (agar berilgan bo'lsa)
      // Phone verification bilan password o'zgartirishda currentPassword bo'sh bo'lishi mumkin
      if (currentPassword && currentPassword.trim() !== "") {
        const isPasswordValid = await compare(
          currentPassword,
          member.password_hash
        );
        if (!isPasswordValid) {
          throw new UnauthorizedException("Current password is incorrect");
        }
      }

      // Yangi password'ni hash qilish
      const newPasswordHash = await hash(
        newPassword,
        MembersService.PASSWORD_SALT_ROUNDS
      );

      // Password'ni yangilash va must_change_password'ni false qilish
      await this.repository.update(member.id, {
        password_hash: newPasswordHash,
        must_change_password: false,
        updated_at: new Date(),
      });
    } catch (error) {
      this.logger.error(`Failed to change password for ${memberId}`, error);
      throw error;
    }
  }
}
