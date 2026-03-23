ALTER TABLE "Product" ADD COLUMN "tax_rate" FLOAT NOT NULL DEFAULT 0;
-- 0 = 0% (NO TAX)
-- 0.1 = 10% 
-- 0.7 =   7% (custom tax rate for specific products)

ALTER TABLE "OrderItem" ADD COLUMN "tax_rate" FLOAT NOT NULL DEFAULT 0;