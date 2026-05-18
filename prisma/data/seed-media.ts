/**
 * Image URLs for non-movie seed entities.
 */

import newsImagesJson from "./news-images.json";

const unsplash = (photoId: string, w = 1200) =>
  `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=${w}&q=80`;

export const SEED_SNACK_IMAGES: Record<string, string> = {
  "Popcorn (L)": unsplash("1489599849927-2ee91cede3ba", 400),
  "Popcorn (M)": unsplash("1517604931442-7e0c8ed2963c", 400),
  "Coca-Cola (L)": unsplash("1460881680858-30d872d5b530", 400),
  "Combo Couple": unsplash("1478720568477-152d9b164e26", 400),
  "Combo Family": unsplash("1536440136628-849c177e76a1", 400),
  Nachos: unsplash("1440404653325-ab127d49abc1", 400),
  "Hot Dog": unsplash("1594909122845-11baa439b7bf", 400),
  "Water Bottle": unsplash("1505686994434-e3cc5abf1330", 400),
};

/** AI-generated promo banners in cinect-frontend/public/media/promotions */
const promoBase = () =>
  (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/$/, "");
const promoMedia = (file: string) => `${promoBase()}/media/promotions/${file}`;

export const SEED_PROMOTION_IMAGES: Record<string, string> = {
  STUDENT20: promoMedia("student20.png"),
  COMBO2026: promoMedia("combo2026.png"),
  LOVE2026: promoMedia("love2026.png"),
  FAMILY15: promoMedia("family15.png"),
};

export const SEED_NEWS_IMAGES: Record<string, string> = newsImagesJson as Record<
  string,
  string
>;

export const SEED_GIFT_CARD_IMAGES: Record<string, string> = {
  "Movie Night Gift Card": unsplash("1517604931442-7e0c8ed2963c", 600),
  "Premium Experience Gift Card": unsplash("1489599849927-2ee91cede3ba", 600),
  "Ultimate Cinema Package": unsplash("1536440136628-849c177e76a1", 600),
};

export const SEED_CAMPAIGN_IMAGES: Record<string, string> = {
  "lunar-new-year-2026": unsplash("1460881680858-30d872d5b530", 1400),
  "summer-blockbusters-2026": unsplash("1505686994434-e3cc5abf1330", 1400),
};
