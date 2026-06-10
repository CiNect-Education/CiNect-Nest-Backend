-- Community & user interaction sync features

ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'COMMUNITY';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'REVIEW';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'WATCHLIST';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'REFUND';

CREATE TYPE "community_post_type" AS ENUM ('DISCUSSION', 'POLL');

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referral_code" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referred_by_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_public" BOOLEAN NOT NULL DEFAULT true;

UPDATE "users"
SET "referral_code" = 'CIN' || UPPER(SUBSTRING(REPLACE("id"::text, '-', ''), 1, 8))
WHERE "referral_code" IS NULL;

ALTER TABLE "users" ALTER COLUMN "referral_code" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_referral_code_key" ON "users"("referral_code");
CREATE INDEX IF NOT EXISTS "users_referral_code_idx" ON "users"("referral_code");

ALTER TABLE "users"
  ADD CONSTRAINT "users_referred_by_id_fkey"
  FOREIGN KEY ("referred_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "is_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "is_approved" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "helpful_count" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "reviews_is_approved_created_at_idx" ON "reviews"("is_approved", "created_at");

CREATE TABLE IF NOT EXISTS "review_reactions" (
  "id" TEXT NOT NULL,
  "review_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_reactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "review_reactions_review_id_user_id_key" ON "review_reactions"("review_id", "user_id");
CREATE INDEX IF NOT EXISTS "review_reactions_user_id_idx" ON "review_reactions"("user_id");
ALTER TABLE "review_reactions"
  ADD CONSTRAINT "review_reactions_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_reactions"
  ADD CONSTRAINT "review_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "watchlist_items" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "movie_id" TEXT NOT NULL,
  "notify_when_available" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "watchlist_items_user_id_movie_id_key" ON "watchlist_items"("user_id", "movie_id");
CREATE INDEX IF NOT EXISTS "watchlist_items_movie_id_idx" ON "watchlist_items"("movie_id");
ALTER TABLE "watchlist_items"
  ADD CONSTRAINT "watchlist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "watchlist_items"
  ADD CONSTRAINT "watchlist_items_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "booking_group_invites" (
  "id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "host_user_id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_group_invites_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "booking_group_invites_booking_id_key" ON "booking_group_invites"("booking_id");
CREATE UNIQUE INDEX IF NOT EXISTS "booking_group_invites_token_key" ON "booking_group_invites"("token");
CREATE INDEX IF NOT EXISTS "booking_group_invites_token_idx" ON "booking_group_invites"("token");
ALTER TABLE "booking_group_invites"
  ADD CONSTRAINT "booking_group_invites_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_group_invites"
  ADD CONSTRAINT "booking_group_invites_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "community_posts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "movie_id" TEXT,
  "content" TEXT NOT NULL,
  "hashtags" JSONB NOT NULL DEFAULT '[]',
  "type" "community_post_type" NOT NULL DEFAULT 'DISCUSSION',
  "poll_options" JSONB,
  "is_approved" BOOLEAN NOT NULL DEFAULT true,
  "like_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "community_posts_is_approved_created_at_idx" ON "community_posts"("is_approved", "created_at");
CREATE INDEX IF NOT EXISTS "community_posts_movie_id_idx" ON "community_posts"("movie_id");
ALTER TABLE "community_posts"
  ADD CONSTRAINT "community_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_posts"
  ADD CONSTRAINT "community_posts_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "community_poll_votes" (
  "id" TEXT NOT NULL,
  "post_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "option_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_poll_votes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "community_poll_votes_post_id_user_id_key" ON "community_poll_votes"("post_id", "user_id");
ALTER TABLE "community_poll_votes"
  ADD CONSTRAINT "community_poll_votes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_poll_votes"
  ADD CONSTRAINT "community_poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "cinema_photos" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "booking_id" TEXT,
  "movie_id" TEXT,
  "image_url" TEXT NOT NULL,
  "caption" TEXT,
  "is_approved" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cinema_photos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "cinema_photos_is_approved_created_at_idx" ON "cinema_photos"("is_approved", "created_at");
ALTER TABLE "cinema_photos"
  ADD CONSTRAINT "cinema_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cinema_photos"
  ADD CONSTRAINT "cinema_photos_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cinema_photos"
  ADD CONSTRAINT "cinema_photos_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "referrals" (
  "id" TEXT NOT NULL,
  "referrer_id" TEXT NOT NULL,
  "referred_id" TEXT NOT NULL,
  "points_awarded" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "referrals_referred_id_key" ON "referrals"("referred_id");
CREATE INDEX IF NOT EXISTS "referrals_referrer_id_idx" ON "referrals"("referrer_id");
ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "post_show_prompts" (
  "id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "movie_id" TEXT NOT NULL,
  "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_show_prompts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "post_show_prompts_booking_id_key" ON "post_show_prompts"("booking_id");
CREATE INDEX IF NOT EXISTS "post_show_prompts_user_id_idx" ON "post_show_prompts"("user_id");
