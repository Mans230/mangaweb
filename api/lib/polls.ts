/**
 * الاستطلاع الأسبوعي — استطلاع نشط واحد، صوت واحد لكل مستخدم.
 */
import { desc, eq, sql } from "drizzle-orm";
import { pollOptions, polls, pollVotes } from "@db/schemaCoins";
import { getDb } from "../queries/connection";

/** مفتاح الأسبوع الحالي بصيغة ISO "YYYY-Www" (UTC) */
export function currentWeekKey(d = new Date()): string {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export type PollOptionWithVotes = {
  id: number;
  textAr: string | null;
  textEn: string | null;
  votes: number;
};

export type CurrentPoll = {
  id: number;
  questionAr: string | null;
  questionEn: string | null;
  weekKey: string | null;
  options: PollOptionWithVotes[];
  totalVotes: number;
};

async function pollWithCounts(pollId: number): Promise<{
  options: PollOptionWithVotes[];
  totalVotes: number;
}> {
  const db = getDb();
  const options = await db
    .select({
      id: pollOptions.id,
      textAr: pollOptions.textAr,
      textEn: pollOptions.textEn,
      votes: sql<number>`(
        SELECT COUNT(*) FROM poll_votes pv
        WHERE pv.optionId = ${pollOptions.id}
      )`,
    })
    .from(pollOptions)
    .where(eq(pollOptions.pollId, pollId));
  const mapped = options.map((o) => ({ ...o, votes: Number(o.votes ?? 0) }));
  return {
    options: mapped,
    totalVotes: mapped.reduce((sum, o) => sum + o.votes, 0),
  };
}

/** أحدث استطلاع نشط + خياراته + عدد الأصوات + صوت المستخدم (إن وُجد) */
export async function currentPoll(
  userId?: number | null,
): Promise<{ poll: CurrentPoll | null; myVoteOptionId: number | null }> {
  const db = getDb();
  const [poll] = await db
    .select()
    .from(polls)
    .where(eq(polls.active, true))
    .orderBy(desc(polls.id))
    .limit(1);
  if (!poll) return { poll: null, myVoteOptionId: null };
  const { options, totalVotes } = await pollWithCounts(poll.id);
  let myVoteOptionId: number | null = null;
  if (userId != null && Number.isFinite(userId)) {
    const [vote] = await db
      .select({ optionId: pollVotes.optionId })
      .from(pollVotes)
      .where(
        sql`${pollVotes.pollId} = ${poll.id} AND ${pollVotes.userId} = ${userId}`,
      )
      .limit(1);
    myVoteOptionId = vote ? Number(vote.optionId) : null;
  }
  return {
    poll: {
      id: poll.id,
      questionAr: poll.questionAr,
      questionEn: poll.questionEn,
      weekKey: poll.weekKey,
      options,
      totalVotes,
    },
    myVoteOptionId,
  };
}

/** التصويت في استطلاع — يتحقق من الخيار والاستطلاع ويمنع التكرار بالمفتاح المركّب */
export async function votePoll(
  userId: number,
  pollId: number,
  optionId: number,
): Promise<
  | { ok: true; options: PollOptionWithVotes[]; totalVotes: number }
  | { ok: false; reason: "not_found" | "already_voted" }
> {
  const db = getDb();
  const [poll] = await db
    .select()
    .from(polls)
    .where(eq(polls.id, pollId))
    .limit(1);
  if (!poll || !poll.active) return { ok: false, reason: "not_found" };
  const [option] = await db
    .select({ id: pollOptions.id })
    .from(pollOptions)
    .where(
      sql`${pollOptions.id} = ${optionId} AND ${pollOptions.pollId} = ${pollId}`,
    )
    .limit(1);
  if (!option) return { ok: false, reason: "not_found" };
  try {
    await db.insert(pollVotes).values({ pollId, userId, optionId });
  } catch {
    return { ok: false, reason: "already_voted" };
  }
  const counts = await pollWithCounts(pollId);
  return { ok: true, ...counts };
}
