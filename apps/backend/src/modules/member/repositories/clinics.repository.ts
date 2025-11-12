import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";

@Injectable()
export class ClinicsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: any) {
    return this.prisma.clinic.create({ data });
  }
}

