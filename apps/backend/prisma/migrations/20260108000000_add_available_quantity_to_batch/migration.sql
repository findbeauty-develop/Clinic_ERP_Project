-- Add available_quantity column to Batch table
ALTER TABLE "Batch" ADD COLUMN "available_quantity" INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN "Batch"."available_quantity" IS 'Available quantity: (inbound_qty * capacity_per_product) - used_count. Auto-calculated via trigger.';

-- Create function to calculate available_quantity
CREATE OR REPLACE FUNCTION calculate_batch_available_quantity(
  p_batch_id TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_inbound_qty INTEGER;
  v_used_count INTEGER;
  v_capacity_per_product DOUBLE PRECISION;
  v_usage_capacity DOUBLE PRECISION;
  v_result INTEGER;
BEGIN
  -- Get batch and product data
  SELECT 
    b.inbound_qty,
    COALESCE(b.used_count, 0),
    COALESCE(p.capacity_per_product, 0),
    COALESCE(p.usage_capacity, 0)
  INTO 
    v_inbound_qty,
    v_used_count,
    v_capacity_per_product,
    v_usage_capacity
  FROM "Batch" b
  JOIN "Product" p ON p.id = b.product_id
  WHERE b.id = p_batch_id;

  -- Calculate available_quantity
  IF v_inbound_qty IS NOT NULL 
     AND v_capacity_per_product > 0 
     AND v_usage_capacity > 0 THEN
    -- Formula: (inbound_qty * capacity_per_product) - used_count
    v_result := GREATEST(0, (v_inbound_qty * v_capacity_per_product)::INTEGER - v_used_count);
  ELSIF v_inbound_qty IS NOT NULL 
       AND v_capacity_per_product > 0 THEN
    -- If usage_capacity is 0 or NULL, use: inbound_qty * capacity_per_product
    v_result := (v_inbound_qty * v_capacity_per_product)::INTEGER;
  ELSE
    -- Fallback: use qty
    SELECT qty INTO v_result FROM "Batch" WHERE id = p_batch_id;
  END IF;

  RETURN COALESCE(v_result, 0);
END;
$$ LANGUAGE plpgsql;

-- Create trigger function to auto-update available_quantity
CREATE OR REPLACE FUNCTION update_batch_available_quantity()
RETURNS TRIGGER AS $$
DECLARE
  v_inbound_qty INTEGER;
  v_used_count INTEGER;
  v_capacity_per_product DOUBLE PRECISION;
  v_usage_capacity DOUBLE PRECISION;
  v_result INTEGER;
BEGIN
  -- Get product data
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

  -- Calculate available_quantity
  IF v_inbound_qty > 0 
     AND v_capacity_per_product > 0 
     AND v_usage_capacity > 0 THEN
    -- Formula: (inbound_qty * capacity_per_product) - used_count
    v_result := GREATEST(0, (v_inbound_qty * v_capacity_per_product)::INTEGER - v_used_count);
  ELSIF v_inbound_qty > 0 
       AND v_capacity_per_product > 0 THEN
    -- If usage_capacity is 0 or NULL, use: inbound_qty * capacity_per_product
    v_result := (v_inbound_qty * v_capacity_per_product)::INTEGER;
  ELSE
    -- Fallback: use qty
    v_result := NEW.qty;
  END IF;

  NEW.available_quantity := v_result;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER batch_available_quantity_trigger
BEFORE INSERT OR UPDATE OF inbound_qty, used_count, qty, product_id ON "Batch"
FOR EACH ROW
EXECUTE FUNCTION update_batch_available_quantity();

-- Update existing batches
UPDATE "Batch" b
SET available_quantity = (
  SELECT 
    CASE 
      WHEN b.inbound_qty IS NOT NULL 
           AND p.capacity_per_product > 0 
           AND p.usage_capacity > 0 THEN
        GREATEST(0, (b.inbound_qty * p.capacity_per_product)::INTEGER - COALESCE(b.used_count, 0))
      WHEN b.inbound_qty IS NOT NULL 
           AND p.capacity_per_product > 0 THEN
        (b.inbound_qty * p.capacity_per_product)::INTEGER
      ELSE
        b.qty
    END
  FROM "Product" p
  WHERE p.id = b.product_id
);

