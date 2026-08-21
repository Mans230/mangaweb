# Ops / Infrastructure Admin Tools — Roadmap

A 10-tool "infrastructure & DevOps" admin suite was requested. This app is a **single
Railway Node process + MySQL + in-memory caches + R2/catbox image storage + custom SMTP +
Telegram** — there is **no Redis, no metrics/APM/Sentry, and no Railway/Cloudflare API
integration**. So a large part of that spec cannot be built as real in-app features without
fabricating data or doing something unsafe. This roadmap tracks the **honest feasible subset**
and is explicit about what is out of scope and why.

Legend: ✅ done · 🟡 partial/exists · 🔴 planned

## Feasible subset (buildable in-app, iteratively)

- **1. Scraper Job Queue/Log (spec Tool 2)** — ✅ done
  `scrape_jobs` table (schema + idempotent `ensureSchema`), `api/lib/scrapeJobs.ts`
  (`startJob`/`finishJob`/`inBlackout` + exponential-backoff retry, max 3 attempts),
  wired into `triggerScrape`/`importFullCatalog` via a shared `scrapeOneSource` helper in
  `adminRouter.ts` (alongside Phase-3 `recordSourceHealth`). Admin procedures
  `listScrapeJobs`/`scrapeJobStats`/`retryScrapeJob`/`getScrapeBlackout`/`setScrapeBlackout`,
  and a `ScraperJobs.tsx` tab (queue-depth stats, per-source run-now with success rate, job
  log with status badges + retry, blackout-window editor). Manual runs override blackout;
  automatic retries respect it.
- **2. Security & audit ops (spec Tool 5, feasible parts)** — 🟡 audit-log viewer already
  exists (`admin.adminLogs` + `AdminSettings.tsx`). Planned: dedicated tab + IP-ban management
  UI (`api/lib/ipBan.ts`) + failed-login tracking + rate-limit visibility (`api/lib/rateLimit.ts`).
- **3. Error-tracking upgrade (spec Tool 8)** — 🟡 base exists (`error_logs` + `SystemHealth`,
  from the content-admin Phase 6). Planned: group by fingerprint, status workflow
  (new/investigating/fixed/ignored), browser JS-error ingestion endpoint, basic API timing.
- **4. Instance health + safe DB stats (spec Tools 1 & 3, feasible parts)** — 🔴
  `process`/`os` metrics (memory, load, uptime, event-loop lag), DB ping latency, in-memory
  cache sizes; read-only table-size/row dashboard from `information_schema`. **No arbitrary SQL.**
- **5. Email/notification infra (spec Tool 6, feasible parts)** — 🟡 templates already done
  (content-admin Phase 4). Planned: SMTP/Telegram config-presence + test-send console + delivery log.
- **6. Feature flags + version display (spec Tool 7, feasible parts)** — 🟡 maintenance mode
  already exists. Planned: feature-flag registry via site settings + running-version display.

## Out of scope — needs external infra / APIs, or unsafe (documented, NOT built)

Building UI that *displays* these would mean fabricating data or is inherently platform-level:

- Real multi-server CPU/RAM/disk/network & Railway auto-scaling events (needs Railway API/agents)
- Redis cache hit/miss & memory (there is **no Redis**)
- CDN bandwidth/region analytics, WebP pipeline config, hotlink/origin-shield, CDN cost
  forecasting (Cloudflare dashboard/API)
- WAF rule management, bot-detection challenges, vulnerability scanner, SSL auto-renewal
  monitoring (Cloudflare/infra)
- One-click deploy/rollback, blue/green releases, web-based secret/env editing (Railway/CI —
  and editing secrets from a web UI is unsafe)
- Automated DB backups/restore/retention/encryption/offsite/multi-region (infra ops)
- Real infrastructure cost/billing breakdown, right-sizing, reserved-instance advice
  (Railway/Cloudflare billing APIs)
- Arbitrary SQL query editor (security risk — refused)

Each feasible item ships as its own commit and is pushed to `origin/main`.
