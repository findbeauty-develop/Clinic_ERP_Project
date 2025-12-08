-- Migrate expiry data from first batch to Product table
-- This is a one-time migration to populate Product.expiry_months, expiry_unit, alert_days

UPDATE "Product" p
SET 
  expiry_months = b.expiry_months,
  expiry_unit = b.expiry_unit,
  alert_days = b.alert_days
FROM (
  SELECT DISTINCT ON (product_id) 
    product_id, 
    expiry_months, 
    expiry_unit, 
    alert_days
  FROM "Batch"
  WHERE expiry_months IS NOT NULL  -- Faqat expiry ma'lumotlari bor batch'lardan
  ORDER BY product_id, created_at ASC  -- Eng eski (birinchi) batch
) b
WHERE p.id = b.product_id
  AND (p.expiry_months IS NULL OR p.expiry_unit IS NULL);  -- Faqat bo'sh productlar

-- Show results
SELECT 
  COUNT(*) as updated_products
FROM "Product"
WHERE expiry_months IS NOT NULL;

