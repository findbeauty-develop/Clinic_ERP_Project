"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const barcodeMethods = [
  {
    key: "manual",
    title: "방법 1",
    description: "직접 입력",
    helper: "바코드 번호를 직접 입력하세요 (예: 8801234567890)",
  },
  {
    key: "scanner",
    title: "방법 2",
    description: "바코드 스캐너 사용",
    helper: "바코드 스캐너로 제품 바코드를 스캔하면 자동으로 입력됩니다.",
  },
];

const inboundManagers = ["성함 선택", "김도훈", "이지은", "한지민"];
const statusOptions = ["활성", "재고 부족", "만료", "단종"];
const unitOptions = ["단위 선택", "개", "ml", "g","세트","박스","병"];

export default function InboundNewPage() {
  const router = useRouter();
  const apiUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000", []);
  
  const [selectedBarcodeMethod, setSelectedBarcodeMethod] = useState<string>("manual");
  const [isReturnable, setIsReturnable] = useState<boolean>(true);
  const [selectedManager, setSelectedManager] = useState<string>(inboundManagers[0]);
  const [loading, setLoading] = useState(false);
  const [inboundDate, setInboundDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // YYYY-MM-DD format
  });
  
  // Form state
  const [formData, setFormData] = useState({
    // Product info
    name: "",
    brand: "",
    barcode: "",
    image: "",
    imageUrl: "",
    category: "",
    status: statusOptions[0],
    isActive: true,
    isUrgent: false, 
    currentStock: 0,
    minStock: 0,
    unit: unitOptions[0],
    capacityPerProduct: 0,
    capacityUnit: unitOptions[0],
    usageCapacity: 0,
    purchasePrice: "",
    salePrice: "",
    // Return policy
    refundAmount: "",
    returnStorage: "",
    returnNote: "",
    // Batch info
    batchNo: "",
    storage: "",
    manufactureDate: "",
    expiryDate: "",
    expiryMonths: 12,
    expiryUnit: "months",
    alertDays: "",
    // Supplier info
    supplierId: "",
    supplierName: "",
    supplierContactName: "",
    supplierContactPhone: "",
    supplierEmail: "",
    supplierNote: "",
    moq: "",
    leadTimeDays: "",
  });

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        handleInputChange("image", base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Prepare API payload
      // Map isUrgent checkbox to status: if checked (단종), set to "단종", otherwise "활성"
      const resolvedStatus = formData.isUrgent ? "단종" : "활성";
      const resolvedIsActive = formData.isUrgent ? false : true;
      
      const payload: any = {
        name: formData.name,
        brand: formData.brand,
        category: formData.category,
        status: resolvedStatus,
        isActive: resolvedIsActive,
        currentStock: Number(formData.currentStock) || 0,
        minStock: Number(formData.minStock) || 0,
      };
      if (formData.unit && formData.unit !== unitOptions[0]) {
        payload.unit = formData.unit;
      }
      if (formData.capacityPerProduct && formData.capacityPerProduct > 0) {
        payload.capacityPerProduct = Number(formData.capacityPerProduct);
      }
      if (formData.capacityUnit && formData.capacityUnit !== unitOptions[0]) {
        payload.capacityUnit = formData.capacityUnit;
      }
      if (formData.usageCapacity && formData.usageCapacity > 0) {
        payload.usageCapacity = Number(formData.usageCapacity);
      }
      if (formData.purchasePrice) {
        payload.purchasePrice = Number(formData.purchasePrice);
      }
      if (formData.salePrice) {
        payload.salePrice = Number(formData.salePrice);
      }

      // Add optional fields
      if (formData.barcode) payload.barcode = formData.barcode;
      if (formData.image) payload.image = formData.image;
      else if (formData.imageUrl) payload.image = formData.imageUrl;

      // Add return policy if returnable
      if (isReturnable) {
        payload.returnPolicy = {
          is_returnable: true,
          refund_amount: formData.refundAmount ? Number(formData.refundAmount) : undefined,
          return_storage: formData.returnStorage || undefined,
          note: formData.returnNote || undefined,
        };
      }

      // Add batch if batch info is provided
      if (formData.batchNo) {
        payload.initial_batches = [
          {
            batch_no: formData.batchNo,
            storage: formData.storage || undefined,
            purchase_price: formData.purchasePrice ? Number(formData.purchasePrice) : undefined,
            sale_price: formData.salePrice ? Number(formData.salePrice) : undefined,
            manufacture_date: formData.manufactureDate || undefined,
            expiry_date: formData.expiryDate || undefined,
            expiry_months: formData.expiryMonths || undefined,
            expiry_unit: formData.expiryUnit || undefined,
            qty: Number(formData.currentStock) || 0,
            alert_days: formData.alertDays || undefined,
          },
        ];
      }

      // Add supplier if supplier info is provided
      if (formData.supplierId || formData.supplierName) {
        payload.suppliers = [
          {
            supplier_id: formData.supplierId || formData.supplierName,
            purchase_price: formData.purchasePrice ? Number(formData.purchasePrice) : undefined,
            moq: formData.moq ? Number(formData.moq) : undefined,
            lead_time_days: formData.leadTimeDays ? Number(formData.leadTimeDays) : undefined,
            note: formData.supplierNote || undefined,
            contact_name: formData.supplierContactName || undefined,
            contact_phone: formData.supplierContactPhone || undefined,
            contact_email: formData.supplierEmail || undefined,
          },
        ];
      }

      // Call API using authenticated request
      const { apiPost } = await import("../../../lib/api");
      const result = await apiPost("/products", payload);
      console.log("Product created:", result);
      
      // Redirect to inbound list page
      router.push("/inbound");
    } catch (error) {
      console.error("Error creating product:", error);
      alert(error instanceof Error ? error.message : "제품 저장에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 bg-slate-50 dark:bg-slate-900/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
              신규 입고 등록
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/inbound"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300"
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </Link>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">제품 정보 입력</h1>
            </div>
            <p className="max-w-3xl text-base text-slate-500 dark:text-slate-300">
            
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-2 text-base font-medium text-slate-700 dark:text-slate-200">
              <span>입고날짜</span>
              <span className="font-mono text-slate-900 dark:text-white">
                {inboundDate
                  .split('-')
                  .map((part, i) => (i === 0 ? part.slice(2) : part))
                  .join('-')}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
             
           
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:from-sky-600 hover:to-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <SaveIcon className="h-5 w-5" />
              {loading ? "저장 중..." : "제품 저장"}
            </button>
            </div>
          </div>
        </header>

        <section className="space-y-6">
          <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
            <InfoIcon className="h-5 w-5 text-sky-500" />
            제품 정보
          </h2>
          <div className="rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-200/40 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
            <div className="space-y-8 p-6 sm:p-10">
              <div className="grid gap-6 md:grid-cols-2">
                <InputField
                  label="제품명 *"
                  placeholder="제품명을 입력해주세요"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                />
                <InputField
                  label="브랜드"
                  placeholder="브랜드명을 입력해주세요"
                  value={formData.brand}
                  onChange={(e) => handleInputChange("brand", e.target.value)}
                />
              </div>

              <div className="space-y-5 rounded-2xl bg-gradient-to-br from-sky-50 via-white to-transparent p-6 dark:from-sky-900/20 dark:via-slate-900">
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
                  <BarcodeIcon className="h-5 w-5 text-sky-500" />
                  바코드 입력
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {barcodeMethods.map((method) => {
                    const active = selectedBarcodeMethod === method.key;
                    return (
                      <button
                        key={method.key}
                        type="button"
                        onClick={() => setSelectedBarcodeMethod(method.key)}
                        className={`flex h-full flex-col gap-2 rounded-2xl border px-5 py-4 text-left transition ${
                          active
                            ? "border-sky-400 bg-white shadow-sm dark:border-sky-500 dark:bg-slate-900"
                            : "border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/40"
                        }`}
                      >
                        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{method.title}</span>
                        <span className="text-base font-medium text-slate-900 dark:text-slate-100">{method.description}</span>
                        <span className="text-sm text-slate-500 dark:text-slate-400">{method.helper}</span>
                      </button>
                    );
                  })}
                </div>
                <InputField
                  label="바코드 번호"
                  placeholder="바코드 번호를 입력하거나 스캔하세요"
                  value={formData.barcode}
                  onChange={(e) => handleInputChange("barcode", e.target.value)}
                  inputProps={{ type: "text", inputMode: "numeric", pattern: "[0-9]*" }}
                />
                <div className="flex flex-col gap-3 text-sm text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    바코드 스캐너를 사용하면 입력 정확도가 높아집니다. 스캔 정보는 자동 저장됩니다.
                  </span>
                  <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white">
                    <ScanIcon className="h-4 w-4" />
                    바코드 스캐너 연결 가이드
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-6 dark:border-slate-800 dark:bg-slate-900/60">
                  <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">파일 업로드</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <UploadDropzone onFileSelect={handleImageUpload} imagePreview={formData.image} />
                    <InputField
                      label="이미지 URL 직접 입력"
                      placeholder="https://example.com/image.jpg"
                      value={formData.imageUrl}
                      onChange={(e) => handleInputChange("imageUrl", e.target.value)}
                    />
                  </div>
                  <InputField
                    label="AI 이미지 검색 (실험적 기능)"
                    placeholder="제품명으로 이미지 검색..."
                    suffix={
                      <button className="inline-flex h-9 items-center justify-center rounded-lg bg-sky-500 px-3 text-sm font-medium text-white transition hover:bg-sky-600">
                        <SearchIcon className="h-4 w-4" />
                      </button>
                    }
                  />
                </div>
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        상태
                      </label>
                      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                        <div className="relative">
                          <input
                            type="checkbox"
                            id="isUrgent"
                            checked={formData.isUrgent}
                            onChange={(e) => handleInputChange("isUrgent", e.target.checked)}
                            className="h-5 w-5 appearance-none rounded border border-slate-300 bg-white checked:bg-sky-500 checked:border-sky-500 focus:ring-2 focus:ring-sky-500 focus:ring-offset-0 dark:border-slate-600 dark:bg-white dark:checked:bg-sky-500"
                          />
                          {formData.isUrgent && (
                            <svg
                              className="pointer-events-none absolute left-0 top-0 h-5 w-5 text-white"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4.5 12.75l6 6 9-13.5"
                              />
                            </svg>
                          )}
                        </div>
                        <label htmlFor="isUrgent" className="text-sm font-medium text-slate-900 cursor-pointer dark:text-slate-100">
                          단종
                        </label>
                      </div>
                    </div>
                    <InputField
                      label="카테고리 *"
                      placeholder="카테고리를 입력하세요 (예: 코스메슈티컬)"
                      value={formData.category}
                      onChange={(e) => handleInputChange("category", e.target.value)}
                    />
                  </div>
                  {/* Stock and Capacity Grid - 2x2 Layout */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Top Row - Stock Fields */}
                    <NumberField
                      label="현재 재고"
                      value={formData.currentStock}
                      onChange={(value) => handleInputChange("currentStock", value)}
                    />
                    <NumberField
                      label="최소 재고 *"
                      value={formData.minStock}
                      onChange={(value) => handleInputChange("minStock", value)}
                    />
                    
                    {/* Bottom Row - Capacity Fields */}
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                        제품당 용량
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="0"
                          value={formData.capacityPerProduct || ""}
                          onChange={(e) => handleInputChange("capacityPerProduct", e.target.value ? Number(e.target.value) : 0)}
                          placeholder="0"
                          className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        />
                        <div className="relative w-28">
                          <select
                            value={formData.capacityUnit}
                            onChange={(e) => handleInputChange("capacityUnit", e.target.value)}
                            className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          >
                            {unitOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                        사용 용량
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="0"
                          value={formData.usageCapacity || ""}
                          onChange={(e) => handleInputChange("usageCapacity", e.target.value ? Number(e.target.value) : 0)}
                          placeholder="0"
                          className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        />
                        <div className="relative w-28">
                          <select
                            value={formData.capacityUnit}
                            onChange={(e) => handleInputChange("capacityUnit", e.target.value)}
                            className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          >
                            {unitOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
            <DollarIcon className="h-5 w-5 text-emerald-500" />
            가격 정보
          </h2>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="grid gap-6 md:grid-cols-2">
              <InputField
                label="구매가 (원)"
                placeholder="0"
                value={formData.purchasePrice}
                onChange={(e) => handleInputChange("purchasePrice", e.target.value)}
                inputProps={{ type: "number", min: 0 }}
              />
              <InputField
                label="판매가 (원)"
                placeholder="0"
                value={formData.salePrice}
                onChange={(e) => handleInputChange("salePrice", e.target.value)}
                inputProps={{ type: "number", min: 0 }}
              />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="text-sm text-slate-500 dark:text-slate-400">
                공급업체로부터 구매하는 가격
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                고객에게 판매하는 가격
              </div>
            </div>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">단위</span>
                <select
                  value={formData.unit}
                  onChange={(e) => handleInputChange("unit", e.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {unitOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
            <TruckIcon className="h-5 w-5 text-indigo-500" />
            공급업체 정보
          </h2>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-slate-800 dark:text-slate-100">기존 담당자 선택</span>
              <div className="flex -space-x-2">
                <Avatar color="bg-sky-500" />
                <Avatar color="bg-indigo-500" />
              </div>
            </div>
            <div className="mt-6 space-y-6">
              <SelectField
                label="기존 담당자를 선택하거나 새로 입력하세요"
                options={["새 담당자 등록", "김도훈 차장", "이지은 대리"]}
                value={formData.supplierId}
                onChange={(value) => handleInputChange("supplierId", value)}
              />
              <InputField
                label="공급업체명"
                placeholder="공급업체명을 입력하세요"
                value={formData.supplierName}
                onChange={(e) => handleInputChange("supplierName", e.target.value)}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <InputField
                  label="담당자 이름"
                  placeholder="담당자 이름을 입력하세요"
                  value={formData.supplierContactName}
                  onChange={(e) => handleInputChange("supplierContactName", e.target.value)}
                />
                <InputField
                  label="담당자 연락처"
                  placeholder="담당자 연락처를 입력하세요"
                  value={formData.supplierContactPhone}
                  onChange={(e) => handleInputChange("supplierContactPhone", e.target.value)}
                />
              </div>
              <InputField
                label="공급업체 이메일"
                placeholder="example@supplier.com"
                inputProps={{ type: "email" }}
                value={formData.supplierEmail}
                onChange={(e) => handleInputChange("supplierEmail", e.target.value)}
              />
              <TextareaField
                label="공급업체 특이사항"
                placeholder="해당 공급업체에 대한 특별한 지시사항이나 메모를 입력하세요 (예: 특정 요일에만 배송 가능)"
                rows={3}
                value={formData.supplierNote}
                onChange={(e) => handleInputChange("supplierNote", e.target.value)}
              />
              <TextareaField label="메모" placeholder="추가 메모를 입력하세요" rows={4} />
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
            <RefreshIcon className="h-5 w-5 text-amber-500" />
            반납 관리
          </h2>
          <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-6 shadow-lg shadow-amber-200/40 dark:border-amber-500/40 dark:bg-amber-500/10">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={isReturnable}
                onChange={() => setIsReturnable((prev) => !prev)}
                className="mt-1 h-5 w-5 rounded border-amber-300 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-sm text-amber-700 dark:text-amber-200">
                이 제품은 반납 가능한 제품입니다. 반납 정책을 입력하면 자동으로 시스템에 반영됩니다.
              </span>
            </label>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <InputField
                label="반납 시 할인 금액 (개당, 원)"
                placeholder="예: 5000"
                value={formData.refundAmount}
                onChange={(e) => handleInputChange("refundAmount", e.target.value)}
                disabled={!isReturnable}
              />
              <InputField
                label="반납품 보관 위치"
                placeholder="보관 위치 입력하거나 선택하세요"
                value={formData.returnStorage}
                onChange={(e) => handleInputChange("returnStorage", e.target.value)}
                disabled={!isReturnable}
              />
            </div>
            <TextareaField
              label="반납 정책 메모"
              placeholder="반납 조건이나 추가 정보를 입력하세요"
              value={formData.returnNote}
              onChange={(e) => handleInputChange("returnNote", e.target.value)}
              rows={4}
              disabled={!isReturnable}
            />
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
            <CalendarIcon className="h-5 w-5 text-emerald-500" />
            유통기한 정보
          </h2>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">제조일 선택</label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="date"
                      value={formData.manufactureDate}
                      onChange={(e) => handleInputChange("manufactureDate", e.target.value)}
                      className="h-14 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">유통기한 기간</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={formData.expiryMonths}
                      onChange={(e) => handleInputChange("expiryMonths", Number(e.target.value))}
                      className="h-11 w-20 rounded-xl border border-slate-200 bg-white px-4 text-center text-sm text-slate-700 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                    <select
                      value={formData.expiryUnit}
                      onChange={(e) => handleInputChange("expiryUnit", e.target.value)}
                      className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-600 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <option value="months">개월</option>
                      <option value="days">일</option>
                      <option value="years">년</option>
                    </select>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    제조일부터 12개월 후가 유통기한이 됩니다.
                  </p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">계산된 유통기한</label>
                  <input
                    type="text"
                    readOnly
                    value="제조일을 선택하면 자동 계산됩니다"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-sky-50 px-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-sky-500/10 dark:text-slate-400"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">또는 직접 입력</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="yyyy/mm/dd"
                      value={formData.expiryDate}
                      onChange={(e) => handleInputChange("expiryDate", e.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                    <CalendarIcon className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  </div>
                  <p className="mt-2 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <LightbulbIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    직접 입력하면 제조일 기반 계산이 초기화됩니다.
                  </p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">유통기한 임박 알림 기준</label>
                  <div className="relative">
                    <select
                      value={formData.alertDays || ""}
                      onChange={(e) => handleInputChange("alertDays", e.target.value)}
                      className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <option value="">선택(30일전/60일전/90일전)</option>
                      <option value="30">30일전</option>
                      <option value="60">60일전</option>
                      <option value="90">90일전</option>
                    </select>
                    <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
                      <svg
                        className="h-4 w-4 text-slate-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">보관 위치</label>
                  <input
                    type="text"
                    placeholder="보관 위치를 입력하거나 선택하세요"
                    value={formData.storage}
                    onChange={(e) => handleInputChange("storage", e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                  <p className="mt-2 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <LightbulbIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    기존 보관 위치: 냉장고 B, 선반 B-1, 선반_B 외 3곳
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
            <ClipboardIcon className="h-5 w-5 text-indigo-500" />
            입고 담당자
          </h2>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
            <ManagerSelectField
              label="성함 선택"
              options={inboundManagers}
              value={selectedManager}
              onChange={setSelectedManager}
            />
          </div>
        </section>

        <footer className="">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-end">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 px-6 text-sm font-semibold text-white shadow-lg transition hover:from-sky-600 hover:to-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <SaveIcon className="h-5 w-5" />
              {loading ? "저장 중..." : "제품 저장"}
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}

function InputField({
  label,
  placeholder,
  disabled,
  suffix,
  inputProps,
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  disabled?: boolean;
  suffix?: React.ReactNode;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <div className="relative flex items-center">
        <input
          {...inputProps}
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          className={`h-11 w-full rounded-xl border bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${
            disabled ? "border-dashed opacity-60 dark:border-slate-700" : "border-slate-200"
          }`}
        />
        {suffix ? <div className="absolute inset-y-0 right-2 flex items-center">{suffix}</div> : null}
      </div>
    </label>
  );
}

function TextareaField({
  label,
  placeholder,
  rows = 4,
  disabled,
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        className={`w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${
          disabled ? "border-dashed opacity-60 dark:border-slate-700" : "border-slate-200"
        }`}
      />
    </label>
  );
}

function SelectField({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: string[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        className={`h-11 w-full rounded-xl border bg-white px-4 text-sm text-slate-700 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${
          disabled ? "border-dashed opacity-60 dark:border-slate-700" : "border-slate-200"
        }`}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange?: (value: number) => void;
}) {
  const handleDecrement = () => {
    if (onChange) {
      onChange(Math.max(0, (value || 0) - 1));
    }
  };

  const handleIncrement = () => {
    if (onChange) {
      onChange((value || 0) + 1);
    }
  };

  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDecrement}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-xl text-slate-500 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          -
        </button>
        <input
          type="number"
          value={value || 0}
          onChange={(e) => onChange && onChange(Number(e.target.value) || 0)}
          className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-center text-sm text-slate-700 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
        <button
          type="button"
          onClick={handleIncrement}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-xl text-slate-500 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          +
        </button>
      </div>
    </label>
  );
}

function UploadDropzone({
  onFileSelect,
  imagePreview,
}: {
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  imagePreview?: string;
}) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-6 text-center transition hover:border-sky-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60">
      {imagePreview ? (
        <>
          <img src={imagePreview} alt="Preview" className="h-full w-full object-contain rounded-xl" />
          <label className="absolute inset-0 cursor-pointer">
            <input type="file" accept="image/*" onChange={onFileSelect} className="hidden" />
          </label>
        </>
      ) : (
        <>
          <UploadIcon className="h-10 w-10 text-sky-500" />
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">컴퓨터에서 이미지 선택</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">JPG, PNG, 최대 5MB</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-sky-400 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-600 transition hover:bg-sky-500/20 dark:border-sky-500 dark:text-sky-300 dark:hover:bg-sky-500/10">
            파일 선택
            <input type="file" accept="image/*" onChange={onFileSelect} className="hidden" />
          </label>
        </>
      )}
    </div>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function SaveIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 21v-7.5H7.5V21M4.5 7.5l7.5-5.25L19.5 7.5M12 2.25v9" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1115 6.75a7.5 7.5 0 011.65 9.9z" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25h1.5v5.25h-1.5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75h.008v.008H12z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
    </svg>
  );
}

function BarcodeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6v12M7.5 6v12M12 6v12M15 6v12M18 6v12" />
    </svg>
  );
}

function DollarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m4.5-13.5A3.75 3.75 0 0012 3.75h-.75a3.75 3.75 0 000 7.5h1.5a3.75 3.75 0 010 7.5H12a3.75 3.75 0 01-4.5-3.75" />
    </svg>
  );
}

function ScanIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5V4.875A1.125 1.125 0 014.875 3.75H7.5M3.75 16.5v2.625c0 .621.504 1.125 1.125 1.125H7.5M16.5 3.75h2.625c.621 0 1.125.504 1.125 1.125V7.5M16.5 21h2.625c.621 0 1.125-.504 1.125-1.125V16.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 12h7.5" />
    </svg>
  );
}

function TruckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75V5.25A2.25 2.25 0 014.5 3h11.25v12H3.75a1.5 1.5 0 01-1.5-1.5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 7.5H19.5c.621 0 1.125.504 1.125 1.125V15.75M15.75 12H21" />
      <circle cx="6" cy="18" r="1.5" />
      <circle cx="18" cy="18" r="1.5" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0113.3-4.7L21 6M4.5 12a7.5 7.5 0 0013.3 4.7L21 18" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 6v3h-3M21 18v-3h-3" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m4.5 0a12.06 12.06 0 00-4.5 0m0 0a8.97 8.97 0 01-3.25-.55m3.25.55a8.97 8.97 0 00-3.25-.55m0 0a9 9 0 0113.5-12.297M15.75 2.25a9 9 0 00-9 9c0 1.507.18 2.97.54 4.35M15.75 2.25A8.97 8.97 0 0118 2.25c2.34 0 4.5.9 6.12 2.38M15.75 2.25a8.97 8.97 0 00-2.25 1.5m0 0a9 9 0 00-9 9m9-9v.001" />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5V6h6V4.5a1.5 1.5 0 00-1.5-1.5h-3A1.5 1.5 0 009 4.5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.75A2.25 2.25 0 016.75 4.5h10.5a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0117.25 20.25H6.75A2.25 2.25 0 014.5 18V6.75z" />
    </svg>
  );
}

function InfoBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {children}
    </span>
  );
}

function Avatar({ color }: { color: string }) {
  return (
    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-sm font-semibold text-white ${color}`}>
      Y
    </span>
  );
}

function ManagerSelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {label}
        </span>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-700 transition hover:border-slate-300 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <span className={value === options[0] ? "text-slate-400" : ""}>
            {value}
          </span>
          <ChevronDownIcon
            className={`h-4 w-4 text-slate-400 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </label>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-3 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                  value === option
                    ? "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"
                    : "text-slate-700 dark:text-slate-200"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
      />
    </svg>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
      />
    </svg>
  );
}

