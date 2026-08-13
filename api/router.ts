import { authRouter } from "./auth-router";
import { adminRouter } from "./adminRouter";
import { communityRouter } from "./communityRouter";
import { engagementRouter } from "./engagementRouter";
import { libraryRouter } from "./libraryRouter";
import { listsRouter } from "./listsRouter";
import { mangaRouter } from "./mangaRouter";
import { reportsRouter } from "./reportsRouter";
import { requestRouter } from "./requestRouter";
import { importRouter } from "./importRouter";
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
});

export type AppRouter = typeof appRouter;
