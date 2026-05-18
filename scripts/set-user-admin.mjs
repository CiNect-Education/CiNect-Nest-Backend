/**
 * Grant ADMIN role to a user by email.
 * Usage: node scripts/set-user-admin.mjs user1100@gmail.com
 */
import { PrismaClient, UserRole } from "@prisma/client";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/set-user-admin.mjs <email>");
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const adminRole = await prisma.role.findFirst({
    where: { name: UserRole.ADMIN },
  });
  if (!adminRole) {
    console.error("ADMIN role missing — run: npx prisma db seed");
    process.exit(1);
  }

  await prisma.userRoleJoin.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    update: {},
    create: { userId: user.id, roleId: adminRole.id },
  });

  const roles = await prisma.userRoleJoin.findMany({
    where: { userId: user.id },
    include: { role: true },
  });

  console.log({
    email: user.email,
    userId: user.id,
    roles: roles.map((r) => r.role.name),
  });
} finally {
  await prisma.$disconnect();
}
