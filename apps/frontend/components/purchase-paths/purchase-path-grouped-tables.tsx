"use client";

import React from "react";

/** 제품 수정 · 입고 신규 구매 경로 테이블 공통 라디오 스타일 */
export const PURCHASE_PATH_DEFAULT_RADIO_CLASS =
  "h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-full border border-slate-300 bg-white checked:border-sky-600 checked:bg-white checked:shadow-[inset_0_0_0_3px_theme(colors.sky.600)] focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-0 disabled:opacity-50 dark:border-slate-500 dark:bg-white dark:checked:bg-white dark:checked:shadow-[inset_0_0_0_3px_theme(colors.sky.500)]";

export function TrashIcon({ className }: { className?: string }) {
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
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}

export type PurchasePathManagerTableRow = {
  rowKey: string;
  isDefault: boolean;
  companyName: string;
  managerName: string;
  position: string;
  phone: string;
  platformLinked: boolean;
  /** 있으면 연동/수동 대신 표시 (예: 담당자 없음 "—") */
  platformLabelOverride?: string;
};

export type PurchasePathSiteTableRow = {
  rowKey: string;
  isDefault: boolean;
  pathLabel: string;
  content: string;
};

export type PurchasePathOtherTableRow = {
  rowKey: string;
  isDefault: boolean;
  content: string;
};

export type PurchasePathGroupedTablesProps = {
  /** HTML radio name — 한 제품/폼에서 그룹당 하나 */
  radioGroupName: string;
  managerRows: PurchasePathManagerTableRow[];
  siteRows: PurchasePathSiteTableRow[];
  otherRows: PurchasePathOtherTableRow[];
  disabled?: boolean;
  onSetDefault: (rowKey: string) => void;
  onEditManager: (rowKey: string) => void;
  onDeleteManager: (rowKey: string) => void;
  onEditSite: (rowKey: string) => void;
  onDeleteSite: (rowKey: string) => void;
  onEditOther: (rowKey: string) => void;
  onDeleteOther: (rowKey: string) => void;
};

/**
 * 구매 경로 — 담당자 / 사이트 / 기타 그룹 테이블 (제품 수정 · 입고 신규 공통 UI)
 */
