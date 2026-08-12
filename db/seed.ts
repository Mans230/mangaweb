import { eq } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import { chapters, manga, sources } from "./schema";
import { mangaList } from "../src/data/mock";

const SOURCE_URLS: Record<string, string> = {
  kawaiimanga: "https://kawaiimanga.com",
  olympustaff: "https://olympustaff.com",
  azorafly: "https://azorafly.com",
  mangatime: "https://mangatime.com",
  mangadar: "https://mangadar.com",
  rocksmanga: "https://rocksmanga.com",
  "3asq": "https://3asq.org",
  "despair-manga": "https://despair-manga.com",
};

const TYPE_MAP: Record<string, "manga" | "manhwa" | "manhua"> = {
  "مانجا": "manga",
  "مانهوا": "manhwa",
  "مانها": "manhua",
};

const STATUS_MAP: Record<string, "ongoing" | "completed"> = {
  "مستمر": "ongoing",
  "مكتمل": "completed",
  "متوقف": "completed",
};

function parseViews(views: string): number {
  const n = parseFloat(views);
  if (views.endsWith("M")) return Math.round(n * 1_000_000);
  if (views.endsWith("K")) return Math.round(n * 1_000);
  return Math.round(n);
}

async function seed() {
  const db = getDb();
  console.log("Seeding database...");

  // ---- sources (idempotent by name) ----
  const sourceIdByName = new Map<string, number>();
  for (const [name, baseUrl] of Object.entries(SOURCE_URLS)) {
    const existing = await db.query.sources.findFirst({
      where: eq(sources.name, name),
    });
    if (existing) {
      sourceIdByName.set(name, existing.id);
      continue;
    }
    const [{ id }] = await db
      .insert(sources)
      .values({
        name,
        baseUrl,
        status: name === "mangadar" ? "paused" : "active",
        mangaCount: 0,
      })
      .$returningId();
    sourceIdByName.set(name, id);
    console.log(`  + source: ${name}`);
  }

  // ---- manga + chapters (idempotent by slug) ----
  const now = Date.now();
  let mangaIndex = 0;
  for (const m of mangaList) {
    const sourceId = sourceIdByName.get(m.source);
    if (!sourceId) throw new Error(`source not found: ${m.source}`);

    const existing = await db.query.manga.findFirst({
      where: eq(manga.slug, m.slug),
    });
    if (existing) {
      mangaIndex++;
      continue;
    }

    const [{ id: mangaId }] = await db
      .insert(manga)
      .values({
        slug: m.slug,
        title: m.title,
        altTitles: m.altTitle ? [m.altTitle] : [],
        description: m.synopsis,
        coverUrl: m.cover,
        type: TYPE_MAP[m.type] ?? "manhwa",
        status: STATUS_MAP[m.status] ?? "ongoing",
        genres: m.genres,
        rating: m.rating,
        ratingCount: m.ratingCount,
        viewCount: parseViews(m.views),
        chapterCount: m.chapters,
        isAdult: m.isAdult ?? false,
        sourceId,
        sourceUrl: `${SOURCE_URLS[m.source]}/manga/${m.slug}`,
      })
      .$returningId();

    // chapters: numbered 1..N, dates descending (latest chapter is most recent)
    const latestOffsetMs = (mangaIndex * 7 + 5) * 60 * 60 * 1000; // stagger per manga
    const DAY = 24 * 60 * 60 * 1000;
    const rows = [];
    for (let n = 1; n <= m.chapters; n++) {
      rows.push({
        mangaId,
        number: n,
        title: null,
        pageCount: 18 + ((n * 7) % 9),
        publishedAt: new Date(
          now - latestOffsetMs - (m.chapters - n) * 3 * DAY,
        ),
      });
    }
    for (let i = 0; i < rows.length; i += 500) {
      await db.insert(chapters).values(rows.slice(i, i + 500));
    }

    // set updatedAt to the latest chapter's publish date
    const latestPublished = new Date(now - latestOffsetMs);
    await db
      .update(manga)
      .set({ updatedAt: latestPublished })
      .where(eq(manga.id, mangaId));

    console.log(`  + manga: ${m.slug} (${m.chapters} chapters)`);
    mangaIndex++;
  }

  // ---- refresh per-source manga counts ----
  for (const [name, sourceId] of sourceIdByName) {
    const rows = await db
      .select({ id: manga.id })
      .from(manga)
      .where(eq(manga.sourceId, sourceId));
    await db
      .update(sources)
      .set({ mangaCount: rows.length })
      .where(eq(sources.id, sourceId));
    void name;
  }

  console.log("Done.");
  process.exit(0); // close MySQL connection pool
}

seed();
