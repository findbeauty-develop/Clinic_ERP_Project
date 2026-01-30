import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get inventory summary (inbound/outbound totals with date range)
   */
  async getInventorySummary(
    tenantId: string,
    startDate?: Date,
    endDate?: Date
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    try {
      // Calculate previous period for comparison
      let previousStartDate: Date | undefined;
      let previousEndDate: Date | undefined;

      if (startDate && endDate) {
        const periodDays = Math.ceil(
          (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        previousEndDate = new Date(startDate);
        previousEndDate.setDate(previousEndDate.getDate() - 1);
        previousStartDate = new Date(previousEndDate);
        previousStartDate.setDate(previousStartDate.getDate() - periodDays);
      }

      // Get inbound totals (from Batch created_at - when products are received)
      const inboundWhere: any = {
        tenant_id: tenantId,
      };
      if (startDate || endDate) {
        inboundWhere.created_at = {};
        if (startDate) inboundWhere.created_at.gte = startDate;
        if (endDate) inboundWhere.created_at.lte = endDate;
      }

      const inboundTotal = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).batch.aggregate({
          where: inboundWhere,
          _sum: {
            qty: true,
          },
        });
      });

      // Get previous period inbound for comparison
      let previousInbound = 0;
      if (previousStartDate && previousEndDate) {
        const prevInboundWhere: any = {
          tenant_id: tenantId,
          created_at: {
            gte: previousStartDate,
            lte: previousEndDate,
          },
        };
        const prevInboundResult = await this.prisma.executeWithRetry(
          async () => {
            return (this.prisma as any).batch.aggregate({
              where: prevInboundWhere,
              _sum: {
                qty: true,
              },
            });
          }
        );
        previousInbound = prevInboundResult._sum?.qty || 0;
      }

      // Get outbound totals
      const outboundWhere: any = {
        tenant_id: tenantId,
      };
      if (startDate || endDate) {
        outboundWhere.outbound_date = {};
        if (startDate) outboundWhere.outbound_date.gte = startDate;
        if (endDate) outboundWhere.outbound_date.lte = endDate;
      }

      const outboundTotal = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).outbound.aggregate({
          where: outboundWhere,
          _sum: {
            outbound_qty: true,
          },
        });
      });

      // Get previous period outbound for comparison
      let previousOutbound = 0;
      if (previousStartDate && previousEndDate) {
        const prevOutboundWhere: any = {
          tenant_id: tenantId,
          outbound_date: {
            gte: previousStartDate,
            lte: previousEndDate,
          },
        };
        const prevOutboundResult = await this.prisma.executeWithRetry(
          async () => {
            return (this.prisma as any).outbound.aggregate({
              where: prevOutboundWhere,
              _sum: {
                outbound_qty: true,
              },
            });
          }
        );
        previousOutbound = prevOutboundResult._sum?.outbound_qty || 0;
      }

      const currentInbound = inboundTotal._sum?.qty || 0;
      const currentOutbound = outboundTotal._sum?.outbound_qty || 0;

      return {
        inbound: {
          total: currentInbound,
          previous: previousInbound,
          change: currentInbound - previousInbound,
        },
        outbound: {
          total: currentOutbound,
          previous: previousOutbound,
          change: currentOutbound - previousOutbound,
        },
        lastUpdated: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(
        `Error getting inventory summary: ${error.message}`,
        error.stack
      );
      throw new BadRequestException(
        `Failed to get inventory summary: ${error.message}`
      );
    }
  }

  /**
   * Get risky inventory (products with imminent expiry)
   */
  async getRiskyInventory(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    try {
      const products = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).product.findMany({
          where: {
            tenant_id: tenantId,
            is_active: true,
          },
          include: {
            batches: {
              where: {
                qty: { gt: 0 },
                expiry_date: { not: null },
              },
              orderBy: { expiry_date: "asc" },
            },
          },
        });
      });

      const riskyItems: any[] = [];

      products.forEach((product: any) => {
        product.batches.forEach((batch: any) => {
          if (!batch.expiry_date) return;

          const expiryDate = new Date(batch.expiry_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const diffTime = expiryDate.getTime() - today.getTime();
          const daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          // Get alert_days from product or batch
          const alertDays = parseInt(
            product.alert_days || batch.alert_days || "30",
            10
          );

          if (daysUntilExpiry <= alertDays && daysUntilExpiry >= 0) {
            // Calculate usage rate (how much has been used)
            const totalStock = product.current_stock || 0;
            const usageRate =
              totalStock > 0
                ? Math.round(((totalStock - batch.qty) / totalStock) * 100)
                : 0;

            riskyItems.push({
              productId: product.id,
              productName: product.name,
              batchNo: batch.batch_no,
              remainingQty: batch.qty,
              unit: product.unit || "개",
              daysUntilExpiry: daysUntilExpiry,
              usageRate: usageRate,
            });
          }
        });
      });

      // Sort by days until expiry (most urgent first)
      riskyItems.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

      return riskyItems;
    } catch (error: any) {
      this.logger.error(
        `Error getting risky inventory: ${error.message}`,
        error.stack
      );
      throw new BadRequestException(
        `Failed to get risky inventory: ${error.message}`
      );
    }
  }

  /**
   * Get depletion list (products nearing stockout)
   */
  async getDepletionList(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    try {
      const products = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).product.findMany({
          where: {
            tenant_id: tenantId,
            is_active: true,
            min_stock: { gt: 0 }, // Only products with min_stock set
          },
          include: {
            orderItems: {
              orderBy: { created_at: "desc" },
              take: 1, // Latest order
            },
            outbounds: {
              where: {
                outbound_date: {
                  gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
                },
              },
            },
          },
        });
      });

      const depletionItems: any[] = [];

      products.forEach((product: any) => {
        const currentStock = product.current_stock || 0;
        const minStock = product.min_stock || 0;

        // Only include if current stock is at or below min stock
        if (currentStock <= minStock) {
          // Calculate order frequency (orders per week based on last 7 days)
          const lastOrder = product.orderItems?.[0];
          const lastOrderQty = lastOrder?.quantity || 0;

          // Calculate weekly outbound (based on last 7 days)
          const weeklyOutbound = product.outbounds.reduce(
            (sum: number, out: any) => sum + (out.outbound_qty || 0),
            0
          );

          // Estimate depletion (weeks until stockout)
          const estimatedDepletion =
            weeklyOutbound > 0
              ? (currentStock / weeklyOutbound).toFixed(1)
              : null;

          depletionItems.push({
            productId: product.id,
            productName: product.name,
            currentStock: currentStock,
            unit: product.unit || "개",
            minStock: minStock,
            lastOrderQty: lastOrderQty,
            orderFrequency:
              weeklyOutbound > 0 ? `${weeklyOutbound} /주` : "0 /주",
            estimatedDepletion: estimatedDepletion
              ? `${estimatedDepletion}주`
              : "-",
          });
        }
      });

      // Sort by estimated depletion (most urgent first)
      depletionItems.sort((a, b) => {
        const aDepletion = parseFloat(a.estimatedDepletion) || 999;
        const bDepletion = parseFloat(b.estimatedDepletion) || 999;
        return aDepletion - bDepletion;
      });

      return depletionItems;
    } catch (error: any) {
      this.logger.error(
        `Error getting depletion list: ${error.message}`,
        error.stack
      );
      throw new BadRequestException(
        `Failed to get depletion list: ${error.message}`
      );
    }
  }

  /**
   * Get top value products (by inventory value)
   */
  async getTopValueProducts(tenantId: string, limit: number = 8) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    try {
      const products = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).product.findMany({
          where: {
            tenant_id: tenantId,
            is_active: true,
            current_stock: { gt: 0 },
          },
          include: {
            batches: {
              where: { qty: { gt: 0 } },
            },
          },
          orderBy: { current_stock: "desc" },
          take: limit * 2, // Get more to filter by value
        });
      });

      const productsWithValue = products
        .map((product: any) => {
          const salePrice = product.sale_price || product.purchase_price || 0;
          const totalValue = (product.current_stock || 0) * salePrice;
          const unitValue = salePrice;

          return {
            productId: product.id,
            productName: product.name,
            category: product.category,
            imageUrl: product.image_url,
            quantity: product.current_stock || 0,
            unit: product.unit || "개",
            totalValue: totalValue,
            unitValue: unitValue,
          };
        })
        .filter((p: any) => p.totalValue > 0) // Only products with value
        .sort((a: any, b: any) => b.totalValue - a.totalValue) // Sort by total value
        .slice(0, limit); // Take top N

      return productsWithValue;
    } catch (error: any) {
      this.logger.error(
        `Error getting top value products: ${error.message}`,
        error.stack
      );
      throw new BadRequestException(
        `Failed to get top value products: ${error.message}`
      );
    }
  }

  /**
   * Get inventory by location
   */
  async getInventoryByLocation(tenantId: string, location?: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    try {
      const where: any = {
        tenant_id: tenantId,
        qty: { gt: 0 },
      };

      if (location) {
        where.storage = location;
      }

      const batches = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).batch.findMany({
          where,
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unit: true,
              },
            },
          },
          orderBy: { storage: "asc" },
        });
      });

      // Group by location
      const locationMap = new Map<string, any[]>();

      batches.forEach((batch: any) => {
        const loc = batch.storage || "기타";
        if (!locationMap.has(loc)) {
          locationMap.set(loc, []);
        }
        locationMap.get(loc)!.push({
          productId: batch.product_id,
          productName: batch.product?.name || "Unknown",
          batchNo: batch.batch_no,
          quantity: batch.qty,
          unit: batch.product?.unit || "개",
        });
      });

      // Convert to array format
      const locations = Array.from(locationMap.entries()).map(
        ([locationName, items]) => ({
          location: locationName,
          productCount: items.length,
          items: items,
        })
      );

      return locations;
    } catch (error: any) {
      this.logger.error(
        `Error getting inventory by location: ${error.message}`,
        error.stack
      );
      throw new BadRequestException(
        `Failed to get inventory by location: ${error.message}`
      );
    }
  }
}
