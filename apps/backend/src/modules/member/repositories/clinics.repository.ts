import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";
import { Clinic } from "@prisma/client";

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

  update(id: string, data: Partial<Clinic>, tenantId?: string): Promise<Clinic> {
    const where: any = { id };
    if (tenantId) {
      where.tenant_id = tenantId;
    }
    return this.prisma.clinic.update({
      where,
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

  findByDocumentIssueNumberAndNameExcludingId(
    documentIssueNumber: string,
    name: string,
    excludeId: string
  ) {
    return this.prisma.clinic.findFirst({
      where: {
        document_issue_number: documentIssueNumber,
        name: name,
        id: {
          not: excludeId,
        },
      },
    });
  }
}

