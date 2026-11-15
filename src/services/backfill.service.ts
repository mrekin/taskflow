import { db } from "@/lib/db";

/**
 * Minimal structural interface for a Prisma model delegate, so the same
 * backfill routine works for both Comment and NoteComment.
 */
interface ShortIdModelDelegate {
  findMany(args: {
    where: { shortIdNum: number };
    orderBy: { createdAt: "asc" };
    select: { id: true; ownerId: true };
  }): Promise<Array<{ id: string; ownerId: string }>>;
  findFirst(args: {
    where: { ownerId: string };
    orderBy: { shortIdNum: "desc" };
    select: { shortIdNum: true };
  }): Promise<{ shortIdNum: number } | null>;
  update(args: { where: { id: string }; data: { shortIdNum: number } }): Promise<unknown>;
}

/**
 * Assign shortIdNum to all rows that still have the default value 0.
 *
 * Numbering is per-owner (same scheme as getNextShortIdNum): for each owner we
 * continue after the current max shortIdNum of that owner, assigning numbers to
 * the zero rows in createdAt ASC order. Soft-deleted task comments
 * (deleted=true) are included — they stay in the DB as "[deleted]" and get
 * numbered too.
 *
 * Idempotent: when no rows with shortIdNum=0 exist, this is a no-op.
 * Collision note: same as for all entities — a comment created concurrently
 * while the backfill runs may compute the same max+1; accepted.
 */
async function backfillShortIdNum(model: ShortIdModelDelegate, label: string): Promise<number> {
  const zeroRows = await model.findMany({
    where: { shortIdNum: 0 },
    orderBy: { createdAt: "asc" },
    select: { id: true, ownerId: true },
  });

  if (zeroRows.length === 0) {
    console.log(`[Backfill] ${label}.shortIdNum: nothing to do (no rows with shortIdNum=0)`);
    return 0;
  }

  // Group zero rows by owner, preserving createdAt ASC order within each owner.
  const ownerIds: string[] = [];
  const rowsByOwner = new Map<string, Array<{ id: string; ownerId: string }>>();
  for (const row of zeroRows) {
    let rows = rowsByOwner.get(row.ownerId);
    if (!rows) {
      rows = [];
      rowsByOwner.set(row.ownerId, rows);
      ownerIds.push(row.ownerId);
    }
    rows.push(row);
  }

  let updated = 0;
  for (const ownerId of ownerIds) {
    // Continue numbering after the current max of this owner — this also keeps
    // numbering consistent if a previous run was interrupted mid-way.
    const maxRecord = await model.findFirst({
      where: { ownerId },
      orderBy: { shortIdNum: "desc" },
      select: { shortIdNum: true },
    });
    let next = (maxRecord?.shortIdNum ?? 0) + 1;

    for (const row of rowsByOwner.get(ownerId)!) {
      await model.update({ where: { id: row.id }, data: { shortIdNum: next } });
      next++;
      updated++;
    }
  }

  console.log(
    `[Backfill] ${label}.shortIdNum: assigned numbers to ${updated} row(s) across ${ownerIds.length} owner(s)`
  );
  return updated;
}

/**
 * Startup backfills. Runs once per app start (from instrumentation.ts register,
 * i.e. after the entrypoint has finished `prisma db push`). Safe to run on
 * every cold start — cheap when there is nothing to backfill.
 */
export async function runStartupBackfills(): Promise<void> {
  try {
    await backfillShortIdNum(db.comment, "Comment");
  } catch (error) {
    console.error("[Backfill] Comment.shortIdNum backfill failed:", error);
  }

  try {
    await backfillShortIdNum(db.noteComment, "NoteComment");
  } catch (error) {
    console.error("[Backfill] NoteComment.shortIdNum backfill failed:", error);
  }
}
