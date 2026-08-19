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
  primaryKey,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: bigint("id", { mode: "number", unsigned: true })
    .autoincrement()
    .primaryKey(),
  email: varchar("email", { length: 320 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  name: varchar("name", { length: 255 }),
  username: varchar("username", { length: 24 }).unique(),
  usernameChangedAt: timestamp("usernameChangedAt"),
  avatarUrl: text("avatarUrl"),
  bannerUrl: text("bannerUrl"),
  telegramId: varchar("telegramId", { length: 64 }).unique(),
  telegramUsername: varchar("telegramUsername", { length: 64 }),
  telegramPhotoUrl: text("telegramPhotoUrl"),
  googleId: varchar("googleId", { length: 255 }).unique(),
  emailVerifiedAt: timestamp("emailVerifiedAt"),
  notificationsTelegram: boolean("notificationsTelegram")
    .default(false)
    .notNull(),
  dnd: boolean("dnd").default(false).notNull(),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /** اشتراك مميّز فعّال حتى هذا التاريخ (null = بلا اشتراك) */
  premiumUntil: timestamp("premiumUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
  bannedAt: timestamp("banned_at"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const linkCodes = mysqlTable("link_codes", {
  code: varchar("code", { length: 6 }).primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expiresAt").notNull(),
});

export type LinkCode = typeof linkCodes.$inferSelect;
export type InsertLinkCode = typeof linkCodes.$inferInsert;

export const sessions = mysqlTable(
  "sessions",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 512 }).notNull().unique(),
    userAgent: varchar("userAgent", { length: 500 }),
    ip: varchar("ip", { length: 45 }),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("sessions_user_idx").on(table.userId),
  }),
);

export type SessionRow = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;

export const emailCodes = mysqlTable(
  "email_codes",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 6 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  (table) => ({
    userIdx: index("email_codes_user_idx").on(table.userId),
  }),
);

export type EmailCode = typeof emailCodes.$inferSelect;

/** أكواد تغيير كلمة المرور عبر البريد (6 أرقام، 10 دقائق، تُستهلك مرة واحدة) */
export const passwordResetCodes = mysqlTable(
  "password_reset_codes",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 6 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  (table) => ({
    userIdx: index("password_reset_codes_user_idx").on(table.userId),
  }),
);

export type PasswordResetCode = typeof passwordResetCodes.$inferSelect;

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
    /** مشاهدات صفحة المانجا على موقعنا (تُزيدها analytics.track) — مستقلة عن viewCount المجلوب من المصدر */
    siteViewCount: bigint("siteViewCount", { mode: "number", unsigned: true })
      .default(0)
      .notNull(),
    chapterCount: int("chapterCount").default(0).notNull(),
    isAdult: boolean("isAdult").default(false).notNull(),
    isTrending: boolean("is_trending").default(false).notNull(),
    sourceId: bigint("sourceId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => sources.id),
    sourceUrl: text("sourceUrl"),
    hiddenAt: timestamp("hiddenAt"),
    featuredAt: timestamp("featuredAt"),
    coverOverrideUrl: text("coverOverrideUrl"),
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
    url: text("url"),
    pageCount: int("pageCount").default(0).notNull(),
    publishedAt: timestamp("publishedAt"),
    /** آخر صفحات مُجلوبة بنجاح من المصدر — fallback للقارئ عند تعذّر الجلب اللايف */
    cachedPages: json("cachedPages").$type<string[]>(),
    pagesCachedAt: timestamp("pagesCachedAt"),
    hiddenAt: timestamp("hiddenAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    mangaIdx: index("chapters_manga_idx").on(table.mangaId),
    publishedIdx: index("chapters_published_idx").on(table.publishedAt),
    mangaNumberUnique: uniqueIndex("chapters_manga_number_unique").on(
      table.mangaId,
      table.number,
    ),
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
    /** ردّ على تعليق آخر (مستوى واحد) — null = تعليق رئيسي */
    parentId: bigint("parentId", { mode: "number", unsigned: true }),
    /** صورة مرفقة اختيارية (catbox) */
    imageUrl: varchar("imageUrl", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    mangaIdx: index("comments_manga_idx").on(table.mangaId),
    chapterIdx: index("comments_chapter_idx").on(table.chapterId),
    parentIdx: index("comments_parent_idx").on(table.parentId),
  }),
);

export type Comment = typeof comments.$inferSelect;

/** تصويت لايك/ديسلايك على تعليق — صوت واحد لكل مستخدم لكل تعليق */
export const commentVotes = mysqlTable(
  "comment_votes",
  {
    commentId: bigint("commentId", { mode: "number", unsigned: true }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    /** 1 = لايك، -1 = ديسلايك */
    value: int("value").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.commentId, table.userId] }),
  }),
);

