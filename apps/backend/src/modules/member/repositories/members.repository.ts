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

  findByMemberId(memberId: string, tenantId?: string) {
    const where: any = { member_id: memberId };
    if (tenantId) {
      where.tenant_id = tenantId;
    }
    // Use executeWithRetry to handle connection errors gracefully
    return this.prisma.executeWithRetry(async () => {
      return await this.prisma.member.findFirst({
        where,
      });
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

  update(id: string, data: Partial<MemberCreateInput>) {
    return this.prisma.member.update({
      where: { id },
      data,
    });
  }
}
