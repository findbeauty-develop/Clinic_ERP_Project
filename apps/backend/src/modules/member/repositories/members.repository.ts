import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";
import { Prisma } from "@prisma/client";

type MemberCreateArgs = Prisma.MemberCreateArgs;

@Injectable()
export class MembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  createMany(data: MemberCreateArgs[], tenantId: string) {
    return this.prisma.$transaction(
      data.map((entry) =>
        this.prisma.member.create({
          data: {
            ...entry.data,
            tenant_id: tenantId,
          },
        })
      )
    );
  }

  upsertMany(
    data: Array<{ where: { member_id: string; tenant_id: string }; create: MemberCreateArgs["data"]; update: Partial<MemberCreateArgs["data"]> }>,
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
    return this.prisma.member.findFirst({
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
}