/** حظر مستخدم لمستخدم آخر — تعليقات المحظور تختفي عن الحاظر */
export const userBlocks = mysqlTable(
  "user_blocks",
  {
    blockerId: bigint("blockerId", { mode: "number", unsigned: true }).notNull(),
    blockedId: bigint("blockedId", { mode: "number", unsigned: true }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.blockerId, table.blockedId] }),
  }),
);

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
    /** مراجعة نصية اختيارية مع التقييم — تُضاف عبر ensureBootSchema */
    reviewText: text("reviewText"),
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

export const bannedIps = mysqlTable("banned_ips", {
  ip: varchar("ip", { length: 45 }).primaryKey(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BannedIp = typeof bannedIps.$inferSelect;

// ================= قوائم المستخدم / التقارير / رسائل المجتمع =================

export const userLists = mysqlTable(
  "user_lists",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userNameUnique: uniqueIndex("user_lists_user_name_unique").on(
      table.userId,
      table.name,
    ),
  }),
);

export type UserList = typeof userLists.$inferSelect;
export type InsertUserList = typeof userLists.$inferInsert;

export const userListItems = mysqlTable(
  "user_list_items",
  {
    listId: bigint("listId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => userLists.id, { onDelete: "cascade" }),
    mangaId: bigint("mangaId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    addedAt: timestamp("addedAt").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.listId, table.mangaId] }),
  }),
);

export type UserListItem = typeof userListItems.$inferSelect;

export const reports = mysqlTable(
  "reports",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    mangaId: bigint("mangaId", { mode: "number", unsigned: true }).references(
      () => manga.id,
    ),
    chapterId: bigint("chapterId", {
      mode: "number",
      unsigned: true,
    }).references(() => chapters.id),
    communityMessageId: bigint("communityMessageId", {
      mode: "number",
      unsigned: true,
    }).references(() => communityChatMessages.id, { onDelete: "set null" }),
    commentId: bigint("commentId", { mode: "number", unsigned: true }),
    reason: mysqlEnum("reason", [
      "porn",
      "broken",
      "wrong_translation",
      "other",
    ]).notNull(),
    details: text("details"),
    status: mysqlEnum("status", ["pending", "resolved", "dismissed"])
      .default("pending")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("reports_status_idx").on(table.status),
    userIdx: index("reports_user_idx").on(table.userId),
  }),
);

export type Report = typeof reports.$inferSelect;

export const communityMessages = mysqlTable(
  "community_messages",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    mangaId: bigint("mangaId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    mangaIdIdx: index("community_messages_manga_id_idx").on(
      table.mangaId,
      table.id,
    ),
  }),
);

export type CommunityMessage = typeof communityMessages.$inferSelect;

// ================= مجتمعات المستخدمين =================

export const siteSettings = mysqlTable("site_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value"),
});

export type SiteSetting = typeof siteSettings.$inferSelect;

export const communities = mysqlTable(
  "communities",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    slug: varchar("slug", { length: 150 }).notNull().unique(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    imageUrl: text("imageUrl"),
    color: varchar("color", { length: 7 }),
    isPrivate: boolean("isPrivate").default(false).notNull(),
    ownerId: bigint("ownerId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    mangaId: bigint("mangaId", { mode: "number", unsigned: true }).references(
      () => manga.id,
    ),
    slowModeSeconds: int("slowModeSeconds").default(0).notNull(),
    archivedAt: timestamp("archivedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index("communities_owner_idx").on(table.ownerId),
  }),
);

export type Community = typeof communities.$inferSelect;
export type InsertCommunity = typeof communities.$inferInsert;

export const communityRoles = mysqlTable(
  "community_roles",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    communityId: bigint("communityId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    canModerate: boolean("canModerate").default(false).notNull(),
  },
  (table) => ({
    communityNameUnique: uniqueIndex("community_roles_community_name_unique").on(
      table.communityId,
      table.name,
    ),
  }),
);

export type CommunityRole = typeof communityRoles.$inferSelect;
export type InsertCommunityRole = typeof communityRoles.$inferInsert;

export const communityMembers = mysqlTable(
  "community_members",
  {
    communityId: bigint("communityId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: bigint("roleId", { mode: "number", unsigned: true }).references(
      () => communityRoles.id,
      { onDelete: "set null" },
    ),
    mutedUntil: timestamp("mutedUntil"),
    lastMessageAt: timestamp("lastMessageAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.communityId, table.userId] }),
    userIdx: index("community_members_user_idx").on(table.userId),
  }),
);

