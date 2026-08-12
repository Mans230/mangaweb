import { authRouter } from "./auth-router";
import { adminRouter } from "./adminRouter";
import { engagementRouter } from "./engagementRouter";
import { libraryRouter } from "./libraryRouter";
import { mangaRouter } from "./mangaRouter";
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
});

export type AppRouter = typeof appRouter;
