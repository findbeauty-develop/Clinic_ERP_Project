import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { PrismaService } from "../../../core/prisma.service";
import {
  CreatePurchasePathDto,
  UpdatePurchasePathDto,
} from "../dto/purchase-path.dto";
import {
  buildPurchasePathSnapshot,
  normalizePurchasedSiteDomain,
} from "../utils/purchase-path-domain.util";

const pathIncludeManager = {
  clinicSupplierManager: {
    select: {
      id: true,
      supplier_id: true,
      company_name: true,
      business_number: true,
      company_phone: true,
      company_email: true,
      company_address: true,
      name: true,
      phone_number: true,
      email1: true,
      email2: true,
      position: true,
      linked_supplier_manager_id: true,
      responsible_products: true,
      responsible_regions: true,
      memo: true,
    },
  },
} as const;

@Injectable()
export class PurchasePathService {
  constructor(private readonly prisma: PrismaService) {}

  async listForProduct(productId: string, tenantId: string) {
    return (this.prisma as any).purchasePath.findMany({
      where: { product_id: productId, tenant_id: tenantId },
      include: pathIncludeManager,
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
    });
  }

  async create(
    productId: string,
    tenantId: string,
    dto: CreatePurchasePathDto
  ) {
    await this.assertProductTenant(productId, tenantId);
    this.validateDtoPayload(dto);

    const normalizedDomain =
      dto.pathType === "SITE"
        ? normalizePurchasedSiteDomain(dto.siteUrl || dto.siteName)
        : null;

    if (dto.pathType === "SITE" && !normalizedDomain) {
      throw new BadRequestException(
        "SITE path requires a valid URL or site name to derive domain"
      );
    }

    if (dto.pathType === "MANAGER") {
      const mgr = await (this.prisma as any).clinicSupplierManager.findFirst({
        where: {
          id: dto.clinicSupplierManagerId!,
          tenant_id: tenantId,
        },
        select: { id: true },
      });
      if (!mgr) {
        throw new BadRequestException("Clinic supplier manager not found");
      }
      const dupManagerPath = await (this.prisma as any).purchasePath.findFirst({
        where: {
          tenant_id: tenantId,
          product_id: productId,
          path_type: "MANAGER",
          clinic_supplier_manager_id: dto.clinicSupplierManagerId!,
        },
        select: { id: true },
      });
      if (dupManagerPath) {
        throw new BadRequestException(
          "이미 동일한 담당자 구매 경로가 등록되어 있습니다."
        );
      }
    }

    const count = await (this.prisma as any).purchasePath.count({
      where: { product_id: productId, tenant_id: tenantId },
    });
    const isDefault = dto.isDefault ?? count === 0;

    return this.prisma.$transaction(async (tx: any) => {
      if (isDefault) {
        await (tx as any).purchasePath.updateMany({
          where: { product_id: productId, tenant_id: tenantId },
          data: { is_default: false },
        });
      }

      try {
        return await (tx as any).purchasePath.create({
          data: {
            tenant_id: tenantId,
            product_id: productId,
            path_type: dto.pathType,
            is_default: isDefault,
            sort_order: dto.sortOrder ?? count,
            clinic_supplier_manager_id:
              dto.pathType === "MANAGER"
                ? dto.clinicSupplierManagerId!
                : null,
            site_name: dto.pathType === "SITE" ? dto.siteName ?? null : null,
            site_url: dto.pathType === "SITE" ? dto.siteUrl ?? null : null,
            normalized_domain:
              dto.pathType === "SITE" ? normalizedDomain : null,
            other_text: dto.pathType === "OTHER" ? dto.otherText! : null,
          },
          include: pathIncludeManager,
        });
      } catch (e: any) {
        if (
          e instanceof PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          throw new BadRequestException(
            "Duplicate site domain for this product"
          );
        }
        throw e;
      }
    });
  }

  async update(
    productId: string,
    pathId: string,
    tenantId: string,
    dto: UpdatePurchasePathDto
  ) {
    const existing = await this.getPathOrThrow(productId, pathId, tenantId);
    const nextType = (dto.pathType ?? existing.path_type) as string;

    if (dto.pathType && dto.pathType !== existing.path_type) {
      throw new BadRequestException("pathType cannot be changed");
    }

    const siteUrl = dto.siteUrl ?? existing.site_url;
    const siteName = dto.siteName ?? existing.site_name;
    let normalizedDomain = existing.normalized_domain;
    if (nextType === "SITE" && (dto.siteUrl != null || dto.siteName != null)) {
      normalizedDomain = normalizePurchasedSiteDomain(siteUrl || siteName);
      if (!normalizedDomain) {
        throw new BadRequestException("Invalid site URL for domain");
      }
    }

    const patch = this.buildPatchData(
      dto,
      existing,
      nextType,
      normalizedDomain
    );

    if (dto.isDefault === true) {
      await this.prisma.$transaction(async (tx: any) => {
        await (tx as any).purchasePath.updateMany({
          where: { product_id: productId, tenant_id: tenantId },
          data: { is_default: false },
        });
        try {
          await (tx as any).purchasePath.update({
            where: { id: pathId },
            data: { ...patch, is_default: true },
          });
        } catch (e: any) {
          if (
            e instanceof PrismaClientKnownRequestError &&
            e.code === "P2002"
          ) {
            throw new BadRequestException(
              "Duplicate site domain for this product"
            );
          }
          throw e;
        }
      });
      return this.getPathOrThrow(productId, pathId, tenantId);
    }

    try {
      return await (this.prisma as any).purchasePath.update({
        where: { id: pathId },
        data: patch,
        include: pathIncludeManager,
      });
    } catch (e: any) {
      if (
        e instanceof PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new BadRequestException(
          "Duplicate site domain for this product"
        );
      }
      throw e;
    }
  }