export type CommunityMember = typeof communityMembers.$inferSelect;
export type InsertCommunityMember = typeof communityMembers.$inferInsert;

export const communityJoinRequests = mysqlTable(
  "community_join_requests",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    communityId: bigint("communityId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["pending", "approved", "rejected"])
      .default("pending")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    communityUserIdx: index("community_join_requests_community_id_idx").on(
      table.communityId,
      table.userId,
    ),
    statusIdx: index("community_join_requests_status_idx").on(table.status),
  }),
);

export type CommunityJoinRequest = typeof communityJoinRequests.$inferSelect;

export const communityBans = mysqlTable(
  "community_bans",
  {
    communityId: bigint("communityId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.communityId, table.userId] }),
  }),
);

export type CommunityBan = typeof communityBans.$inferSelect;

export type CommunityCreatePayload = {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  color?: string | null;
  isPrivate: boolean;
  mangaId?: number | null;
};

export const communityCreateRequests = mysqlTable(
  "community_create_requests",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    payload: json("payload").$type<CommunityCreatePayload>().notNull(),
    status: mysqlEnum("status", ["pending", "approved", "rejected"])
      .default("pending")
      .notNull(),
    rejectReason: text("rejectReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("community_create_requests_status_idx").on(table.status),
    userIdx: index("community_create_requests_user_idx").on(table.userId),
  }),
);

export type CommunityCreateRequest =
  typeof communityCreateRequests.$inferSelect;

export const communityInvites = mysqlTable("community_invites", {
  communityId: bigint("communityId", { mode: "number", unsigned: true })
    .primaryKey()
    .references(() => communities.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 32 }).notNull().unique(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type CommunityInvite = typeof communityInvites.$inferSelect;

export const communityChatMessages = mysqlTable(
  "community_chat_messages",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    communityId: bigint("communityId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: varchar("content", { length: 500 }).notNull(),
    imageUrl: text("imageUrl"),
    pinnedAt: timestamp("pinnedAt"),
    deletedAt: timestamp("deletedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    communityIdIdx: index("community_chat_messages_community_id_idx").on(
      table.communityId,
      table.id,
    ),
  }),
);

export type CommunityChatMessage = typeof communityChatMessages.$inferSelect;

export type NotificationPayload = {
  communityId?: number;
  communitySlug?: string;
  communityName?: string;
  messageId?: number;
  fromUsername?: string;
  excerpt?: string;
  /** new_chapter: إشعار فصل جديد */
  mangaId?: number;
  mangaTitle?: string;
  mangaSlug?: string;
  chapterId?: number;
  chapterNumber?: number;
  /** إشعارات عامة (نص حر) */
  title?: string;
  body?: string;
  /** ticket_reply: رد الإدارة على تذكرة دعم */
  ticketId?: number;
  subject?: string;
};

export const notifications = mysqlTable(
  "notifications",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    payload: json("payload").$type<NotificationPayload>(),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userReadIdx: index("notifications_user_read_idx").on(
      table.userId,
      table.readAt,
    ),
  }),
);

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ================= الريلز =================

export const reels = mysqlTable(
  "reels",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoUrl: text("videoUrl").notNull(),
    caption: varchar("caption", { length: 300 }),
    mangaId: bigint("mangaId", { mode: "number", unsigned: true }).references(
      () => manga.id,
      { onDelete: "set null" },
    ),
    status: mysqlEnum("status", ["pending", "approved", "rejected"])
      .default("pending")
      .notNull(),
    rejectReason: text("rejectReason"),
    likesCount: int("likesCount").default(0).notNull(),
    viewsCount: int("viewsCount").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("reels_status_idx").on(table.status),
    userIdx: index("reels_user_idx").on(table.userId),
  }),
);

export type Reel = typeof reels.$inferSelect;
export type InsertReel = typeof reels.$inferInsert;

export const reelLikes = mysqlTable(
  "reel_likes",
  {
    reelId: bigint("reelId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => reels.id, { onDelete: "cascade" }),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.reelId, table.userId] }),
  }),
);

export type ReelLike = typeof reelLikes.$inferSelect;

export const reelComments = mysqlTable(
  "reel_comments",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    reelId: bigint("reelId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => reels.id, { onDelete: "cascade" }),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: varchar("content", { length: 500 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    reelIdx: index("reel_comments_reel_idx").on(table.reelId, table.id),
  }),
);

export type ReelComment = typeof reelComments.$inferSelect;

