# Admin Tools Roadmap

The admin panel (`src/pages/Admin.tsx` + `src/components/admin/*` + `api/adminRouter.ts`)
already covers most of the 12 requested tools. This roadmap tracks the remaining work,
built **iteratively** — one shippable vertical slice per phase (DB/setting → tRPC → admin UI → wiring).

Legend: ✅ done · 🟡 partial (exists, gaps listed) · 🔴 new

| # | Tool | Status | Existing surface |
|---|------|--------|------------------|
| 1 | Content Management | ✅ | `ContentManager`, `MangaManager`, `MergeDuplicates`, `AddByLink` |
| 2 | Chapter Management | 🟡 | in `MangaManager` — missing: scheduling, gap detection, translation versions, broken-chapter queue |
| 3 | Source Integration & Monitoring | 🟡 | `Sources` — missing: scraper health (last run, error rate), rate-limit UI, onboarding wizard |
| 4 | User Management | ✅ | `UsersManager` |
| 5 | Request Moderation | ✅ | `RequestsManager` — could add: response templates, SLA tracking |
| 6 | Content Moderation & DMCA | 🟡 | `ReportsManager`, `CommentsManager` — missing: dedicated DMCA tracking + templates |
| 7 | Analytics & Insights | ✅ | `AnalyticsDashboard` — could add: cohort/funnel |
| 8 | Community & Engagement | ✅ | `CommunitiesManager`, announcements, challenges, polls |
| 9 | Monetization & Premium | 🟡 | `AdminCoins`, premium/shop — missing: payment gateway, promo codes, refunds |
| 10 | System Config & Health | 🟡 | `AdminSettings` — missing: error-log viewer, backup, CDN purge |
| 11 | Theme & Branding Customizer | 🔴 | none |
| 12 | Notification System Manager | 🟡 | `notificationsRouter` — missing: admin template-builder UI |

## Phases

- **Phase 1 — Theme & Branding Customizer (Tool 11)** — ✅ done
  Site-wide color scheme, logo/favicon, site name & SEO description, custom CSS injection.
  Stored as one JSON site setting; applied live on the frontend via CSS variables.
  Files: `siteSettings.ts`, `mangaRouter.branding`, `adminRouter.{getBranding,setBranding,resetBranding}`,
  `src/lib/branding.ts`, `ThemeBranding.tsx`, wired in `App.tsx` + `Admin.tsx`.
- **Phase 2 — DMCA tracking (Tool 6 gap)** — ✅ done
  `dmca_requests` table (schema + idempotent `ensureSchema`), `dmcaRouter`
  (public rate-limited `submit`; admin `list`/`pendingCount`/`updateStatus`/`remove`),
  `DmcaManager.tsx` queue UI with status workflow + response templates, tab with pending badge.
- **Phase 3 — Source health monitoring (Tool 3 gap)** — ✅ done
  Health columns on `sources` (`lastRunAt`/`lastSuccessAt`/`lastError`/`successCount`/`errorCount`/`priority`/`autoScrape`),
  idempotent `ensureSchema` ALTERs, `recordSourceHealth()` wired into `triggerScrape` + `importFullCatalog`,
  `admin.updateSourceConfig` (priority + auto toggle), rebuilt `Sources.tsx` with health badges,
  success/error counters, last-error display, priority input, and auto-scrape switch.
- **Phase 4 — Notification template builder (Tool 12 gap)** — ✅ done
  `notification_templates` table (+ ensureSchema), admin template CRUD and a
  targeted `adminBroadcast` (all / premium / manga-followers, chunked insert)
  on `notificationsRouter`, plus `NotificationsManager.tsx` (compose + confirm,
  template picker, template editor) and a Notifications tab.
- **Phase 5 — Broken-chapter queue (Tool 2 gap)** — ✅ done
  `admin.listBrokenChapters` (reports where `reason="broken"`, joined chapter + manga,
  status filter + pagination) plus `BrokenChaptersManager.tsx` resolution workflow
  reusing existing `rescrapeChapter` / `hideChapter` / `unhideChapter` /
  `reports.resolveReport`. New "Broken chapters" tab.
  **Chapter scheduling deferred:** chapters already carry `publishedAt`, but public
  chapter reads (e.g. `mangaRouter` manga-detail at line ~107) don't filter `hiddenAt`
  or future `publishedAt` — so scheduling needs a broader chapter-visibility pass across
  ~8 read queries, best done as its own change with runtime verification.
- **Phase 6 — System health: error-log viewer + cache purge (Tool 10 gap)** — ✅ done
  `error_logs` table (+ ensureSchema), best-effort `captureError()` wired into the
  tRPC `onError` hook in boot.ts (500-class only), `admin.errorLogs`/`clearErrorLogs`,
  and `admin.purgeCaches` (clears in-memory chapter-pages + settings caches via new
  `clearPagesCache()` + `invalidateSettingsCache()`). `SystemHealth.tsx` viewer + purge
  button, new "System health" tab.
- **Phase 7 — Monetization: promo codes (Tool 9 gap)** — ✅ done
  `promo_codes` + `promo_redemptions` tables (schema + idempotent ensureSchema,
  unique (codeId,userId) index blocks double-redeem). New `promoRouter`: user
  `redeem` (rate-limited; rejects expired/inactive/exhausted/duplicate; reuses the
  `premiumUntil` grant logic and `awardCoins`) and admin
  `listCodes`/`createCode`/`updateCode`/`deleteCode`. `Monetization.tsx` admin tab
  (create/manage codes, random-code generator) and a shared `PromoRedeem.tsx`
  wired into both `Premium.tsx` and `Coins.tsx`.
  **Refund log dropped** and **payment-gateway integration intentionally left out**
  — it needs real payment credentials/webhooks and is a separate infra decision.

---

**All planned phases complete.** Remaining known follow-ups (not in this roadmap's
scope): chapter scheduling (needs a chapter-visibility pass), real payment-gateway
integration, and the repo's 28 pre-existing TypeScript errors in untouched files.

Each phase follows the repo's existing conventions:
key/value settings via `getSetting`/`setSetting`, admin procedures via `adminQuery`,
`logAdminAction` for audit, and `trpc.admin.*` on the client.
