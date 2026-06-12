import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const now = new Date();
const future = await p.showtime.count({ where: { isActive: true, startTime: { gt: now } } });
const byMovie = await p.showtime.groupBy({
  by: ["movieId"],
  where: { isActive: true, startTime: { gt: now } },
  _count: true,
});
console.log("future showtimes", future);
console.log("movies with showtimes", byMovie.length);
await p.$disconnect();
