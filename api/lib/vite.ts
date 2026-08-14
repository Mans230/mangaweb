import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";

type App = Hono<{ Bindings: HttpBindings }>;

export function serveStaticFiles(app: App) {
  const distPath = path.resolve(import.meta.dirname, "../dist/public");

  // كاش صارم: أصول /assets المُجزّأة (hash في الاسم) تُخزَّن سنة،
  // بينما index.html وباقي الملفات no-cache حتى لا يعلق المستخدمون على نسخة قديمة بعد كل deploy
  app.use("*", async (c, next) => {
    await next();
    if (c.res.headers.get("Cache-Control")) return;
    const p = c.req.path;
    if (p.startsWith("/assets/")) {
      c.header("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      c.header("Cache-Control", "no-cache");
    }
  });

  app.use("*", serveStatic({ root: "./dist/public" }));

  app.notFound((c) => {
    const accept = c.req.header("accept") ?? "";
    if (!accept.includes("text/html")) {
      return c.json({ error: "Not Found" }, 404);
    }
    const indexPath = path.resolve(distPath, "index.html");
    const content = fs.readFileSync(indexPath, "utf-8");
    return c.body(content, 200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    });
  });
}