// ================= التحليلات وسجلات الأدمن =================

export const pageViews = mysqlTable(
  "page_views",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    path: varchar("path", { length: 300 }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    ipHash: varchar("ipHash", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    createdIdx: index("page_views_created_idx").on(table.createdAt),
  }),
);

export type PageView = typeof pageViews.$inferSelect;

export const adminLogs = mysqlTable(
  "admin_logs",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    adminId: bigint("adminId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 100 }).notNull(),
    targetType: varchar("targetType", { length: 50 }),
    targetId: varchar("targetId", { length: 100 }),
    meta: json("meta"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    createdIdx: index("admin_logs_created_idx").on(table.createdAt),
  }),
);

export type AdminLog = typeof adminLogs.$inferSelect;
export type InsertAdminLog = typeof adminLogs.$inferInsert;

export const updateRequests = mysqlTable(
  "update_requests",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    mangaId: bigint("mangaId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["pending", "resolved"])
      .default("pending")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("update_requests_status_idx").on(table.status),
  }),
);

export type UpdateRequest = typeof updateRequests.$inferSelect;

// ================= تذاكر الدعم =================

export const supportTickets = mysqlTable(
  "support_tickets",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: varchar("subject", { length: 200 }).notNull(),
    category: varchar("category", { length: 40 }).default("general").notNull(),
    status: varchar("status", { length: 20 }).default("open").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdx: index("support_tickets_user_idx").on(table.userId),
    statusIdx: index("support_tickets_status_idx").on(table.status),
  }),
);

export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = typeof supportTickets.$inferInsert;

export const supportTicketMessages = mysqlTable(
  "support_ticket_messages",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    ticketId: bigint("ticketId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    authorId: bigint("authorId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isAdmin: boolean("isAdmin").default(false).notNull(),
    body: text("body").notNull(),
    /** مرفق صورة اختياري (رابط مرفوع) */
    imageUrl: varchar("imageUrl", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    ticketIdx: index("support_ticket_messages_ticket_idx").on(table.ticketId),
  }),
);

export type SupportTicketMessage = typeof supportTicketMessages.$inferSelect;
export type InsertSupportTicketMessage = typeof supportTicketMessages.$inferInsert;

/** إعلانات الموقع — بانر علوي + صفحة أرشيف /announcements */
export const announcements = mysqlTable("announcements", {
  id: bigint("id", { mode: "number", unsigned: true })
    .autoincrement()
    .primaryKey(),
  /** info | warning | maintenance | new */
  type: varchar("type", { length: 20 }).default("info").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  linkUrl: varchar("linkUrl", { length: 500 }),
  linkLabel: varchar("linkLabel", { length: 80 }),
  /** all | users */
  audience: varchar("audience", { length: 20 }).default("all").notNull(),
  active: boolean("active").default(true).notNull(),
  startsAt: timestamp("startsAt"),
  endsAt: timestamp("endsAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = typeof announcements.$inferInsert;

/** متابعة مستخدم لمستخدم (لصفحات البروفايل العامة) */
export const userFollows = mysqlTable(
  "user_follows",
  {
    followerId: bigint("followerId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followingId: bigint("followingId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.followerId, table.followingId] }),
    followingIdx: index("user_follows_following_idx").on(table.followingId),
  }),
);

export type UserFollow = typeof userFollows.$inferSelect;

/** بوستات الأعضاء في قسم Fun */
export const posts = mysqlTable(
  "posts",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    imageUrl: varchar("imageUrl", { length: 500 }),
    hidden: boolean("hidden").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    createdIdx: index("posts_created_idx").on(table.createdAt),
    userIdx: index("posts_user_idx").on(table.userId),
  }),
);

export type Post = typeof posts.$inferSelect;

/** إعجابات البوستات */
export const postLikes = mysqlTable(
  "post_likes",
  {
    postId: bigint("postId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.postId, table.userId] }),
  }),
);

export type PostLike = typeof postLikes.$inferSelect;

/** رياكشنات على مانهوا/فصل — رياكشن واحد لكل مستخدم لكل هدف */
export const reactions = mysqlTable(
  "reactions",
  {
    /** manga | chapter */
    targetType: varchar("targetType", { length: 10 }).notNull(),
    targetId: bigint("targetId", { mode: "number", unsigned: true }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** upvote | funny | love | surprised | angry | sad */
    kind: varchar("kind", { length: 12 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.targetType, table.targetId, table.userId] }),
    targetIdx: index("reactions_target_idx").on(table.targetType, table.targetId),
  }),
);

export type Reaction = typeof reactions.$inferSelect;
