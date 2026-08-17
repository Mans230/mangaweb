import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { checkRateLimit, clientIp } from "./lib/rateLimit";
import { currentPoll, votePoll } from "./lib/polls";

function assertPollsRateLimit(action: string, req: Request) {
  const key = `polls:${action}:${clientIp(req)}`;
  if (!checkRateLimit(key, 20, 60 * 1000)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "محاولات كثيرة، جرب بعد شوية",
    });
  }
}

export const pollsRouter = createRouter({
  /** الاستطلاع النشط الحالي + خياراته + صوت المستخدم (null للزوار) */
  current: publicQuery.query(async ({ ctx }) => {
    const userId = ctx.user ? Number(ctx.user.id) : null;
    return currentPoll(userId);
  }),

  /** التصويت في الاستطلاع — صوت واحد لكل مستخدم */
  vote: authedQuery
    .input(
      z.object({
        pollId: z.number().int().positive(),
        optionId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPollsRateLimit("vote", ctx.req);
      const res = await votePoll(
        Number(ctx.user.id),
        input.pollId,
        input.optionId,
      );
      if (!res.ok) {
        const message =
          res.reason === "already_voted"
            ? "صوّتت بالفعل في هذا الاستطلاع"
            : "الاستطلاع أو الخيار غير موجود";
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
      return res;
    }),
});
