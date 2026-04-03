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

  /**
   * Notification.recipient_member_id = Prisma Member.id.
   * Local JWT uses sub = Member.id; some clients use Supabase auth id as Bearer `user.id` — then match via member_id.
   */
  async resolveMemberPrimaryKey(
    tenantId: string,
    jwtUser: { id: string; member_id?: string | null }
  ): Promise<string | null> {
    const byPk = await this.prisma.member.findFirst({
      where: { id: jwtUser.id, tenant_id: tenantId },
      select: { id: true },
    });
    if (byPk) return byPk.id;
    if (jwtUser.member_id) {
      const byLogin = await this.prisma.member.findFirst({
        where: { member_id: jwtUser.member_id, tenant_id: tenantId },
        select: { id: true },
      });
      if (byLogin) return byLogin.id;
    }
    return null;
  }
}
