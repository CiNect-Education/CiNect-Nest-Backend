DROP TABLE IF EXISTS "referrals";

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_referred_by_id_fkey";
ALTER TABLE "users" DROP COLUMN IF EXISTS "referred_by_id";

DROP INDEX IF EXISTS "users_referral_code_key";
DROP INDEX IF EXISTS "users_referral_code_idx";
ALTER TABLE "users" DROP COLUMN IF EXISTS "referral_code";
