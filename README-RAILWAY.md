# نشر zeko-manga على Railway

دليل خطوة بخطوة لنشر التطبيق self-hosted على Railway مع دومينك الخاص (مثال: `zekospace.com`).

---

## 1) إنشاء المشروع

1. ادخل على [railway.app](https://railway.app) وسجّل الدخول عبر GitHub.
2. **New Project** ← **Deploy from GitHub repo** ← اختر مستودع `zeko-manga`.
   - لو تفضّل CLI: `railway init` ثم `railway up` من جذر المشروع.

## 2) إضافة قاعدة MySQL

1. داخل المشروع: **+ New** ← **Database** ← **MySQL**.
2. بعد إنشائها، افتح خدمة MySQL ← تبويب **Variables** (أو **Connect**) وانسخ قيمة `DATABASE_URL`
   بصيغة `mysql://root:****@host:port/railway`.
   - يمكنك أيضاً استخدام المرجع الداخلي `mysql.railway.internal` بدل الدومين العام.

## 3) ضبط متغيرات البيئة

افتح خدمة التطبيق ← **Variables** وأضف:

| المتغير | الوصف | إلزامي؟ |
|---|---|---|
| `DATABASE_URL` | رابط MySQL من الخطوة السابقة | ✅ |
| `JWT_SECRET` | مفتاح توقيع الجلسات — ولّده بـ `openssl rand -hex 32` | ✅ |
| `SITE_URL` | `https://zekospace.com` | ✅ |
| `ADMIN_EMAILS` | إيميلات الأدمن مفصولة بفواصل — أول تسجيل بأحدها يمنح `role=admin` | ✅ |
| `TELEGRAM_BOT_TOKEN` | توكن البوت من [@BotFather](https://t.me/BotFather) | لتفعيل دخول تليجرام |
| `TELEGRAM_BOT_USERNAME` | اسم البوت بدون `@` | لتفعيل دخول تليجرام |
| `VITE_TELEGRAM_BOT_USERNAME` | نفس الاسم — يُضمَّن في الواجهة وقت البناء ليظهر زر تليجرام | لتفعيل دخول تليجرام |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | من Google Cloud Console | اختياري |
| `LINK_API_SECRET` | سر مشترك مع بوت الربط الخارجي (يُرسل في ترويسة `x-link-secret`) | اختياري |
| `ENABLED_SOURCES` | المصادر المفعّلة مفصولة بفواصل (افتراضي: `kawaiimanga,olympustaff,azorafly,mangatime,rocksmanga,3asq,despair`) | اختياري |
| `IMPORT_ON_EMPTY` | عند `true` يستورد الموقع أشهر المانجا تلقائياً من كل مصدر لو القاعدة فارغة (افتراضي `true`) | اختياري |
| `IMPORT_LIMIT_PER_SOURCE` | عدد السلاسل المستوردة من كل مصدر عند التشغيل الأول (افتراضي `12`) | اختياري |
| `SCRAPER_REFRESH_MIN` | دقائق بين كل تحديث تلقائي للفصول (افتراضي `30`) | اختياري |
| `FLARESOLVERR_URL` | رابط FlareSolverr لتفعيل مصدر mangadar المحمي بـ Cloudflare | اختياري |
| `PORT` | Railway يضبطه تلقائياً — لا تغيّره | تلقائي |

> **أول تشغيل:** لو قاعدة البيانات فارغة، الموقع هيستورد تلقائياً ~12 سلسلة حقيقية من كل مصدر (حوالي 84 سلسلة) في الخلفية خلال دقائق من الإقلاع، وبيحدّث الفصول كل 30 دقيقة. تقدر كمان تضيف أي مانجا يدوياً من لوحة الأدمن ← "إضافة بلينك" بلصق رابطها من أي مصدر.

> **تنبيه**: `VITE_TELEGRAM_BOT_USERNAME` يجب أن يكون موجوداً **وقت البناء** لأن Vite يضمّنه في ملفات الواجهة. بعد تغييره أعد النشر (Redeploy). في Dockerfile يمرَّر كـ build arg تلقائياً من متغيرات Railway.

## 4) أوامر البناء والتشغيل

الخيار الأسهل: استخدم **Dockerfile** الموجود (Railway يكتشفه تلقائياً) — يبني الواجهة والسيرفر ثم يشغّل `npm start` فقط.

> **لا يوجد migrate عند الإقلاع**: `drizzle-kit migrate` أُزيل من أمر التشغيل لأن `ALTER TABLE` كان يعلّق على metadata lock أثناء تبديل الحاويات ويسبب crash loop. بدلاً منه يعمل `ensureBootSchema()` بعد بدء الاستماع مباشرة (fire-and-forget، idempotent) ويطبّق أي أعمدة/جداول جديدة. ملفات `db/migrations/` تبقى المرجع الرسمي ويمكن تشغيلها يدوياً عند الحاجة.

أو بدون Docker (Nixpacks) اضبط في **Settings ← Deploy**:

- **Build Command**: `npm ci && npm run build`
- **Start Command**: `npm start`

## 5) ربط الدومين المخصص (zekospace.com)

1. خدمة التطبيق ← **Settings ← Networking ← Custom Domain** ← أدخل `zekospace.com`.
2. Railway سيعطيك سجل **CNAME** (مثل `xxxx.up.railway.app`).
3. في مزود DNS لديك:
   - `www` أو السب-دومين: سجل `CNAME` يشير لقيمة Railway.
   - الدومين الجذر `zekospace.com`: إن كان مزودك يدعم `ALIAS/ANAME` (مثل Cloudflare بـ CNAME flattening) استخدمه، وإلا انقل DNS إلى Cloudflare واضبط `CNAME` للجذر (Cloudflare يسمح بذلك) مع **SSL/TLS: Full**.
4. انتظر انتشار DNS (دقائق عادةً) — Railway يصدر شهادة TLS تلقائياً.
5. حدّث `SITE_URL=https://zekospace.com` وأعد النشر.

## 6) أول دخول Admin

1. افتح `https://zekospace.com/login`.
2. سجّل حساباً جديداً بأحد الإيميلات الموجودة في `ADMIN_EMAILS` — سيحصل تلقائياً على `role=admin`.
3. ستظهر لك لوحة الإدارة على `/admin`.

> لو سجّلت قبل ضبط `ADMIN_EMAILS`، يمكنك ترقية المستخدم يدوياً:
> `UPDATE users SET role='admin' WHERE email='you@zekospace.com';`

## 7) تفعيل Telegram Login (اختياري)

1. أنشئ بوتاً عبر @BotFather واحفظ التوكن.
2. نفّذ `/setdomain` في @BotFather واربط البوت بـ `zekospace.com` (إلزامي لعمل الـ Login Widget).
3. أضف `TELEGRAM_BOT_TOKEN` و`TELEGRAM_BOT_USERNAME` و`VITE_TELEGRAM_BOT_USERNAME` ثم أعد النشر.
4. سيظهر زر "الدخول عبر تليجرام" في صفحة الدخول تلقائياً.

### ربط حساب تليجرام بحساب موجود (للبوت الخارجي)

- المستخدم المسجّل يطلب كود ربط من صفحته (tRPC: `auth.createLinkCode`) — كود 6 أرقام صالح 10 دقائق.
- البوت الخارجي يستلم الكود من المستخدم ثم ينادي:

```http
POST /api/link/verify
Content-Type: application/json
x-link-secret: <LINK_API_SECRET لو ضُبط>

{ "code": "123456", "telegramId": "123456789", "username": "user" }
```

## 8) تفعيل Google OAuth (اختياري)

1. Google Cloud Console ← Credentials ← **OAuth client ID (Web)**.
2. أضف `https://zekospace.com/api/oauth/google/callback` في **Authorized redirect URIs**.
3. أضف `GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET` وأعد النشر — زر جوجل يظهر تلقائياً.

---

## التشغيل محلياً

```bash
cp .env.example .env   # وعبّئ القيم
npm install
npm run migrate
npm run dev            # تطوير
# أو إنتاج محلي:
npm run build && npm start
```

## استكشاف الأخطاء

| العَرَض | السبب المحتمل |
|---|---|
| `Missing required environment variable` | متغير ناقص في Railway Variables |
| زر تليجرام لا يظهر | `VITE_TELEGRAM_BOT_USERNAME` غير مضبوط وقت البناء — أعد النشر |
| Widget تليجرام يرفض الدومين | لم تنفّذ `/setdomain` في BotFather |
| الكوكي لا يُحفظ | تأكد أن الموقع يعمل عبر HTTPS (الكوكي `Secure` في الإنتاج) |

<!-- redeploy-trigger: coins-batch-2 -->
