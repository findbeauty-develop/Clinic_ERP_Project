import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";

type MemberCreateArgs = Parameters<PrismaService["member"]["create"]>[0];

@Injectable()
export class MembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  createMany(data: MemberCreateArgs[]) {
    return this.prisma.$transaction(data.map((entry) => this.prisma.member.create(entry)));
  }
}

