-- Add IMDb and Metacritic critic scores (separate from CiNect audience rating)
ALTER TABLE "movies" ADD COLUMN IF NOT EXISTS "imdb_id" TEXT;
ALTER TABLE "movies" ADD COLUMN IF NOT EXISTS "imdb_rating" DECIMAL(3,1);
ALTER TABLE "movies" ADD COLUMN IF NOT EXISTS "metacritic_score" INTEGER;

CREATE INDEX IF NOT EXISTS "movies_imdb_id_idx" ON "movies"("imdb_id");
