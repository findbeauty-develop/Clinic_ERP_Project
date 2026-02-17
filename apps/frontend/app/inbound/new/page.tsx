"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAccessToken, getTenantId } from "../../../lib/api";

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

// inboundManagers will be loaded from API
const statusOptions = ["활성", "재고 부족", "만료", "단종"];
const unitOptions = [
  "단위 선택",
  "cc / mL",
  "unit / U",
  "mg",
  "vial",
  "shot",
  "ea",
  "box",
  "set",
  "roll",
];
const positionOptions = [
  "직함 선택",
  "사원",
  "주임",
  "대리",
  "과장",
  "차장",
  "부장",
];

export default function InboundNewPage() {
  const router = useRouter();
  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "https://api.jaclit.com",
    []
  );

  const [selectedBarcodeMethod, setSelectedBarcodeMethod] =
    useState<string>("manual");
  const [isReturnable, setIsReturnable] = useState<boolean>(false);
  const [selectedManager, setSelectedManager] = useState<string>(""); // Current logged-in member name
  const [loading, setLoading] = useState(false);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] =
    useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false); // Flag to bypass unsaved changes check when saving
  const [supplierManagers, setSupplierManagers] = useState<
    Array<{
      id: string;
      name: string;
      clinicName?: string;
      fullName?: string;
      displayName: string;
    }>
  >([]);
  const [inboundDate, setInboundDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0]; // YYYY-MM-DD format
  });
  const [storageOptions, setStorageOptions] = useState<string[]>([]);

  // Initialize manager name from localStorage (current logged-in member)
  // useEffect(() => {
  //   const memberData = localStorage.getItem("erp_member_data");
  //   if (memberData) {
  //     const member = JSON.parse(memberData);
  //     setSelectedManager(member.full_name || member.member_id || "");
  //   }
  // }, []);

  // Fetch storage options from backend
  useEffect(() => {
    const fetchStorages = async () => {
      try {
        const { apiGet } = await import("../../../lib/api");
        const token = localStorage.getItem("erp_token");
        if (!token) return;

        const response = await apiGet("/products/storages/list");
        if (Array.isArray(response)) {
          setStorageOptions(response);
        }
      } catch (error) {
        console.error("Failed to fetch storage options:", error);
        // Silently fail - user can still type manually
      }
    };

    fetchStorages();
  }, []);

  // USB Barcode Scanner Support
  useEffect(() => {
    let buffer = '';
    let lastTime = 0;
    let timeout: NodeJS.Timeout;
    
    const handleKeyPress = (e: KeyboardEvent) => {
      const now = Date.now();
      
      // USB scanner types very fast (< 100ms between chars)
      if (now - lastTime > 100) buffer = '';
      
      if (e.key === 'Enter' && buffer.length >= 8) {
        handleBarcodeScanned(buffer);
        buffer = '';
      } else if (e.key.length === 1) {
        buffer += e.key;
        lastTime = now;
        
        clearTimeout(timeout);
        timeout = setTimeout(() => { buffer = ''; }, 500);
      }
    };
    
    window.addEventListener('keypress', handleKeyPress);
    return () => {
      window.removeEventListener('keypress', handleKeyPress);
      clearTimeout(timeout);
    };
  }, [apiUrl]);

  const handleBarcodeScanned = async (scannedBarcode: string) => {
    try {
      const { parseGS1Barcode } = await import('../../../utils/barcodeParser');
      const parsed = parseGS1Barcode(scannedBarcode);
      
      if (!parsed.gtin) {
        // If not GS1 format, just use the raw barcode
        setFormData(prev => ({ ...prev, barcode: scannedBarcode }));
        return;
      }
      
      // Fill only GTIN to the barcode field
      setFormData(prev => ({ ...prev, barcode: parsed.gtin || "" }));
      
    } catch (error) {
      console.error('Barcode parsing error:', error);
      // On any error, just use the raw barcode
      setFormData(prev => ({ ...prev, barcode: scannedBarcode }));
    }
  };

  // Supplier search states
  const [supplierSearchCompanyName, setSupplierSearchCompanyName] =
    useState("");
  const [supplierSearchManagerName, setSupplierSearchManagerName] =
    useState("");
  const [supplierSearchPhoneNumber, setSupplierSearchPhoneNumber] =
    useState("");
  const [supplierSearchResults, setSupplierSearchResults] = useState<
    Array<{
      id?: string; // Supplier ID (UUID)
      supplierId?: string; // Supplier ID (alias)
      companyName: string;
      companyAddress: string | null;
      businessNumber: string;
      companyPhone: string | null;
      companyEmail: string;
      managerId: string;
      managerName: string;
      position: string | null;
      phoneNumber: string;
      email1: string | null;
      email2: string | null;
      responsibleProducts: string[];
    }>
  >([]);
  const [supplierSearchLoading, setSupplierSearchLoading] = useState(false);
  const [supplierSearchFallback, setSupplierSearchFallback] = useState(false); // For fallback search
  const [showSupplierConfirmModal, setShowSupplierConfirmModal] =
    useState(false); // Modal for confirming supplier without transaction history
  const [showManualEntryForm, setShowManualEntryForm] = useState(false); // Manual entry form
  const [pendingSupplierPhone, setPendingSupplierPhone] = useState<string>(""); // Phone number for manual entry

  // OCR and Business Verification states
  const [certificateImage, setCertificateImage] = useState<File | null>(null);
  const [certificatePreview, setCertificatePreview] = useState<string>("");
  const [certificateUrl, setCertificateUrl] = useState<string>("");
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [isBusinessValid, setIsBusinessValid] = useState<boolean | null>(null);
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  const [pendingSupplier, setPendingSupplier] = useState<{
    companyName: string;
    companyAddress: string | null;
    businessNumber: string;
    companyPhone: string | null;
    companyEmail: string;
    managerId: string; // manager_id (like "회사명0001")
    supplierManagerId?: string; // Database ID of SupplierManager (for creating ClinicSupplierLink)
    managerName: string;
    position: string | null;
    phoneNumber: string;
    email1: string | null;
    email2: string | null;
    responsibleProducts: string[];
    isRegisteredOnPlatform?: boolean;
    supplierId?: string; // Supplier company ID for approval
  } | null>(null);
  const [selectedSupplierResult, setSelectedSupplierResult] = useState<
    number | null
  >(null);
  const [selectedSupplierDetails, setSelectedSupplierDetails] = useState<{
    id?: string; // Supplier ID (UUID)
    supplierId?: string; // Supplier ID (alias)
    companyName: string;
    companyAddress: string | null;
    businessNumber: string;
    companyPhone: string | null;
    companyEmail: string;
    managerId: string;
    managerName: string;
    position: string | null;
    phoneNumber: string;
    email1: string | null;
    email2: string | null;
    responsibleProducts: string[];
  } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    // Product info
    name: "",
    brand: "",
    barcode: "",
    image: "",
    imageUrl: "",
    additionalImage: "", // Qo'shimcha image uchun
    category: "",
    status: statusOptions[0],
    isActive: true,
    isUrgent: false,
    // REMOVED: currentStock, currentStockUnit (moved to /inbound page)
    unit: unitOptions[0],
    minStock: 0,
    minStockUnit: "box", // ✅ Changed to always be "box"
    capacityPerProduct: 0,
    capacityUnit: unitOptions[0] || "cc / mL", // 제품 용량 unit
    usageCapacity: 0,
    usageCapacityUnit: unitOptions[0] || "cc / mL", // 사용 단위 unit (alohida)
    purchasePrice: "",
    purchasePriceUnit: unitOptions[0] || "cc / mL",
    salePrice: "",
    salePriceUnit: unitOptions[0] || "cc / mL",
    usageSalePrice: "", // 사용량에 대한 별도 판매가
    // Return policy
    refundAmount: "",
    returnStorage: "",
    returnNote: "",
    // REMOVED: Batch info (batchNo, storage, manufactureDate, expiryDate, moved to /inbound page)
    // Alert Days - Product level configuration
    hasExpiryPeriod: true, // 유효기간 있음/없음 switch
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
    // Packaging unit conversion
    hasDifferentPackagingQuantity: false,
    packagingFromQuantity: 0,
    packagingFromUnit: "box",
    packagingToQuantity: 0,
    packagingToUnit: "ea",
    // Usage capacity enable
    enableUsageCapacity: false,
  });

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => {
      const newData = { ...prev, [field]: value };

      // 제품 재고 수량, 최소 제품 재고, 구매가 unit'lari bir-biriga bog'langan
      const syncedUnitFields = ["minStockUnit", "purchasePriceUnit"];

      if (syncedUnitFields.includes(field)) {
        syncedUnitFields.forEach((unitField) => {
          if (unitField !== field) {
            (newData as Record<string, any>)[unitField] = value;
          }
        });
      }

      // 제품 용량 unit o'zgarganda, 판매가 unit ham o'zgaradi (readonly)
      // Faqat "사용 단위" checkbox o'chirilgan bo'lsa
      if (field === "capacityUnit") {
        // Agar "사용 단위" checkbox o'chirilgan bo'lsa, 판매가 unit 제품 용량 unit'iga o'zgaradi
        if (!prev.enableUsageCapacity) {
          newData.salePriceUnit = value;
        }
      }

      // 사용 단위 unit o'zgarganda, 판매가 unit ham o'zgaradi (readonly)
      // Faqat "사용 단위" checkbox yoqilgan bo'lsa
      if (field === "usageCapacityUnit") {
        // Agar "사용 단위" checkbox yoqilgan bo'lsa, 판매가 unit 사용 단위 unit'iga o'zgaradi
        if (prev.enableUsageCapacity) {
          newData.salePriceUnit = value;
        }
      }

      // 사용 단위 checkbox bosilganda, 판매가 unit mos ravishda o'zgaradi
      if (field === "enableUsageCapacity") {
        if (value === true) {
          // Checkbox yoqilganda, 판매가 unit 사용 단위 unit'iga o'zgaradi
          newData.salePriceUnit = prev.usageCapacityUnit;
        } else {
          // Checkbox o'chirilganda, 판매가 unit 제품 용량 unit'iga qaytadi
          newData.salePriceUnit = prev.capacityUnit;
        }
      }

      return newData;
    });
  };

  // Check if all required fields are filled
  const isFormValid = () => {
    return !!(
      formData.name?.trim() &&
      formData.brand?.trim() &&
      formData.category?.trim()
    );
  };

  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    // Check if any important fields are filled
    return !!(
      formData.name ||
      formData.barcode ||
      formData.brand ||
      formData.image ||
      formData.imageUrl ||
      formData.additionalImage ||
      formData.purchasePrice ||
      formData.salePrice ||
      formData.supplierName ||
      formData.supplierContactName ||
      selectedSupplierDetails
    );
  };

  // Handle browser beforeunload event
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [formData, selectedSupplierDetails]);

  // Handle Next.js router navigation
  useEffect(() => {
    // Intercept router.push calls
    const originalPush = router.push;
    router.push = ((url: string, options?: any) => {
      // Don't show unsaved changes dialog if we're in the process of saving
      if (isSaving) {
        return originalPush.call(router, url, options);
      }
      if (hasUnsavedChanges() && url !== "/inbound/new") {
        setPendingNavigation(url);
        setShowUnsavedChangesDialog(true);
        return Promise.resolve(false);
      }
      return originalPush.call(router, url, options);
    }) as typeof router.push;

    return () => {
      router.push = originalPush;
    };
  }, [router, formData, selectedSupplierDetails, isSaving]);

  // Handle dialog actions
  const handleLeavePage = () => {
    setShowUnsavedChangesDialog(false);
    if (pendingNavigation) {
      router.push(pendingNavigation);
      setPendingNavigation(null);
    } else {
      router.back();
    }
  };

  const handleContinueEditing = () => {
    setShowUnsavedChangesDialog(false);
    setPendingNavigation(null);
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

  const handleAdditionalImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        handleInputChange("additionalImage", base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  // Supplier search function
  const searchSuppliers = async (
    companyName?: string,
    managerName?: string,
    phoneNumber?: string
  ) => {
    if (!companyName && !managerName && !phoneNumber) {
      setSupplierSearchResults([]);
      setSupplierSearchFallback(false);
      return;
    }

    setSupplierSearchLoading(true);
    setSupplierSearchFallback(false);
    try {
      // ✅ getAccessToken() ishlatish (localStorage emas)
      const token = await getAccessToken();
      const tenantId = getTenantId();

      const params = new URLSearchParams();
      if (companyName) params.append("companyName", companyName);
      if (managerName) params.append("managerName", managerName);
      if (phoneNumber) params.append("phoneNumber", phoneNumber);

      const response = await fetch(
        `${apiUrl}/supplier/search?${params.toString()}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Tenant-Id": tenantId || "",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const results = data.map((item: any) => ({
          companyName: item.companyName || "",
          companyAddress: item.companyAddress || null,
          businessNumber: item.businessNumber || "",
          companyPhone: item.companyPhone || null,
          companyEmail: item.companyEmail || "",
          managerId: item.managerId || "",
          managerName: item.managerName || "",
          position: item.position || null,
          phoneNumber: item.phoneNumber || "",
          email1: item.email1 || null,
          email2: item.email2 || null,
          responsibleProducts: item.responsibleProducts || [],
          supplierId: item.supplierId || item.id || null, // Supplier company ID
        }));
        setSupplierSearchResults(results);

        // If no results and we have companyName + managerName, show fallback option
        if (results.length === 0 && companyName && managerName) {
          setSupplierSearchFallback(true);
        }
      } else {
        setSupplierSearchResults([]);
        if (companyName && managerName) {
          setSupplierSearchFallback(true);
        }
      }
    } catch (error) {
      console.error("Error searching suppliers:", error);
      setSupplierSearchResults([]);
      if (companyName && managerName) {
        setSupplierSearchFallback(true);
      }
    } finally {
      setSupplierSearchLoading(false);
    }
  };

  // Fallback search by phone number (without transaction history filter)
  const searchSuppliersByPhone = async (phoneNumber: string) => {
    if (!phoneNumber) {
      setSupplierSearchResults([]);
      return;
    }

    // Clean phone number: remove spaces, dashes, and other formatting
    const cleanPhoneNumber = phoneNumber.replace(/[\s\-\(\)]/g, "").trim();

    if (!cleanPhoneNumber) {
      setSupplierSearchResults([]);
      return;
    }

    setSupplierSearchLoading(true);
    setSupplierSearchFallback(false);
    try {
      // ✅ getAccessToken() ishlatish (localStorage emas)
      const token = await getAccessToken();
      const tenantId = getTenantId();

      const response = await fetch(
        `${apiUrl}/supplier/search-by-phone?phoneNumber=${encodeURIComponent(cleanPhoneNumber)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Tenant-Id": tenantId || "",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();

        // Handle both array and single object responses
        const dataArray = Array.isArray(data) ? data : data ? [data] : [];

        const results = dataArray.map((item: any) => {
          // Get supplierManagerId from multiple possible sources
          const supplierManagerId =
            item.supplierManagerId ||
            item.managers?.[0]?.id ||
            (item.managers && item.managers.length > 0
              ? item.managers[0].id
              : null) ||
            null;

          return {
            companyName: item.companyName || "",
            companyAddress: item.companyAddress || null,
            businessNumber: item.businessNumber || "",
            companyPhone: item.companyPhone || null,
            companyEmail: item.companyEmail || "",
            managerId: item.managerId || item.managers?.[0]?.managerId || "", // manager_id (like "회사명0001")
            supplierManagerId: supplierManagerId, // Database ID of SupplierManager
            managerName: item.managerName || item.managers?.[0]?.name || "",
            position: item.position || item.managers?.[0]?.position || null,
            phoneNumber:
              item.phoneNumber || item.managers?.[0]?.phoneNumber || "",
            email1: item.email1 || item.managers?.[0]?.email1 || null,
            email2: item.email2 || item.managers?.[0]?.email2 || null,
            responsibleProducts:
              item.responsibleProducts ||
              item.managers?.[0]?.responsibleProducts ||
              [],
            isRegisteredOnPlatform:
              item.isRegisteredOnPlatform === true ||
              item.isRegisteredOnPlatform === "true" ||
              false,
            supplierId: item.supplierId || item.id || null, // Get supplier ID from response
          };
        });

        // If results found from fallback search, show confirmation modal
        // Check if supplier is registered on platform (has isRegisteredOnPlatform flag)
        if (results.length > 0) {
          const supplier = results[0];

          // Note: The property 'isClinicCreated' does not exist on supplier type.
          // So we remove usage of 'isClinicCreated' and just check 'isRegisteredOnPlatform'
          if (supplier.isRegisteredOnPlatform) {
            // Clinic yaratgan supplier - natijalarni ko'rsatish (ma'lumotlar allaqachon bor)
            setSupplierSearchResults(results);
          } else if (supplier.isRegisteredOnPlatform) {
            // Supplier is registered on platform - show approval modal with supplier info
            setPendingSupplier(supplier); // Show modal for first result
            setShowSupplierConfirmModal(true);
            setSupplierSearchResults([]); // Don't show in table yet
          } else {
            // Supplier found but not registered on platform - show in results
            setSupplierSearchResults(results);
          }
        } else {
          // No supplier found - show manual entry option
          setPendingSupplierPhone(phoneNumber);
          setShowSupplierConfirmModal(true);
          setSupplierSearchResults([]);
        }
      } else {
        // Error or no results - show modal with direct input option
        const errorText = await response.text();

        setPendingSupplierPhone(phoneNumber);
        setShowSupplierConfirmModal(true);
        setSupplierSearchResults([]);
      }
    } catch (error) {
      console.error("Error searching suppliers by phone:", error);
      // On error, still show manual entry option with phone number
      setPendingSupplierPhone(phoneNumber);
      setShowSupplierConfirmModal(true);
      setSupplierSearchResults([]);
    } finally {
      setSupplierSearchLoading(false);
    }
  };

  // Handle search button click - requires both companyName and managerName
  const handleSupplierSearch = () => {
    if (supplierSearchCompanyName && supplierSearchManagerName) {
      searchSuppliers(
        supplierSearchCompanyName,
        supplierSearchManagerName,
        undefined
      );
    } else {
      setSupplierSearchResults([]);
    }
  };

  // Handle supplier result selection
  const handleSupplierResultSelect = (index: number) => {
    setSelectedSupplierResult(index);
    const result = supplierSearchResults[index];
    if (result) {
      setSelectedSupplierDetails(result);
      handleInputChange("supplierId", result.supplierId || result.id); // ✅ Use Supplier.id (UUID)
      handleInputChange("supplierName", result.companyName);
      handleInputChange("supplierContactName", result.managerName);
      handleInputChange("supplierContactPhone", result.phoneNumber);
      handleInputChange("supplierEmail", result.email1 || "");
    }
  };

  // Handle supplier details close/back
  const handleSupplierDetailsClose = () => {
    setSelectedSupplierDetails(null);
    setSelectedSupplierResult(null);
  };

  // Handle confirm supplier from modal (네 button)
  // If supplier is registered on platform, approve trade link first
  const handleConfirmSupplier = async () => {
    if (!pendingSupplier) return;

    // If supplier is registered on platform, approve trade link
    if (pendingSupplier.isRegisteredOnPlatform && pendingSupplier.supplierId) {
      try {
        // ✅ getAccessToken() ishlatish (localStorage emas)
        const token = await getAccessToken();
        const tenantId = getTenantId();

        // Check if token and tenantId exist
        if (!token) {
          alert("로그인이 필요합니다. 다시 로그인해주세요.");
          return;
        }

        if (!tenantId) {
          alert("테넌트 정보가 없습니다. 다시 로그인해주세요.");
          return;
        }

        const response = await fetch(`${apiUrl}/supplier/approve-trade-link`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Tenant-Id": tenantId,
          },
          body: JSON.stringify({
            supplierId: pendingSupplier.supplierId,
            managerId: pendingSupplier.managerId, // manager_id (like "회사명0001")
            supplierManagerId: pendingSupplier.supplierManagerId, // Database ID of SupplierManager (preferred)
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Error response:", errorText);

          if (response.status === 401) {
            alert("인증이 만료되었습니다. 다시 로그인해주세요.");
            // Optionally redirect to login
            // window.location.href = "/login";
            return;
          }

          throw new Error(`거래 관계 승인에 실패했습니다: ${response.status}`);
        }

        // Success - trade link approved
        const result = await response.json();

        // Show success message
        alert("거래 관계가 승인되었습니다. 담당자 정보가 추가되었습니다.");
      } catch (error: any) {
        console.error("Error approving trade link:", error);
        alert(
          `거래 관계 승인 중 오류가 발생했습니다: ${error.message || "알 수 없는 오류"}`
        );
        return;
      }
    }

    // Set supplier details - this will show the card with all manager information
    // Include all fields: companyName, managerName, position, phoneNumber, managerId, etc.
    setSelectedSupplierDetails({
      id: pendingSupplier.supplierId || "",
      supplierId: pendingSupplier.supplierId || "",
      companyName: pendingSupplier.companyName,
      companyAddress: pendingSupplier.companyAddress,
      businessNumber: pendingSupplier.businessNumber,
      companyPhone: pendingSupplier.companyPhone,
      companyEmail: pendingSupplier.companyEmail,
      managerId: pendingSupplier.managerId,
      managerName: pendingSupplier.managerName,
      position: pendingSupplier.position || null,
      phoneNumber: pendingSupplier.phoneNumber,
      email1: pendingSupplier.email1,
      email2: pendingSupplier.email2,
      responsibleProducts: pendingSupplier.responsibleProducts || [],
    });

    // Also update form fields
    handleInputChange("supplierId", pendingSupplier.supplierId || ""); // ✅ Use Supplier.id
    handleInputChange("supplierName", pendingSupplier.companyName);
    handleInputChange("supplierContactName", pendingSupplier.managerName);
    handleInputChange("supplierContactPhone", pendingSupplier.phoneNumber);
    handleInputChange("supplierEmail", pendingSupplier.email1 || "");

    // Close modal and clear pending supplier
    setShowSupplierConfirmModal(false);
    setPendingSupplier(null);
  };

  // Handle direct input (직접 입력 button)
  const handleDirectInput = () => {
    setShowSupplierConfirmModal(false);
    setShowManualEntryForm(true);
    // Keep pendingSupplierPhone for pre-filling phone number
  };

  // Manual entry form state
  const [manualEntryForm, setManualEntryForm] = useState({
    managerName: "",
    position: "",
    phoneNumber: "",
    companyName: "",
    companyAddress: "",
    businessNumber: "",
    companyPhone: "",
    email1: "",
    email2: "",
    responsibleProducts: "",
    memo: "",
    certificateImage: null as File | null,
    certificatePreview: "",
    certificateUrl: "",
  });

  const [uploadingCertificate, setUploadingCertificate] = useState(false);
  const [savingManualEntry, setSavingManualEntry] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrExtractedData, setOcrExtractedData] = useState<{
    companyName?: string;
    businessNumber?: string;
    companyAddress?: string;
    companyPhone?: string;
  } | null>(null);

  // Initialize phone number when manual entry form opens
  useEffect(() => {
    if (showManualEntryForm && pendingSupplierPhone) {
      setManualEntryForm((prev) => ({
        ...prev,
        phoneNumber: pendingSupplierPhone,
      }));
    }
  }, [showManualEntryForm, pendingSupplierPhone]);

  // Handle certificate upload
  const handleCertificateUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setManualEntryForm((prev) => ({
        ...prev,
        certificatePreview: reader.result as string,
        certificateImage: file,
      }));
      setCertificatePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to server with OCR and verification
    setUploadingCertificate(true);
    setUploading(true);
    setOcrResult(null);
    setVerificationResult(null);
    setIsBusinessValid(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Use supplier-backend API for certificate upload with OCR and verification
      const supplierApiUrl =
        process.env.NEXT_PUBLIC_SUPPLIER_API_URL ||
        "https://api-supplier.jaclit.com";
      const response = await fetch(
        `${supplierApiUrl}/supplier/manager/upload-certificate`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error("파일 업로드에 실패했습니다");
      }

      const data = await response.json();
      setManualEntryForm((prev) => ({
        ...prev,
        certificateUrl: data.fileUrl,
      }));
      setCertificateUrl(data.fileUrl);
      setOcrResult(data.ocrResult);

      // Auto-fill from OCR if available
      if (data.ocrResult?.parsedFields) {
        const fields = data.ocrResult.parsedFields;
        setManualEntryForm((prev) => ({
          ...prev,
          companyName: fields.companyName || prev.companyName,
          businessNumber: fields.businessNumber || prev.businessNumber,
          companyAddress: fields.address || prev.companyAddress,
          managerName: fields.representativeName || prev.managerName,
        }));

        // Update OCR extracted data
        setOcrExtractedData({
          companyName: fields.companyName,
          businessNumber: fields.businessNumber,
          companyAddress: fields.address,
        });
      }

      // Check verification result
      if (data.ocrResult?.verification) {
        setVerificationResult(data.ocrResult.verification);
        setIsBusinessValid(data.ocrResult.verification.isValid);
        setShowVerificationModal(true);
      } else if (data.ocrResult?.verification === null) {
        setIsBusinessValid(false);
        setVerificationResult({ error: "사업자 정보를 확인할 수 없습니다" });
        setShowVerificationModal(true);
      }
    } catch (error: any) {
      console.error("Error uploading certificate:", error);
      alert(error.message || "파일 업로드에 실패했습니다");
      setIsBusinessValid(false);
    } finally {
      setUploadingCertificate(false);
      setUploading(false);
    }
  };

  // Handle manual entry form submission
  const handleManualEntrySubmit = async () => {
    // Validate required fields
    if (!manualEntryForm.managerName || !manualEntryForm.phoneNumber) {
      alert("담당자 이름과 핸드폰 번호는 필수입니다.");
      return;
    }

    // Validate business verification if certificate was uploaded
    if (certificateUrl && isBusinessValid !== true) {
      alert(
        "사업자 정보 확인이 필요합니다. 사업자등록증을 다시 업로드하거나 확인해주세요."
      );
      return;
    }

    // Validate phone number format
    const phoneNumber = manualEntryForm.phoneNumber.replace(/-/g, "");
    if (!/^010\d{8}$/.test(phoneNumber)) {
      alert("휴대폰 번호 형식이 올바르지 않습니다 (예: 01012345678)");
      return;
    }

    setSavingManualEntry(true);
    try {
      // ✅ getAccessToken() ishlatish (localStorage emas)
      const token = await getAccessToken();

      // Validate business number format if provided
      let businessNumber = manualEntryForm.businessNumber.trim();
      if (businessNumber && !/^\d{3}-\d{2}-\d{5}$/.test(businessNumber)) {
        alert("사업자 등록번호 형식이 올바르지 않습니다 (예: 123-45-67890)");
        return;
      }

      // If business number is not provided, generate a temporary one
      // Format: 000-00-XXXXX (where XXXXX is last 5 digits of phone number)
      if (!businessNumber) {
        const phoneLast5 = phoneNumber.slice(-5);
        businessNumber = `000-00-${phoneLast5}`;
      }

      // Prepare data for API
      const supplierData = {
        companyName: manualEntryForm.companyName || "미입력",
        businessNumber: businessNumber,
        companyPhone: manualEntryForm.companyPhone || undefined,
        companyEmail: manualEntryForm.email1 || undefined,
        companyAddress: manualEntryForm.companyAddress || undefined,
        managerName: manualEntryForm.managerName,
        phoneNumber: phoneNumber, // Format: 01012345678
        managerEmail: manualEntryForm.email1 || undefined,
        position: manualEntryForm.position || undefined,
      };

      // Call API to create supplier
      const response = await fetch(`${apiUrl}/supplier/create-manual`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(supplierData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `서버 오류: ${response.status}`);
      }

      const result = await response.json();

      // Update form data with supplier info
      handleInputChange("supplierId", result.supplier?.id || ""); // ✅ Use Supplier.id (UUID)
      handleInputChange("supplierName", manualEntryForm.companyName);
      handleInputChange("supplierContactName", manualEntryForm.managerName);
      handleInputChange("supplierContactPhone", phoneNumber);
      handleInputChange("supplierEmail", manualEntryForm.email1);
      handleInputChange("supplierNote", manualEntryForm.memo);

      // Close manual entry form and show supplier details
      setShowManualEntryForm(false);
      setSelectedSupplierDetails({
        id: result.supplier?.id || "",
        supplierId: result.supplier?.id || "",
        companyName: manualEntryForm.companyName || "미입력",
        companyAddress: manualEntryForm.companyAddress || null,
        businessNumber: manualEntryForm.businessNumber || "000-00-00000",
        companyPhone: manualEntryForm.companyPhone || null,
        companyEmail: manualEntryForm.email1 || "",
        managerId: result.clinicManager?.id || "", // Manager database ID
        managerName: manualEntryForm.managerName,
        position: manualEntryForm.position || null,
        phoneNumber: phoneNumber,
        email1: manualEntryForm.email1 || null,
        email2: manualEntryForm.email2 || null,
        responsibleProducts: manualEntryForm.responsibleProducts
          ? manualEntryForm.responsibleProducts.split(",").map((p) => p.trim())
          : [],
      });

      alert("공급업체가 성공적으로 등록되었습니다.");
    } catch (error: any) {
      console.error("Error saving manual entry:", error);
      alert(error.message || "저장에 실패했습니다");
    } finally {
      setSavingManualEntry(false);
    }
  };

  // Handle phone number search (fallback search)
  const handlePhoneNumberSearch = () => {
    if (supplierSearchPhoneNumber) {
      searchSuppliersByPhone(supplierSearchPhoneNumber);
    }
  };

  const formatNumber = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/[^\d]/g, "");
    if (!s) return "";
    return Number(s).toLocaleString("en-US"); // 1,234,567
  };

  const parseNumber = (v: string) => v.replace(/[^\d]/g, ""); // faqat raqam

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true); // Set flag to bypass unsaved changes check
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
        barcode: formData.barcode || undefined,
        minStock: Number(formData.minStock) || 0,
        // ✅ Always send unit (use minStockUnit or purchasePriceUnit or default to "EA")
        unit:
          formData.minStockUnit &&
          formData.minStockUnit !== unitOptions[0]
            ? formData.minStockUnit
            : formData.purchasePriceUnit &&
              formData.purchasePriceUnit !== unitOptions[0]
            ? formData.purchasePriceUnit
            : "EA",
      };
      // ✅ unit already set above, no need for conditional
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
      if (
        formData.usageSalePrice &&
        formData.usageCapacity &&
        formData.usageCapacity > 0
      ) {
        payload.usageSalePrice = Number(formData.usageSalePrice);
      }

      // Add packaging unit conversion if enabled
      if (formData.hasDifferentPackagingQuantity) {
        payload.hasDifferentPackagingQuantity = true;
        if (
          formData.packagingFromQuantity &&
          formData.packagingFromQuantity > 0
        ) {
          payload.packagingFromQuantity = Number(
            formData.packagingFromQuantity
          );
        }
        if (formData.packagingFromUnit) {
          payload.packagingFromUnit = formData.packagingFromUnit;
        }
        if (formData.packagingToQuantity && formData.packagingToQuantity > 0) {
          payload.packagingToQuantity = Number(formData.packagingToQuantity);
        }
        if (formData.packagingToUnit) {
          payload.packagingToUnit = formData.packagingToUnit;
        }
      }

      // Add optional fields
      if (formData.image) payload.image = formData.image;
      else if (formData.imageUrl) payload.image = formData.imageUrl;

      // Add alert_days at product level if hasExpiryPeriod
      if (
        formData.hasExpiryPeriod &&
        formData.alertDays &&
        formData.alertDays.trim() !== ""
      ) {
        payload.alertDays = formData.alertDays;
      }

      // Add return policy if returnable
      if (isReturnable) {
        payload.returnPolicy = {
          is_returnable: true,
          refund_amount: formData.refundAmount
            ? Number(formData.refundAmount)
            : undefined,
          return_storage: formData.returnStorage || undefined,
          note: formData.returnNote || undefined,
        };
      }

      // Add supplier if supplier info is provided
      // Use selectedSupplierDetails if available (has Supplier UUID)
      const supplierUUID =
        selectedSupplierDetails?.supplierId ||
        selectedSupplierDetails?.id ||
        formData.supplierId;

      if (supplierUUID || formData.supplierName) {
        payload.suppliers = [
          {
            supplier_id: supplierUUID || undefined, // Faqat UUID bo'lsa yuborish
            company_name: formData.supplierName || undefined, // ✅ QOSHISH: Company name alohida
            purchase_price: formData.purchasePrice
              ? Number(formData.purchasePrice)
              : undefined,
            moq: formData.moq ? Number(formData.moq) : undefined,
            lead_time_days: formData.leadTimeDays
              ? Number(formData.leadTimeDays)
              : undefined,
            note: formData.supplierNote || undefined,
            contact_name: formData.supplierContactName || undefined,
            contact_phone: formData.supplierContactPhone || undefined,
            contact_email: formData.supplierEmail || undefined,
          },
        ];
      }

      // Call API using authenticated request
      const { apiPost, clearCache } = await import("../../../lib/api");

      const result = await apiPost("/products", payload);

      // ✅ Clear frontend cache so new product appears immediately
      // Clear cache for both "/products" and full URL format
      clearCache("/products");
      clearCache("products"); // Also clear without leading slash

      // Set flag to force refresh on inbound page
      if (typeof window !== "undefined") {
        sessionStorage.setItem("inbound_force_refresh", "true");

        // ✅ Dispatch custom event to notify inbound page immediately
        window.dispatchEvent(new CustomEvent("productCreated"));
      }

      // Clear unsaved changes flag and redirect to inbound list page
      setShowUnsavedChangesDialog(false);
      setPendingNavigation(null);

      // Use router.push for smooth navigation (cache already cleared)
      router.push("/inbound");
      // isSaving will be reset when component unmounts or navigation completes
    } catch (error) {
      console.error("Error creating product:", error);
      setIsSaving(false); // Reset flag on error
      alert(
        error instanceof Error ? error.message : "제품 저장에 실패했습니다."
      );
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
              <button
                onClick={(e) => {
                  e.preventDefault();
                  if (hasUnsavedChanges()) {
                    setPendingNavigation("/inbound");
                    setShowUnsavedChangesDialog(true);
                  } else {
                    router.push("/inbound");
                  }
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300"
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </button>
              <h1 className="t ext-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">
                제품 정보 입력
              </h1>
            </div>
            <p className="max-w-3xl text-base text-slate-500 dark:text-slate-300"></p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-2 text-base font-medium text-slate-700 dark:text-slate-200">
              <span>입고날짜</span>
              <span className="font-mono text-slate-900 dark:text-white">
                {inboundDate
                  .split("-")
                  .map((part, i) => (i === 0 ? part.slice(2) : part))
                  .join("-")}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || !isFormValid()}
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
            제품 정보 *
          </h2>
          <div className="rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-200/40 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
            <div className="p-6 sm:p-10">
              {/* New Layout: Left side - Image Upload, Right side - Form Fields */}
              <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
                {/* Left Side - Image Upload */}
                <div className="flex flex-col gap-3">
                  {/* Large Image Upload */}
                  <div className="relative flex w-full min-h-[24rem] max-h-[32rem] flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 overflow-hidden transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/60">
                    {formData.image ? (
                      <>
                        <img
                          src={formData.image}
                          alt="Preview"
                          className="max-w-full max-h-full object-contain rounded-xl"
                        />
                        <label className="absolute inset-0 cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInputChange("image", "");
                          }}
                          className="absolute top-2 right-2 rounded-full bg-red-500 p-1.5 text-white hover:bg-red-600 transition z-10"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-2 cursor-pointer w-full h-full p-6">
                        <svg
                          className="h-12 w-12 text-slate-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                          사진 첨부
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                  {/* Small Additional Image Placeholder */}
                </div>

                {/* Right Side - Form Fields + Small Image Placeholder */}
                <div className="flex flex-col gap-6">
                  {/* Form Fields in 2 Columns */}
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* Left Column */}
                    <div className="flex flex-col gap-6">
                      <InputField
                        label="제품명"
                        placeholder="이름"
                        value={formData.name}
                        onChange={(e) =>
                          handleInputChange("name", e.target.value)
                        }
                      />
                      <InputField
                        label="카테고리"
                        placeholder="물광"
                        value={formData.category}
                        onChange={(e) =>
                          handleInputChange("category", e.target.value)
                        }
                      />
                    </div>

                    {/* Right Column */}
                    <div className="flex flex-col gap-6">
                      <InputField
                        label="제조사"
                        placeholder="브랜트"
                        value={formData.brand}
                        onChange={(e) =>
                          handleInputChange("brand", e.target.value)
                        }
                      />
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          바코드 번호 
                        </label>
                       
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="바코드 스캔 또는 입력"
                            value={formData.barcode}
                            onChange={(e) => {
                              handleInputChange("barcode", e.target.value);
                            }}
                            className="h-11 flex-1 rounded-xl border border-blue-300 bg-blue-50 px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Small Additional Image Placeholder */}
                  <div className="relative flex h-48 w-[200px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 cursor-pointer transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:bg-slate-800">
                    {formData.additionalImage ? (
                      <>
                        <img
                          src={formData.additionalImage}
                          alt="Additional Preview"
                          className="h-full w-full object-cover rounded-lg"
                        />
                        <label className="absolute inset-0 cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleAdditionalImageUpload}
                            className="hidden"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInputChange("additionalImage", "");
                          }}
                          className="absolute top-1 right-1 rounded-full bg-red-500 p-1 text-white hover:bg-red-600 transition"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <label className="flex h-full w-full cursor-pointer items-center justify-center">
                        <svg
                          className="h-6 w-6 text-slate-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAdditionalImageUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
            <InfoIcon className="h-5 w-5 text-sky-500" />
            제품 수량 및 용량 설정 *
          </h2>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="grid grid-cols-2 gap-4">
              {/* REMOVED: 제품 재고 수량 - moved to /inbound page */}
              
              {/* 최소 제품 재고 */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  최소 제품 재고
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    value={formData.minStock || ""}
                    onChange={(e) =>
                      handleInputChange(
                        "minStock",
                        e.target.value ? Number(e.target.value) : 0
                      )
                    }
                    placeholder="0"
                    className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <div className="relative w-28">
                    <select
                      value={formData.minStockUnit}
                      onChange={(e) =>
                        handleInputChange("minStockUnit", e.target.value)
                      }
                      className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      disabled
                    >
                      <option value="box">box</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Packaging Unit Conversion - Outside Grid for Full Width */}

            <div className="grid grid-cols-2 gap-4 mt-6">
              {/* Bottom Row - Capacity Fields */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  제품 용량
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={formData.capacityPerProduct || ""}
                    onChange={(e) =>
                      handleInputChange(
                        "capacityPerProduct",
                        e.target.value ? parseFloat(e.target.value) : 0
                      )
                    }
                    placeholder="0"
                    className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <div className="relative w-28">
                    <select
                      value={formData.capacityUnit}
                      onChange={(e) =>
                        handleInputChange("capacityUnit", e.target.value)
                      }
                      className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      {unitOptions.slice(0).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
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
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.enableUsageCapacity}
                    onChange={(e) =>
                      handleInputChange("enableUsageCapacity", e.target.checked)
                    }
                    className="
        h-5 w-5 shrink-0 rounded
        appearance-none bg-white
        border border-white-300
        checked:bg-white-500 checked:border-white-500
        focus:outline-none focus:ring-2 focus:ring-white-500
        dark:bg-white
        relative
        after:content-['']
        after:absolute after:left-1/2 after:top-1/2
        after:h-2.5 after:w-1.5
        after:-translate-x-1/2 after:-translate-y-1/2
        after:rotate-45
        after:border-r-2 after:border-b-2
        after:border-black
        after:opacity-0
        checked:after:opacity-100
      "
                  />
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                    사용 단위
                  </label>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={formData.usageCapacity || ""}
                    onChange={(e) =>
                      handleInputChange(
                        "usageCapacity",
                        e.target.value ? parseFloat(e.target.value) : 0
                      )
                    }
                    placeholder="전제 사용 아닌 경우,실제 사용량을 입력하세요"
                    disabled={!formData.enableUsageCapacity}
                    className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <div className="relative w-28">
                    <select
                      value={formData.usageCapacityUnit}
                      onChange={(e) =>
                        handleInputChange("usageCapacityUnit", e.target.value)
                      }
                      disabled={!formData.enableUsageCapacity}
                      className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                    >
                      {unitOptions.slice(0).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
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
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
            <DollarIcon className="h-5 w-5 text-emerald-500" />
            가격 정보 *
          </h2>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  구매가
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={formatNumber(formData.purchasePrice)}
                    onChange={(e) => {
                      const raw = parseNumber(e.target.value);
                      handleInputChange("purchasePrice", raw); // DBga "12345" saqlanadi
                    }}
                    className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                  <div className="relative w-28">
                    <select
                      value={formData.purchasePriceUnit}
                      onChange={(e) =>
                        handleInputChange("purchasePriceUnit", e.target.value)
                      }
                      className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      {unitOptions.slice(0).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
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
                {/* <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  공급업체로부터 구매하는 가격
                </div> */}
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  판매가
                </label>
                <div className="flex items-start gap-3">
                  <div className="flex-1 flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={formatNumber(formData.salePrice)}
                      onChange={(e) => {
                        const raw = parseNumber(e.target.value);
                        handleInputChange("salePrice", raw); // "12345"
                      }}
                      className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                    {/* <div className="relative w-28">
                      <select
                        value={formData.salePriceUnit}
                        disabled={true} // Readonly
                        className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 pr-8 text-sm text-slate-600 cursor-not-allowed transition dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400"
                        title="제품 용량 또는 사용 단위에 따라 자동으로 설정됩니다"
                      >
                        {unitOptions.slice(1).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
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
                    </div> */}
                  </div>
                  {/* Unit Display Card */}
                  {(formData.enableUsageCapacity && formData.usageCapacity) ||
                  formData.capacityPerProduct ? (
                    <div className="mt-0 flex-shrink-0">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {formData.enableUsageCapacity &&
                            formData.usageCapacity
                              ? "사용 단위"
                              : "제품 용량"}
                          </div>

                          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 text-right">
                            {formData.enableUsageCapacity &&
                            formData.usageCapacity
                              ? `${formData.usageCapacity} ${formData.usageCapacityUnit || ""}`
                              : formData.capacityPerProduct
                                ? `${formData.capacityPerProduct} ${formData.capacityUnit || ""}`
                                : "-"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
                {/* <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  고객에게 판매하는 가격
                </div> */}
              </div>
            </div>

            {/* 사용량에 대한 별도 판매가 - 사용량이 입력된 경우에만 표시
            {formData.usageCapacity > 0 && (
              <div className="mt-6 rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-700 dark:bg-sky-900/20">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-white">
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-sky-700 dark:text-sky-300">
                    용기 용량이 아닌 단위로 사용할 경우
                  </span>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    사용량 단위 판매가 ({formData.usageCapacityUnit})
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={formData.usageSalePrice || ""}
                      onChange={(e) =>
                        handleInputChange("usageSalePrice", e.target.value)
                      }
                      className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                    <div className="relative w-28">
                      <select
                        value={formData.usageCapacityUnit}
                        disabled
                        className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-100 px-3 pr-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                      >
                        <option value={formData.usageCapacityUnit}>
                          {formData.usageCapacityUnit}
                        </option>
                      </select>
                      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
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
                  <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    사용량 단위({formData.usageCapacityUnit})에 대한 별도
                    판매가를 입력하세요
                  </div>
                </div>
              </div>
            )} */}
          </div>
        </section>
        <section className="space-y-6">
          <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
            <RefreshIcon className="h-5 w-5 text-amber-500" />
            반납 관리 *
          </h2>

          <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-6 shadow-lg shadow-amber-200/40 dark:border-amber-500/40 dark:bg-amber-500/10">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={isReturnable}
                onChange={() => {
                  setIsReturnable((prev) => {
                    const next = !prev;
                    if (!next) {
                      handleInputChange("refundAmount", "");
                      handleInputChange("returnStorage", "");
                    }
                    return next;
                  });
                }}
                className="
        h-5 w-5 shrink-0 rounded
        appearance-none bg-white
        border border-amber-300
        checked:bg-amber-500 checked:border-amber-500
        focus:outline-none focus:ring-2 focus:ring-amber-500
        dark:bg-white
        relative
        after:content-['']
        after:absolute after:left-1/2 after:top-1/2
        after:h-2.5 after:w-1.5
        after:-translate-x-1/2 after:-translate-y-1/2
        after:rotate-45
        after:border-r-2 after:border-b-2
        after:border-white
        after:opacity-0
        checked:after:opacity-100
      "
              />
              <span className="text-sm text-amber-700 dark:text-amber-200">
                이 제품은 반납 가능한 제품입니다. 반납 정책을 입력하면 자동으로
                시스템에 반영됩니다.
              </span>
            </label>

            {isReturnable && (
              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <InputField
                  label="반납 시 할인 금액 (개당, 원)"
                  placeholder="예: 5000"
                  value={formData.refundAmount}
                  onChange={(e) =>
                    handleInputChange("refundAmount", e.target.value)
                  }
                />
                <InputField
                  label="반납품 보관 위치"
                  placeholder="보관 위치 입력하거나 선택하세요"
                  value={formData.returnStorage}
                  onChange={(e) =>
                    handleInputChange("returnStorage", e.target.value)
                  }
                />
              </div>
            )}
          </div>
        </section>

        {/* 유효기간 설정 section */}
        <section className="space-y-6">
          <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
            <CalendarIcon className="h-5 w-5 text-emerald-500" />
            유효기간 설정
          </h2>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="space-y-4">
              {/* Switch: 유효기간 있음/없음 */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl dark:bg-slate-800/50">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  유효기간 있음
                </label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.hasExpiryPeriod}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      handleInputChange("hasExpiryPeriod", isChecked);
                      if (!isChecked) {
                        handleInputChange("alertDays", "");
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 dark:peer-focus:ring-emerald-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Alert Days Dropdown */}
              {formData.hasExpiryPeriod && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    유효기간 임박 알림 기준
                  </label>
                  <div className="relative">
                    <select
                      value={formData.alertDays || ""}
                      onChange={(e) =>
                        handleInputChange("alertDays", e.target.value)
                      }
                      className="h-14 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
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
              )}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
            <TruckIcon className="h-5 w-5 text-indigo-500" />
            공급업체 정보 *
          </h2>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70">
            {selectedSupplierDetails ? (
              /* Full Supplier Details Card */
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  공급업체 상세 정보
                </h3>

                <div className="grid gap-6 md:grid-cols-2">
                  {/* Left Column */}
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        회사명
                      </label>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                        {selectedSupplierDetails.companyName}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        회사 주소
                      </label>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                        {selectedSupplierDetails.companyAddress || "-"}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        이름
                      </label>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                        {selectedSupplierDetails.managerName}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        직함
                      </label>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                        {selectedSupplierDetails.position || "-"}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        이메일
                      </label>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                        {selectedSupplierDetails.email1 || "-"}
                      </div>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        사업자 등록번호
                      </label>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                        {selectedSupplierDetails.businessNumber}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        회사 전화번호
                      </label>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                        {selectedSupplierDetails.companyPhone || "-"}
                      </div>
                    </div>
                    {/* <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        담당자 ID
                      </label>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                        {selectedSupplierDetails.managerId}
                      </div>
                    </div> */}
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        핸드폰 번호
                      </label>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                        {selectedSupplierDetails.phoneNumber}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        담당 제품
                      </label>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                        {selectedSupplierDetails.responsibleProducts.length > 0
                          ? selectedSupplierDetails.responsibleProducts.join(
                              ", "
                            )
                          : "-"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 메모 - Full Width */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    메모
                  </label>
                  <textarea
                    rows={4}
                    value={formData.supplierNote}
                    onChange={(e) =>
                      handleInputChange("supplierNote", e.target.value)
                    }
                    placeholder="메모를 입력하세요"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
                  />
                </div>

                {/* <div className="flex justify-end pt-4">
                  <button
                    type="button"
                    onClick={handleSupplierDetailsClose}
                    className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                  >
                    확인하기
                  </button>
                </div> */}
              </div>
            ) : showManualEntryForm ? (
              /* Manual Entry Form */
              <div className="space-y-6">
                {/* Header with back button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
                    <svg
                      className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      담당자님 정보 없습니다. 입력 부탁드립니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowManualEntryForm(false);
                      setPendingSupplierPhone("");
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    뒤로
                  </button>
                </div>

                {/* Form Content */}
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Left Column */}
                  <div className="space-y-4">
                    {/* 담당자 이름 + 직함 */}
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                        담당자 이름*
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={manualEntryForm.managerName}
                          onChange={(e) =>
                            setManualEntryForm((prev) => ({
                              ...prev,
                              managerName: e.target.value,
                            }))
                          }
                          placeholder="성함"
                          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                        />
                        <select
                          value={manualEntryForm.position}
                          onChange={(e) =>
                            setManualEntryForm((prev) => ({
                              ...prev,
                              position: e.target.value,
                            }))
                          }
                          className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        >
                          {positionOptions.map((option) => (
                            <option
                              key={option}
                              value={option === "직함 선택" ? "" : option}
                            >
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* 사업자등록증 업로드 */}
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                        사업자등록증
                      </label>
                      <div className="space-y-2">
                        {manualEntryForm.certificatePreview ? (
                          <div className="relative rounded-lg border border-slate-200 bg-slate-50 p-4 ">
                            <img
                              src={manualEntryForm.certificatePreview}
                              alt="Certificate preview"
                              className="h-62 w-full object-contain rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setManualEntryForm((prev) => ({
                                  ...prev,
                                  certificatePreview: "",
                                  certificateImage: null,
                                  certificateUrl: "",
                                }));
                                setCertificatePreview("");
                                setCertificateUrl("");
                                setOcrResult(null);
                                setVerificationResult(null);
                                setIsBusinessValid(null);
                                setOcrExtractedData(null);
                              }}
                              className="absolute right-2 top-2 rounded-full bg-red-500 p-1.5 text-white transition hover:bg-red-600"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                            {ocrProcessing && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg">
                                <div className="bg-white rounded-lg p-4 flex items-center gap-3">
                                  <svg
                                    className="animate-spin h-5 w-5 text-sky-600"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                    ></circle>
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                  </svg>
                                  <span className="text-sm font-medium text-slate-700">
                                    OCR 처리 중...
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
                            <div className="text-center">
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                이미지를 업로드하세요
                              </p>
                              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                업로드 시 자동으로 정보를 추출합니다
                              </p>
                            </div>
                          </div>
                        )}

                        {/* OCR Extracted Data Notification */}

                        <label className="flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                          {uploadingCertificate || ocrProcessing
                            ? "업로드 및 OCR 처리 중..."
                            : manualEntryForm.certificatePreview
                              ? "사업자등록증 변경"
                              : "사업자등록증 업로드"}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleCertificateUpload}
                            disabled={uploadingCertificate || ocrProcessing}
                            className="hidden"
                          />
                        </label>

                        {/* Business Verification Status */}
                        {/* {isBusinessValid === true && (
                          <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                            <div className="flex items-center gap-2">
                              <svg
                                className="h-5 w-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                              <span className="font-medium">
                                ✅ 사업자 정보 확인 완료
                              </span>
                            </div>
                            {verificationResult?.businessStatus && (
                              <p className="mt-1 text-xs">
                                상태: {verificationResult.businessStatus}
                              </p>
                            )}
                          </div>
                        )} */}
                        {isBusinessValid === false && (
                          <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                            <div className="flex items-center gap-2">
                              <svg
                                className="h-5 w-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                              <span className="font-medium">
                                ⚠️ 사업자 정보 확인 실패
                              </span>
                            </div>
                            <p className="mt-1 text-xs">
                              수동으로 정보를 입력해주세요
                            </p>
                          </div>
                        )}
                        {uploading && (
                          <div className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                            <div className="flex items-center gap-2">
                              <svg
                                className="h-5 w-5 animate-spin"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                              <span className="font-medium">
                                사업자 정보 확인 중...
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                        핸드폰 번호*
                      </label>
                      <input
                        type="tel"
                        value={manualEntryForm.phoneNumber}
                        onChange={(e) =>
                          setManualEntryForm((prev) => ({
                            ...prev,
                            phoneNumber: e.target.value,
                          }))
                        }
                        placeholder="-없이 입력해주세요."
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                        회사명 *
                      </label>
                      <input
                        type="text"
                        value={manualEntryForm.companyName}
                        onChange={(e) =>
                          setManualEntryForm((prev) => ({
                            ...prev,
                            companyName: e.target.value,
                          }))
                        }
                        placeholder="회사명"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                        회사 주소 *
                      </label>
                      <input
                        type="text"
                        value={manualEntryForm.companyAddress}
                        onChange={(e) =>
                          setManualEntryForm((prev) => ({
                            ...prev,
                            companyAddress: e.target.value,
                          }))
                        }
                        placeholder="주소를 압력햐주세요"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                        사업자 등록번호 *
                      </label>
                      <input
                        type="text"
                        value={manualEntryForm.businessNumber}
                        onChange={(e) =>
                          setManualEntryForm((prev) => ({
                            ...prev,
                            businessNumber: e.target.value,
                          }))
                        }
                        placeholder="00-000-0000"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                        회사 전화번호 *
                      </label>
                      <input
                        type="tel"
                        value={manualEntryForm.companyPhone}
                        onChange={(e) =>
                          setManualEntryForm((prev) => ({
                            ...prev,
                            companyPhone: e.target.value,
                          }))
                        }
                        placeholder="00-0000-0000"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                        이메일 *
                      </label>
                      <input
                        type="email"
                        value={manualEntryForm.email1}
                        onChange={(e) =>
                          setManualEntryForm((prev) => ({
                            ...prev,
                            email1: e.target.value,
                          }))
                        }
                        placeholder="이메일을 입력해주세요"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                      />
                    </div>

                    {/* <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                        이메일 2
                      </label>
                      <input
                        type="email"
                        value={manualEntryForm.email2}
                        onChange={(e) =>
                          setManualEntryForm((prev) => ({
                            ...prev,
                            email2: e.target.value,
                          }))
                        }
                        placeholder="이메일을 입력해주세요"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                      />
                    </div> */}

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                        담당 제품 *
                      </label>
                      <input
                        type="text"
                        value={manualEntryForm.responsibleProducts}
                        onChange={(e) =>
                          setManualEntryForm((prev) => ({
                            ...prev,
                            responsibleProducts: e.target.value,
                          }))
                        }
                        placeholder="제품을 입력해주세요"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                        메모
                      </label>
                      <textarea
                        value={manualEntryForm.memo}
                        onChange={(e) =>
                          setManualEntryForm((prev) => ({
                            ...prev,
                            memo: e.target.value,
                          }))
                        }
                        rows={3}
                        placeholder="메모를 입력하세요"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-4">
                  <button
                    type="button"
                    onClick={handleManualEntrySubmit}
                    disabled={
                      savingManualEntry ||
                      !manualEntryForm.managerName ||
                      !manualEntryForm.phoneNumber ||
                      (!!certificateUrl && isBusinessValid !== true)
                    }
                    className={`rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      !!certificateUrl && isBusinessValid !== true
                        ? "bg-slate-400 dark:bg-slate-600"
                        : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                    }`}
                  >
                    {savingManualEntry
                      ? "저장 중..."
                      : !!certificateUrl && isBusinessValid !== true
                        ? "🔒 사업자 확인 필요"
                        : "저장 및 등록"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Search Fields */}
                <div className="mb-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                      공급업체명
                    </label>
                    <input
                      type="text"
                      value={supplierSearchCompanyName}
                      onChange={(e) =>
                        setSupplierSearchCompanyName(e.target.value)
                      }
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          supplierSearchCompanyName &&
                          supplierSearchManagerName
                        ) {
                          handleSupplierSearch();
                        }
                      }}
                      placeholder="공급업체명을 입력해주세요."
                      className="h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                      담당자
                    </label>
                    <input
                      type="text"
                      value={supplierSearchManagerName}
                      onChange={(e) =>
                        setSupplierSearchManagerName(e.target.value)
                      }
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          supplierSearchCompanyName &&
                          supplierSearchManagerName
                        ) {
                          handleSupplierSearch();
                        }
                      }}
                      placeholder="담당자 이름"
                      className="h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleSupplierSearch}
                      disabled={
                        supplierSearchLoading ||
                        !supplierSearchCompanyName ||
                        !supplierSearchManagerName
                      }
                      className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                      title="검색"
                    >
                      {supplierSearchLoading ? (
                        <svg
                          className="h-5 w-5 animate-spin"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      ) : (
                        <SearchIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Search Results Table */}
                {supplierSearchResults.length > 0 && (
                  <div className="mb-6 overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                            회사명
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                            이름
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                            직함
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                            핸드폰 번호
                          </th>
                          {/* <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                            담당자 ID
                          </th> */}
                        </tr>
                      </thead>
                      <tbody>
                        {supplierSearchResults.map((result, index) => (
                          <tr
                            key={index}
                            onClick={() => handleSupplierResultSelect(index)}
                            className={`cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 ${
                              selectedSupplierResult === index
                                ? "bg-blue-50 dark:bg-blue-900/20"
                                : ""
                            }`}
                          >
                            <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
                              {result.companyName}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
                              {result.managerName}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
                              {result.position || "-"}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
                              {result.phoneNumber}
                            </td>
                            {/* <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
                              {result.managerId}
                            </td> */}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* No Results Message with Fallback Option */}
                {!supplierSearchLoading &&
                  supplierSearchResults.length === 0 &&
                  supplierSearchFallback && (
                    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 text-amber-600 dark:text-amber-400">
                          ℹ️
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                            거래 이력이 있는 공급업체를 찾을 수 없습니다.
                          </p>
                          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                            등록된 공급업체를 찾으려면 아래에서 핸드폰 번호로
                            검색해보세요.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                {/* Phone Number Search Section */}
                <div className="mt-6 space-y-4 border-t border-slate-200 pt-6 dark:border-slate-700">
                  <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
                    <span className="mt-0.5">▲</span>
                    <span>
                      담당자님 못 찾은 경우, 핸드폰 입력하시고 한번 더 검색해
                      보세요.
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                        핸드폰 번호
                      </label>
                      <input
                        type="tel"
                        value={supplierSearchPhoneNumber}
                        onChange={(e) =>
                          setSupplierSearchPhoneNumber(e.target.value)
                        }
                        placeholder="000-0000-0000"
                        className="h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={handlePhoneNumberSearch}
                        disabled={
                          supplierSearchLoading || !supplierSearchPhoneNumber
                        }
                        className="h-12 rounded-lg bg-slate-600 px-6 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-500 dark:hover:bg-slate-600"
                      >
                        {supplierSearchLoading ? "검색 중..." : "검색하기"}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* REMOVED: 입고 담당자 section - moved to /inbound page */}

        <footer className="">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-end gap-6">
            {/* REMOVED: 보관 위치 and 담당자 - moved to /inbound page */}

            {/* RIGHT: 버튼 */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !isFormValid()}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 px-6 text-sm font-semibold text-white shadow-lg transition hover:from-sky-600 hover:to-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <SaveIcon className="h-5 w-5" />
              {loading ? "저장 중..." : "제품 저장"}
            </button>
          </div>
        </footer>
      </div>

      {/* Supplier Confirmation Modal */}
      {showSupplierConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                setShowSupplierConfirmModal(false);
                setPendingSupplier(null);
                setPendingSupplierPhone("");
              }}
              className="absolute right-4 top-4 text-slate-400 transition hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            {/* Modal Content */}
            <div className="space-y-4">
              {pendingSupplier ? (
                <>
                  {/* Supplier found in system */}
                  <div className="space-y-2">
                    <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      프랫품 이미 정보있는 담당자입니다.
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      이 담당자 정보를 추가하시겠습니까?
                    </p>
                  </div>

                  {/* Supplier Info Preview */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                    <div className="space-y-1 text-sm">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {pendingSupplier?.companyName}
                      </p>
                      <p className="text-slate-600 dark:text-slate-400">
                        {pendingSupplier?.managerName} (
                        {pendingSupplier?.phoneNumber})
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleDirectInput}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      직접 입력
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmSupplier}
                      className="flex-1 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
                    >
                      네
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Supplier not found in system */}
                  <div className="space-y-2">
                    <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      담당자님 정보 없습니다.
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      입력 부탁드립니다.
                    </p>
                  </div>

                  {/* Action Button */}
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleDirectInput}
                      className="rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
                    >
                      직접 입력
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Business Verification Result Modal */}
      {showVerificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <div className="text-center">
              {isBusinessValid ? (
                <>
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <svg
                      className="h-8 w-8 text-green-600 dark:text-green-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-100">
                    사업자 정보 확인 완료
                  </h3>
                  <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                    유효한 사업자등록번호입니다
                  </p>
                  {verificationResult?.businessStatus && (
                    <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-700">
                      <p className="text-slate-700 dark:text-slate-300">
                        상태: {verificationResult.businessStatus}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                    <svg
                      className="h-8 w-8 text-red-600 dark:text-red-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-100">
                    사업자 정보 확인 실패
                  </h3>
                  <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                    {verificationResult?.error ||
                      "사업자등록번호를 확인할 수 없습니다"}
                  </p>
                  <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                    수동으로 정보를 입력하여 계속 진행할 수 있습니다
                  </p>
                </>
              )}
              <button
                onClick={() => setShowVerificationModal(false)}
                className="w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Dialog */}
      {showUnsavedChangesDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative w-full max-w-md rounded-2xl border border-black bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-xl font-bold text-black">
              작성 중인 내용
            </h2>
            <div className="mb-6 space-y-2 text-base text-black">
              <p>정보가 아직 저장되지 않았습니다.</p>
              <p>지금 나가면 입력한 내용이 모두 사라집니다.</p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleLeavePage}
                className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-base font-medium text-black transition hover:bg-slate-50"
              >
                나가기
              </button>
              <button
                onClick={handleContinueEditing}
                className="rounded-lg bg-gradient-to-r from-blue-500 to-teal-500 px-6 py-2.5 text-base font-medium text-white transition hover:from-blue-600 hover:to-teal-600"
              >
                계속 작성하기
              </button>
            </div>
          </div>
        </div>
      )}
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
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <div className="relative flex items-center">
        <input
          {...inputProps}
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          className={`h-11 w-full rounded-xl border bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${
            disabled
              ? "border-dashed opacity-60 dark:border-slate-700"
              : "border-slate-200"
          }`}
        />
        {suffix ? (
          <div className="absolute inset-y-0 right-2 flex items-center">
            {suffix}
          </div>
        ) : null}
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
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <textarea
        rows={rows}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        className={`w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${
          disabled
            ? "border-dashed opacity-60 dark:border-slate-700"
            : "border-slate-200"
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
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        className={`h-11 w-full rounded-xl border bg-white px-4 text-sm text-slate-700 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${
          disabled
            ? "border-dashed opacity-60 dark:border-slate-700"
            : "border-slate-200"
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
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </span>
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
          <img
            src={imagePreview}
            alt="Preview"
            className="h-full w-full object-contain rounded-xl"
          />
          <label className="absolute inset-0 cursor-pointer">
            <input
              type="file"
              accept="image/*"
              onChange={onFileSelect}
              className="hidden"
            />
          </label>
        </>
      ) : (
        <>
          <UploadIcon className="h-10 w-10 text-sky-500" />
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              컴퓨터에서 이미지 선택
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              JPG, PNG, 최대 5MB
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-sky-400 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-600 transition hover:bg-sky-500/20 dark:border-sky-500 dark:text-sky-300 dark:hover:bg-sky-500/10">
            파일 선택
            <input
              type="file"
              accept="image/*"
              onChange={onFileSelect}
              className="hidden"
            />
          </label>
        </>
      )}
    </div>
  );
}

function UploadIcon({ className }: { className?: string }) {
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
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}

function SaveIcon({ className }: { className?: string }) {
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
        d="M16.5 21v-7.5H7.5V21M4.5 7.5l7.5-5.25L19.5 7.5M12 2.25v9"
      />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
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
        d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1115 6.75a7.5 7.5 0 011.65 9.9z"
      />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
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
        d="M11.25 11.25h1.5v5.25h-1.5z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.75h.008v.008H12z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21a9 9 0 100-18 9 9 0 000 18z"
      />
    </svg>
  );
}

function BarcodeIcon({ className }: { className?: string }) {
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
        d="M4.5 6v12M7.5 6v12M12 6v12M15 6v12M18 6v12"
      />
    </svg>
  );
}

