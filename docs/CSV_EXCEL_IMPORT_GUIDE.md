    # CSV/Excel Import Funksiyasi - Qo'llanma

    ## Umumiy ma'lumot

    Bu hujjat CSV/Excel fayl orqali productlarni bulk import qilish funksiyasini qurish va ishlatish bo'yicha to'liq qo'llanmadir.

    ## Arxitektura

    ### Frontend

    - **Fayl:** `apps/frontend/app/inbound/new/page.tsx`
    - **Yondashuv:** Mavjud `/inbound/new` pageda tab yoki card sifatida qo'shish
    - **Kutubxona:** `xlsx` (Excel fayllar uchun)

    ### Backend

    - **Controller:** `apps/backend/src/modules/product/controllers/products.controller.ts`
    - **Service:** `apps/backend/src/modules/product/services/products.service.ts`
    - **DTO:** `apps/backend/src/modules/product/dto/create-product.dto.ts`

    ## Majburiy fieldlar (Required)

    ### Backend validation bo'yicha:

    1. **`name`** (제품명) - Product nomi
    2. **`brand`** (브랜드) - Brand nomi
    3. **`category`** (카테고리) - Kategoriya

    ### CSV import uchun qo'shimcha majburiy:

    4. **`contact_phone`** (담당자전화번호) - Supplier bilan aloqa uchun majburiy

    ## Kritik fieldlar (Bo'lmasa boshqa funksiyalar buzilishi mumkin)

    ### 1. `unit` (단위) - **Juda muhim**

    - **Nima uchun kerak:**
    - Outbound pageda ko'rsatish
    - Package pageda ko'rsatish
    - Barcha sahifalarda miqdor ko'rsatish
    - **Agar bo'lmasa:**
    - Fallback: `"단위"` yoki `"EA"`
    - UI'da noto'g'ri ko'rinishi mumkin
    - **CSV import uchun:** Majburiy emas, lekin tavsiya etiladi (default: "EA")

    ### 2. `capacity_per_product` va `usage_capacity` (제품용량, 사용단위)

    - **Nima uchun kerak:**
    - Outbound'da "사용 단위" mantiqi
    - Returns'da empty box hisoblash
    - Outbound pageda 재고 ko'rsatish (`inbound_qty * capacity_per_product`)
    - **Agar bo'lmasa:**
    - "사용 단위" mantiqi ishlamaydi
    - Empty box hisoblanmaydi
    - Outbound pageda 재고 noto'g'ri ko'rsatiladi
    - **CSV import uchun:** Ixtiyoriy, lekin agar "사용 단위" kerak bo'lsa, majburiy

    ### 3. `expiry_months` va `expiry_unit` (유통기한개월, 유통기한단위)

    - **Nima uchun kerak:**
    - Batch yaratilganda expiry date avtomatik hisoblash
    - FEFO sorting
    - **Agar bo'lmasa:**
    - Expiry date avtomatik hisoblanmaydi
    - FEFO sorting to'g'ri ishlamaydi
    - **CSV import uchun:** Ixtiyoriy, lekin tavsiya etiladi

    ### 4. `min_stock` (최소재고)

    - **Nima uchun kerak:**
    - Low stock warning
    - "부족" badge ko'rsatish
    - Batch'ga copy qilinadi
    - **Agar bo'lmasa:**
    - Low stock warning ishlamaydi
    - "부족" badge ko'rsatilmaydi
    - **CSV import uchun:** Ixtiyoriy (default: 0)

    ### 5. `inbound_qty` (입고수량)

    - **Nima uchun kerak:**
    - Outbound pageda 재고 ko'rsatish (`inbound_qty * capacity_per_product`)
    - Batch yaratilganda saqlanadi
    - **Agar bo'lmasa:**
    - Outbound pageda 재고 noto'g'ri ko'rsatiladi (fallback: `batch.qty`)
    - **CSV import uchun:** Ixtiyoriy (batch yaratilganda avtomatik qo'shiladi)

    ## CSV/Excel Template

    ### Minimal versiya (Majburiy fieldlar):

    ```csv
    제품명,브랜드,카테고리,담당자전화번호
    제품1,브랜드1,카테고리1,01012345678
    제품2,브랜드2,카테고리2,01098765432
    ```

    ### Tavsiya etilgan versiya (Funksiyalar to'liq ishlashi uchun):

    ```csv
    제품명,브랜드,카테고리,단위,재고수량,최소재고,제품용량,용량단위,사용단위,유통기한개월,유통기한단위,담당자전화번호
    제품1,브랜드1,카테고리1,EA,100,10,5,EA,1,12,months,01012345678
    제품2,브랜드2,카테고리2,BOX,50,5,10,EA,1,6,months,01098765432
    ```

    ### To'liq versiya (Barcha funksiyalar uchun):

    ```csv
    제품명,브랜드,바코드,카테고리,단위,구매가,판매가,재고수량,최소재고,제품용량,용량단위,사용단위,유통기한개월,유통기한단위,보관위치,회사명,사업자등록번호,담당자이름,담당자전화번호,담당자이메일
    제품1,브랜드1,1234567890,카테고리1,EA,1000,2000,100,10,5,EA,1,12,months,창고A,ABC제약,123-45-67890,홍길동,01012345678,hong@abc.com
    제품2,브랜드2,0987654321,카테고리2,BOX,2000,4000,50,5,10,EA,1,6,months,창고B,XYZ제약,098-76-54321,김철수,01098765432,kim@xyz.com
    ```

    ## CSV Column Mapping

    CSV faylda quyidagi ustun nomlari qo'llab-quvvatlanadi:

    | CSV Ustun Nomi       | Backend Field                  | Izoh                       |
    | -------------------- | ------------------------------ | -------------------------- |
    | `제품명`             | `name`                         | Asosiy                     |
    | `name`               | `name`                         | Alternative                |
    | `productName`        | `name`                         | Alternative                |
    | `브랜드`             | `brand`                        | Asosiy                     |
    | `brand`              | `brand`                        | Alternative                |
    | `카테고리`           | `category`                     | Asosiy                     |
    | `category`           | `category`                     | Alternative                |
    | `단위`               | `unit`                         | Asosiy (default: "EA")     |
    | `unit`               | `unit`                         | Alternative                |
    | `바코드`             | `barcode`                      | Asosiy                     |
    | `barcode`            | `barcode`                      | Alternative                |
    | `구매가`             | `purchasePrice`                | Asosiy                     |
    | `purchasePrice`      | `purchasePrice`                | Alternative                |
    | `판매가`             | `salePrice`                    | Asosiy                     |
    | `salePrice`          | `salePrice`                    | Alternative                |
    | `재고수량`           | `currentStock`                 | Asosiy (default: 0)        |
    | `currentStock`       | `currentStock`                 | Alternative                |
    | `최소재고`           | `minStock`                     | Asosiy (default: 0)        |
    | `minStock`           | `minStock`                     | Alternative                |
    | `제품용량`           | `capacityPerProduct`           | Asosiy                     |
    | `capacityPerProduct` | `capacityPerProduct`           | Alternative                |
    | `용량단위`           | `capacityUnit`                 | Asosiy                     |
    | `capacityUnit`       | `capacityUnit`                 | Alternative                |
    | `사용단위`           | `usageCapacity`                | Asosiy                     |
    | `usageCapacity`      | `usageCapacity`                | Alternative                |
    | `유통기한개월`       | `expiryMonths`                 | Asosiy                     |
    | `expiryMonths`       | `expiryMonths`                 | Alternative                |
    | `유통기한단위`       | `expiryUnit`                   | Asosiy (default: "months") |
    | `expiryUnit`         | `expiryUnit`                   | Alternative                |
    | `보관위치`           | `storage`                      | Asosiy                     |
    | `storage`            | `storage`                      | Alternative                |
    | `회사명`             | `suppliers[0].company_name`    | Asosiy                     |
    | `company_name`       | `suppliers[0].company_name`    | Alternative                |
    | `supplierName`       | `suppliers[0].company_name`    | Alternative                |
    | `사업자등록번호`     | `suppliers[0].business_number` | Asosiy                     |
    | `business_number`    | `suppliers[0].business_number` | Alternative                |
    | `businessNumber`     | `suppliers[0].business_number` | Alternative                |
    | `담당자이름`         | `suppliers[0].contact_name`    | Asosiy                     |
    | `contact_name`       | `suppliers[0].contact_name`    | Alternative                |
    | `managerName`        | `suppliers[0].contact_name`    | Alternative                |
    | `담당자전화번호`     | `suppliers[0].contact_phone`   | **Majburiy (CSV import)**  |
    | `contact_phone`      | `suppliers[0].contact_phone`   | Alternative                |
    | `phoneNumber`        | `suppliers[0].contact_phone`   | Alternative                |
    | `전화번호`           | `suppliers[0].contact_phone`   | Alternative                |
    | `담당자이메일`       | `suppliers[0].contact_email`   | Asosiy                     |
    | `contact_email`      | `suppliers[0].contact_email`   | Alternative                |
    | `회사전화번호`       | `suppliers[0].company_phone`   | Asosiy                     |
    | `company_phone`      | `suppliers[0].company_phone`   | Alternative                |
    | `회사이메일`         | `suppliers[0].company_email`   | Asosiy                     |
    | `company_email`      | `suppliers[0].company_email`   | Alternative                |
    | `회사주소`           | `suppliers[0].company_address` | Asosiy                     |
    | `company_address`    | `suppliers[0].company_address` | Alternative                |

    ## Telefon raqami formatlari

    ### Qabul qilinadigan formatlar:

    - `01012345678` (10 raqam, `010` bilan boshlanadi) - **Tavsiya etiladi**
    - `010-1234-5678` (avtomatik formatlanadi)
    - `010 1234 5678` (avtomatik formatlanadi)

    ### Validation:

    - Regex: `/^010\d{8}$/`
    - Formatlangan: `01012345678` (10 raqam)

    ## Implementation Plan

    ### 1. Frontend qismi

    #### a) CSV/Excel fayl yuklash komponenti

    - File input qo'shish (`accept=".csv,.xlsx,.xls"`)
    - CSV parse funksiyasi
    - Excel parse funksiyasi (`xlsx` kutubxonasi)
    - Validation va error handling
    - Progress bar (ko'p productlar uchun)

    #### b) UI komponenti

    - Tab yoki toggle button (개별 등록 / 대량 등록)
    - File upload input
    - Preview table (import qilishdan oldin)
    - Error list (validation error'lar)
    - Success/Error messages

    ### 2. Backend qismi

    #### a) Bulk create DTO

    ```typescript
    export class BulkCreateProductsDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateProductDto)
    products!: CreateProductDto[];
    }
    ```

    #### b) Controller endpoint

    ```typescript
    @Post('bulk')
    @UseGuards(JwtTenantGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create multiple products from CSV/Excel' })
    async bulkCreate(
    @Body() dto: BulkCreateProductsDto,
    @Tenant() tenantId: string
    )
    ```

    #### c) Service metod

    - Batch processing (20-50 ta product har safar)
    - Transaction timeout: 5 daqiqa (300000 ms)
    - Error handling (har bir product uchun alohida)
    - Cache invalidation (barcha productlar yaratilgandan keyin)

    ### 3. Validation

    #### Frontend validation:

    - Majburiy fieldlar tekshiruvi
    - Telefon raqami format tekshiruvi
    - Number fieldlar tekshiruvi
    - Email format tekshiruvi (agar mavjud bo'lsa)

    #### Backend validation:

    - DTO validation (`class-validator`)
    - Har bir product uchun alohida validation
    - Error collection va qaytarish

    ## Performance Considerations

    ### 100 ta product import uchun:

    - **Batch size:** 20-50 ta product
    - **Timeout:** 5 daqiqa (300000 ms)
    - **Progress tracking:** Frontend'da ko'rsatish
    - **Error handling:** Har bir product uchun alohida error saqlash

    ### Optimizatsiya:

    - Parallel processing (Promise.allSettled)
    - Cache invalidation (barcha productlar yaratilgandan keyin)
    - Transaction optimization (bitta katta transaction yoki batch'lar)

    ## Error Handling

    ### Frontend:

    - Validation error'lar (qator raqami bilan)
    - Network error'lar
    - File parse error'lar

    ### Backend:

    - DTO validation error'lar
    - Database error'lar
    - Transaction error'lar

    ### Error response format:

    ```typescript
    {
    success: boolean,
    created: number,
    failed: number,
    errors: Array<{
        row: number,
        error: string
    }>
    }
    ```

    ## Qo'shimcha tavsiyalar

    1. **Progress bar:** Ko'p productlar yuklanganda progress ko'rsatish
    2. **Preview:** Import qilishdan oldin ma'lumotlarni ko'rsatish
    3. **Template download:** Template faylni yuklab olish imkoniyati
    4. **Batch processing:** 100+ productlar uchun batch'larga bo'lib yuborish
    5. **Retry mechanism:** Failed productlar uchun qayta urinish imkoniyati

    ## Returns Page mantiqini buzmaslik

    **MUHIM:** CSV import qilganda ham returns pagedagi empty box mantiqi buzilmasligi kerak.

    - Backend'ga yuborilganda quantity o'zgartirilmaydi
    - `used_count` va `batch.qty` to'g'ri yangilanadi
    - Empty box hisoblash to'g'ri ishlaydi

    ## Kutubxonalar

    ### Frontend:

    ```bash
    npm install xlsx
    npm install --save-dev @types/xlsx
    ```

    ### Backend:

    - Mavjud kutubxonalar yetarli (NestJS, Prisma, class-validator)

    ## Test Cases

    ### 1. Minimal fieldlar bilan import

    - Faqat majburiy fieldlar: `name`, `brand`, `category`, `contact_phone`
    - Natija: Product yaratiladi, lekin ba'zi funksiyalar cheklangan

    ### 2. To'liq fieldlar bilan import

    - Barcha fieldlar to'ldirilgan
    - Natija: Barcha funksiyalar to'liq ishlaydi

    ### 3. Xato format bilan import

    - Noto'g'ri telefon raqami
    - Natija: Validation error, qator o'tkazib yuboriladi

    ### 4. 100+ product import

    - 100 ta product bilan test
    - Natija: Batch processing, progress tracking, error handling

    ## Xulosa

    CSV/Excel import funksiyasi:

    - **Murakkablik:** O'rtacha (4-6 soat)
    - **Majburiy fieldlar:** `name`, `brand`, `category`, `contact_phone`
    - **Tavsiya etilgan fieldlar:** `unit`, `capacity_per_product`, `usage_capacity`, `expiry_months`, `expiry_unit`
    - **Performance:** Batch processing, progress tracking
    - **Error handling:** Har bir product uchun alohida error saqlash
