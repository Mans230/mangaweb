import { authRouter } from "./auth-router";
import { adminRouter } from "./adminRouter";
import { adminCoinsRouter } from "./adminCoinsRouter";
import { communityRouter } from "./communityRouter";
import { communitiesRouter } from "./communitiesRouter";
import { engagementRouter } from "./engagementRouter";
import { libraryRouter } from "./libraryRouter";
import { listsRouter } from "./listsRouter";
import { mangaRouter } from "./mangaRouter";
import { reportsRouter } from "./reportsRouter";
import { requestRouter } from "./requestRouter";
import { importRouter } from "./importRouter";
import { uploadRouter } from "./uploadRouter";
import { reelsRouter } from "./reelsRouter";
import { analyticsRouter } from "./analyticsRouter";
import { notificationsRouter } from "./notificationsRouter";
import { supportRouter } from "./supportRouter";
import { coinsRouter } from "./coinsRouter";
import { shopRouter } from "./shopRouter";
import { pollsRouter } from "./pollsRouter";
import { enRouter } from "./enRouter";
import { recommendRouter } from "./recommendRouter";
import { announcementsRouter } from "./announcementsRouter";
import { usersRouter } from "./usersRouter";
import { postsRouter } from "./postsRouter";
import { premiumRouter } from "./premiumRouter";
import { reactionsRouter } from "./reactionsRouter";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  manga: mangaRouter,
  en: enRouter,
  rec: recommendRouter,
  library: libraryRouter,
  engagement: engagementRouter,
  request: requestRouter,
  import: importRouter,
  admin: adminRouter,
  adminCoins: adminCoinsRouter,
  lists: listsRouter,
  reports: reportsRouter,
  community: communityRouter,
  communities: communitiesRouter,
  upload: uploadRouter,
  reels: reelsRouter,
  analytics: analyticsRouter,
  notifications: notificationsRouter,
  support: supportRouter,
  coins: coinsRouter,
  shop: shopRouter,
  polls: pollsRouter,
  announcements: announcementsRouter,
  users: usersRouter,
  posts: postsRouter,
  premium: premiumRouter,
  reactions: reactionsRouter,
});

export type AppRouter = typeof appRouter;
