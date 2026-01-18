"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";

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
  const [importMode, setImportMode] = useState<"strict" | "flexible">("strict");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          // Get auth token
          const token =
            localStorage.getItem("erp_access_token") ||
            localStorage.getItem("token");
          if (!token) {
            alert("로그인이 필요합니다.");
            setLoading(false);
            return;
          }

          // Send to backend for preview
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/products/import/preview`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ rows: results.data }),
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

    setImporting(true);

    try {
      // Get auth token
      const token =
        localStorage.getItem("erp_access_token") ||
        localStorage.getItem("token");
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
            mode: importMode,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status} error`);
      }

      const result = await response.json();

      alert(
        `✅ Import 완료!\n\n` +
          `전체: ${result.total}개\n` +
          `성공: ${result.imported}개\n` +
          `실패: ${result.failed}개`
      );

      // Reset and close
      setFile(null);
      setPreview(null);
      setImportMode("strict");
      onImport();
      onClose();
    } catch (error: any) {
      console.error("Import error:", error);
      alert(`Import 실패: ${error.message}`);
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
      "name,brand,category,inbound_qty,unit,min_stock,capacity_per_product,capacity_unit,usage_capacity,expiry_date,alert_days,storage,barcode,purchase_price,sale_price,contact_phone",
      "시럽A,브랜드A,의약품,100,EA,10,50,ml,5,2026-12-31,30,냉장,1234567890,5000,8000,010-1234-5678",
      "주사기B,브랜드B,의료기기,200,BOX,20,100,개,10,12/31/2027,60,상온,0987654321,7000,12000,",
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
              {preview.errors > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-3">
                    ⚠️ 오류가 발견되었습니다
                  </h4>
                  <div className="space-y-2">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        value="strict"
                        checked={importMode === "strict"}
                        onChange={(e) =>
                          setImportMode(e.target.value as "strict")
                        }
                        className="w-4 h-4"
                      />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          Strict Mode (전체 또는 없음)
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          모든 데이터가 유효해야 Import 진행
                        </div>
                      </div>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        value="flexible"
                        checked={importMode === "flexible"}
                        onChange={(e) =>
                          setImportMode(e.target.value as "flexible")
                        }
                        className="w-4 h-4"
                      />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          Flexible Mode (유효한 데이터만)
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          오류가 있는 행은 건너뛰고 유효한 행만 Import
                        </div>
                      </div>
                    </label>
                  </div>
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
        <div className="flex items-center justify-end space-x-3 border-t border-gray-200 dark:border-gray-700 px-6 py-4">
          <button
            onClick={onClose}
            disabled={importing}
            className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleConfirm}
            disabled={
              !preview ||
              importing ||
              (importMode === "strict" && preview.errors > 0)
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
  );
}
