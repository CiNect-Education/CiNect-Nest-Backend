ALTER TABLE "memberships"
ADD COLUMN "daily_checkin_streak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "last_daily_checkin_at" TIMESTAMP(3);

