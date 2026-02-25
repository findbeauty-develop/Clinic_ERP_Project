"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import { getAccessToken } from "../lib/api";
import { parseGS1Barcode } from "../utils/barcodeParser";

interface ValidationError {
  row: number;
  data: any;
  valid: boolean;
  errors: string[];
}

interface PreviewData {
  total: number;
  valid: number;
  errors: number;
  results: ValidationError[];
}

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: () => void;
}

export default function CSVImportModal({
  isOpen,
  onClose,
  onImport,
}: CSVImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [inboundManager, setInboundManager] = useState<string>("");
  const [showDuplicateGtinModal, setShowDuplicateGtinModal] = useState(false);
  const [showRequiredErrorModal, setShowRequiredErrorModal] = useState(false);
  const [requiredFieldErrors, setRequiredFieldErrors] = useState<
    { row: number; missingFields: string[] }[]
  >([]);
  const [importErrorMsg, setImportErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Required fields and Korean labels for error modal */
  const REQUIRED_FIELDS: { label: string; check: (d: any) => boolean }[] = [
    { label: "제품명", check: (d) => !String(d?.name ?? "").trim() },
    { label: "제조사/유통사", check: (d) => !String(d?.brand ?? "").trim() },
    { label: "카테고리", check: (d) => !String(d?.category ?? "").trim() },
    { label: "재고 수량_단위", check: (d) => !String(d?.unit ?? "").trim() },
    { label: "최소 제품 수량", check: (d) => { const v = d?.min_stock; return v === undefined || v === null || Number(v) < 0; } },
    { label: "제품 용량", check: (d) => { const v = d?.capacity_per_product; return v === undefined || v === null || Number(v) < 0; } },
    { label: "사용 용량_단위", check: (d) => !String(d?.capacity_unit ?? "").trim() },
    { label: "사용 용량", check: (d) => { const v = d?.usage_capacity; return v === undefined || v === null || Number(v) < 0; } },
    { label: "유효기간 임박 알림", check: (d) => { const v = d?.alert_days; return v === undefined || v === null || Number(v) < 0; } },
    { label: "유효기간 있음", check: (d) => d?.has_expiry_period === undefined || d?.has_expiry_period === null },
    { label: "담당자 핸드폰번호", check: (d) => !String(d?.contact_phone ?? "").trim() },
    { label: "바코드", check: (d) => !String(d?.barcode ?? "").trim() },
  ];

  const getRequiredFieldErrors = (): { row: number; missingFields: string[] }[] => {
    if (!preview?.results?.length) return [];
    const list: { row: number; missingFields: string[] }[] = [];
    preview.results.forEach((r) => {
      const missing = REQUIRED_FIELDS.filter((f) => f.check(r.data)).map((f) => f.label);
      if (missing.length > 0) list.push({ row: r.row, missingFields: missing });
    });
    return list;
  };

  const normalizeToGtin = (barcode: string): string => {
    if (!barcode?.trim()) return "";
    try {
      const parsed = parseGS1Barcode(barcode.trim());
      return parsed?.gtin?.trim() || barcode.trim();
    } catch {
      return barcode.trim();
    }
  };

  /** Parse 유효기간 있음 (예/아니오, 1/0, true/false, Y/N) → boolean. Empty/invalid → undefined (required error). */
  const parseHasExpiryPeriod = (val: unknown): boolean | undefined => {
    const s = String(val ?? "").trim().toLowerCase();
    if (s === "") return undefined;
    if (s === "예" || s === "1" || s === "true" || s === "y" || s === "yes") return true;
    if (s === "아니오" || s === "0" || s === "false" || s === "n" || s === "no") return false;
    return undefined;
  };

  /** Map Korean CSV headers to English (backend expects name, brand, barcode, etc.) */
  const mapCsvRowToEnglish = (row: any): any => {
    const get = (en: string, kr: string) => row[en] ?? row[kr] ?? "";
    const num = (en: string, kr: string) => {
      const v = row[en] ?? row[kr];
      if (v === "" || v === undefined || v === null) return undefined;
      const n = Number(String(v).replace(/[,\s]/g, ""));
      return isNaN(n) ? undefined : n;
    };
    const hasExpiryRaw = get("has_expiry_period", "유효기간 있음*");
    return {
      name: String(get("name", "제품명*")).trim(),
      brand: String(get("brand", "제조사/유통사*")).trim(),
      category: String(get("category", "카테고리*")).trim(),
      unit: String(get("unit", "재고 수량_단위*")).trim(),
      min_stock: num("min_stock", "최소 제품 수량*") ?? 0,
      capacity_per_product: num("capacity_per_product", "제품 용량*") ?? 0,
      capacity_unit: String(get("capacity_unit", "사용 용량_단위*")).trim(),
      usage_capacity: num("usage_capacity", "사용 용량*") ?? 0,
      alert_days: num("alert_days", "유효기간 임박 알림*") ?? 0,
      has_expiry_period: parseHasExpiryPeriod(hasExpiryRaw),
      contact_phone: String(get("contact_phone", "담당자 핸드폰번호*")).trim(),
      barcode: String(get("barcode", "바코드")).trim(),
      refund_amount: num("refund_amount", "반납가"),
      purchase_price: num("purchase_price", "구매가"),
      sale_price: num("sale_price", "판매가"),
    };
  };

  const duplicateGtinList = (() => {
    if (!preview?.results?.length) return [] as { gtin: string; rows: number[]; name: string }[];
    const map = new Map<string, { rows: number[]; name: string }>();
    preview.results.forEach((r) => {
      const gtin = r.data?.barcode?.trim();
      const name = (r.data?.name ?? "")?.trim() || "—";
      if (gtin) {
        if (!map.has(gtin)) map.set(gtin, { rows: [], name });
        map.get(gtin)!.rows.push(r.row);
      }
    });
    return [...map.entries()]
      .filter(([, v]) => v.rows.length > 1)
      .map(([gtin, v]) => ({ gtin, rows: v.rows, name: v.name }));
  })();

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith(".csv")) {
      alert("CSV 파일만 업로드 가능합니다.");
      return;
    }

    setFile(selectedFile);
    parseCSV(selectedFile);
  };

  const parseCSV = (file: File) => {
    setLoading(true);
    setPreview(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false, // Keep all fields as strings
      complete: async (results) => {
        try {
          const token = await getAccessToken();
          if (!token) {
            alert("로그인이 필요합니다.");
            setLoading(false);
            return;
          }

          const rawRows = (results.data as any[]).map(mapCsvRowToEnglish);
          const rows = rawRows.map((row: any) => ({
            ...row,
            barcode: normalizeToGtin(row.barcode || ""),
          }));

          const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/products/import/preview`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ rows }),
            }
          );

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(
              errorData.message || `HTTP ${response.status} error`
            );
          }

          const previewData = await response.json();
          setPreview(previewData);
        } catch (error: any) {
          console.error("Preview error:", error);
          alert(`미리보기 실패: ${error.message}`);
        } finally {
          setLoading(false);
        }
      },
      error: (error) => {
        console.error("CSV parse error:", error);
        alert(`CSV 파일 파싱 실패: ${error.message}`);
        setLoading(false);
      },
    });
  };

  const handleConfirm = async () => {
    if (!preview || !file) return;

    if (!inboundManager.trim()) {
      alert("입고 담당자를 입력하세요.");
      return;
    }

    const requiredErrors = getRequiredFieldErrors();
    if (requiredErrors.length > 0) {
      setRequiredFieldErrors(requiredErrors);
      setShowRequiredErrorModal(true);
      return;
    }

    setImporting(true);

    try {
      // ✅ getAccessToken() ishlatish (localStorage emas)
      const token = await getAccessToken();
      if (!token) {
        alert("로그인이 필요합니다.");
        setImporting(false);
        return;
      }

      // Send to backend for import
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/products/import/confirm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            rows: preview.results.map((r) => r.data),
            mode: "strict",
            inboundManager: inboundManager.trim(),
          }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const msg = result?.message;
        const message =
          Array.isArray(msg)
            ? msg.join(". ")
            : (msg && String(msg).trim()) ||
              response.statusText ||
              (response.status === 400
                ? "유효성 검사 오류가 발생했습니다. CSV 파일에서 오류를 수정한 뒤 다시 시도해 주세요."
                : `요청 실패 (${response.status})`);
        setImportErrorMsg(message);
        setImporting(false);
        return;
      }

      const existingMsg =
        result.existingProductCount > 0
          ? `\n기존 제품 입고 추가: ${result.existingProductCount}건`
          : "";
      alert(
        `✅ Import 완료!\n\n` +
          `전체: ${result.total}개\n` +
          `성공: ${result.imported}개\n` +
          `실패: ${result.failed}개` +
          existingMsg
      );

      // Reset and close
      setFile(null);
      setPreview(null);
      setInboundManager(""); // Reset inbound manager
      onImport();
      onClose();
    } catch (error: any) {
      console.error("Import error:", error);
      const msg = error?.message ?? error?.response?.data?.message ?? "Import 실패";
      setImportErrorMsg(typeof msg === "string" ? msg : Array.isArray(msg) ? msg.join(". ") : "Import 실패");
    } finally {
      setImporting(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = [
      "name,brand,category,unit,min_stock,capacity_per_product,capacity_unit,usage_capacity,alert_days,유효기간 있음*,contact_phone,barcode,purchase_price,sale_price,refund_amount",
      "시럽A,브랜드A,의약품,EA,10,50,ml,5,30,예,010-1234-5678,1234567890,5000,8000,",
      "주사기B,브랜드B,의료기기,BOX,20,100,개,10,60,아니오,010-8765-4321,0987654321,7000,12000,0",
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "products_template.csv";
    link.click();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            📦 CSV Import
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Template Download */}
          <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div>
              <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                📄 CSV 템플릿 다운로드
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                올바른 형식의 CSV 파일을 작성하려면 템플릿을 다운로드하세요.
              </p>
            </div>
            <button
              onClick={handleDownloadTemplate}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              템플릿 다운로드
            </button>
          </div>

          {/* File Upload Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50"
            }`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => {
                const selectedFile = e.target.files?.[0];
                if (selectedFile) handleFileSelect(selectedFile);
              }}
              className="hidden"
            />

            <div className="space-y-4">
              <div className="text-6xl">📂</div>
              <div>
                <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">
                  {file ? file.name : "CSV 파일을 드래그하거나 클릭하세요"}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  최대 10,000개 제품까지 업로드 가능
                </p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
              >
                파일 선택
              </button>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-300">
                파일 검증 중...
              </p>
            </div>
          )}

          {/* Preview Results */}
          {preview && !loading && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">
                    {preview.total}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    전체
                  </div>
                </div>
                <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {preview.valid}
                  </div>
                  <div className="text-sm text-green-700 dark:text-green-500 mt-1">
                    성공
                  </div>
                </div>
                <div className="bg-red-100 dark:bg-red-900/30 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                    {preview.errors}
                  </div>
                  <div className="text-sm text-red-700 dark:text-red-500 mt-1">
                    오류
                  </div>
                </div>
              </div>

              {/* Import Mode Selection (if errors exist) */}
              {/* 중복 GTIN 한 모달로 보기 */}
              {duplicateGtinList.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                  <button
                    type="button"
                    onClick={() => setShowDuplicateGtinModal(true)}
                    className="text-sm font-medium text-amber-800 hover:underline dark:text-amber-200"
                  >
                    중복 GTIN {duplicateGtinList.length}건 보기
                  </button>
                </div>
              )}

              {/* Error List (show first 20 errors) */}
              {preview.errors > 0 && (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  <h4 className="font-semibold text-red-600 dark:text-red-400">
                    오류 목록 (최대 20개 표시):
                  </h4>
                  {preview.results
                    .filter((r) => !r.valid)
                    .slice(0, 20)
                    .map((error, idx) => (
                      <div
                        key={idx}
                        className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 text-sm"
                      >
                        <div className="font-semibold text-red-900 dark:text-red-100">
                          행 {error.row}:
                        </div>
                        <ul className="mt-1 space-y-1 text-red-700 dark:text-red-300">
                          {error.errors.map((err, i) => (
                            <li key={i}>• {err}</li>
                          ))}
                        </ul>
                        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 font-mono bg-white dark:bg-gray-800 p-2 rounded overflow-x-auto">
                          {JSON.stringify(error.data, null, 2)}
                        </div>
                      </div>
                    ))}
                  {preview.errors > 20 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                      ... 그리고 {preview.errors - 20}개 오류 더
                    </p>
                  )}
                </div>
              )}

              {/* Success Message */}
              {preview.errors === 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
                  <div className="text-4xl mb-2">✅</div>
                  <div className="font-semibold text-green-900 dark:text-green-100">
                    모든 데이터가 유효합니다!
                  </div>
                  <div className="text-sm text-green-700 dark:text-green-300 mt-1">
                    {preview.valid}개 제품을 Import할 준비가 되었습니다.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
          {/* Inbound Manager Input */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              입고 담당자*
            </label>
            <input
              type="text"
              value={inboundManager}
              onChange={(e) => setInboundManager(e.target.value)}
              placeholder="입고 담당자 이름을 입력하세요"
              disabled={importing}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50"
              required
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3">
            <button
              onClick={() => {
                setFile(null);
                setPreview(null);
                setInboundManager("");
                onClose();
              }}
              disabled={importing}
              className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              disabled={
                !preview ||
                !inboundManager.trim() ||
                importing
              }
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing
                ? "Import 중..."
                : `Import (${preview?.valid || 0}개 제품)`}
            </button>
          </div>
        </div>
      </div>

      {/* 중복 GTIN 모달 */}
      {showDuplicateGtinModal && duplicateGtinList.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowDuplicateGtinModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-amber-200 bg-white shadow-xl dark:border-amber-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                CSV 내 중복 GTIN
              </h3>
              <button
                type="button"
                onClick={() => setShowDuplicateGtinModal(false)}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto px-4 py-3">
              <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
                아래 GTIN이 파일 내에서 2회 이상 사용되었습니다. 행 번호를 확인하세요.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                      GTIN
                    </th>
                    <th className="py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                      제품명
                    </th>
                    <th className="py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                      행 번호
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {duplicateGtinList.map(({ gtin, rows, name }, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="py-2 font-mono text-slate-900 dark:text-slate-100">
                        {gtin}
                      </td>
                      <td className="py-2 text-slate-600 dark:text-slate-400">
                        {name}
                      </td>
                      <td className="py-2 text-slate-600 dark:text-slate-400">
                        {rows.sort((a, b) => a - b).join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setShowDuplicateGtinModal(false)}
                className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 필수 입력 누락 Error Alert 모달 */}
      {showRequiredErrorModal && requiredFieldErrors.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowRequiredErrorModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-red-200 bg-white shadow-xl dark:border-red-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <h3 className="font-semibold text-red-700 dark:text-red-300">
                필수 입력 누락
              </h3>
              <button
                type="button"
                onClick={() => setShowRequiredErrorModal(false)}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto px-4 py-3">
              <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
                아래 행에서 필수 항목이 비어 있습니다. 해당 행을 수정한 뒤 다시 시도하세요.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                      행 번호
                    </th>
                    <th className="py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                      누락된 항목
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requiredFieldErrors.map(({ row, missingFields }, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="py-2 font-mono text-slate-900 dark:text-slate-100">
                        {row}
                      </td>
                      <td className="py-2 text-red-600 dark:text-red-400">
                        {missingFields.join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setShowRequiredErrorModal(false)}
                className="w-full rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import 실패 Error Modal */}
      {importErrorMsg && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setImportErrorMsg(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-red-200 bg-white shadow-xl dark:border-red-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </span>
                <h3 className="font-semibold text-red-700 dark:text-red-300">
                  Import 실패
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setImportErrorMsg(null)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                aria-label="닫기"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-4 py-4">
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {importErrorMsg}
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                오류를 수정한 뒤 CSV 파일을 다시 업로드해 주세요.
              </p>
            </div>
            <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setImportErrorMsg(null)}
                className="w-full rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white transition hover:bg-red-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
