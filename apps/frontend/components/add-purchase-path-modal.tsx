"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  apiGet,
  apiPost,
  clearCache,
  getAccessToken,
  getTenantId,
} from "../lib/api";

type PathType = "" | "MANAGER" | "SITE" | "OTHER";

export type AddPurchasePathModalProps = {
  open: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  apiUrl: string;
  /** ProductSupplier → ClinicSupplierManager id */
  clinicSupplierManagerId: string | null;
  initialCompanyName?: string | null;
  initialManagerName?: string | null;
  initialPhoneNumber?: string | null;
  /** 연결된 Supplier.status (예: MANUAL_ONLY) */
  initialSupplierStatus?: string | null;
  onSaved: () => void | Promise<void>;
};

type ManagerLinkedCardFields = {
  companyName: string;
  managerName: string;
  supplierStatus: string | null;
  phoneNumber: string;
};

type StagedPurchasePath = {
  tempId: string;
  pathType: "MANAGER" | "SITE" | "OTHER";
  clinicSupplierManagerId?: string;
  displayLabel: string;
  siteUrl?: string;
  siteName?: string;
  otherText?: string;
  /** 전화로 신규 등록한 담당자 — 제품 연결 카드와 동일한 요약 카드 표시용 */
  managerLinkedCard?: ManagerLinkedCardFields;
};

type SupplierSearchRow = {
  companyName: string;
  companyAddress: string | null;
  businessNumber: string;
  companyPhone: string | null;
  companyEmail: string;
  managerId: string;
  clinicSupplierManagerId: string;
  managerName: string;
  position: string | null;
  phoneNumber: string;
  email1: string | null;
  email2: string | null;
  responsibleProducts: string[];
  supplierId?: string | null;
};

type SelectedSupplierDetails = SupplierSearchRow;

/** 백엔드 CreateSupplierManualDto.position 과 동일 */
const MANAGER_POSITION_OPTIONS = [
  "사원",
  "주임",
  "대리",
  "과장",
  "차장",
  "부장",
  "대표",
  "이사",
  "담당자",
] as const;

function newTempId() {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function parseSiteInput(v: string): { siteUrl?: string; siteName?: string } {
  const trimmed = v.trim();
  if (!trimmed) return {};
  if (/^https?:\/\//i.test(trimmed)) {
    return { siteUrl: trimmed };
  }
  if (/^www\./i.test(trimmed) || /\.[a-z0-9-]+\.[a-z]{2,}/i.test(trimmed)) {
    return { siteUrl: `https://${trimmed.replace(/^https?:\/\//i, "")}` };
  }
  return { siteName: trimmed };
}

function managerDedupeKeyFromSearchRow(row: SupplierSearchRow): string {
  const id = (
    row.clinicSupplierManagerId?.trim() ||
    row.managerId?.trim() ||
    ""
  ).toLowerCase();
  if (id) return `id:${id}`;
  const phone = String(row.phoneNumber || "").replace(/\D/g, "");
  const company = String(row.companyName || "")
    .trim()
    .toLowerCase();
  const name = String(row.managerName || "")
    .trim()
    .toLowerCase();
  return `k:${company}|${name}|${phone}`;
}

function managerDedupeKeyFromStaged(p: StagedPurchasePath): string | null {
  if (p.pathType !== "MANAGER") return null;
  const id = (p.clinicSupplierManagerId || "").trim().toLowerCase();
  if (id) return `id:${id}`;
  const parts = (p.displayLabel || "").split("·").map((s) => s.trim());
  if (parts.length >= 2) {
    const company = parts[0].toLowerCase();
    const name = parts[1].toLowerCase();
    return `k:${company}|${name}|`;
  }
  return null;
}

function managerDedupeKeysMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.startsWith("id:") || b.startsWith("id:")) return false;
  const stripPhone = (k: string) => {
    const body = k.replace(/^k:/, "");
    const parts = body.split("|");
    return `${parts[0] ?? ""}|${parts[1] ?? ""}`;
  };
  if (a.startsWith("k:") && b.startsWith("k:")) {
    const ca = stripPhone(a);
    const cb = stripPhone(b);
    return ca === cb && ca !== "|";
  }
  return false;
}

function isDuplicateStagedManager(
  staged: StagedPurchasePath[],
  newKey: string
): boolean {
  return staged.some((p) => {
    const ex = managerDedupeKeyFromStaged(p);
    if (!ex) return false;
    return ex === newKey || managerDedupeKeysMatch(ex, newKey);
  });
}

function TruckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
      />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

export function AddPurchasePathModal({
  open,
  onClose,
  productId,
  productName,
  apiUrl,
  clinicSupplierManagerId,
  initialCompanyName,
  initialManagerName,
  initialPhoneNumber,
  initialSupplierStatus,
  onSaved,
}: AddPurchasePathModalProps) {
  const [staged, setStaged] = useState<StagedPurchasePath[]>([]);
  /** 제품에 이미 저장된 MANAGER 경로 — 중복 검사에 스테이징과 함께 사용 */
  const [persistedManagerPaths, setPersistedManagerPaths] = useState<
    StagedPurchasePath[]
  >([]);
  const [addOpen, setAddOpen] = useState(false);
  const [pathType, setPathType] = useState<PathType>("");
  const [siteInput, setSiteInput] = useState("");
  const [otherInput, setOtherInput] = useState("");
  const [writeNow, setWriteNow] = useState(true);
  const [saving, setSaving] = useState(false);

  const [supplierCompany, setSupplierCompany] = useState("");
  const [supplierManager, setSupplierManager] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierResults, setSupplierResults] = useState<SupplierSearchRow[]>(
    []
  );
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierFallback, setSupplierFallback] = useState(false);
  const [selectedResultIdx, setSelectedResultIdx] = useState<number | null>(
    null
  );
  const [selectedDetails, setSelectedDetails] =
    useState<SelectedSupplierDetails | null>(null);

  const [showPhoneManualCreate, setShowPhoneManualCreate] = useState(false);
  const [manualCompanyName, setManualCompanyName] = useState("");
  const [manualManagerName, setManualManagerName] = useState("");
  const [manualPosition, setManualPosition] = useState("");
  const [manualPhoneForCreate, setManualPhoneForCreate] = useState("");
  const [manualBusinessNumber, setManualBusinessNumber] = useState("");
  const [manualEmail1, setManualEmail1] = useState("");
  const [manualMemo, setManualMemo] = useState("");
  const [manualCreating, setManualCreating] = useState(false);

  const resetForm = useCallback(() => {
    setStaged([]);
    setPersistedManagerPaths([]);
    setAddOpen(false);
    setPathType("");
    setSiteInput("");
    setOtherInput("");
    setWriteNow(true);
    setSupplierCompany("");
    setSupplierManager("");
    setSupplierPhone("");
    setSupplierResults([]);
    setSupplierLoading(false);
    setSupplierFallback(false);
    setSelectedResultIdx(null);
    setSelectedDetails(null);
    setShowPhoneManualCreate(false);
    setManualCompanyName("");
    setManualManagerName("");
    setManualPosition("");
    setManualPhoneForCreate("");
    setManualBusinessNumber("");
    setManualEmail1("");
    setManualMemo("");
    setManualCreating(false);
  }, []);

  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open, productId, resetForm]);

  useEffect(() => {
    if (!open || !productId) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await apiGet<Record<string, unknown>[]>(
          `/products/${productId}/purchase-paths`,
          {
            headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
          }
        );
        if (cancelled) return;
        const arr = Array.isArray(rows) ? rows : [];
        const next: StagedPurchasePath[] = [];
        for (const raw of arr) {
          const pt = raw.path_type ?? raw.pathType;
          if (pt !== "MANAGER") continue;
          const mgrId = String(
            raw.clinic_supplier_manager_id ?? raw.clinicSupplierManagerId ?? ""
          ).trim();
          if (!mgrId) continue;
          const m = (raw.clinicSupplierManager ??
            raw.clinic_supplier_manager) as Record<string, unknown> | null;
          const c = String(m?.company_name ?? m?.companyName ?? "").trim();
          const n = String(m?.name ?? "").trim();
          const label = `${c} · ${n}`.trim() || "담당자 경로";
          next.push({
            tempId: `persisted_${String(raw.id ?? mgrId)}`,
            pathType: "MANAGER",
            clinicSupplierManagerId: mgrId,
            displayLabel: label,
          });
        }
        setPersistedManagerPaths(next);
      } catch {
        if (!cancelled) setPersistedManagerPaths([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, productId]);

  const managerPathsForDedupe = useMemo(
    () => [...persistedManagerPaths, ...staged],
    [persistedManagerPaths, staged]
  );
  const managerPathsForDedupeRef = useRef(managerPathsForDedupe);
  managerPathsForDedupeRef.current = managerPathsForDedupe;

  const removeStaged = (tempId: string) => {
    setStaged((prev) => prev.filter((p) => p.tempId !== tempId));
  };

  const addStagedSite = () => {
    const parsed = parseSiteInput(siteInput);
    if (!parsed.siteUrl && !parsed.siteName) {
      alert("사이트 이름 또는 URL을 입력해주세요.");
      return;
    }
    const label = siteInput.trim();
    setStaged((prev) => [
      ...prev,
      {
        tempId: newTempId(),
        pathType: "SITE",
        displayLabel: label,
        ...(parsed.siteUrl
          ? { siteUrl: parsed.siteUrl }
          : { siteName: parsed.siteName }),
      },
    ]);
    setSiteInput("");
    alert(
      "구매 경로가 목록에 추가되었습니다. 하단「저장」으로 제품에 반영합니다."
    );
    setPathType("");
    setAddOpen(false);
  };

  const addStagedOther = () => {
    const v = otherInput.trim();
    if (!v) {
      alert("구매 경로 내용을 입력해주세요.");
      return;
    }
    setStaged((prev) => [
      ...prev,
      { tempId: newTempId(), pathType: "OTHER", displayLabel: v, otherText: v },
    ]);
    setOtherInput("");
    alert(
      "구매 경로가 목록에 추가되었습니다. 하단「저장」으로 제품에 반영합니다."
    );
    setPathType("");
    setAddOpen(false);
  };

  const addStagedFromSelectedManager = () => {
    if (!selectedDetails) {
      alert("담당자를 검색·선택한 뒤 추가할 수 있습니다.");
      return;
    }
    const mgrId =
      selectedDetails.clinicSupplierManagerId?.trim() ||
      selectedDetails.managerId?.trim();
    if (!mgrId) {
      alert("담당자를 검색·선택한 뒤 추가할 수 있습니다.");
      return;
    }
    setStaged((prev) => [
      ...prev,
      {
        tempId: newTempId(),
        pathType: "MANAGER",
        clinicSupplierManagerId: mgrId,
        displayLabel: `${selectedDetails.companyName} · ${selectedDetails.managerName}`,
      },
    ]);
    alert(
      "구매 경로가 목록에 추가되었습니다. 하단「저장」으로 제품에 반영합니다."
    );
    setPathType("");
    setAddOpen(false);
    setSelectedDetails(null);
    setSelectedResultIdx(null);
  };

  const addStagedFromLinkedProduct = () => {
    const mgrId = clinicSupplierManagerId?.trim();
    if (!mgrId) return;
    const label =
      `${initialCompanyName || ""} · ${initialManagerName || ""}`.trim() ||
      "담당자 경로";
    setStaged((prev) => [
      ...prev,
      {
        tempId: newTempId(),
        pathType: "MANAGER",
        clinicSupplierManagerId: mgrId,
        displayLabel: label,
      },
    ]);
    alert(
      "구매 경로가 목록에 추가되었습니다. 하단「저장」으로 제품에 반영합니다."
    );
    setPathType("");
    setAddOpen(false);
  };

  const searchSuppliers = async () => {
    if (!supplierCompany.trim() || !supplierManager.trim()) {
      setSupplierResults([]);
      return;
    }
    setSupplierLoading(true);
    setSupplierFallback(false);
    try {
      const token = await getAccessToken();
      const tenantId = getTenantId();
      const params = new URLSearchParams();
      params.append("companyName", supplierCompany.trim());
      params.append("managerName", supplierManager.trim());
      const res = await fetch(
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
      if (!res.ok) {
        setSupplierResults([]);
        setSupplierFallback(true);
        return;
      }
      const data = await res.json();
      const results: SupplierSearchRow[] = (
        Array.isArray(data) ? data : []
      ).map((item: any) => ({
        companyName: item.companyName || "",
        companyAddress: item.companyAddress || null,
        businessNumber: item.businessNumber || "",
        companyPhone: item.companyPhone || null,
        companyEmail: item.companyEmail || "",
        managerId: item.managerId || "",
        clinicSupplierManagerId:
          item.clinicSupplierManagerId || item.managerId || item.id || "",
        managerName: item.managerName || "",
        position: item.position || null,
        phoneNumber: item.phoneNumber || "",
        email1: item.email1 || null,
        email2: item.email2 || null,
        responsibleProducts: item.responsibleProducts || [],
        supplierId: item.supplierId || item.id || null,
      }));
      setSupplierResults(results);
      if (
        results.length === 0 &&
        supplierCompany.trim() &&
        supplierManager.trim()
      ) {
        setSupplierFallback(true);
      }
    } catch {
      setSupplierResults([]);
      setSupplierFallback(true);
    } finally {
      setSupplierLoading(false);
    }
  };

  const searchByPhone = async () => {
    const clean = supplierPhone.replace(/[\s\-()]/g, "").trim();
    if (!clean) {
      setSupplierResults([]);
      return;
    }
    setSupplierLoading(true);
    setSupplierFallback(false);
    try {
      const token = await getAccessToken();
      const tenantId = getTenantId();
      const res = await fetch(
        `${apiUrl}/supplier/search-by-phone?phoneNumber=${encodeURIComponent(clean)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Tenant-Id": tenantId || "",
          },
        }
      );
      if (!res.ok) {
        setSupplierResults([]);
        setShowPhoneManualCreate(false);
        return;
      }
      const data = await res.json();
      const dataArray = Array.isArray(data) ? data : data ? [data] : [];
      const results: SupplierSearchRow[] = dataArray.map((item: any) => {
        const supplierManagerId =
          item.supplierManagerId ||
          item.managers?.[0]?.id ||
          (item.managers?.length ? item.managers[0].id : null);
        return {
          companyName: item.companyName || "",
          companyAddress: item.companyAddress || null,
          businessNumber: item.businessNumber || "",
          companyPhone: item.companyPhone || null,
          companyEmail: item.companyEmail || "",
          managerId: item.managerId || item.managers?.[0]?.managerId || "",
          clinicSupplierManagerId:
            item.clinicSupplierManagerId ||
            item.clinic_supplier_manager_id ||
            supplierManagerId ||
            item.managerId ||
            "",
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
          supplierId: item.supplierId || item.id || null,
        };
      });
      setSupplierResults(results);
      if (results.length === 0 && clean.length >= 10) {
        setShowPhoneManualCreate(true);
        setManualPhoneForCreate(supplierPhone.trim());
        setSelectedDetails(null);
        setSelectedResultIdx(null);
      } else {
        setShowPhoneManualCreate(false);
      }
    } catch {
      setSupplierResults([]);
      setShowPhoneManualCreate(false);
    } finally {
      setSupplierLoading(false);
    }
  };

  const submitManualSupplierFromPhone = async () => {
    const company = manualCompanyName.trim();
    const manager = manualManagerName.trim();
    const phoneDigits = manualPhoneForCreate.replace(/\D/g, "");
    if (!company) {
      alert("회사명을 입력해주세요.");
      return;
    }
    if (!manager) {
      alert("담당자 성함을 입력해주세요.");
      return;
    }
    if (!manualPosition.trim()) {
      alert("직함을 선택해주세요.");
      return;
    }
    if (!/^010\d{8}$/.test(phoneDigits)) {
      alert("휴대폰 번호 형식이 올바르지 않습니다 (예: 01012345678)");
      return;
    }
    const businessNumberTrim = manualBusinessNumber.trim();
    if (businessNumberTrim && !/^\d{3}-\d{2}-\d{5}$/.test(businessNumberTrim)) {
      alert("사업자 등록번호 형식이 올바르지 않습니다 (예: 123-45-67890)");
      return;
    }
    const emailTrim = manualEmail1.trim();
    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      alert("이메일 형식이 올바르지 않습니다.");
      return;
    }
    setManualCreating(true);
    try {
      const token = await getAccessToken();
      const tenantId = getTenantId();
      const body: Record<string, unknown> = {
        companyName: company,
        managerName: manager,
        phoneNumber: phoneDigits,
        status: "MANUAL_ONLY",
        position: manualPosition.trim(),
      };
      if (businessNumberTrim) {
        body.businessNumber = businessNumberTrim;
      }
      if (emailTrim) {
        body.managerEmail = emailTrim;
      }
      const memoTrim = manualMemo.trim();
      if (memoTrim) {
        body.memo = memoTrim;
      }
      const response = await fetch(`${apiUrl}/supplier/create-manual`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId || "",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          (errorData as { message?: string }).message ||
            `서버 오류: ${response.status}`
        );
      }
      const result = (await response.json()) as {
        clinicManager?: { id: string; name: string; phoneNumber?: string };
        supplier?: { id: string; companyName?: string; status?: string };
      };
      const mgrId = result.clinicManager?.id?.trim();
      if (!mgrId) {
        alert("담당자 저장 후 ID를 받지 못했습니다. 다시 시도해주세요.");
        return;
      }
      const label = `${company} · ${manager}`;
      const linkedCard: ManagerLinkedCardFields = {
        companyName: company,
        managerName: manager,
        supplierStatus: result.supplier?.status ?? "MANUAL_ONLY",
        phoneNumber: phoneDigits,
      };
      setStaged((prev) => [
        ...prev,
        {
          tempId: newTempId(),
          pathType: "MANAGER",
          clinicSupplierManagerId: mgrId,
          displayLabel: label,
          managerLinkedCard: linkedCard,
        },
      ]);
      setShowPhoneManualCreate(false);
      setManualCompanyName("");
      setManualManagerName("");
      setManualPosition("");
      setManualBusinessNumber("");
      setManualEmail1("");
      setManualMemo("");
      setSupplierPhone("");
      setManualPhoneForCreate("");
      setSupplierResults([]);
      setSelectedDetails(null);
      setSelectedResultIdx(null);
      alert(
        "신규 담당자가 등록되어 구매 경로 목록에 추가되었습니다. 하단「저장」으로 제품에 반영합니다."
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "등록에 실패했습니다.";
      alert(msg);
    } finally {
      setManualCreating(false);
    }
  };

  const selectSupplierRow = (index: number) => {
    const r = supplierResults[index];
    if (!r) return;
    setSelectedResultIdx(index);
    setSelectedDetails({
      ...r,
      clinicSupplierManagerId:
        r.clinicSupplierManagerId || r.managerId || String(r.supplierId || ""),
    });
  };

  const saveAll = async () => {
    if (staged.length === 0) {
      alert("추가할 구매 경로를 등록해주세요.");
      return;
    }
    setSaving(true);
    try {
      for (let i = 0; i < staged.length; i++) {
        const p = staged[i];
        const isDefault = i === 0;
        if (p.pathType === "MANAGER" && p.clinicSupplierManagerId) {
          await apiPost(`/products/${productId}/purchase-paths`, {
            pathType: "MANAGER",
            clinicSupplierManagerId: p.clinicSupplierManagerId,
            isDefault,
          });
        } else if (p.pathType === "SITE") {
          await apiPost(`/products/${productId}/purchase-paths`, {
            pathType: "SITE",
            isDefault,
            ...(p.siteUrl
              ? { siteUrl: p.siteUrl }
              : { siteName: p.siteName || p.displayLabel }),
          });
        } else if (p.pathType === "OTHER" && p.otherText) {
          await apiPost(`/products/${productId}/purchase-paths`, {
            pathType: "OTHER",
            otherText: p.otherText,
            isDefault,
          });
        }
      }
      clearCache("/products");
      clearCache("products");
      await onSaved();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "저장에 실패했습니다.";
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-pp-modal-title"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900">
          <div>
            <h2
              id="order-pp-modal-title"
              className="text-lg font-bold text-slate-900 dark:text-white"
            >
              구매 경로 추가
            </h2>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
              {productName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="닫기"
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
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-700">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-slate-100">
                <TruckIcon className="h-5 w-5 text-indigo-500" />
                구매 경로
              </h3>
              <button
                type="button"
                onClick={() => {
                  setAddOpen(true);
                  setPathType("");
                  setSiteInput("");
                  setOtherInput("");
                }}
                disabled={saving}
                className="rounded-lg border border-sky-500 bg-white px-3 py-1.5 text-sm font-semibold text-sky-600 transition hover:bg-sky-50 disabled:opacity-50 dark:border-sky-400 dark:bg-slate-900 dark:text-sky-300 dark:hover:bg-slate-800"
              >
                경로 추가
              </button>
            </div>

            {/* {staged.length > 0 && (
              <ul className="mb-4 space-y-2">
                {staged.map((p) => (
                  <li
                    key={p.tempId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-2.5 text-sm dark:border-amber-900/40 dark:bg-amber-950/20"
                  >
                    <div className="text-slate-800 dark:text-slate-100">
                      <span className="mr-2 font-semibold text-amber-800 dark:text-amber-200">
                        저장 대기 ·{" "}
                        {p.pathType === "MANAGER"
                          ? "담당자 경로"
                          : p.pathType === "SITE"
                            ? "사이트 경로"
                            : "기타 경로"}
                      </span>
                      {p.displayLabel}
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => removeStaged(p.tempId)}
                      className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50 dark:text-rose-400"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )} */}

            {addOpen && (
              <div className="mb-6 space-y-4 border-b border-slate-100 pb-6 dark:border-slate-700">
                {/* {(pathType === "SITE" || pathType === "OTHER") && (
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={writeNow}
                      onChange={(e) => setWriteNow(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    이 제품의 구매 경로 바로 작성하기
                  </label>
                )} */}
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <span>어디에서 이 제품 구매 하세요?</span>
                  <span
                    className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-slate-300 text-xs text-slate-500 dark:border-slate-600 dark:text-slate-400"
                    title="하단 저장 시 제품에 구매 경로가 등록됩니다."
                  >
                    ⓘ
                  </span>
                </div>
                <div className="relative">
                  <select
                    value={pathType}
                    onChange={(e) => setPathType(e.target.value as PathType)}
                    disabled={saving}
                    className="h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-700 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <option value="">구매 경로 선택해주세요</option>
                    <option value="MANAGER">담당자 경로</option>
                    <option value="SITE">사이트 경로</option>
                    <option value="OTHER">기타 경로</option>
                  </select>
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
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
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>

                {pathType === "SITE" && (
                  <div className="space-y-3 pt-2">
                    <input
                      type="text"
                      value={siteInput}
                      onChange={(e) => setSiteInput(e.target.value)}
                      placeholder="사이트 이름 또는 URL 붙여넣기"
                      disabled={saving}
                      className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm bg-white focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={addStagedSite}
                        className="rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-50"
                      >
                        등록하기
                      </button>
                    </div>
                  </div>
                )}

                {pathType === "OTHER" && (
                  <div className="space-y-3 pt-2">
                    <input
                      type="text"
                      value={otherInput}
                      onChange={(e) => setOtherInput(e.target.value)}
                      placeholder="예) 서비스 무료제공, 학회 수령, 샘플 등..."
                      disabled={saving}
                      className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm bg-white focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={addStagedOther}
                        className="rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-50"
                      >
                        등록하기
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {addOpen && pathType === "MANAGER" && (
              <div className="rounded-xl bg-sky-50/90 p-4 dark:bg-sky-950/25">
                {(clinicSupplierManagerId ||
                  staged.some(
                    (p) =>
                      p.pathType === "MANAGER" && p.managerLinkedCard != null
                  )) && (
                  <div className="mb-6 space-y-6">
                    {clinicSupplierManagerId && (
                      <div className="rounded-lg border border-sky-200 bg-white/80 p-4 dark:border-sky-800 dark:bg-slate-900/60">
                        <p className="mb-2 text-xs font-semibold text-sky-800 dark:text-sky-200">
                          제품에 연결된 공급처
                        </p>
                        <div className="grid gap-2 text-sm sm:grid-cols-2">
                          <div>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              회사명
                            </span>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {initialCompanyName || "—"}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              담당자
                            </span>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {initialManagerName || "—"}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              상태
                            </span>
                            <p className="text-slate-800 dark:text-slate-200">
                              {initialSupplierStatus || "—"}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              핸드폰
                            </span>
                            <p className="text-slate-800 dark:text-slate-200">
                              {initialPhoneNumber || "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {staged
                      .filter(
                        (p) =>
                          p.pathType === "MANAGER" &&
                          p.managerLinkedCard != null
                      )
                      .map((p) => {
                        const c = p.managerLinkedCard!;
                        return (
                          <div
                            key={p.tempId}
                            className="rounded-lg border border-sky-200 bg-white/80 p-4 dark:border-sky-800 dark:bg-slate-900/60"
                          >
                            <p className="mb-2 text-xs font-semibold text-sky-800 dark:text-sky-200">
                              제품에 연결된 공급처
                            </p>
                            <div className="grid gap-2 text-sm sm:grid-cols-2">
                              <div>
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  회사명
                                </span>
                                <p className="font-medium text-slate-900 dark:text-white">
                                  {c.companyName || "—"}
                                </p>
                              </div>
                              <div>
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  담당자
                                </span>
                                <p className="font-medium text-slate-900 dark:text-white">
                                  {c.managerName || "—"}
                                </p>
                              </div>
                              <div>
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  상태
                                </span>
                                <p className="text-slate-800 dark:text-slate-200">
                                  {c.supplierStatus || "—"}
                                </p>
                              </div>
                              <div>
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  핸드폰
                                </span>
                                <p className="text-slate-800 dark:text-slate-200">
                                  {c.phoneNumber || "—"}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {selectedDetails && (
                  <div className="mb-6 space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-900/80">
                    <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                      공급업체 상세 정보
                    </h4>
                    <div className="grid gap-3 text-sm md:grid-cols-2">
                      <div>
                        <span className="text-xs text-slate-500">회사명</span>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {selectedDetails.companyName}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">담당자</span>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {selectedDetails.managerName}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">직함</span>
                        <p className="text-slate-800 dark:text-slate-200">
                          {selectedDetails.position || "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">핸드폰</span>
                        <p className="text-slate-800 dark:text-slate-200">
                          {selectedDetails.phoneNumber || "—"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={addStagedFromSelectedManager}
                      className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-50"
                    >
                      구매 경로에 추가
                    </button>
                  </div>
                )}

                <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                      공급업체명
                    </label>
                    <input
                      type="text"
                      value={supplierCompany}
                      onChange={(e) => setSupplierCompany(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          supplierCompany &&
                          supplierManager
                        ) {
                          void searchSuppliers();
                        }
                      }}
                      placeholder="공급업체명"
                      disabled={saving}
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                      담당자
                    </label>
                    <input
                      type="text"
                      value={supplierManager}
                      onChange={(e) => setSupplierManager(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          supplierCompany &&
                          supplierManager
                        ) {
                          void searchSuppliers();
                        }
                      }}
                      placeholder="담당자 이름"
                      disabled={saving}
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => void searchSuppliers()}
                      disabled={
                        saving ||
                        supplierLoading ||
                        !supplierCompany.trim() ||
                        !supplierManager.trim()
                      }
                      className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      title="검색"
                    >
                      {supplierLoading ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <SearchIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {supplierResults.length > 0 && (
                  <div className="mb-4 max-h-48 overflow-auto rounded-lg border border-slate-200 dark:border-slate-600">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                          <th className="px-3 py-2 text-left text-xs font-semibold">
                            회사명
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold">
                            이름
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold">
                            직함
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold">
                            핸드폰
                          </th>
                          <th className="w-px whitespace-nowrap px-3 py-2 text-right text-xs font-semibold">
                            선택
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {supplierResults.map((row, index) => (
                          <tr
                            key={`${row.managerId}-${index}`}
                            className={`border-b border-slate-100 dark:border-slate-700 ${
                              selectedResultIdx === index
                                ? "bg-blue-50 dark:bg-blue-900/20"
                                : ""
                            }`}
                          >
                            <td className="px-3 py-2">{row.companyName}</td>
                            <td className="px-3 py-2">{row.managerName}</td>
                            <td className="px-3 py-2">{row.position || "—"}</td>
                            <td className="px-3 py-2">{row.phoneNumber}</td>
                            <td className="w-px whitespace-nowrap px-3 py-2 text-right align-middle">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const pick = supplierResults[index];
                                  if (!pick) return;
                                  const newKey =
                                    managerDedupeKeyFromSearchRow(pick);
                                  if (
                                    isDuplicateStagedManager(
                                      managerPathsForDedupeRef.current,
                                      newKey
                                    )
                                  ) {
                                    alert(
                                      "이미 목록에 동일한 담당자 경로가 있습니다."
                                    );
                                    return;
                                  }
                                  selectSupplierRow(index);
                                }}
                                className="rounded-md border border-sky-500 bg-white px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-400 dark:bg-slate-900 dark:text-sky-300 dark:hover:bg-slate-800"
                              >
                                선택하기
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {!supplierLoading &&
                  supplierFallback &&
                  supplierResults.length === 0 && (
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                      거래 이력이 있는 공급업체를 찾을 수 없습니다. 핸드폰
                      번호로 검색하거나{" "}
                      <Link
                        href={`/products/${productId}`}
                        className="font-semibold underline"
                      >
                        제품 상세
                      </Link>
                      에서 등록해주세요.
                    </div>
                  )}

                <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-600">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    ▲ 담당자님 못 찾은 경우, 핸드폰으로 검색해 보세요.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={supplierPhone}
                      onChange={(e) => {
                        setSupplierPhone(e.target.value);
                        setShowPhoneManualCreate(false);
                      }}
                      placeholder="000-0000-0000"
                      disabled={saving}
                      className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => void searchByPhone()}
                      disabled={
                        saving || supplierLoading || !supplierPhone.trim()
                      }
                      className="shrink-0 rounded-lg bg-slate-600 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      검색하기
                    </button>
                  </div>
                  {showPhoneManualCreate && (
                    <div className="mt-4 space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 md:p-6">
                      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-700">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            담당자 정보 작성
                          </h3>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            핸드폰 검색 결과가 없을 때 신규 담당자를 등록할 수
                            있습니다.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowPhoneManualCreate(false);
                            setManualCompanyName("");
                            setManualManagerName("");
                            setManualPosition("");
                            setManualBusinessNumber("");
                            setManualEmail1("");
                            setManualMemo("");
                          }}
                          disabled={saving || manualCreating}
                          className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-sky-700 transition hover:bg-sky-50 disabled:opacity-50 dark:border-sky-800 dark:bg-slate-800 dark:text-sky-300 dark:hover:bg-slate-700"
                          aria-label="닫기"
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
                      </div>

                      <div className="flex flex-col gap-3 rounded-xl border border-sky-100 bg-sky-50/80 p-4 sm:flex-row sm:items-center sm:gap-4 dark:border-sky-900/40 dark:bg-sky-950/30">
                        <Link
                          href="/inbound/new"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600"
                        >
                          회사정보 간편 등록
                        </Link>
                        <p className="text-sm leading-relaxed text-sky-900 dark:text-sky-100/90">
                          사업자등록증으로 등록하면 회사 정보가 자동으로
                          입력됩니다.
                        </p>
                      </div>

                      <div>
                        <h4 className="mb-3 text-xl font-bold text-slate-500 dark:text-slate-400">
                          회사 정보
                        </h4>
                        <div className="grid gap-4 px-0 md:grid-cols-2 md:px-4">
                          <div>
                            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                              회사명 <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={manualCompanyName}
                              onChange={(e) =>
                                setManualCompanyName(e.target.value)
                              }
                              placeholder="회사명을 입력해주세요"
                              disabled={saving || manualCreating}
                              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                              사업자등록번호{" "}
                              <span className="font-normal text-slate-500">
                                (선택)
                              </span>
                            </label>
                            <input
                              type="text"
                              value={manualBusinessNumber}
                              onChange={(e) =>
                                setManualBusinessNumber(e.target.value)
                              }
                              placeholder="사업자등록번호를 입력해주세요 (예: 123-45-67890)"
                              disabled={saving || manualCreating}
                              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="mb-3 text-xl font-bold text-slate-500 dark:text-slate-400">
                          담당자 정보
                        </h4>
                        <div className="grid gap-4 px-0 md:grid-cols-2 md:px-4">
                          <div>
                            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                              담당자 성함{" "}
                              <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={manualManagerName}
                              onChange={(e) =>
                                setManualManagerName(e.target.value)
                              }
                              placeholder="담당자 성함을 입력해주세요"
                              disabled={saving || manualCreating}
                              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                              직함 <span className="text-rose-500">*</span>
                            </label>
                            <select
                              value={manualPosition}
                              onChange={(e) =>
                                setManualPosition(e.target.value)
                              }
                              disabled={saving || manualCreating}
                              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                            >
                              <option value="">직함 선택</option>
                              {MANAGER_POSITION_OPTIONS.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                              핸드폰 번호{" "}
                              <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="tel"
                              value={manualPhoneForCreate}
                              onChange={(e) =>
                                setManualPhoneForCreate(e.target.value)
                              }
                              placeholder="담당자 핸드폰 번호를 입력해주세요"
                              disabled={saving || manualCreating}
                              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                              이메일 주소{" "}
                              <span className="font-normal text-slate-500">
                                (선택)
                              </span>
                            </label>
                            <input
                              type="email"
                              value={manualEmail1}
                              onChange={(e) => setManualEmail1(e.target.value)}
                              placeholder="담당자 이메일을 입력해주세요"
                              disabled={saving || manualCreating}
                              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                          메모
                        </h4>
                        <textarea
                          value={manualMemo}
                          onChange={(e) => setManualMemo(e.target.value)}
                          rows={4}
                          placeholder="메모를 입력하세요"
                          disabled={saving || manualCreating}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                        />
                      </div>

                      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => {
                            setShowPhoneManualCreate(false);
                            setManualCompanyName("");
                            setManualManagerName("");
                            setManualPosition("");
                            setManualBusinessNumber("");
                            setManualEmail1("");
                            setManualMemo("");
                          }}
                          disabled={saving || manualCreating}
                          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          닫기
                        </button>
                        <button
                          type="button"
                          onClick={() => void submitManualSupplierFromPhone()}
                          disabled={saving || manualCreating}
                          className="rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-md transition hover:from-sky-600 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {manualCreating ? "등록 중…" : "등록하기"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void saveAll()}
            disabled={saving || staged.length === 0}
            className="rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-2 text-sm font-semibold text-white shadow disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
