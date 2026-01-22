import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";
type NullableString = string | null | undefined;

interface MemberCreateInput {
  id?: string;
  member_id: string;
  tenant_id?: string;
  role: string;
  password_hash: string;
  clinic_name: string;
  must_change_password?: boolean;
  full_name?: NullableString;
  phone_number?: NullableString;
  id_card_number?: NullableString;
  address?: NullableString;
  created_at?: Date | string;
  created_by?: NullableString;
  updated_at?: Date | string | null;
  updated_by?: NullableString;
}

@Injectable()
export class MembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  createMany(data: MemberCreateInput[], tenantId: string) {
    return this.prisma.$transaction(
      data.map((entry) =>
        this.prisma.member.create({
          data: {
            ...entry,
            tenant_id: tenantId,
          },
        })
      )
    );
  }

  upsertMany(
    data: Array<{
      where: { member_id: string; tenant_id: string };
      create: MemberCreateInput;
      update: Partial<MemberCreateInput>;
    }>,
    tenantId: string
  ) {
    return this.prisma.$transaction(
      data.map((entry) =>
        this.prisma.member.upsert({
          where: {
            member_id: entry.where.member_id,
            tenant_id: tenantId,
          },
          create: {
            ...entry.create,
            tenant_id: tenantId,
          },
          update: entry.update,
        })
      )
    );
  }

  async findByTenant(tenantId: string) {
    return await this.prisma.member.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        member_id: true,
        role: true,
        full_name: true,
        clinic_name: true,
        created_at: true,
      },
    });
  }

  async findByMemberId(memberId: string, tenantId?: string) {
    const where: any = { member_id: memberId };
    if (tenantId) {
      where.tenant_id = tenantId;
    }
    return await this.prisma.member.findFirst({
      where,
    });
  }

  findManyByMemberIds(memberIds: string[], tenantId: string) {
    return this.prisma.member.findMany({
      where: {
        member_id: {
          in: memberIds,
        },
        tenant_id: tenantId,
      },
    });
  }

  // Check if member_id exists globally (across all tenants)
  findManyByMemberIdsGlobal(memberIds: string[]) {
    return this.prisma.member.findMany({
      where: {
        member_id: {
          in: memberIds,
        },
      },
      select: {
        member_id: true,
        tenant_id: true,
      },
    });
  }

  update(id: string, data: Partial<MemberCreateInput>) {
    return this.prisma.member.update({
      where: { id },
      data,
    });
  }

  // Refresh Token methods
  async saveRefreshToken(memberId: string, token: string, expiresAt: Date) {
    return this.prisma.refreshToken.create({
      data: {
        member_id: memberId,
        token,
        expires_at: expiresAt,
      },
    });
  }

  async findRefreshToken(token: string) {
    return this.prisma.refreshToken.findUnique({
      where: { token },
      include: { member: true },
    });
  }

  async isRefreshTokenValid(memberId: string, token: string): Promise<boolean> {
    const refreshToken = await this.prisma.refreshToken.findFirst({
      where: {
        token,
        member_id: memberId,
        revoked: false,
        expires_at: {
          gt: new Date(),
        },
      },
    });
    return !!refreshToken;
  }

  async revokeRefreshToken(token: string) {
    return this.prisma.refreshToken.update({
      where: { token },
      data: {
        revoked: true,
        revoked_at: new Date(),
      },
    });
  }

  async revokeAllMemberTokens(memberId: string) {
    return this.prisma.refreshToken.updateMany({
      where: {
        member_id: memberId,
        revoked: false,
      },
      data: {
        revoked: true,
        revoked_at: new Date(),
      },
    });
  }

  async deleteExpiredTokens() {
    return this.prisma.refreshToken.deleteMany({
      where: {
        expires_at: {
          lt: new Date(),
        },
      },
    });
  }
}
