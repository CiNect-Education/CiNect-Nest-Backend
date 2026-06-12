-- Rich reviews, comments, reports, feed filters
CREATE TYPE "community_target_type" AS ENUM ('REVIEW', 'POST');
CREATE TYPE "content_report_reason" AS ENUM ('SPAM', 'SPOILER', 'HARASSMENT', 'OTHER');

ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "cinema_id" TEXT;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "tags" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "image_urls" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "has_spoiler" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "community_posts" ADD COLUMN IF NOT EXISTS "has_spoiler" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "post_show_prompts" ADD COLUMN IF NOT EXISTS "dismissed_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "reviews_cinema_id_idx" ON "reviews"("cinema_id");
CREATE INDEX IF NOT EXISTS "reviews_is_approved_helpful_count_idx" ON "reviews"("is_approved", "helpful_count");
CREATE INDEX IF NOT EXISTS "post_show_prompts_user_id_dismissed_at_idx" ON "post_show_prompts"("user_id", "dismissed_at");

CREATE TABLE IF NOT EXISTS "community_comments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "target_type" "community_target_type" NOT NULL,
    "target_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "has_spoiler" BOOLEAN NOT NULL DEFAULT false,
    "is_approved" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "community_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "content_reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "target_type" "community_target_type" NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" "content_report_reason" NOT NULL,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "community_comments_target_type_target_id_created_at_idx" ON "community_comments"("target_type", "target_id", "created_at");
CREATE INDEX IF NOT EXISTS "content_reports_target_type_target_id_idx" ON "content_reports"("target_type", "target_id");
CREATE UNIQUE INDEX IF NOT EXISTS "content_reports_reporter_id_target_type_target_id_key" ON "content_reports"("reporter_id", "target_type", "target_id");

ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_cinema_id_fkey";
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_cinema_id_fkey" FOREIGN KEY ("cinema_id") REFERENCES "cinemas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "community_comments" DROP CONSTRAINT IF EXISTS "community_comments_user_id_fkey";
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "content_reports" DROP CONSTRAINT IF EXISTS "content_reports_reporter_id_fkey";
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
