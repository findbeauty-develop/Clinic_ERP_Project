import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../core/prisma.service";
import { PackageRepository } from "../repositories/package.repository";
import { CreatePackageDto } from "../dto/create-package.dto";
import { UpdatePackageDto } from "../dto/update-package.dto";
import { ProductsService } from "../../product/services/products.service";

@Injectable()
export class PackageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly packageRepository: PackageRepository,
    private readonly productsService: ProductsService
  ) {}

  /**
   * 모든 패키지 목록 가져오기
   */
  async getAllPackages(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const packages = await this.packageRepository.findAll(tenantId);

    return packages.map((pkg: any) => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      isActive: pkg.is_active,
      createdAt: pkg.created_at,
      updatedAt: pkg.updated_at,
      itemsCount: pkg.items?.length || 0,
    }));
  }

  /**
   * 패키지 상세 정보 (구성 제품 포함)
   */
  async getPackage(packageId: string, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const pkg = await this.packageRepository.findById(packageId, tenantId);

    if (!pkg) {
      throw new NotFoundException("Package not found");
    }

    return {
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      isActive: pkg.is_active,
      createdAt: pkg.created_at,
      updatedAt: pkg.updated_at,
      items: (pkg.items || []).map((item: any) => ({
        id: item.id,
        productId: item.product_id,
        productName: item.product?.name || "",
        brand: item.product?.brand || "",
        unit: item.product?.unit || "",
        quantity: item.quantity,
        order: item.order,
      })),
    };
  }

  /**
   * 패키지명 자동완성 (Auto-complete)
   * 패키지 이름 입력 시 Auto-complete 기능 제공
   */
  async searchPackageNames(
    query: string,
    tenantId: string,
    limit: number = 10
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    if (!query || query.trim().length === 0) {
      return [];
    }

    const packages = await this.packageRepository.findAll(tenantId);

    const searchLower = query.toLowerCase().trim();
    const matching = packages
      .filter((pkg: any) =>
        pkg.name?.toLowerCase().includes(searchLower)
      )
      .slice(0, limit)
      .map((pkg: any) => ({
        id: pkg.id,
        name: pkg.name,
        description: pkg.description,
        itemsCount: pkg.items?.length || 0,
      }));

    return matching;
  }

  /**
   * 동일 구성 패키지 존재 체크
   * 동일 구성 패키지 존재 시 추가불가
   */
  async checkDuplicatePackage(
    items: CreatePackageDto["items"],
    tenantId: string,
    excludePackageId?: string
  ): Promise<{ isDuplicate: boolean; existingPackage?: any }> {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    if (!items || items.length === 0) {
      return { isDuplicate: false };
    }

    // Barcha paketlarni olish
    const allPackages = await this.packageRepository.findAll(tenantId);

    // Har bir paketni tekshirish
    for (const pkg of allPackages) {
      // Agar excludePackageId bo'lsa, uni o'tkazib yuborish
      if (excludePackageId && pkg.id === excludePackageId) {
        continue;
      }

      const pkgItems = (pkg.items || []).map((item: any) => ({
        productId: item.product_id,
        quantity: item.quantity,
      }));

      // Items soni bir xil bo'lishi kerak
      if (pkgItems.length !== items.length) {
        continue;
      }

      // Har bir item tekshirish
      const itemsMap = new Map(
        items.map((item) => [`${item.productId}-${item.quantity}`, item])
      );
      const pkgItemsMap = new Map(
        pkgItems.map((item: { productId: string; quantity: number }) => [
          `${item.productId}-${item.quantity}`,
          item,
        ])
      );

      // Barcha items bir xil bo'lishi kerak
      let isMatch = true;
      for (const [key] of itemsMap) {
        if (!pkgItemsMap.has(key)) {
          isMatch = false;
          break;
        }
      }

      if (isMatch && itemsMap.size === pkgItemsMap.size) {
        return {
          isDuplicate: true,
          existingPackage: {
            id: pkg.id,
            name: pkg.name,
            description: pkg.description,
            items: pkgItems,
          },
        };
      }
    }

    return { isDuplicate: false };
  }

  /**
   * 패키지 생성
   */
  async createPackage(dto: CreatePackageDto, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException("Package must have at least one item");
    }

    // 동일 구성 패키지 존재 체크
    const duplicateCheck = await this.checkDuplicatePackage(
      dto.items,
      tenantId
    );
    if (duplicateCheck.isDuplicate) {
      throw new BadRequestException(
        `동일 구성의 패키지가 이미 존재합니다: ${duplicateCheck.existingPackage?.name}`
      );
    }

    // Validate all products exist
    for (const item of dto.items) {
      const product = await this.prisma.product.findFirst({
        where: {
          id: item.productId,
          tenant_id: tenantId,
        },
      });

      if (!product) {
        throw new NotFoundException(
          `Product not found: ${item.productId}`
        );
      }
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const pkg = await this.packageRepository.create(
        {
          name: dto.name,
          description: dto.description || null,
          is_active: true,
          items: {
            create: dto.items.map((item, index) => ({
              tenant_id: tenantId,
              product_id: item.productId,
              quantity: item.quantity,
              order: item.order ?? index,
            })),
          },
        },
        tenantId,
        tx
      );

      return {
        id: pkg.id,
        name: pkg.name,
        description: pkg.description,
        isActive: pkg.is_active,
        createdAt: pkg.created_at,
        updatedAt: pkg.updated_at,
        items: (pkg.items || []).map((item: any) => ({
          id: item.id,
          productId: item.product_id,
          productName: item.product?.name || "",
          brand: item.product?.brand || "",
          unit: item.product?.unit || "",
          quantity: item.quantity,
          order: item.order,
        })),
      };
    });
  }

  /**
   * 패키지 수정
   */
  async updatePackage(
    id: string,
    dto: UpdatePackageDto,
    tenantId: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const existing = await this.packageRepository.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundException("Package not found");
    }

    // Validate products if items are being updated
    if (dto.items && dto.items.length > 0) {
      // 동일 구성 패키지 존재 체크 (현재 패키지 제외)
      const duplicateCheck = await this.checkDuplicatePackage(
        dto.items,
        tenantId,
        id
      );
      if (duplicateCheck.isDuplicate) {
        throw new BadRequestException(
          `동일 구성의 패키지가 이미 존재합니다: ${duplicateCheck.existingPackage?.name}`
        );
      }

      for (const item of dto.items) {
        const product = await this.prisma.product.findFirst({
          where: {
            id: item.productId,
            tenant_id: tenantId,
          },
        });

        if (!product) {
          throw new NotFoundException(
            `Product not found: ${item.productId}`
          );
        }
      }
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Delete existing items if new items are provided
      if (dto.items) {
        await this.packageRepository.deleteItemsByPackageId(id, tenantId, tx);
      }

      const updateData: any = {};
      if (dto.name) updateData.name = dto.name;
      if (dto.description !== undefined) updateData.description = dto.description;

      const pkg = await this.packageRepository.update(
        {
          ...updateData,
          updated_at: new Date(),
          ...(dto.items && {
            items: {
              create: dto.items.map((item, index) => ({
                tenant_id: tenantId,
                product_id: item.productId,
                quantity: item.quantity,
                order: item.order ?? index,
              })),
            },
          }),
        },
        id,
        tenantId,
        tx
      );

      return {
        id: pkg.id,
        name: pkg.name,
        description: pkg.description,
        isActive: pkg.is_active,
        createdAt: pkg.created_at,
        updatedAt: pkg.updated_at,
        items: (pkg.items || []).map((item: any) => ({
          id: item.id,
          productId: item.product_id,
          productName: item.product?.name || "",
          brand: item.product?.brand || "",
          unit: item.product?.unit || "",
          quantity: item.quantity,
          order: item.order,
        })),
      };
    });
  }

  /**
   * 패키지 삭제
   */
  async deletePackage(id: string, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const existing = await this.packageRepository.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundException("Package not found");
    }

    await this.packageRepository.delete(id, tenantId);
    return { message: "Package deleted successfully" };
  }

  /**
   * 패키지 구성 제품 정보 가져오기 (출고용)
   * - 각 제품의 batch 정보, 재고, 유효기간 등 포함
   * - 유효기간 임박 제품은 상단 우선 노출
   */
  async getPackageItemsForOutbound(
    packageId: string,
    tenantId: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const pkg = await this.packageRepository.findById(packageId, tenantId);
    if (!pkg) {
      throw new NotFoundException("Package not found");
    }

    const items = (pkg.items || []).map((item: any) => {
      const product = item.product;
      const batches = (product?.batches || []).map((batch: any) => {
        // 유효기간 임박 체크
        let isExpiringSoon = false;
        let daysUntilExpiry: number | null = null;

        if (batch.expiry_date) {
          const expiryDate = new Date(batch.expiry_date);
          const today = new Date();
          const diffTime = expiryDate.getTime() - today.getTime();
          daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          // alert_days bo'yicha tekshirish
          const alertDays = batch.alert_days
            ? parseInt(batch.alert_days, 10)
            : 30;
          isExpiringSoon = daysUntilExpiry <= alertDays && daysUntilExpiry >= 0;
        }

        return {
          id: batch.id,
          batchNo: batch.batch_no,
          qty: batch.qty,
          expiryDate: batch.expiry_date,
          expiryMonths: batch.expiry_months,
          expiryUnit: batch.expiry_unit,
          storage: batch.storage,
          isExpiringSoon,
          daysUntilExpiry,
        };
      });

      // FEFO sort: 유효기간 임박 제품 상단 우선 노출
      batches.sort((a: any, b: any) => {
        // 1. 유효기간 임박 우선
        if (a.isExpiringSoon && !b.isExpiringSoon) return -1;
        if (!a.isExpiringSoon && b.isExpiringSoon) return 1;

        // 2. 유효기간으로 정렬 (오래된 것 먼저)
        const dateA = a.expiryDate ? new Date(a.expiryDate).getTime() : 0;
        const dateB = b.expiryDate ? new Date(b.expiryDate).getTime() : 0;
        if (dateA !== dateB) {
          return dateA - dateB;
        }

        // 3. 배치번호로 정렬
        return (a.batchNo || "").localeCompare(b.batchNo || "");
      });

      return {
        productId: product?.id || "",
        productName: product?.name || "",
        brand: product?.brand || "",
        unit: product?.unit || "",
        packageQuantity: item.quantity, // 패키지당 수량
        currentStock: product?.current_stock || 0,
        minStock: product?.min_stock || 0,
        batches,
      };
    });

    return items;
  }
}