function DollarIcon({ className }: { className?: string }) {
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
        d="M12 3v18m4.5-13.5A3.75 3.75 0 0012 3.75h-.75a3.75 3.75 0 000 7.5h1.5a3.75 3.75 0 010 7.5H12a3.75 3.75 0 01-4.5-3.75"
      />
    </svg>
  );
}

function ScanIcon({ className }: { className?: string }) {
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
        d="M3.75 7.5V4.875A1.125 1.125 0 014.875 3.75H7.5M3.75 16.5v2.625c0 .621.504 1.125 1.125 1.125H7.5M16.5 3.75h2.625c.621 0 1.125.504 1.125 1.125V7.5M16.5 21h2.625c.621 0 1.125-.504 1.125-1.125V16.5"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 12h7.5" />
    </svg>
  );
}

function TruckIcon({ className }: { className?: string }) {
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
        d="M2.25 15.75V5.25A2.25 2.25 0 014.5 3h11.25v12H3.75a1.5 1.5 0 01-1.5-1.5z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 7.5H19.5c.621 0 1.125.504 1.125 1.125V15.75M15.75 12H21"
      />
      <circle cx="6" cy="18" r="1.5" />
      <circle cx="18" cy="18" r="1.5" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
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
        d="M4.5 12a7.5 7.5 0 0113.3-4.7L21 6M4.5 12a7.5 7.5 0 0013.3 4.7L21 18"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 6v3h-3M21 18v-3h-3"
      />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
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
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
      />
    </svg>
  );
}

