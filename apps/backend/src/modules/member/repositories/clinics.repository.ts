import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";
import { Clinic, Prisma } from "../../../../node_modules/.prisma/client-backend";

@Injectable()
export class ClinicsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ClinicCreateInput): Promise<Clinic> {
    return this.prisma.clinic.create({ data });
  }

  findByTenant(tenantId: string): Promise<Clinic[]> {
    return this.prisma.clinic.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: "desc" },
    });
  }

  findById(id: string, tenantId: string): Promise<Clinic | null> {
    return this.prisma.clinic.findFirst({
      where: { id, tenant_id: tenantId },
    });
  }

  update(
    id: string,
    data: Partial<Clinic>,
    tenantId?: string
  ): Promise<Clinic> {
    // Since id is UUID and primary key, we can update by id only
    // tenantId parameter is kept for API compatibility but not used in where clause
    return this.prisma.clinic.update({
      where: { id },
      data,
    });
  }

  findByDocumentIssueNumberAndName(
    documentIssueNumber: string,
    name: string
  ): Promise<Clinic | null> {
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
  ): Promise<Clinic | null> {
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

  findByDocumentIssueNumber(
    documentIssueNumber: string
  ): Promise<Clinic | null> {
    return this.prisma.clinic.findFirst({
      where: {
        document_issue_number: documentIssueNumber,
      },
    });
  }

  findByLicenseNumber(licenseNumber: string): Promise<Clinic | null> {
    return this.prisma.clinic.findFirst({
      where: {
        license_number: licenseNumber,
      },
    });
  }
}