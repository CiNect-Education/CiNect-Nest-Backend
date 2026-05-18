/**
 * Delete all rows from users (and dependent user data).
 * Usage: node scripts/clear-all-users.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const before = await prisma.user.count();

  // Bookings block user delete (no onDelete on user relation).
  const bookings = await prisma.booking.deleteMany({});
  const holds = await prisma.hold.deleteMany({});

  const users = await prisma.user.deleteMany({});

  const after = await prisma.user.count();

  console.log({
    usersBefore: before,
    bookingsRemoved: bookings.count,
    holdsRemoved: holds.count,
    usersRemoved: users.count,
    usersAfter: after,
  });
} finally {
  await prisma.$disconnect();
}
