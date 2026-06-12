import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const email = process.env.ADMIN_EMAIL ?? 'admin@cinect.vn';
const password = process.env.ADMIN_PASSWORD ?? 'Password@123';

try {
  const hash = await bcrypt.hash(password, 10);
  const adminRole = await prisma.role.upsert({
    where: { name: UserRole.ADMIN },
    update: {},
    create: { name: UserRole.ADMIN, permissions: ['*'] },
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash: hash,
      isActive: true,
      emailVerified: true,
      fullName: 'Admin CiNect',
    },
    create: {
      email,
      passwordHash: hash,
      fullName: 'Admin CiNect',
      phone: '0901234567',
      isActive: true,
      emailVerified: true,
      city: 'Ho Chi Minh',
    },
  });

  await prisma.userRoleJoin.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    update: {},
    create: { userId: user.id, roleId: adminRole.id },
  });

  console.log(`Admin ready: ${email}`);
} finally {
  await prisma.$disconnect();
}
