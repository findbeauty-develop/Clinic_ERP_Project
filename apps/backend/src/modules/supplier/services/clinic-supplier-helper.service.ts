import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";

/**
 * Helper service for ClinicSupplierManager operations.
 * Handles claim flow, product mapping, and supplier information retrieval.
 */
@Injectable()
export class ClinicSupplierHelperService {
  private readonly logger = new Logger(ClinicSupplierHelperService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find or create ClinicSupplierManager for a product.
   * Used when creating products without explicit supplier contact.
   */
  async findOrCreateDefaultSupplierManager(
    tenantId: string
  ): Promise<{ id: string }> {
    // Try to find existing default supplier manager
    let supplierManager = await this.prisma.clinicSupplierManager.findFirst({
      where: {
        tenant_id: tenantId,
        phone_number: "000-0000-0000", // Default phone number
        company_name: "공급업체 없음",
      },
    });

    if (!supplierManager) {
      // Create default supplier manager
      supplierManager = await this.prisma.clinicSupplierManager.create({
        data: {
          tenant_id: tenantId,
          company_name: "공급업체 없음",
          name: "담당자 없음",
          phone_number: "000-0000-0000",
        },
      });
    }

    return { id: supplierManager.id };
  }

  /**
   * Find platform SupplierManager by phone number (with normalization)
   */
  private async findPlatformSupplierManagerByPhone(
    phone: string
  ): Promise<any | null> {
    if (!phone || phone === "000-0000-0000") return null;

    const normalizedPhone = phone.replace(/[\s\-\(\)]/g, "").trim();
    const phoneVariations = [
      phone,
      normalizedPhone,
      phone.replace(/-/g, ""),
    ].filter((p, i, arr) => arr.indexOf(p) === i);

    try {
      const platformManager = await (this.prisma as any).supplierManager.findFirst({
        where: {
          OR: phoneVariations.map((p) => ({ phone_number: p })),
          status: "ACTIVE",
        },
        include: {
          supplier: {
            select: { tenant_id: true },
          },
        },
      });

      return platformManager;
    } catch (error) {
      this.logger.warn(
        `Failed to search platform SupplierManager by phone: ${error}`
      );
      return null;
    }
  }

  /**
   * Find platform SupplierManager by business number
   */
  private async findPlatformSupplierManagerByBusinessNumber(
    businessNumber: string
  ): Promise<any | null> {
    if (!businessNumber) return null;

    try {
      const platformManager = await (this.prisma as any).supplierManager.findFirst({
        where: {
          supplier: {
            business_number: businessNumber,
          },
          status: "ACTIVE",
        },
        include: {
          supplier: {
            select: { tenant_id: true, business_number: true },
          },
        },
      });

      return platformManager;
    } catch (error) {
      this.logger.warn(
        `Failed to search platform SupplierManager by business_number: ${error}`
      );
      return null;
    }
  }

  /**
   * Find or create ClinicSupplierManager from supplier data.
   * Used when creating products with supplier information.
   * ✅ Auto-links to platform SupplierManager if found by phone or business_number
   */
  async findOrCreateSupplierManager(
    tenantId: string,
    supplierData: {
      supplier_id?: string; // UUID or company name
      company_name?: string;
      business_number?: string;
      company_phone?: string;
      company_email?: string;
      company_address?: string;
      contact_name?: string;
      contact_phone?: string;
      contact_email?: string;
    }
  ): Promise<{ id: string }> {
    // If supplier_id is UUID, try to find by linked_supplier_manager_id
    if (supplierData.supplier_id) {
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          supplierData.supplier_id
        );

      if (isUUID) {
        // Try to find by linked_supplier_manager_id
        const supplierManager =
          await this.prisma.clinicSupplierManager.findFirst({
            where: {
              tenant_id: tenantId,
              linked_supplier_manager_id: supplierData.supplier_id,
            },
          });

        if (supplierManager) {
          return { id: supplierManager.id };
        }
      }
    }

    // Try to find by phone_number (for claim matching)
    if (supplierData.contact_phone) {
      const clinicSupplierManager = await this.prisma.clinicSupplierManager.findFirst(
        {
          where: {
            tenant_id: tenantId,
            phone_number: supplierData.contact_phone,
          },
        }
      );

      if (clinicSupplierManager) {
        // ✅ Auto-link: If linked_supplier_manager_id is null, try to find platform SupplierManager
        if (!clinicSupplierManager.linked_supplier_manager_id) {
          const platformManager =
            await this.findPlatformSupplierManagerByPhone(
              supplierData.contact_phone
            );

          if (platformManager) {
            // ✅ Update with auto-link
            const updated = await this.prisma.clinicSupplierManager.update({
              where: { id: clinicSupplierManager.id },
              data: {
                linked_supplier_manager_id: platformManager.id,
                business_number:
                  supplierData.business_number ||
                  clinicSupplierManager.business_number,
              },
            });

            this.logger.log(
              `🔗 [AUTO-LINK] Linked ClinicSupplierManager ${clinicSupplierManager.id} to SupplierManager ${platformManager.id} by phone: ${supplierData.contact_phone}`
            );

            return { id: updated.id };
          }
        }

        return { id: clinicSupplierManager.id };
      }
    }

    // Try to find by business_number
    if (supplierData.business_number) {
      const clinicSupplierManager = await this.prisma.clinicSupplierManager.findFirst(
        {
          where: {
            tenant_id: tenantId,
            business_number: supplierData.business_number,
          },
        }
      );

      if (clinicSupplierManager) {
        // ✅ Auto-link: If linked_supplier_manager_id is null, try to find platform SupplierManager
        if (!clinicSupplierManager.linked_supplier_manager_id) {
          // Try by business_number first
          let platformManager =
            await this.findPlatformSupplierManagerByBusinessNumber(
              supplierData.business_number
            );

          // If not found, try by phone_number
          if (!platformManager && supplierData.contact_phone) {
            platformManager = await this.findPlatformSupplierManagerByPhone(
              supplierData.contact_phone
            );
          }

          if (platformManager) {
            // ✅ Update with auto-link
            const updated = await this.prisma.clinicSupplierManager.update({
              where: { id: clinicSupplierManager.id },
              data: {
                linked_supplier_manager_id: platformManager.id,
              },
            });

            this.logger.log(
              `🔗 [AUTO-LINK] Linked ClinicSupplierManager ${clinicSupplierManager.id} to SupplierManager ${platformManager.id} by business_number: ${supplierData.business_number}`
            );

            return { id: updated.id };
          }
        }

        return { id: clinicSupplierManager.id };
      }
    }

    // ✅ Create new ClinicSupplierManager - check for platform SupplierManager first
    let linkedSupplierManagerId: string | null = null;

    // Try to find platform SupplierManager by phone_number
    if (supplierData.contact_phone) {
      const platformManager = await this.findPlatformSupplierManagerByPhone(
        supplierData.contact_phone
      );

      if (platformManager) {
        linkedSupplierManagerId = platformManager.id;
        this.logger.log(
          `🔗 [AUTO-LINK] Creating ClinicSupplierManager with auto-link to SupplierManager ${platformManager.id} by phone: ${supplierData.contact_phone}`
        );
      }
    }

    // If not found by phone, try by business_number
    if (!linkedSupplierManagerId && supplierData.business_number) {
      const platformManager =
        await this.findPlatformSupplierManagerByBusinessNumber(
          supplierData.business_number
        );

      if (platformManager) {
        linkedSupplierManagerId = platformManager.id;
        this.logger.log(
          `🔗 [AUTO-LINK] Creating ClinicSupplierManager with auto-link to SupplierManager ${platformManager.id} by business_number: ${supplierData.business_number}`
        );
      }
    }

    const newSupplierManager = await this.prisma.clinicSupplierManager.create({
      data: {
        tenant_id: tenantId,
        company_name:
          supplierData.company_name ||
          supplierData.supplier_id ||
          "공급업체 없음",
        business_number: supplierData.business_number,
        company_phone: supplierData.company_phone,
        company_email: supplierData.company_email,
        company_address: supplierData.company_address,
        name: supplierData.contact_name || "담당자 없음",
        phone_number: supplierData.contact_phone || "000-0000-0000",
        email1: supplierData.contact_email,
        linked_supplier_manager_id: linkedSupplierManagerId, // ✅ Auto-link
      },
    });

    return { id: newSupplierManager.id };
  }

