/**
 * Normalize host for SITE path duplicate checks (http/https and www ignored).
 */
export function normalizePurchasedSiteDomain(
  input: string | null | undefined
): string | null {
  if (!input?.trim()) return null;
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  const slash = s.indexOf("/");
  if (slash >= 0) s = s.slice(0, slash);
  const q = s.indexOf("?");
  if (q >= 0) s = s.slice(0, q);
  return s.length > 0 ? s : null;
}

export function buildPurchasePathSnapshot(path: {
  path_type: string;
  site_name?: string | null;
  site_url?: string | null;
  normalized_domain?: string | null;
  other_text?: string | null;
  clinicSupplierManager?: {
    company_name?: string;
    name?: string;
    position?: string | null;
    phone_number?: string;
  } | null;
}): Record<string, unknown> {
  const base: Record<string, unknown> = { pathType: path.path_type };
  if (path.path_type === "MANAGER" && path.clinicSupplierManager) {
    const m = path.clinicSupplierManager;
    return {
      ...base,
      companyName: m.company_name ?? null,
      managerName: m.name ?? null,
      position: m.position ?? null,
      phone: m.phone_number ?? null,
    };
  }
  if (path.path_type === "SITE") {
    return {
      ...base,
      siteName: path.site_name ?? null,
      siteUrl: path.site_url ?? null,
      domain: path.normalized_domain ?? null,
    };
  }
  if (path.path_type === "OTHER") {
    return { ...base, text: path.other_text ?? null };
  }
  return base;
}
