import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const movies = await prisma.movie.findMany({
    take: 5,
    where: { isDeleted: false },
    select: { id: true, title: true, slug: true },
    orderBy: { createdAt: 'desc' },
  });
  const cinemas = await prisma.cinema.findMany({
    take: 5,
    where: { isActive: true },
    select: { id: true, name: true, city: true },
    orderBy: { name: 'asc' },
  });
  const rooms = await prisma.room.findMany({
    take: 15,
    where: { isActive: true },
    select: { id: true, name: true, cinemaId: true, format: true },
    orderBy: [{ cinemaId: 'asc' }, { name: 'asc' }],
  });

  const pairs = [];
  for (const c of cinemas) {
    const r = rooms.find((x) => x.cinemaId === c.id);
    if (r) pairs.push({ cinema: c, room: r });
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: 'Dùng cùng cinemaId + roomId trong một cặp; room.cinemaId phải === cinemaId.',
        samplePairsForPostman: pairs.slice(0, 3).map(({ cinema, room }) => ({
          cinemaId: cinema.id,
          cinemaName: cinema.name,
          roomId: room.id,
          roomName: room.name,
          roomFormatDb: room.format,
        })),
        movies: movies.slice(0, 5),
        cinemas,
        rooms,
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
