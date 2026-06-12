import { fetchText, stripAccents } from "./sync-movies-lib.mjs";
import { RoomFormat, SeatType, SeatStatus } from "@prisma/client";

/** Stable slug per Cinestar cinema id (from cinestar.com.vn API). */
export const CINESTAR_ID_TO_SLUG = {
  "8f3a5832-8340-4a43-89bc-6653817162f1": "cinestar-quoc-thanh",
  "cf13e1ce-2c1f-4c73-8ce5-7ef65472db3c": "cinestar-sinh-vien",
  "f8a60463-5c34-49a9-9ae8-52081e387bb8": "cinestar-hue",
  "e08f986a-1937-419e-b1b1-759b7c74728b": "cinestar-da-lat",
  "104509be-034e-47c1-bf1b-aba7f2df4f28": "cinestar-lam-dong-duc-trong",
  "8f54df74-3796-42ea-896e-cd638eec1fe3": "cinestar-my-tho",
  "4a51b9ee-f143-4411-9dbb-5f54a1c382c0": "cinestar-kien-giang",
  "42bec658-2331-4dc7-ac03-39231c069d7e": "cinestar-satra-quan-6",
  "85e300f7-6aa7-48bc-b29f-405255918bba": "cinestar-parkcity-ha-noi",
};

const AREA_PROVINCE = {
  "Hồ Chí Minh": { code: "ho-chi-minh-city", city: "Thành phố Hồ Chí Minh" },
  "Huế": { code: "hue", city: "Huế" },
  "Đà Lạt": { code: "lam-dong", city: "Lâm Đồng" },
  "Lâm Đồng": { code: "lam-dong", city: "Lâm Đồng" },
  "Đồng Tháp": { code: "dong-thap", city: "Đồng Tháp" },
  "An Giang": { code: "an-giang", city: "An Giang" },
  "Hà Nội": { code: "ha-noi", city: "Hà Nội" },
};

const DEFAULT_ROOM = "Phòng 1 - 2D";

function parseCoords(maps) {
  if (!maps || typeof maps !== "string") return { latitude: null, longitude: null };
  const [lat, lng] = maps.split(",").map((s) => Number(s.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { latitude: null, longitude: null };
  return { latitude: lat, longitude: lng };
}

function cinemaSlug(ext) {
  return CINESTAR_ID_TO_SLUG[ext.id] || `cinestar-${stripAccents(ext.name_en || ext.name_vn || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

export function mapCinestarCinema(ext) {
  const area = AREA_PROVINCE[ext.area_name_vn] || {
    code: "ho-chi-minh-city",
    city: ext.area_name_vn || "Việt Nam",
  };
  const { latitude, longitude } = parseCoords(ext.maps);
  return {
    slug: cinemaSlug(ext),
    cinestarId: ext.id,
    name: ext.name_vn || ext.name_en,
    address: String(ext.address || "").trim(),
    city: area.city,
    provinceCode: area.code,
    phone: ext.telephone || null,
    imageUrl: ext.image || null,
    latitude,
    longitude,
    amenities: ["2D", "Dolby Atmos", "Parking"],
  };
}

export function parseCinestarPage(html) {
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!nextMatch) return { cinemas: [], res: null };
  const data = JSON.parse(nextMatch[1]);
  const res = data?.props?.pageProps?.res;
  const cinemas = Array.isArray(res?.listCinemas) ? res.listCinemas.map(mapCinestarCinema) : [];
  return { cinemas, res };
}

export async function fetchCinestarCinemas() {
  const html = await fetchText("https://cinestar.com.vn/showtimes");
  return parseCinestarPage(html).cinemas;
}

async function ensureDefaultRoom(prisma, cinemaId) {
  let room = await prisma.room.findUnique({
    where: { cinemaId_name: { cinemaId, name: DEFAULT_ROOM } },
  });
  if (room) return room;

  const rows = 8;
  const cols = 12;
  room = await prisma.room.create({
    data: {
      cinemaId,
      name: DEFAULT_ROOM,
      format: RoomFormat.STANDARD2D,
      totalSeats: rows * cols,
      rows,
      columns: cols,
    },
  });

  const rowLabels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const seats = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 1; c <= cols; c++) {
      seats.push({
        roomId: room.id,
        rowLabel: rowLabels[r],
        number: c,
        type: r >= rows - 2 ? SeatType.VIP : SeatType.STANDARD,
        status: SeatStatus.AVAILABLE,
        price: 85000,
      });
    }
  }
  await prisma.seat.createMany({ data: seats });
  return room;
}

/** Upsert all Cinestar cinemas + default screening room. Returns upserted cinema rows. */
export async function upsertCinestarCinemas(prisma) {
  const external = await fetchCinestarCinemas();
  if (!external.length) throw new Error("No Cinestar cinemas returned from API");

  const provinces = await prisma.provinceNew.findMany({ select: { id: true, code: true } });
  const provinceByCode = new Map(provinces.map((p) => [p.code, p.id]));

  const results = [];
  for (const c of external) {
    const provinceNewId = provinceByCode.get(c.provinceCode);
    if (!provinceNewId) {
      console.warn(`  skip ${c.slug}: unknown province ${c.provinceCode}`);
      continue;
    }

    const cinema = await prisma.cinema.upsert({
      where: { slug: c.slug },
      update: {
        name: c.name,
        address: c.address,
        city: c.city,
        phone: c.phone,
        imageUrl: c.imageUrl,
        amenities: c.amenities,
        latitude: c.latitude,
        longitude: c.longitude,
        provinceNewId,
        isActive: true,
      },
      create: {
        slug: c.slug,
        name: c.name,
        address: c.address,
        city: c.city,
        phone: c.phone,
        imageUrl: c.imageUrl,
        amenities: c.amenities,
        latitude: c.latitude,
        longitude: c.longitude,
        provinceNewId,
        isActive: true,
      },
    });

    await ensureDefaultRoom(prisma, cinema.id);
    results.push(cinema);
  }
  return results;
}
