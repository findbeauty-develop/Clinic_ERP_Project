-- Step 2: available_quantity and used_count as Float

-- 0) Drop trigger again (in case previous migration was skipped or trigger exists)
DROP TRIGGER IF EXISTS batch_available_quantity_trigger ON "Batch" CASCADE;

-- 1) Alter columns
ALTER TABLE "Batch" ALTER COLUMN "used_count" TYPE DOUBLE PRECISION USING COALESCE("used_count", 0)::DOUBLE PRECISION;
ALTER TABLE "Batch" ALTER COLUMN "used_count" SET DEFAULT 0;

ALTER TABLE "Batch" ALTER COLUMN "available_quantity" TYPE DOUBLE PRECISION USING "available_quantity"::DOUBLE PRECISION;

-- 2) Drop existing functions (return type changes, so must DROP first)
DROP FUNCTION IF EXISTS calculate_batch_available_quantity(text);
DROP FUNCTION IF EXISTS update_batch_available_quantity() CASCADE;

-- 3) Create calculate_batch_available_quantity (returns float)
CREATE FUNCTION calculate_batch_available_quantity(p_batch_id TEXT)
RETURNS DOUBLE PRECISION AS $$
DECLARE
  v_inbound_qty INTEGER;
  v_used_count DOUBLE PRECISION;
  v_capacity_per_product DOUBLE PRECISION;
  v_usage_capacity DOUBLE PRECISION;
  v_total_volume DOUBLE PRECISION;
  v_volume_used DOUBLE PRECISION;
  v_result DOUBLE PRECISION;
BEGIN
  SELECT b.inbound_qty, COALESCE(b.used_count, 0), COALESCE(p.capacity_per_product, 0), COALESCE(p.usage_capacity, 0)
  INTO v_inbound_qty, v_used_count, v_capacity_per_product, v_usage_capacity
  FROM "Batch" b
  JOIN "Product" p ON p.id = b.product_id
  WHERE b.id = p_batch_id;

  IF v_inbound_qty IS NOT NULL AND v_inbound_qty > 0 AND v_capacity_per_product > 0 THEN
    v_total_volume := v_inbound_qty * v_capacity_per_product;
    IF v_usage_capacity > 0 THEN
      v_volume_used := v_used_count * v_usage_capacity;
      v_result := GREATEST(0, v_total_volume - v_volume_used);
    ELSE
      v_result := v_total_volume;
    END IF;
  ELSE
    SELECT qty::DOUBLE PRECISION INTO v_result FROM "Batch" WHERE id = p_batch_id;
  END IF;
  RETURN COALESCE(v_result, 0);
END;
$$ LANGUAGE plpgsql;

-- 4) Create update_batch_available_quantity trigger function
CREATE FUNCTION update_batch_available_quantity()
RETURNS TRIGGER AS $$
DECLARE
  v_inbound_qty INTEGER;
  v_used_count DOUBLE PRECISION;
  v_capacity_per_product DOUBLE PRECISION;
  v_usage_capacity DOUBLE PRECISION;
  v_total_volume DOUBLE PRECISION;
  v_volume_used DOUBLE PRECISION;
  v_result DOUBLE PRECISION;
BEGIN
  SELECT 
    COALESCE(NEW.inbound_qty, 0),
    COALESCE(NEW.used_count, 0),
    COALESCE(p.capacity_per_product, 0),
    COALESCE(p.usage_capacity, 0)
  INTO 
    v_inbound_qty,
    v_used_count,
    v_capacity_per_product,
    v_usage_capacity
  FROM "Product" p
  WHERE p.id = NEW.product_id;

  IF v_inbound_qty > 0 AND v_capacity_per_product > 0 THEN
    v_total_volume := v_inbound_qty * v_capacity_per_product;
    IF v_usage_capacity > 0 THEN
      v_volume_used := v_used_count * v_usage_capacity;
      v_result := GREATEST(0, v_total_volume - v_volume_used);
    ELSE
      v_result := v_total_volume;
    END IF;
  ELSE
    v_result := NEW.qty::DOUBLE PRECISION;
  END IF;

  NEW.available_quantity := v_result;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5) Re-create trigger
CREATE TRIGGER batch_available_quantity_trigger
BEFORE INSERT OR UPDATE OF inbound_qty, used_count, qty, product_id ON "Batch"
FOR EACH ROW
EXECUTE FUNCTION update_batch_available_quantity();

-- 6) Recalculate existing batches (float)
UPDATE "Batch" b
SET available_quantity = (
  SELECT 
    CASE 
      WHEN b.inbound_qty IS NOT NULL AND b.inbound_qty > 0
           AND p.capacity_per_product > 0 
           AND p.usage_capacity > 0 THEN
        GREATEST(0, (b.inbound_qty * p.capacity_per_product) - (COALESCE(b.used_count, 0) * p.usage_capacity))
      WHEN b.inbound_qty IS NOT NULL AND b.inbound_qty > 0
           AND p.capacity_per_product > 0 THEN
        (b.inbound_qty * p.capacity_per_product)::DOUBLE PRECISION
      ELSE
        b.qty::DOUBLE PRECISION
    END
  FROM "Product" p
  WHERE p.id = b.product_id
);
