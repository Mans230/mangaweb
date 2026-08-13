import { relations } from "drizzle-orm";
import {
  chapters,
  comments,
  communities,
  communityBans,
  communityChatMessages,
  communityCreateRequests,
  communityInvites,
  communityJoinRequests,
  communityMembers,
  communityMessages,
  communityRoles,
  favorites,
  follows,
  manga,
  notifications,
  ratings,
  readingProgress,
  reports,
  requests,
  sources,
  userListItems,
  userLists,
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

export const userListsRelations = relations(userLists, ({ one, many }) => ({
  user: one(users, { fields: [userLists.userId], references: [users.id] }),
  items: many(userListItems),
}));

export const userListItemsRelations = relations(userListItems, ({ one }) => ({
  list: one(userLists, {
    fields: [userListItems.listId],
    references: [userLists.id],
  }),
  manga: one(manga, {
    fields: [userListItems.mangaId],
    references: [manga.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  user: one(users, { fields: [reports.userId], references: [users.id] }),
  manga: one(manga, { fields: [reports.mangaId], references: [manga.id] }),
  chapter: one(chapters, {
    fields: [reports.chapterId],
    references: [chapters.id],
  }),
}));

export const communityMessagesRelations = relations(
  communityMessages,
  ({ one }) => ({
    manga: one(manga, {
      fields: [communityMessages.mangaId],
      references: [manga.id],
    }),
    user: one(users, {
      fields: [communityMessages.userId],
      references: [users.id],
    }),
  }),
);

// ================= مجتمعات المستخدمين =================

export const communitiesRelations = relations(communities, ({ one, many }) => ({
  owner: one(users, {
    fields: [communities.ownerId],
    references: [users.id],
  }),
  manga: one(manga, {
    fields: [communities.mangaId],
    references: [manga.id],
  }),
  roles: many(communityRoles),
  members: many(communityMembers),
  joinRequests: many(communityJoinRequests),
  bans: many(communityBans),
  invite: one(communityInvites, {
    fields: [communities.id],
    references: [communityInvites.communityId],
  }),
  messages: many(communityChatMessages),
}));

export const communityRolesRelations = relations(
  communityRoles,
  ({ one, many }) => ({
    community: one(communities, {
      fields: [communityRoles.communityId],
      references: [communities.id],
    }),
    members: many(communityMembers),
  }),
);

export const communityMembersRelations = relations(
  communityMembers,
  ({ one }) => ({
    community: one(communities, {
      fields: [communityMembers.communityId],
      references: [communities.id],
    }),
    user: one(users, {
      fields: [communityMembers.userId],
      references: [users.id],
    }),
    role: one(communityRoles, {
      fields: [communityMembers.roleId],
      references: [communityRoles.id],
    }),
  }),
);

export const communityJoinRequestsRelations = relations(
  communityJoinRequests,
  ({ one }) => ({
    community: one(communities, {
      fields: [communityJoinRequests.communityId],
      references: [communities.id],
    }),
    user: one(users, {
      fields: [communityJoinRequests.userId],
      references: [users.id],
    }),
  }),
);

export const communityBansRelations = relations(communityBans, ({ one }) => ({
  community: one(communities, {
    fields: [communityBans.communityId],
    references: [communities.id],
  }),
  user: one(users, {
    fields: [communityBans.userId],
    references: [users.id],
  }),
}));

export const communityCreateRequestsRelations = relations(
  communityCreateRequests,
  ({ one }) => ({
    user: one(users, {
      fields: [communityCreateRequests.userId],
      references: [users.id],
    }),
  }),
);

export const communityInvitesRelations = relations(
  communityInvites,
  ({ one }) => ({
    community: one(communities, {
      fields: [communityInvites.communityId],
      references: [communities.id],
    }),
  }),
);

export const communityChatMessagesRelations = relations(
  communityChatMessages,
  ({ one }) => ({
    community: one(communities, {
      fields: [communityChatMessages.communityId],
      references: [communities.id],
    }),
    user: one(users, {
      fields: [communityChatMessages.userId],
      references: [users.id],
    }),
  }),
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));
