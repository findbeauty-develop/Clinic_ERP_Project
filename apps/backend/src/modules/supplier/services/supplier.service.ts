import { Injectable } from "@nestjs/common";
import { SupplierRepository } from "../repositories/supplier.repository";
import { SearchSupplierDto } from "../dto/search-supplier.dto";

@Injectable()
export class SupplierService {
  constructor(private readonly repository: SupplierRepository) {}

  async searchSuppliers(dto: SearchSupplierDto) {
    // Validate that at least one search parameter is provided
    if (!dto.companyName && !dto.phoneNumber) {
      throw new Error("회사명 또는 담당자 핸드폰 번호 중 하나는 필수입니다");
    }

    const suppliers = await this.repository.searchSuppliers(
      dto.companyName,
      dto.phoneNumber
    );

    // Format response
    return suppliers.map((supplier: any) => {
      // Get the first manager (or all managers if needed)
      const manager = supplier.managers?.[0];

      return {
        // 회사 정보
        companyName: supplier.company_name, // 회사명
        companyAddress: supplier.company_address, // 회사주소
        businessNumber: supplier.business_number, // 사업자 등록번호
        companyPhone: supplier.company_phone, // 회사 전화번호
        companyEmail: supplier.company_email, // 회사 이메일
        businessType: supplier.business_type, // 업태
        businessItem: supplier.business_item, // 종목
        productCategories: supplier.product_categories, // 취급 제품 카테고리
        status: supplier.status, // 상태

        // 담당자 정보
        managerId: manager?.manager_id || null, // 담당자 ID
        managerName: manager?.name || null, // 이름
        phoneNumber: manager?.phone_number || null, // 담당자 핸드폰 번호
        email1: manager?.email1 || null, // 이메일1
        email2: manager?.email2 || null, // 이메일2
        responsibleProducts: manager?.responsible_products || [], // 담당자 제품
        managerStatus: manager?.status || null, // 담당자 상태

        // All managers (if multiple)
        managers: supplier.managers?.map((m: any) => ({
          managerId: m.manager_id,
          name: m.name,
          phoneNumber: m.phone_number,
          email1: m.email1,
          email2: m.email2,
          responsibleProducts: m.responsible_products,
          status: m.status,
        })) || [],
      };
    });
  }
}

