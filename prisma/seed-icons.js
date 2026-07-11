import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.resolve(__dirname, "..", "assets");

const prisma = new PrismaClient();

async function run() {
  const entries = await fs.readdir(ASSETS_DIR, { withFileTypes: true });
  const icons = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.(png|jpe?g|svg|webp)$/i.test(entry.name)) continue;

    const original = entry.name;
    const lower = original.toLowerCase();

    // Rename to lowercase if needed (two-step for Windows/macOS case-insensitive FS)
    if (original !== lower) {
      const origPath = path.join(ASSETS_DIR, original);
      const tempPath = path.join(ASSETS_DIR, `__tmp_${Date.now()}_${lower}`);
      const finalPath = path.join(ASSETS_DIR, lower);
      await fs.rename(origPath, tempPath);
      await fs.rename(tempPath, finalPath);
      console.log(`renamed: ${original} → ${lower}`);
    }

    const slug = lower.replace(/\.[^.]+$/, "");
    const name = slug
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    icons.push({ name, slug, image_url: `assets/${lower}` });
  }

  console.log(`\nSeeding ${icons.length} icons...`);

  for (const icon of icons) {
    await prisma.icons.upsert({
      where: { slug: icon.slug },
      update: { name: icon.name, image_url: icon.image_url },
      create: icon,
    });
    console.log(`  ✓ ${icon.name}`);
  }

  console.log(`\nDone. ${icons.length} icons in DB.`);
}

run()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("Failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });