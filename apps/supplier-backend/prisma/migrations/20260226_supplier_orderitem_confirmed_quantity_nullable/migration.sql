-- SupplierOrderItem.confirmed_quantity - supplier tasdiqlamaguncha NULL bo'lishi kerak.
-- Production'da ustun NOT NULL qolgani uchun yangi order yaratishda "Null constraint violation" xatosi chiqardi.
ALTER TABLE "SupplierOrderItem"
  ALTER COLUMN "confirmed_quantity" DROP NOT NULL;
