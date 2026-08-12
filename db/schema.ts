import {
  mysqlTable,
  mysqlEnum,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  boolean,
  decimal,
  json,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: bigint("id", { mode: "number", unsigned: true })
    .autoincrement()
    .primaryKey(),
  email: varchar("email", { length: 320 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  name: varchar("name", { length: 255 }),
  avatarUrl: text("avatarUrl"),
  telegramId: varchar("telegramId", { length: 64 }).unique(),
  telegramUsername: varchar("telegramUsername", { length: 64 }),
  googleId: varchar("googleId", { length: 255 }).unique(),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ================= zeko-manga tables =================

export const sources = mysqlTable("sources", {
  id: bigint("id", { mode: "number", unsigned: true })
    .autoincrement()
    .primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  baseUrl: varchar("baseUrl", { length: 500 }).notNull(),
  status: mysqlEnum("status", ["active", "paused", "blocked"])
    .default("active")
    .notNull(),
  lastScanAt: timestamp("lastScanAt"),
  mangaCount: int("mangaCount").default(0).notNull(),
});

export type Source = typeof sources.$inferSelect;
export type InsertSource = typeof sources.$inferInsert;

export const manga = mysqlTable(
  "manga",
  {
    id: bigint("id", { mode: "number", unsigned: true })
    .autoincrement()
    .primaryKey(),
    slug: varchar("slug", { length: 300 }).notNull().unique(),
    title: varchar("title", { length: 500 }).notNull(),
    altTitles: json("altTitles").$type<string[]>(),
    description: text("description"),
    coverUrl: text("coverUrl"),
    type: mysqlEnum("type", ["manga", "manhwa", "manhua"])
      .default("manhwa")
      .notNull(),
    status: mysqlEnum("status", ["ongoing", "completed"])
      .default("ongoing")
      .notNull(),
    genres: json("genres").$type<string[]>(),
    rating: decimal("rating", { precision: 3, scale: 2, mode: "number" })
      .default(0)
      .notNull(),
    ratingCount: int("ratingCount").default(0).notNull(),
    viewCount: bigint("viewCount", { mode: "number", unsigned: true })
      .default(0)
      .notNull(),
    chapterCount: int("chapterCount").default(0).notNull(),
    isAdult: boolean("isAdult").default(false).notNull(),
    sourceId: bigint("sourceId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => sources.id),
    sourceUrl: text("sourceUrl"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    statusIdx: index("manga_status_idx").on(table.status),
    viewCountIdx: index("manga_view_count_idx").on(table.viewCount),
    sourceIdx: index("manga_source_idx").on(table.sourceId),
  }),
);

export type Manga = typeof manga.$inferSelect;
export type InsertManga = typeof manga.$inferInsert;

export const chapters = mysqlTable(
  "chapters",
  {
    id: bigint("id", { mode: "number", unsigned: true })
    .autoincrement()
    .primaryKey(),
    mangaId: bigint("mangaId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => manga.id),
    number: decimal("number", { precision: 8, scale: 1, mode: "number" }).notNull(),
    title: varchar("title", { length: 500 }),
    pageCount: int("pageCount").default(0).notNull(),
    publishedAt: timestamp("publishedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    mangaIdx: index("chapters_manga_idx").on(table.mangaId),
    publishedIdx: index("chapters_published_idx").on(table.publishedAt),
  }),
);

export type Chapter = typeof chapters.$inferSelect;
export type InsertChapter = typeof chapters.$inferInsert;

export const favorites = mysqlTable(
  "favorites",
  {
    id: bigint("id", { mode: "number", unsigned: true })
    .autoincrement()
    .primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    mangaId: bigint("mangaId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => manga.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userMangaUnique: uniqueIndex("favorites_user_manga_unique").on(
      table.userId,
      table.mangaId,
    ),
  }),
);

export type Favorite = typeof favorites.$inferSelect;

export const follows = mysqlTable(
  "follows",
  {
    id: bigint("id", { mode: "number", unsigned: true })
    .autoincrement()
    .primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    mangaId: bigint("mangaId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => manga.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userMangaUnique: uniqueIndex("follows_user_manga_unique").on(
      table.userId,
      table.mangaId,
    ),
  }),
);

export type Follow = typeof follows.$inferSelect;

export const readingProgress = mysqlTable(
  "reading_progress",
  {
    id: bigint("id", { mode: "number", unsigned: true })
    .autoincrement()
    .primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    mangaId: bigint("mangaId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => manga.id),
    chapterId: bigint("chapterId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => chapters.id),
    lastPage: int("lastPage").default(0).notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    userMangaUnique: uniqueIndex("reading_progress_user_manga_unique").on(
      table.userId,
      table.mangaId,
    ),
  }),
);

export type ReadingProgress = typeof readingProgress.$inferSelect;

export const comments = mysqlTable(
  "comments",
  {
    id: bigint("id", { mode: "number", unsigned: true })
    .autoincrement()
    .primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    mangaId: bigint("mangaId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => manga.id),
    chapterId: bigint("chapterId", { mode: "number", unsigned: true }).references(
      () => chapters.id,
    ),
    content: text("content").notNull(),
    isSpoiler: boolean("isSpoiler").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    mangaIdx: index("comments_manga_idx").on(table.mangaId),
    chapterIdx: index("comments_chapter_idx").on(table.chapterId),
  }),
);

export type Comment = typeof comments.$inferSelect;

export const ratings = mysqlTable(
  "ratings",
  {
    id: bigint("id", { mode: "number", unsigned: true })
    .autoincrement()
    .primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    mangaId: bigint("mangaId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => manga.id),
    stars: int("stars").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userMangaUnique: uniqueIndex("ratings_user_manga_unique").on(
      table.userId,
      table.mangaId,
    ),
  }),
);

export type Rating = typeof ratings.$inferSelect;

export const requests = mysqlTable(
  "requests",
  {
    id: bigint("id", { mode: "number", unsigned: true })
    .autoincrement()
    .primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).references(
      () => users.id,
    ),
    title: varchar("title", { length: 500 }).notNull(),
    sourceUrl: text("sourceUrl"),
    note: text("note"),
    status: mysqlEnum("status", ["pending", "added", "rejected"])
      .default("pending")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("requests_status_idx").on(table.status),
  }),
);

export type Request = typeof requests.$inferSelect;