  async delete(productId: string, pathId: string, tenantId: string) {
    const existing = await this.getPathOrThrow(productId, pathId, tenantId);
    await (this.prisma as any).purchasePath.delete({
      where: { id: pathId },
    });
    if (existing.is_default) {
      const first = await (this.prisma as any).purchasePath.findFirst({
        where: { product_id: productId, tenant_id: tenantId },
        orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
      });
      if (first) {
        await (this.prisma as any).purchasePath.update({
          where: { id: first.id },
          data: { is_default: true },
        });
      }
    }
    return { ok: true };
  }

  async setDefault(productId: string, pathId: string, tenantId: string) {
    await this.getPathOrThrow(productId, pathId, tenantId);
    await this.prisma.$transaction(async (tx: any) => {
      await (tx as any).purchasePath.updateMany({
        where: { product_id: productId, tenant_id: tenantId },
        data: { is_default: false },
      });
      await (tx as any).purchasePath.update({
        where: { id: pathId },
        data: { is_default: true },
      });
    });
    return this.getPathOrThrow(productId, pathId, tenantId);
  }

  /**
   * Resolve purchase path for one order line: group key + snapshot for OrderItem.
   */
  async resolveForOrderItem(params: {
    tenantId: string;
    productId: string;
    purchasePathId?: string | null;
    fallbackManagerSupplierId: string;
  }): Promise<{
    orderGroupKey: string;
    purchasePathId: string | null;
    purchasePathType: string | null;
    snapshot: Record<string, unknown> | null;
    touchPathId: string | null;
  }> {
    const { tenantId, productId, purchasePathId, fallbackManagerSupplierId } =
      params;

    let path: any = null;
    if (purchasePathId) {
      path = await (this.prisma as any).purchasePath.findFirst({
        where: {
          id: purchasePathId,
          product_id: productId,
          tenant_id: tenantId,
        },
        include: pathIncludeManager,
      });
      if (!path) {
        throw new NotFoundException("Purchase path not found for product");
      }
    } else {
      path = await (this.prisma as any).purchasePath.findFirst({
        where: {
          product_id: productId,
          tenant_id: tenantId,
          is_default: true,
        },
        include: pathIncludeManager,
      });
    }

    if (!path) {
      return {
        orderGroupKey: fallbackManagerSupplierId,
        purchasePathId: null,
        purchasePathType: null,
        snapshot: null,
        touchPathId: null,
      };
    }

    const snapshot = buildPurchasePathSnapshot(path);
    if (path.path_type === "SITE" || path.path_type === "OTHER") {
      return {
        orderGroupKey: `purchasePath:${path.id}`,
        purchasePathId: path.id,
        purchasePathType: path.path_type,
        snapshot,
        touchPathId: path.id,
      };
    }

    const mid = path.clinic_supplier_manager_id;
    if (!mid) {
      throw new BadRequestException("MANAGER path missing supplier manager");
    }
    return {
      orderGroupKey: mid,
      purchasePathId: path.id,
      purchasePathType: path.path_type,
      snapshot,
      touchPathId: path.id,
    };
  }

  async touchLastUsed(pathIds: string[]) {
    const ids = [...new Set(pathIds)].filter(Boolean);
    if (ids.length === 0) return;
    const now = new Date();
    await (this.prisma as any).purchasePath.updateMany({
      where: { id: { in: ids } },
      data: { last_used_at: now },
    });
  }

  private async assertProductTenant(productId: string, tenantId: string) {
    const p = await this.prisma.product.findFirst({
      where: { id: productId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!p) throw new NotFoundException("Product not found");
  }

  private validateDtoPayload(dto: CreatePurchasePathDto) {
    if (dto.pathType === "MANAGER") {
      if (!dto.clinicSupplierManagerId?.trim()) {
        throw new BadRequestException(
          "MANAGER path requires clinicSupplierManagerId"
        );
      }
    } else if (dto.pathType === "SITE") {
      if (!dto.siteUrl?.trim() && !dto.siteName?.trim()) {
        throw new BadRequestException("SITE path requires siteUrl or siteName");
      }
    } else if (dto.pathType === "OTHER") {
      if (!dto.otherText?.trim()) {
        throw new BadRequestException("OTHER path requires otherText");
      }
    }
  }

  private async getPathOrThrow(
    productId: string,
    pathId: string,
    tenantId: string
  ) {
    const row = await (this.prisma as any).purchasePath.findFirst({
      where: { id: pathId, product_id: productId, tenant_id: tenantId },
      include: pathIncludeManager,
    });
    if (!row) throw new NotFoundException("Purchase path not found");
    return row;
  }

  private buildPatchData(
    dto: UpdatePurchasePathDto,
    existing: any,
    nextType: string,
    normalizedDomain: string | null
  ) {
    const data: any = {};
    if (dto.sortOrder !== undefined) data.sort_order = dto.sortOrder;
    if (nextType === "MANAGER" && dto.clinicSupplierManagerId) {
      data.clinic_supplier_manager_id = dto.clinicSupplierManagerId;
    }
    if (nextType === "SITE") {
      if (dto.siteName !== undefined) data.site_name = dto.siteName;
      if (dto.siteUrl !== undefined) data.site_url = dto.siteUrl;
      if (dto.siteUrl != null || dto.siteName != null) {
        data.normalized_domain = normalizedDomain;
      }
    }
    if (nextType === "OTHER" && dto.otherText !== undefined) {
      data.other_text = dto.otherText;
    }
    return data;
  }
}
