-- CreateTable
CREATE TABLE IF NOT EXISTS "PhoneVerificationCode" (
    "id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneVerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PhoneVerificationCode_phone_number_idx" ON "PhoneVerificationCode"("phone_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PhoneVerificationCode_code_idx" ON "PhoneVerificationCode"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PhoneVerificationCode_expires_at_idx" ON "PhoneVerificationCode"("expires_at");