export function PurchasePathGroupedTables({
  radioGroupName,
  managerRows,
  siteRows,
  otherRows,
  disabled = false,
  onSetDefault,
  onEditManager,
  onDeleteManager,
  onEditSite,
  onDeleteSite,
  onEditOther,
  onDeleteOther,
}: PurchasePathGroupedTablesProps) {
  return (
    <>
      {managerRows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
          <h3 className="mb-3 text-left text-sm font-semibold text-slate-800 dark:text-slate-100">
            담당자 경로
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-center text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-center text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:text-slate-400">
                  <th className="pb-2 pr-2 text-left">기본경로</th>
                  <th className="pb-2 pr-3">회사명</th>
                  <th className="pb-2 pr-3">담당자 성함</th>
                  <th className="pb-2 pr-3">직함</th>
                  <th className="pb-2 pr-3">연락처</th>
                  <th className="pb-2 pr-3">플랫폼</th>
                  <th className="pb-2 text-right">액션</th>
                </tr>
              </thead>
              <tbody>
                {managerRows.map((row) => (
                  <tr
                    key={row.rowKey}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="py-3 pr-2 align-middle text-left">
                      <label className="inline-flex cursor-pointer items-center justify-start gap-2">
                        <input
                          type="radio"
                          name={radioGroupName}
                          className={PURCHASE_PATH_DEFAULT_RADIO_CLASS}
                          checked={row.isDefault}
                          disabled={disabled}
                          onChange={() => onSetDefault(row.rowKey)}
                        />
                        <span className="text-xs text-slate-700 dark:text-slate-200">
                          기본 경로
                        </span>
                      </label>
                    </td>
                    <td className="py-3 pr-3 align-middle font-medium text-slate-800 dark:text-slate-100">
                      {row.companyName}
                    </td>
                    <td className="py-3 pr-3 align-middle text-slate-700 dark:text-slate-200">
                      {row.managerName}
                    </td>
                    <td className="py-3 pr-3 align-middle text-slate-700 dark:text-slate-200">
                      {row.position}
                    </td>
                    <td className="py-3 pr-3 align-middle text-slate-700 dark:text-slate-200">
                      {row.phone}
                    </td>
                    <td className="py-3 pr-3 align-middle text-slate-700 dark:text-slate-200">
                      {row.platformLabelOverride != null
                        ? row.platformLabelOverride
                        : row.platformLinked
                          ? "연동"
                          : "수동"}
                    </td>
                    <td className="py-3 align-middle text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onEditManager(row.rowKey)}
                          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                        >
                          수정하기
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onDeleteManager(row.rowKey)}
                          className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                          aria-label="삭제"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {siteRows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
          <h3 className="mb-3 text-left text-sm font-semibold text-slate-800 dark:text-slate-100">
            사이트 경로
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-center text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-center text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:text-slate-400">
                  <th className="pb-2 pr-2 text-left">기본경로</th>
                  <th className="pb-2 pr-3">경로</th>
                  <th className="pb-2 pr-3">내용</th>
                  <th className="pb-2 text-right">액션</th>
                </tr>
              </thead>
              <tbody>
                {siteRows.map((row) => (
                  <tr
                    key={row.rowKey}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="py-3 pr-2 align-middle text-left">
                      <label className="inline-flex cursor-pointer items-center justify-start gap-2">
                        <input
                          type="radio"
                          name={radioGroupName}
                          className={PURCHASE_PATH_DEFAULT_RADIO_CLASS}
                          checked={row.isDefault}
                          disabled={disabled}
                          onChange={() => onSetDefault(row.rowKey)}
                        />
                        <span className="text-xs text-slate-700 dark:text-slate-200">
                          기본 경로
                        </span>
                        <span className="sr-only">기본 경로</span>
                      </label>
                    </td>
                    <td className="py-3 pr-3 align-middle text-slate-700 dark:text-slate-200">
                      {row.pathLabel}
                    </td>
                    <td className="max-w-xs py-3 pr-3 align-middle break-all text-slate-800 dark:text-slate-100">
                      {row.content}
                    </td>
                    <td className="py-3 align-middle text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onEditSite(row.rowKey)}
                          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                        >
                          수정하기
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onDeleteSite(row.rowKey)}
                          className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                          aria-label="삭제"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {otherRows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
          <h3 className="mb-3 text-left text-sm font-semibold text-slate-800 dark:text-slate-100">
            기타 경로
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-center text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-center text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:text-slate-400">
                  <th className="pb-2 pr-2 text-left">기본경로</th>
                  <th className="pb-2 pr-3">경로</th>
                  <th className="pb-2 pr-3">내용</th>
                  <th className="pb-2 text-right">액션</th>
                </tr>
              </thead>
              <tbody>
                {otherRows.map((row) => (
                  <tr
                    key={row.rowKey}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="py-3 pr-2 align-middle text-left">
                      <label className="inline-flex cursor-pointer items-center justify-start gap-2">
                        <input
                          type="radio"
                          name={radioGroupName}
                          className={PURCHASE_PATH_DEFAULT_RADIO_CLASS}
                          checked={row.isDefault}
                          disabled={disabled}
                          onChange={() => onSetDefault(row.rowKey)}
                        />
                        <span className="text-xs text-slate-700 dark:text-slate-200">
                          기본 경로
                        </span>
                        <span className="sr-only">기본 경로</span>
                      </label>
                    </td>
                    <td className="py-3 pr-3 align-middle text-slate-700 dark:text-slate-200">
                      기타 경로
                    </td>
                    <td className="py-3 pr-3 align-middle text-slate-800 dark:text-slate-100">
                      {row.content}
                    </td>
                    <td className="py-3 align-middle text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onEditOther(row.rowKey)}
                          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                        >
                          수정하기
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onDeleteOther(row.rowKey)}
                          className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                          aria-label="삭제"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
