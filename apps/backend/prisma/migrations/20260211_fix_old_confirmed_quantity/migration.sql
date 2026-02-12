-- Fix confirmed_quantity for old orders
-- Muammo: Migration paytida confirmed_quantity = quantity ga set qilingan
-- Lekin ba'zi orderlar uchun quantity allaqachon supplier adjustment qilingan
-- Yechim: supplier_adjustments dan originalQuantity ni olish va confirmed_quantity ni update qilish

-- ✅ IMPORTANT: Bu migration faqat supplier_adjustments mavjud bo'lgan orderlar uchun ishlaydi
-- Agar supplier_adjustments object bo'lib, adjustments array ichida bo'lsa:

DO $$
DECLARE
    order_record RECORD;
    item_record RECORD;
    adjustments_array jsonb;
    adjustment_record jsonb;
    original_quantity integer;
BEGIN
    -- Barcha orderlarga ega bo'lgan OrderItem'larni iterate qilish
    FOR item_record IN 
        SELECT 
            oi.id as item_id,
            oi.product_id,
            oi.quantity,
            oi.confirmed_quantity,
            o.id as order_id,
            o.order_no,
            o.supplier_adjustments
        FROM "OrderItem" oi
        JOIN "Order" o ON oi.order_id = o.id
        WHERE o.supplier_adjustments IS NOT NULL
          AND o.status IN ('supplier_confirmed', 'pending_inbound', 'inbound_completed')
    LOOP
        -- supplier_adjustments dan adjustments array'ni olish
        -- Format: {"adjustments": [...], "updatedAt": "..."}
        adjustments_array := item_record.supplier_adjustments->'adjustments';
        
        -- Agar adjustments array mavjud bo'lsa
        IF adjustments_array IS NOT NULL AND jsonb_typeof(adjustments_array) = 'array' THEN
            -- Har bir adjustment'ni ko'rib chiqish
            FOR adjustment_record IN SELECT * FROM jsonb_array_elements(adjustments_array)
            LOOP
                -- Agar adjustment'dagi productId mos kelsa
                IF (adjustment_record->>'productId')::uuid = item_record.product_id THEN
                    -- originalQuantity ni olish
                    original_quantity := (adjustment_record->>'originalQuantity')::integer;
                    
                    -- Agar originalQuantity mavjud va confirmed_quantity dan farq qilsa
                    IF original_quantity IS NOT NULL AND original_quantity != item_record.confirmed_quantity THEN
                        -- confirmed_quantity ni yangilash
                        UPDATE "OrderItem"
                        SET confirmed_quantity = original_quantity
                        WHERE id = item_record.item_id;
                        
                        RAISE NOTICE 'Updated OrderItem % (Order %): confirmed_quantity % -> %', 
                            item_record.item_id, 
                            item_record.order_no, 
                            item_record.confirmed_quantity, 
                            original_quantity;
                    END IF;
                    
                    EXIT; -- Bu product_id uchun adjustment topildi, keyingi item'ga o'tish
                END IF;
            END LOOP;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Migration completed!';
END $$;