function LightbulbIcon({ className }: { className?: string }) {
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
        d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m4.5 0a12.06 12.06 0 00-4.5 0m0 0a8.97 8.97 0 01-3.25-.55m3.25.55a8.97 8.97 0 00-3.25-.55m0 0a9 9 0 0113.5-12.297M15.75 2.25a9 9 0 00-9 9c0 1.507.18 2.97.54 4.35M15.75 2.25A8.97 8.97 0 0118 2.25c2.34 0 4.5.9 6.12 2.38M15.75 2.25a8.97 8.97 0 00-2.25 1.5m0 0a9 9 0 00-9 9m9-9v.001"
      />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
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
        d="M9 4.5V6h6V4.5a1.5 1.5 0 00-1.5-1.5h-3A1.5 1.5 0 009 4.5z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 6.75A2.25 2.25 0 016.75 4.5h10.5a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0117.25 20.25H6.75A2.25 2.25 0 014.5 18V6.75z"
      />
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
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-sm font-semibold text-white ${color}`}
    >
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
  options: Array<{
    id: string;
    member_id: string;
    role: string;
    full_name: string | null;
  }>;
  value: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Display name: show member_id (and full_name if available)
  const getDisplayName = (member: {
    id: string;
    member_id: string;
    role: string;
    full_name: string | null;
  }) => {
    if (member.full_name) {
      return `${member.member_id} (${member.full_name})`;
    }
    return member.member_id;
  };

  const displayValue = value === "성함 선택" ? "성함 선택" : value;

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
          <span className={value === "성함 선택" ? "text-slate-400" : ""}>
            {displayValue}
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
          <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => {
                onChange("성함 선택");
                setIsOpen(false);
              }}
              className="w-full px-4 py-3 text-left text-sm text-slate-400 transition hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              성함 선택
            </button>
            {options.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => {
                  onChange(member.member_id);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-3 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                  value === member.member_id
                    ? "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"
                    : "text-slate-700 dark:text-slate-200"
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-medium">{member.member_id}</span>
                  {member.full_name && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {member.full_name}
                    </span>
                  )}
                </div>
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
