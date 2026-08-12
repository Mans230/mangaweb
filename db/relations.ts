import { relations } from "drizzle-orm";
import {
  chapters,
  comments,
  favorites,
  follows,
  manga,
  ratings,
  readingProgress,
  requests,
  sources,
  users,
} from "./schema";

export const sourcesRelations = relations(sources, ({ many }) => ({
  manga: many(manga),
}));

export const mangaRelations = relations(manga, ({ one, many }) => ({
  source: one(sources, { fields: [manga.sourceId], references: [sources.id] }),
  chapters: many(chapters),
  favorites: many(favorites),
  follows: many(follows),
  comments: many(comments),
  ratings: many(ratings),
}));

export const chaptersRelations = relations(chapters, ({ one, many }) => ({
  manga: one(manga, { fields: [chapters.mangaId], references: [manga.id] }),
  comments: many(comments),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, { fields: [favorites.userId], references: [users.id] }),
  manga: one(manga, { fields: [favorites.mangaId], references: [manga.id] }),
}));

export const followsRelations = relations(follows, ({ one }) => ({
  user: one(users, { fields: [follows.userId], references: [users.id] }),
  manga: one(manga, { fields: [follows.mangaId], references: [manga.id] }),
}));

export const readingProgressRelations = relations(readingProgress, ({ one }) => ({
  user: one(users, {
    fields: [readingProgress.userId],
    references: [users.id],
  }),
  manga: one(manga, {
    fields: [readingProgress.mangaId],
    references: [manga.id],
  }),
  chapter: one(chapters, {
    fields: [readingProgress.chapterId],
    references: [chapters.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  user: one(users, { fields: [comments.userId], references: [users.id] }),
  manga: one(manga, { fields: [comments.mangaId], references: [manga.id] }),
  chapter: one(chapters, {
    fields: [comments.chapterId],
    references: [chapters.id],
  }),
}));

export const ratingsRelations = relations(ratings, ({ one }) => ({
  user: one(users, { fields: [ratings.userId], references: [users.id] }),
  manga: one(manga, { fields: [ratings.mangaId], references: [manga.id] }),
}));

export const requestsRelations = relations(requests, ({ one }) => ({
  user: one(users, { fields: [requests.userId], references: [users.id] }),
}));
