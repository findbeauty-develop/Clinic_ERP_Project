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

  findById(id: string, tenantId: string) {
    return this.prisma.clinic.findFirst({
      where: { id, tenant_id: tenantId },
    });
  }

  update(id: string, data: any, tenantId: string) {
    return this.prisma.clinic.update({
      where: { id, tenant_id: tenantId },
      data,
    });
  }

  findByDocumentIssueNumberAndName(documentIssueNumber: string, name: string) {
    return this.prisma.clinic.findFirst({
      where: {
        document_issue_number: documentIssueNumber,
        name: name,
      },
    });
  }
}

