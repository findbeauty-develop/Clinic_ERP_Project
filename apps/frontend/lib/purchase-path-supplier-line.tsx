import type { ReactNode } from "react";

/** getAllProducts list row — 기본 구매 경로(PurchasePath is_default) + 레거시 공급처 */
export type ProductWithPurchasePathListFields = {
  supplierName?: string | null;
  managerName?: string | null;
  isPath?: boolean;
  purchasePathType?: "MANAGER" | "SITE" | "OTHER" | string | null;
  pathCompanyName?: string | null;
  pathManagerName?: string | null;
  pathSiteLabel?: string | null;
  pathOtherText?: string | null;
  normalizedDomain?: string | null;
};

/** 출고/입고 등 상품 카드 한 줄 (공급처 · 구매 사이트 · 구매 경로) */
export function purchasePathSupplierDisplayLine(
  product: ProductWithPurchasePathListFields
): ReactNode {
  const {
    isPath,
    purchasePathType,
    pathCompanyName,
    pathManagerName,
    normalizedDomain,
    pathSiteLabel,
    pathOtherText,
    supplierName,
    managerName,
  } = product;

  if (isPath && purchasePathType === "MANAGER") {
    const parts = [pathCompanyName, pathManagerName].filter((s): s is string =>
      Boolean(s && String(s).trim())
    );
    if (parts.length > 0) {
      return <span>공급처: {parts.join(" · ")}</span>;
    }
  }

  if (isPath && purchasePathType === "SITE") {
    const domain = normalizedDomain?.trim();
    const site = pathSiteLabel?.trim();
    const display = domain || site;
    if (display) {
      return <span>기본 경로: {display}</span>;
    }
  }

  if (isPath && purchasePathType === "OTHER") {
    const text = pathOtherText?.trim();
    if (text) {
      return <span>구매 경로: {text}</span>;
    }
  }

  const legacyParts = [supplierName, managerName].filter((s): s is string =>
    Boolean(s && String(s).trim())
  );
  if (legacyParts.length > 0) {
    return <span>공급처: {legacyParts.join(" · ")}</span>;
  }

  return null;
}

/** OrderItem.purchase_path_snapshot (buildPurchasePathSnapshot) */
export type OrderItemPurchasePathSnapshot = {
  pathType?: string;
  path_type?: string;
  companyName?: string | null;
  company_name?: string | null;
  managerName?: string | null;
  manager_name?: string | null;
  siteName?: string | null;
  site_name?: string | null;
  siteUrl?: string | null;
  site_url?: string | null;
  domain?: string | null;
  normalized_domain?: string | null;
  text?: string | null;
  other_text?: string | null;
};

export function purchasePathFieldsFromOrderSnapshot(
  raw: unknown
): ProductWithPurchasePathListFields | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const s = raw as Record<string, unknown>;
  const pathType = String(s.pathType ?? s.path_type ?? "").trim();
  if (!pathType) return null;

  if (pathType === "MANAGER") {
    const company = (s.companyName ?? s.company_name) as string | null;
    const mgr = (s.managerName ?? s.manager_name) as string | null;
    return {
      isPath: true,
      purchasePathType: "MANAGER",
      pathCompanyName: company ?? null,
      pathManagerName: mgr ?? null,
      pathSiteLabel: null,
      pathOtherText: null,
      normalizedDomain: null,
    };
  }

  if (pathType === "SITE") {
    const siteName = (s.siteName ?? s.site_name) as string | null;
    const siteUrl = (s.siteUrl ?? s.site_url) as string | null;
    const domain = (s.domain ?? s.normalized_domain) as string | null;
    const namePart =
      siteName && String(siteName).trim() ? String(siteName).trim() : null;
    const urlPart =
      siteUrl != null && String(siteUrl).trim() ? String(siteUrl).trim() : null;
    const pathSiteLabel = namePart || urlPart || null;
    return {
      isPath: true,
      purchasePathType: "SITE",
      pathCompanyName: null,
      pathManagerName: null,
      pathSiteLabel,
      pathOtherText: null,
      normalizedDomain:
        domain != null && String(domain).trim() ? String(domain).trim() : null,
    };
  }

  if (pathType === "OTHER") {
    const text = (s.text ?? s.other_text) as string | null;
    return {
      isPath: true,
      purchasePathType: "OTHER",
      pathCompanyName: null,
      pathManagerName: null,
      pathSiteLabel: null,
      pathOtherText: text ?? null,
      normalizedDomain: null,
    };
  }

  return null;
}

export type OrderItemPathSource = {
  purchasePathSnapshot?: unknown;
  purchase_path_snapshot?: unknown;
};

/** 주문 라인 스냅샷 → 출고/입고와 동일 한 줄 (없으면 supplierName/managerName 레거시) */
export function purchasePathSupplierDisplayLineForOrder(options: {
  items?: OrderItemPathSource[] | null;
  supplierName?: string | null;
  managerName?: string | null;
}): ReactNode {
  const items = options.items ?? [];
  for (const item of items) {
    const raw = item.purchasePathSnapshot ?? item.purchase_path_snapshot;
    const fields = purchasePathFieldsFromOrderSnapshot(raw);
    if (!fields?.isPath) continue;
    const line = purchasePathSupplierDisplayLine({
      ...fields,
      supplierName: options.supplierName ?? null,
      managerName: options.managerName ?? null,
    });
    if (line != null) return line;
  }
  return purchasePathSupplierDisplayLine({
    supplierName: options.supplierName ?? null,
    managerName: options.managerName ?? null,
  });
}
