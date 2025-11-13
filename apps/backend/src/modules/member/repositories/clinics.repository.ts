import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";

@Injectable()
export class ClinicsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: any) {
    return this.prisma.clinic.create({ data });
  }

  findByTenant(tenantId: string) {
    return this.prisma.clinic.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: "desc" },
    });
  }

  findById(id: string) {
    return this.prisma.clinic.findUnique({
      where: { id },
    });
  }

  update(id: string, data: any) {
    return this.prisma.clinic.update({
      where: { id },
      data,
    });
  }
}

