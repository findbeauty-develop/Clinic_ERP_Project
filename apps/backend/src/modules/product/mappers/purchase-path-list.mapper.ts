/**
 * Default PurchasePath → getAllProducts list row extras (outbound / list UI).
 * `isPath` = product has a default purchase path row (`is_default`); used like frontend "기본 경로" display.
 */

export type DefaultPurchasePathListSource = {
  path_type: string;
  site_name?: string | null;
  site_url?: string | null;
  normalized_domain?: string | null;
  other_text?: string | null;
  clinicSupplierManager?: {
    company_name?: string | null;
    name?: string | null;
  } | null;
} | null;

export function defaultPurchasePathToListApiFields(
  path: DefaultPurchasePathListSource
) {
  if (!path) {
    return {
      isPath: false,
      purchasePathType: null as string | null,
      pathCompanyName: null as string | null,
      pathManagerName: null as string | null,
      pathSiteLabel: null as string | null,
      pathOtherText: null as string | null,
      normalizedDomain: null as string | null,
    };
  }

  const type = String(path.path_type || "");

  if (type === "MANAGER") {
    const m = path.clinicSupplierManager;
    return {
      isPath: true,
      purchasePathType: "MANAGER" as const,
      pathCompanyName: m?.company_name ?? null,
      pathManagerName: m?.name ?? null,
      pathSiteLabel: null as string | null,
      pathOtherText: null as string | null,
      normalizedDomain: null as string | null,
    };
  }

  if (type === "SITE") {
    const siteLabel =
      (path.site_name && String(path.site_name).trim()) ||
      path.site_url ||
      path.normalized_domain ||
      null;
    return {
      isPath: true,
      purchasePathType: "SITE" as const,
      pathCompanyName: null as string | null,
      pathManagerName: null as string | null,
      pathSiteLabel: siteLabel,
      pathOtherText: null as string | null,
      normalizedDomain: path.normalized_domain ?? null,
    };
  }

  if (type === "OTHER") {
    return {
      isPath: true,
      purchasePathType: "OTHER" as const,
      pathCompanyName: null as string | null,
      pathManagerName: null as string | null,
      pathSiteLabel: null as string | null,
      pathOtherText: path.other_text ?? null,
      normalizedDomain: null as string | null,
    };
  }

  return {
    isPath: false,
    purchasePathType: null as string | null,
    pathCompanyName: null as string | null,
    pathManagerName: null as string | null,
    pathSiteLabel: null as string | null,
    pathOtherText: null as string | null,
    normalizedDomain: null as string | null,
  };
}
