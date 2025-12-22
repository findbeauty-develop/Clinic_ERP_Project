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

      this.logger.log(
        `Created default ClinicSupplierManager for tenant ${tenantId}`
      );
    }

    return { id: supplierManager.id };
  }

  /**
   * Find or create ClinicSupplierManager from supplier data.
   * Used when creating products with supplier information.
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
          this.logger.log(
            `Found ClinicSupplierManager by linked_supplier_manager_id: ${supplierData.supplier_id}`
          );
          return { id: supplierManager.id };
        }
      }
    }

    // Try to find by phone_number (for claim matching)
    if (supplierData.contact_phone) {
      const supplierManager = await this.prisma.clinicSupplierManager.findFirst(
        {
          where: {
            tenant_id: tenantId,
            phone_number: supplierData.contact_phone,
          },
        }
      );

      if (supplierManager) {
        this.logger.log(
          `Found ClinicSupplierManager by phone_number: ${supplierData.contact_phone}`
        );
        return { id: supplierManager.id };
      }
    }

    // Try to find by business_number
    if (supplierData.business_number) {
      const supplierManager = await this.prisma.clinicSupplierManager.findFirst(
        {
          where: {
            tenant_id: tenantId,
            business_number: supplierData.business_number,
          },
        }
      );

      if (supplierManager) {
        this.logger.log(
          `Found ClinicSupplierManager by business_number: ${supplierData.business_number}`
        );
        return { id: supplierManager.id };
      }
    }

    // Create new ClinicSupplierManager
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
      },
    });

    this.logger.log(
      `Created new ClinicSupplierManager: ${newSupplierManager.id} for tenant ${tenantId}`
    );

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

    this.logger.log(
      `Claimed ClinicSupplierManager ${clinicSupplierManagerId} to SupplierManager ${supplierManagerId}`
    );
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
