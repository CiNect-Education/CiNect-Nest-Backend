import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const ms = await p.movie.findMany({ where: { isDeleted: false }, select: { slug: true, posterUrl: true } });
const amazon = ms.filter((m) => m.posterUrl.includes("amazon"));
const wiki = ms.filter((m) => m.posterUrl.includes("wikimedia"));
console.log({ amazon: amazon.length, wiki: wiki.length, amazonSlugs: amazon.map((x) => x.slug) });
await p.$disconnect();
