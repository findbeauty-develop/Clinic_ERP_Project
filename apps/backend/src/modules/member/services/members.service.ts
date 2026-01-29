import {
  Injectable,
  Logger,
  UnauthorizedException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { compare, hash } from "bcryptjs";
import { randomBytes } from "crypto";
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

@Injectable()
export class MembersService {
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
    const clinicSlug = this.normalizeClinicName(dto.clinicName);

    // Use English name if available, otherwise use clinic name
    // Format: member1@EnglishName or member1@ClinicName
    const clinicIdentifier = dto.clinicEnglishName
      ? this.normalizeClinicName(dto.clinicEnglishName)
      : clinicSlug;

    const definitions: Array<{
      role: string;
      label: string;
      password: string;
      isOwner: boolean;
      isTemporary: boolean;
    }> = [
      {
        role: "owner",
        label: "owner1",
        password: dto.ownerPassword,
        isOwner: true,
        isTemporary: false, // Owner o'z password'ini tanlaydi
      },
      {
        role: "manager",
        label: "manager1",
        password: this.generateTemporaryPassword(),
        isOwner: false,
        isTemporary: true, // Temporary password
      },
      {
        role: "member",
        label: "member1",
        password: this.generateTemporaryPassword(),
        isOwner: false,
        isTemporary: true, // Temporary password
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
          must_change_password: definition.isTemporary, // Temporary password bo'lsa, birinchi login'da o'zgartirish majburiy
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
            password: definition.password, // ✅ Owner'ning password'ini ham qaytarish
          },
        };
      })
    );

    try {
      // If edit mode, update existing members; otherwise create new members
      if (dto.isEditMode === true) {
        // Edit mode: update existing members
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
        // Create mode: check if members already exist GLOBALLY (member_id is unique across all tenants)
        const existingMembers = await this.repository.findManyByMemberIdsGlobal(
          memberIds
        );
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

        // Create new members only if they don't exist
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
    // Ownerga barcha memberlarning (owner, manager, member) ID va passwordlari yuboriladi
    if (!dto.isEditMode && dto.ownerPhoneNumber) {
      // Barcha memberlarni (owner, manager, member) formatlash
      const allMembers = definitions.map((definition) => {
        const memberId = `${definition.label}@${clinicIdentifier}`;
        return {
          memberId: memberId,
          role: definition.role,
          temporaryPassword: definition.password, // Owner, manager, member - hammasining password'i
        };
      });

      // SMS yuborish
      try {
        await this.messageService.sendMemberCredentials(
          dto.ownerPhoneNumber,
          dto.clinicName,
          allMembers // Barcha memberlarni (owner, manager, member) yuborish
        );
      } catch (error) {
        this.logger.warn("Failed to send SMS to owner", error);
        // Continue even if SMS fails - don't throw error
      }

      // Email yuborish (agar email mavjud bo'lsa)
      if (dto.ownerEmail) {
        try {
          // Template ID'ni environment variable'dan olish
          const templateId = parseInt(
            process.env.BREVO_MEMBER_CREDENTIALS_TEMPLATE_ID || "0",
            10
          );

          if (templateId > 0) {
            // Template ishlatish
            await this.emailService.sendMemberCredentialsEmailWithTemplate(
              dto.ownerEmail,
              templateId,
              dto.clinicName,
              allMembers
            );
          } else {
            // Oddiy HTML email (fallback)
            await this.emailService.sendMemberCredentialsEmail(
              dto.ownerEmail,
              dto.clinicName,
              allMembers
            );
          }
        } catch (error) {
          this.logger.warn("Failed to send email to owner", error);
          // Continue even if email fails - don't throw error
        }
      }
    }

    return payload.map((item) => item.result);
  }

  private normalizeClinicName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, "");
  }

  private generateRandomPassword(): string {
    return randomBytes(8).toString("base64url");
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
    res?: Response
  ) {
    try {
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

      const secret =
        process.env.MEMBER_JWT_SECRET ??
        process.env.SUPABASE_JWT_SECRET ??
        process.env.SUPABASE_SERVICE_ROLE_KEY;

      const refreshSecret =
        process.env.MEMBER_JWT_REFRESH_SECRET ??
        process.env.MEMBER_JWT_SECRET ??
        secret;

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

      // Access token - qisqa muddat (15 minut)
      const accessTokenExpiresIn =
        process.env.MEMBER_JWT_EXPIRES_IN || "15m";
      const accessToken = sign(
        {
          sub: member.id,
          member_id: member.member_id,
          tenant_id: member.tenant_id,
          roles: [member.role],
          clinic_name: member.clinic_name,
          must_change_password: member.must_change_password || false,
          type: "access",
        },
        secret as string,
        { expiresIn: accessTokenExpiresIn } as SignOptions
      );

      // Refresh token - uzoq muddat (7 kun)
      const refreshTokenExpiresIn =
        process.env.MEMBER_JWT_REFRESH_EXPIRES_IN || "7d";
      const refreshToken = sign(
        {
          sub: member.id,
          member_id: member.member_id,
          tenant_id: member.tenant_id,
          type: "refresh",
        },
        refreshSecret as string,
        { expiresIn: refreshTokenExpiresIn } as SignOptions
      );

      // Refresh token'ni database'ga saqlash
      const expiresAt = new Date();
      if (refreshTokenExpiresIn.endsWith("d")) {
        const days = parseInt(refreshTokenExpiresIn.replace("d", ""));
        expiresAt.setDate(expiresAt.getDate() + days);
      } else if (refreshTokenExpiresIn.endsWith("h")) {
        const hours = parseInt(refreshTokenExpiresIn.replace("h", ""));
        expiresAt.setHours(expiresAt.getHours() + hours);
      } else if (refreshTokenExpiresIn.endsWith("m")) {
        const minutes = parseInt(refreshTokenExpiresIn.replace("m", ""));
        expiresAt.setMinutes(expiresAt.getMinutes() + minutes);
      } else {
        // Default: 7 days
        expiresAt.setDate(expiresAt.getDate() + 7);
      }

      await this.repository.saveRefreshToken(member.id, refreshToken, expiresAt);

      // HttpOnly cookie'ga refresh token saqlash
      if (res) {
        const isProduction = process.env.NODE_ENV === "production";
        res.cookie("refresh_token", refreshToken, {
          httpOnly: true, // ✅ JavaScript'dan o'qib bo'lmaydi
          secure: isProduction, // ✅ HTTPS'da ishlaydi
          sameSite: "strict", // ✅ CSRF himoya
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          path: "/",
        });
      }

      const mustChangePassword = member.must_change_password || false;

      return {
        message: "You successfully login",
        access_token: accessToken, // ✅ Faqat access token qaytariladi
        member: {
          id: member.id,
          member_id: member.member_id,
          role: member.role,
          tenant_id: member.tenant_id,
          clinic_name: member.clinic_name,
          full_name: member.full_name,
          mustChangePassword: mustChangePassword,
        },
      };
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
      const refreshSecret =
        process.env.MEMBER_JWT_REFRESH_SECRET ??
        process.env.MEMBER_JWT_SECRET ??
        process.env.SUPABASE_JWT_SECRET ??
        process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!refreshSecret) {
        throw new UnauthorizedException("Refresh token secret not configured");
      }

      // Refresh token'ni verify qilish
      const payload = verify(refreshToken, refreshSecret) as any;

      if (payload.type !== "refresh") {
        throw new UnauthorizedException("Invalid token type");
      }

      // Database'da refresh token mavjudligini tekshirish
      const isValid = await this.repository.isRefreshTokenValid(
        payload.sub,
        refreshToken
      );

      if (!isValid) {
        throw new UnauthorizedException("Invalid or expired refresh token");
      }

      // Member'ni topish
      const member = await this.repository.findByMemberId(payload.member_id);

      if (!member) {
        throw new UnauthorizedException("Member not found");
      }

      // Yangi access token yaratish
      const secret =
        process.env.MEMBER_JWT_SECRET ??
        process.env.SUPABASE_JWT_SECRET ??
        process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!secret) {
        throw new UnauthorizedException("JWT secret not configured");
      }

      const accessTokenExpiresIn =
        process.env.MEMBER_JWT_EXPIRES_IN || "15m";

      const accessToken = sign(
        {
          sub: member.id,
          member_id: member.member_id,
          tenant_id: member.tenant_id,
          roles: [member.role],
          clinic_name: member.clinic_name,
          must_change_password: member.must_change_password || false,
          type: "access",
        },
        secret as string,
        { expiresIn: accessTokenExpiresIn } as SignOptions
      );

      const result = {
        access_token: accessToken,
        member: {
          id: member.id,
          member_id: member.member_id,
          role: member.role,
          tenant_id: member.tenant_id,
          clinic_name: member.clinic_name,
          full_name: member.full_name,
          mustChangePassword: member.must_change_password || false,
        },
      };

      this.logger.log(`[Refresh] Returning member data for: ${member.member_id}`);
      return result;
    } catch (error: any) {
      this.logger.error("Refresh token error:", error?.message || String(error));
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
  }

  public async logout(refreshToken: string) {
    try {
      // Refresh token'ni database'dan invalid qilish
      await this.repository.revokeRefreshToken(refreshToken);
      return { message: "Successfully logged out" };
    } catch (error: any) {
      this.logger.error("Logout error:", error?.message || String(error));
      // Logout'da xatolik bo'lsa ham success qaytarish (token allaqachon invalid bo'lishi mumkin)
      return { message: "Successfully logged out" };
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
      const newPasswordHash = await hash(newPassword, 12);

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
