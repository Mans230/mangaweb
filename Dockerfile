# ── Stage 1: build ──────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# أدوات بناء احتياطية لـ bcrypt لو لم تتوفر ثنائيات musl الجاهزة
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm install --no-audit

COPY . .

# متغيرات Vite تُضمَّن في الواجهة وقت البناء
ARG VITE_TELEGRAM_BOT_USERNAME
ENV VITE_TELEGRAM_BOT_USERNAME=$VITE_TELEGRAM_BOT_USERNAME

RUN npm run build

# ── Stage 2: runtime ────────────────────────────────────────────
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
# drizzle-kit مطلوب وقت التشغيل لتنفيذ المايغريشن
RUN apk add --no-cache python3 make g++ \
  && npm install --omit=dev --no-audit \
  && apk del python3 make g++

COPY --from=build /app/dist ./dist
COPY drizzle.config.ts ./
COPY db ./db

EXPOSE 3000
ENV PORT=3000

# نشغّل السيرفر مباشرة — تغييرات السكيمة تُطبَّق من ensureBootSchema عند الإقلاع
# (تشغيل drizzle-kit migrate هنا كان يعلّق على قفل جدول manga أثناء تبديل الكونتينرات)
CMD ["sh", "-c", "npm start"]
