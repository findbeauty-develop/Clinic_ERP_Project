import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";

type MemberCreateArgs = Parameters<PrismaService["member"]["create"]>[0];

@Injectable()
export class MembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  createMany(data: MemberCreateArgs[]) {
    return this.prisma.$transaction(data.map((entry) => this.prisma.member.create(entry)));
  }

  upsertMany(data: Array<{ where: { member_id: string }; create: MemberCreateArgs["data"]; update: Partial<MemberCreateArgs["data"]> }>) {
    return this.prisma.$transaction(
      data.map((entry) => this.prisma.member.upsert({
        where: entry.where,
        create: entry.create,
        update: entry.update,
      }))
    );
  }

  findByMemberId(memberId: string) {
    return this.prisma.member.findUnique({
      where: { member_id: memberId },
    });
  }
}

