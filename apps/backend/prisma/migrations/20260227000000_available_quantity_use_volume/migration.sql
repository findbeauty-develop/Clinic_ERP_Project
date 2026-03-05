-- Fix available_quantity: used_count is now "number of uses" (integer).
-- Volume used = used_count * usage_capacity. So:
--   available_quantity = (inbound_qty * capacity_per_product) - ROUND(used_count * usage_capacity)

CREATE OR REPLACE FUNCTION calculate_batch_available_quantity(p_batch_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_inbound_qty INTEGER;
  v_used_count INTEGER;
  v_capacity_per_product DOUBLE PRECISION;
  v_usage_capacity DOUBLE PRECISION;
  v_total_volume INTEGER;
  v_volume_used INTEGER;
  v_result INTEGER;
BEGIN
  SELECT b.inbound_qty, COALESCE(b.used_count, 0), COALESCE(p.capacity_per_product, 0), COALESCE(p.usage_capacity, 0)
  INTO v_inbound_qty, v_used_count, v_capacity_per_product, v_usage_capacity
  FROM "Batch" b
  JOIN "Product" p ON p.id = b.product_id
  WHERE b.id = p_batch_id;

  IF v_inbound_qty IS NOT NULL AND v_inbound_qty > 0 AND v_capacity_per_product > 0 THEN
    v_total_volume := (v_inbound_qty * v_capacity_per_product)::INTEGER;
    IF v_usage_capacity > 0 THEN
      v_volume_used := ROUND(v_used_count * v_usage_capacity)::INTEGER;
      v_result := GREATEST(0, v_total_volume - v_volume_used);
    ELSE
      v_result := v_total_volume;
    END IF;
  ELSE
    SELECT qty INTO v_result FROM "Batch" WHERE id = p_batch_id;
  END IF;
  RETURN COALESCE(v_result, 0);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_batch_available_quantity()
RETURNS TRIGGER AS $$
DECLARE
  v_inbound_qty INTEGER;
  v_used_count INTEGER;
  v_capacity_per_product DOUBLE PRECISION;
  v_usage_capacity DOUBLE PRECISION;
  v_total_volume INTEGER;
  v_volume_used INTEGER;
  v_result INTEGER;
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
    v_total_volume := (v_inbound_qty * v_capacity_per_product)::INTEGER;

    IF v_usage_capacity > 0 THEN
      -- used_count = number of uses; volume used = used_count * usage_capacity
      v_volume_used := ROUND(v_used_count * v_usage_capacity)::INTEGER;
      v_result := GREATEST(0, v_total_volume - v_volume_used);
    ELSE
      v_result := v_total_volume;
    END IF;
  ELSE
    v_result := NEW.qty;
  END IF;

  NEW.available_quantity := v_result;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recalculate existing batches
UPDATE "Batch" b
SET available_quantity = (
  SELECT 
    CASE 
      WHEN b.inbound_qty IS NOT NULL AND b.inbound_qty > 0
           AND p.capacity_per_product > 0 
           AND p.usage_capacity > 0 THEN
        GREATEST(0, (b.inbound_qty * p.capacity_per_product)::INTEGER - ROUND(COALESCE(b.used_count, 0) * p.usage_capacity)::INTEGER)
      WHEN b.inbound_qty IS NOT NULL AND b.inbound_qty > 0
           AND p.capacity_per_product > 0 THEN
        (b.inbound_qty * p.capacity_per_product)::INTEGER
      ELSE
        b.qty
    END
  FROM "Product" p
  WHERE p.id = b.product_id
);
