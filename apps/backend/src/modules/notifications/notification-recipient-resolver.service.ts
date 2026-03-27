import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";

/**
 * Resolves which clinic members receive a notification. V1: all members in tenant.
 * Change rules here later (roles, order stakeholders, etc.).
 */
@Injectable()
export class NotificationRecipientResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveClinicRecipients(tenantId: string): Promise<string[]> {
    const members = await this.prisma.member.findMany({
      where: { tenant_id: tenantId },
      select: { id: true },
    });
    return members.map((m) => m.id);
  }
}
