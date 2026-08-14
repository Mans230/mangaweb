import { authRouter } from "./auth-router";
import { adminRouter } from "./adminRouter";
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
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  manga: mangaRouter,
  library: libraryRouter,
  engagement: engagementRouter,
  request: requestRouter,
  import: importRouter,
  admin: adminRouter,
  lists: listsRouter,
  reports: reportsRouter,
  community: communityRouter,
  communities: communitiesRouter,
  upload: uploadRouter,
  reels: reelsRouter,
  analytics: analyticsRouter,
});

export type AppRouter = typeof appRouter;
