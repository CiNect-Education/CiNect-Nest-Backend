export const REVIEW_EMOTION_TAGS = [
  'great',
  'satisfied',
  'touching',
  'funny',
  'meaningful',
  'masterpiece',
  'worth_watching',
] as const;

export type ReviewEmotionTag = (typeof REVIEW_EMOTION_TAGS)[number];

export const MAX_REVIEW_IMAGES = 3;
