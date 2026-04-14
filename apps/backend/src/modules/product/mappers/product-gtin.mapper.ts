/**
 * ProductGTIN → API barcode entries (getProduct `barcodes` field).
 * Pure mapping — no DB.
 */

export type ProductGtinRow = {
  id: string;
  gtin: string;
  barcode_package_type?: string | null;
};

export type BarcodeItem = {
  id: string;
  gtin: string;
  barcode_package_type: string;
};

export function mapProductGtinsToBarcodeItems(
  productGtins: ProductGtinRow[] | null | undefined
): BarcodeItem[] {
  return (productGtins ?? []).map((g) => ({
    id: g.id,
    gtin: g.gtin,
    barcode_package_type: g.barcode_package_type ?? "BOX",
  }));
}
