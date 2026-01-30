export const SUPPLIER_API_URL = (() => {
  const v = process.env.NEXT_PUBLIC_SUPPLIER_API_URL;
  if (!v) throw new Error("NEXT_PUBLIC_SUPPLIER_API_URL is missing");
  return v;
})();
