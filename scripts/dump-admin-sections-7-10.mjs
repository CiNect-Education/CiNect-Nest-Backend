import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const promotions = await prisma.promotion.findMany({
    take: 3,
    select: { id: true, title: true, code: true, status: true },
    orderBy: { createdAt: 'desc' },
  });
  const pricingRules = await prisma.pricingRule.findMany({
    take: 3,
    select: { id: true, name: true, cinemaId: true, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  const news = await prisma.newsArticle.findMany({
    take: 3,
    select: { id: true, title: true, slug: true },
    orderBy: { publishedAt: 'desc' },
  });
  const campaigns = await prisma.campaign.findMany({
    take: 3,
    select: { id: true, title: true, slug: true },
    orderBy: { startDate: 'desc' },
  });
  const banners = await prisma.banner.findMany({
    take: 3,
    select: { id: true, title: true, position: true, campaignId: true },
    orderBy: { createdAt: 'desc' },
  });
  const bookings = await prisma.booking.findMany({
    take: 3,
    select: { id: true, status: true, userId: true, showtimeId: true },
    orderBy: { createdAt: 'desc' },
  });
  const roles = await prisma.role.findMany({
    select: { id: true, name: true },
  });

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseUrl: 'http://localhost:3001/api/v1',
        note: 'Dùng cùng token admin trong mọi request (trừ mục 10 negative).',
        promotions,
        pricingRules,
        newsArticles: news,
        campaigns,
        banners,
        bookingsSample: bookings,
        roles,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error('Query failed:', e.message);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
