import { db } from "@/lib/db";
import { NoteService } from "./note.service";
import { fireWebhookEvent, buildNoteCommentContext, resolveTaskAreaId } from "@/lib/webhook-engine";
import type { NoteCommentAnchor } from "@/lib/note-anchors";
import type { ServiceResult } from "./types";

export interface CreateNoteCommentData extends NoteCommentAnchor {
  noteId: string;
  content: string;
}

export interface UpdateNoteCommentData {
  content?: string;
  resolved?: boolean;
  /** Re-anchor fields: refreshed after successful anchor resolution so the
   * offset hint tracks text edits instead of drifting to a wrong occurrence. */
  quote?: string;
  prefix?: string;
  suffix?: string;
  offset?: number;
}

/** Who may edit/resolve/delete: the comment's author or the note's owner. */
function canManageNoteComment(
  userId: string,
  comment: { ownerId: string },
  note: { ownerId: string },
): boolean {
  return comment.ownerId === userId || note.ownerId === userId;
}

function serializeComment(comment: Record<string, unknown>): Record<string, unknown> {
  return comment;
}

export const NoteCommentService = {
  async listNoteComments(
    userId: string | null,
    noteId: string,
  ): Promise<ServiceResult<Record<string, unknown>[]>> {
    const access = await NoteService.getReadableNote(userId, noteId);
    if (!access.ok) return { ok: false, status: access.status, error: access.error };

    const comments = await db.noteComment.findMany({
      where: { noteId },
      orderBy: { createdAt: "asc" },
      include: {
        owner: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return { ok: true, data: comments.map(serializeComment) };
  },

  async createNoteComment(
    userId: string,
    data: CreateNoteCommentData,
  ): Promise<ServiceResult<Record<string, unknown>>> {
    if (!userId) return { ok: false, status: 401, error: "Authentication required" };

    if (!data.noteId) return { ok: false, status: 400, error: "noteId is required" };
    if (!data.content || typeof data.content !== "string" || !data.content.trim()) {
      return { ok: false, status: 400, error: "Comment content is required" };
    }
    if (!data.quote || typeof data.quote !== "string" || !data.quote.trim()) {
      return { ok: false, status: 400, error: "quote (anchored text) is required" };
    }

    const access = await NoteService.getReadableNote(userId, data.noteId);
    if (!access.ok) return { ok: false, status: access.status, error: access.error };
    const note = access.note as {
      id: string;
      title: string;
      shortIdNum: number;
      projectId: string | null;
      ownerId: string;
    };

    const comment = await db.noteComment.create({
      data: {
        noteId: data.noteId,
        quote: data.quote,
        prefix: data.prefix ?? "",
        suffix: data.suffix ?? "",
        offset: typeof data.offset === "number" ? Math.max(0, Math.floor(data.offset)) : 0,
        content: data.content.trim(),
        ownerId: userId,
      },
      include: {
        owner: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    const areaId = await resolveTaskAreaId(note.projectId);
    void fireWebhookEvent(
      buildNoteCommentContext(note, "note.comment_created", areaId, {
        comment: comment.content,
        authorName: (comment.owner as { name?: string | null })?.name ?? undefined,
      }),
    );

    return { ok: true, data: serializeComment(comment) };
  },

  async updateNoteComment(
    userId: string,
    id: string,
    data: UpdateNoteCommentData,
  ): Promise<ServiceResult<Record<string, unknown>>> {
    if (!userId) return { ok: false, status: 401, error: "Authentication required" };

    const existing = await db.noteComment.findUnique({ where: { id } });
    if (!existing) return { ok: false, status: 404, error: "Comment not found" };

    const access = await NoteService.getReadableNote(userId, existing.noteId);
    if (!access.ok) return { ok: false, status: access.status, error: access.error };
    const note = access.note as {
      id: string;
      title: string;
      shortIdNum: number;
      projectId: string | null;
      ownerId: string;
    };

    if (!canManageNoteComment(userId, existing, note)) {
      return { ok: false, status: 403, error: "Not allowed to edit this comment" };
    }

    const updateData: Record<string, unknown> = {};
    if (data.content !== undefined) {
      if (!data.content.trim()) return { ok: false, status: 400, error: "Comment content is required" };
      updateData.content = data.content.trim();
    }
    if (data.resolved !== undefined) updateData.resolved = !!data.resolved;
    if (data.quote !== undefined) {
      if (!data.quote.trim()) return { ok: false, status: 400, error: "quote (anchored text) is required" };
      updateData.quote = data.quote;
    }
    if (data.prefix !== undefined) updateData.prefix = data.prefix;
    if (data.suffix !== undefined) updateData.suffix = data.suffix;
    if (data.offset !== undefined) {
      updateData.offset = typeof data.offset === "number" ? Math.max(0, Math.floor(data.offset)) : 0;
    }

    const comment = await db.noteComment.update({
      where: { id },
      data: updateData,
      include: {
        owner: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    // Requirement 3: notify the note owner when a comment is resolved.
    if (data.resolved !== undefined && data.resolved !== existing.resolved) {
      const areaId = await resolveTaskAreaId(note.projectId);
      void fireWebhookEvent(
        buildNoteCommentContext(note, "note.comment_resolved", areaId, {
          resolved: { from: existing.resolved, to: comment.resolved },
          comment: comment.content,
        }),
      );
    }

    return { ok: true, data: serializeComment(comment) };
  },

  async deleteNoteComment(userId: string, id: string): Promise<ServiceResult<{ success: boolean }>> {
    if (!userId) return { ok: false, status: 401, error: "Authentication required" };

    const existing = await db.noteComment.findUnique({ where: { id } });
    if (!existing) return { ok: false, status: 404, error: "Comment not found" };

    const access = await NoteService.getReadableNote(userId, existing.noteId);
    if (!access.ok) return { ok: false, status: access.status, error: access.error };
    const note = access.note as {
      id: string;
      title: string;
      shortIdNum: number;
      projectId: string | null;
      ownerId: string;
    };

    if (!canManageNoteComment(userId, existing, note)) {
      return { ok: false, status: 403, error: "Not allowed to delete this comment" };
    }

    await db.noteComment.delete({ where: { id } });

    void fireWebhookEvent(
      buildNoteCommentContext(note, "note.comment_deleted", await resolveTaskAreaId(note.projectId), {
        comment: existing.content,
      }),
    );

    return { ok: true, data: { success: true } };
  },
};