  /**
   * Claim a ClinicSupplierManager to a SupplierManager.
   * Used when a manual supplier registers on the platform.
   */
  async claimSupplierManager(
    tenantId: string,
    clinicSupplierManagerId: string,
    supplierManagerId: string
  ): Promise<void> {
    await this.prisma.clinicSupplierManager.update({
      where: {
        id: clinicSupplierManagerId,
        tenant_id: tenantId, // Security: ensure tenant matches
      },
      data: {
        linked_supplier_manager_id: supplierManagerId,
      },
    });
  }

  /**
   * Get product supplier information.
   * Returns ProductSupplier with ClinicSupplierManager details.
   */
  async getProductSupplier(productId: string, tenantId: string) {
    const productSupplier = await this.prisma.productSupplier.findUnique({
      where: {
        tenant_id_product_id: {
          tenant_id: tenantId,
          product_id: productId,
        },
      },
      include: {
        clinicSupplierManager: {
          include: {
            linkedManager: {
              include: {
                supplier: true,
              },
            },
          },
        },
      },
    });

    if (!productSupplier) {
      return null;
    }

    return {
      id: productSupplier.id,
      productId: productSupplier.product_id,
      supplierManagerId: productSupplier.clinic_supplier_manager_id,
      purchasePrice: productSupplier.purchase_price,
      moq: productSupplier.moq,
      leadTimeDays: productSupplier.lead_time_days,
      note: productSupplier.note,
      supplier: {
        id: productSupplier.clinicSupplierManager.id,
        companyName: productSupplier.clinicSupplierManager.company_name,
        businessNumber: productSupplier.clinicSupplierManager.business_number,
        companyPhone: productSupplier.clinicSupplierManager.company_phone,
        companyEmail: productSupplier.clinicSupplierManager.company_email,
        companyAddress: productSupplier.clinicSupplierManager.company_address,
        contactName: productSupplier.clinicSupplierManager.name,
        contactPhone: productSupplier.clinicSupplierManager.phone_number,
        contactEmail: productSupplier.clinicSupplierManager.email1,
        linkedSupplierManagerId:
          productSupplier.clinicSupplierManager.linked_supplier_manager_id,
        platformSupplier: productSupplier.clinicSupplierManager.linkedManager
          ? {
              id: productSupplier.clinicSupplierManager.linkedManager.id,
              name: productSupplier.clinicSupplierManager.linkedManager.name,
              phoneNumber:
                productSupplier.clinicSupplierManager.linkedManager
                  .phone_number,
              supplier: productSupplier.clinicSupplierManager.linkedManager
                .supplier
                ? {
                    id: productSupplier.clinicSupplierManager.linkedManager
                      .supplier.tenant_id,
                    companyName:
                      productSupplier.clinicSupplierManager.linkedManager
                        .supplier.company_name,
                  }
                : null,
            }
          : null,
      },
    };
  }

  /**
   * Create or update ProductSupplier mapping.
   */
  async upsertProductSupplier(
    tenantId: string,
    productId: string,
    clinicSupplierManagerId: string,
    data: {
      purchase_price?: number;
      moq?: number;
      lead_time_days?: number;
      note?: string;
    }
  ) {
    return await this.prisma.productSupplier.upsert({
      where: {
        tenant_id_product_id: {
          tenant_id: tenantId,
          product_id: productId,
        },
      },
      create: {
        tenant_id: tenantId,
        product_id: productId,
        clinic_supplier_manager_id: clinicSupplierManagerId,
        purchase_price: data.purchase_price,
        moq: data.moq,
        lead_time_days: data.lead_time_days,
        note: data.note,
      },
      update: {
        purchase_price: data.purchase_price,
        moq: data.moq,
        lead_time_days: data.lead_time_days,
        note: data.note,
      },
    });
  }
}
