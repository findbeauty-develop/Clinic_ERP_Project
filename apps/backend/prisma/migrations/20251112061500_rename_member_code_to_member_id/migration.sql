-- Rename column member_code -> member_id and adjust unique index
DROP INDEX IF EXISTS "Member_member_code_key";

ALTER TABLE "Member" RENAME COLUMN "member_code" TO "member_id";

CREATE UNIQUE INDEX "Member_member_id_key" ON "Member"("member_id");

