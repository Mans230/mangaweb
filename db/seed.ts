import { eq } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import { sources } from "./schema";

/**
 * يزرع المصادر الثمانية الحقيقية فقط (الأسماء والروابط من سكرابرز zeko-bot).
 * لا توجد مانجا وهمية — المحتوى يُجمع فعلياً عبر السكرابرز.
 */
const REAL_SOURCES: { name: string; baseUrl: string; status: "active" | "paused" }[] = [
  { name: "kawaiimanga", baseUrl: "https://kawaiimanga.org", status: "active" },
  { name: "olympustaff", baseUrl: "https://olympustaff.com", status: "active" },
  { name: "azorafly", baseUrl: "https://azorafly.com", status: "active" },
  { name: "mangatime", baseUrl: "https://mangatime.org", status: "active" },
  { name: "rocksmanga", baseUrl: "https://rocksmanga.com", status: "active" },
  { name: "3asq", baseUrl: "https://3asq.online", status: "active" },
  { name: "despair", baseUrl: "https://despair-manga.net", status: "active" },
  // محمي بـ Cloudflare — يُفعَّل فقط عند ضبط FLARESOLVERR_URL
  { name: "mangadar", baseUrl: "https://mangadar.com", status: "paused" },
  { name: "dilar", baseUrl: "https://dilar.tube", status: "active" },
];

async function seed() {
  const db = getDb();
  console.log("Seeding sources...");

  for (const s of REAL_SOURCES) {
    const existing = await db.query.sources.findFirst({
      where: eq(sources.name, s.name),
    });
    if (existing) {
      // حدّث الرابط لو تغيّر دون المساس بالحالة أو العدّاد
      if (existing.baseUrl !== s.baseUrl) {
        await db
          .update(sources)
          .set({ baseUrl: s.baseUrl })
          .where(eq(sources.id, existing.id));
        console.log(`  ~ source: ${s.name} (baseUrl updated)`);
      }
      continue;
    }
    await db.insert(sources).values({ ...s, mangaCount: 0 });
    console.log(`  + source: ${s.name}`);
  }

  console.log("Done.");
  process.exit(0); // close MySQL connection pool
}

seed();
