/**
 * Download cinema images to frontend public/media/cinemas and rewrite JSON to local paths.
 * Run: node scripts/download-cinema-media.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "../prisma/data/cinema-images.json");
const outDir = join(__dirname, "../../cinect-frontend/public/media/cinemas");

const UA = "CiNectImageBot/1.0 (https://cinect.vn; local-dev)";
const images = JSON.parse(readFileSync(dataPath, "utf8"));
mkdirSync(outDir, { recursive: true });

const local = {};
let ok = 0;
let fail = 0;

for (const [slug, url] of Object.entries(images)) {
  if (!url || url.startsWith("/media/")) {
    local[slug] = url;
    continue;
  }

  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) {
      console.warn(`skip ${slug}: HTTP ${res.status}`);
      fail++;
      local[slug] = url;
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = url.includes(".png") ? "png" : "jpg";
    const file = `${slug}.${ext}`;
    writeFileSync(join(outDir, file), buf);
    local[slug] = `/media/cinemas/${file}`;
    ok++;
    console.log(`ok ${slug}`);
    await new Promise((r) => setTimeout(r, 800));
  } catch (e) {
    console.warn(`err ${slug}:`, e.message);
    fail++;
    local[slug] = url;
  }
}

writeFileSync(dataPath, JSON.stringify(local, null, 2), "utf8");
console.log({ downloaded: ok, failed: fail, total: Object.keys(images).length });
