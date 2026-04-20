-- Stabilize manual contact fields before enforcing uniqueness (matches app-layer normalization)
UPDATE "ClinicSupplierManager"
SET
  "company_name" = TRIM(REGEXP_REPLACE("company_name", '\s+', ' ', 'g')),
  "name" = TRIM(REGEXP_REPLACE("name", '\s+', ' ', 'g')),
  "phone_number" = (
    CASE
      WHEN LENGTH(REGEXP_REPLACE(COALESCE("phone_number", ''), '\D', '', 'g')) = 10
        AND SUBSTRING(REGEXP_REPLACE(COALESCE("phone_number", ''), '\D', '', 'g') FROM 1 FOR 2) = '10'
      THEN '0' || REGEXP_REPLACE(COALESCE("phone_number", ''), '\D', '', 'g')
      ELSE REGEXP_REPLACE(COALESCE("phone_number", ''), '\D', '', 'g')
    END
  );

-- One manual contact identity per clinic tenant (company + manager name + mobile)
CREATE UNIQUE INDEX "ClinicSupplierManager_tenant_id_company_name_name_phone_number_key"
ON "ClinicSupplierManager" ("tenant_id", "company_name", "name", "phone_number");
