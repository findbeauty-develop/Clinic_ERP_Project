import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";

export interface CreateNotificationDto {
  supplierManagerId: string;
  type: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
}

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateNotificationDto): Promise<void> {
    await (this.prisma as any).supplierNotification.upsert({
      where: { dedupe_key: dto.dedupeKey ?? `${Date.now()}-${Math.random()}` },
      create: {
        supplier_manager_id: dto.supplierManagerId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        entity_type: dto.entityType ?? "order",
        entity_id: dto.entityId ?? null,
        payload: dto.payload ?? null,
        dedupe_key: dto.dedupeKey ?? null,
      },
      update: {},
    });
  }

  async createMany(dtos: CreateNotificationDto[]): Promise<void> {
    if (dtos.length === 0) return;
    const rows = dtos.map((dto) => ({
      supplier_manager_id: dto.supplierManagerId,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      entity_type: dto.entityType ?? "order",
      entity_id: dto.entityId ?? null,
      payload: dto.payload ?? null,
      dedupe_key: dto.dedupeKey ?? null,
    }));
    await (this.prisma as any).supplierNotification.createMany({
      data: rows,
      skipDuplicates: true,
    });
  }

  async list(supplierManagerId: string, opts: { limit: number; page: number }) {
    const take = Math.min(Math.max(opts.limit, 1), 100);
    const skip = (Math.max(opts.page, 1) - 1) * take;

    const [items, total] = await Promise.all([
      (this.prisma as any).supplierNotification.findMany({
        where: { supplier_manager_id: supplierManagerId },
        orderBy: { created_at: "desc" },
        take,
        skip,
      }),
      (this.prisma as any).supplierNotification.count({
        where: { supplier_manager_id: supplierManagerId },
      }),
    ]);

    return {
      items: items.map(this.toDto),
      page: Math.max(opts.page, 1),
      limit: take,
      total,
      hasMore: skip + items.length < total,
    };
  }

  async unreadCount(supplierManagerId: string): Promise<number> {
    return (this.prisma as any).supplierNotification.count({
      where: { supplier_manager_id: supplierManagerId, read_at: null },
    });
  }

  async markRead(id: string, supplierManagerId: string): Promise<{ ok: boolean }> {
    const now = new Date();
    const result = await (this.prisma as any).supplierNotification.updateMany({
      where: { id, supplier_manager_id: supplierManagerId },
      data: { read_at: now, updated_at: now },
    });
    if (result.count === 0) throw new NotFoundException("Notification not found");
    return { ok: true };
  }

  private toDto(n: any) {
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      entityType: n.entity_type,
      entityId: n.entity_id,
      payload: n.payload,
      readAt: n.read_at ?? null,
      createdAt: n.created_at,
    };
  }
}
