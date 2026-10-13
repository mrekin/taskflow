import { db } from "@/lib/db";
import { sanitizeUserProfile, getIgnoredUserIds } from "@/lib/visibility";
import { AreaService } from "./area.service";
import { ProjectService } from "./project.service";
import { TaskService } from "./task.service";
import { NoteService } from "./note.service";
import { FolderService } from "./folder.service";
import { ReleaseService } from "./release.service";
import { TagService } from "./tag.service";
import { canReadTaskComments } from "./comment.service";

/** Per-type cap on changed entities; exceeding it flips `truncated` (client full-refetches). */
const CHANGED_CAP = 200;

export type SyncEntity = Record<string, unknown>;

/**
 * The client's current list views. `changed` is always reported globally
 * (the store replaces rows by id), but `allIds` is computed per view so the
 * client's deletion diff matches exactly what it should currently hold.
 */
export interface SyncViewScope {
  taskProjectId?: string;
  taskSearch?: string;
  noteProjectId?: string;
  folderProjectId?: string;
  projectAreaId?: string;
}

export interface SyncOptions {
  since: Date;
  /** API-token project scope (already intersected with the user's visible projects). */
  restrictProjectIds?: string[];
  /** Open task dialog: report whether its comments changed since `since`. */
  commentTaskId?: string;
  viewScope?: SyncViewScope;
}

export interface SyncPayload {
  /** Server clock captured before the queries — the only watermark clients may advance. */
  serverTime: string;
  truncated: boolean;
  changed: {
    areas: SyncEntity[];
    projects: SyncEntity[];
    tasks: SyncEntity[];
    notes: SyncEntity[];
    folders: SyncEntity[];
    releases: SyncEntity[];
    tags: SyncEntity[];
    users: Array<{ id: string; name: string | null; image: string | null }>;
  };
  /** Full visible id sets per type (per `viewScope`) — the client diffs these to detect deletions. */
  allIds: {
    areas: string[];
    projects: string[];
    tasks: string[];
    notes: string[];
    folders: string[];
    releases: string[];
    tags: string[];
  };
  openTask?: { commentsChanged: boolean };
}

function scopeClauses(restrictProjectIds?: string[]): Record<string, unknown>[] {
  return restrictProjectIds ? [{ projectId: { in: restrictProjectIds } }] : [];
}

const idsOf = (rows: Array<{ id?: string }>): string[] =>
  rows.map((r) => r.id as string);

export const SyncService = {
  async getChanges(userId: string | null, opts: SyncOptions): Promise<SyncPayload> {
    const serverTime = new Date().toISOString();
    const { since } = opts;
    const restricted = opts.restrictProjectIds ? { restrictProjectIds: opts.restrictProjectIds } : undefined;
    const scope = opts.viewScope ?? {};

    const scopedTasks = !!(scope.taskProjectId || scope.taskSearch);
    const scopedNotes = !!scope.noteProjectId;
    const scopedFolders = !!scope.folderProjectId;
    const scopedProjects = !!scope.projectAreaId;

    // `changed` comes from one unscoped list per type (in-memory updatedAt filter);
    // `allIds` comes from the same list, or a second view-scoped call when the
    // client narrowed its view. Reusing the list services keeps both sets
    // consistent with what fetch* itself would return.
    const [areas, projectChanged, projectAll, tags, taskChanged, taskAll, noteChanged, noteAll, folderChanged, folderAll, releases, changedUsers] =
      await Promise.all([
        AreaService.listAreas(userId),
        ProjectService.listProjects(userId),
        // Areas have no view scope; projects get a scoped id set when the client is inside an area
        scopedProjects ? ProjectService.listProjects(userId, scope.projectAreaId) : ProjectService.listProjects(userId),
        TagService.listTags(userId),
        TaskService.listTasks(userId as string, {}, restricted),
        scopedTasks
          ? TaskService.listTasks(userId as string, { projectId: scope.taskProjectId, search: scope.taskSearch }, restricted)
          : TaskService.listTasks(userId as string, {}, restricted),
        NoteService.listNotes(userId, {}, restricted),
        scopedNotes
          ? NoteService.listNotes(userId, { projectId: scope.noteProjectId }, restricted)
          : NoteService.listNotes(userId, {}, restricted),
        FolderService.listFolders(userId, {}, restricted),
        scopedFolders
          ? FolderService.listFolders(userId, { projectId: scope.folderProjectId }, restricted)
          : FolderService.listFolders(userId, {}, restricted),
        // Releases have no view scope: the client holds the full visible set (sidebar badge)
        ReleaseService.listReleases(userId),
        db.user.findMany({
          where: { updatedAt: { gt: since } },
          select: { id: true, name: true, image: true, email: true, metadata: true },
        }),
      ]);

    const areaAll = areas;

    const changedSince = (item: { updatedAt: Date | string }) => new Date(item.updatedAt).getTime() > since.getTime();

    const changedAreas = (areaAll as unknown as Array<{ updatedAt: Date | string }>).filter(changedSince);
    const changedProjects = (projectChanged as unknown as Array<{ updatedAt: Date | string }>).filter(changedSince);
    const changedTasks = (taskChanged.items as unknown as Array<{ updatedAt: Date | string }>).filter(changedSince);
    const changedNotes = (noteChanged.items as unknown as Array<{ updatedAt: Date | string }>).filter(changedSince);
    const changedFolders = (folderChanged.items as unknown as Array<{ updatedAt: Date | string }>).filter(changedSince);
    const changedReleases = (releases as unknown as Array<{ updatedAt: Date | string }>).filter(changedSince);
    const changedTags = (tags as unknown as Array<{ updatedAt: Date | string }>).filter(changedSince);

    const truncated = [changedAreas, changedProjects, changedTasks, changedNotes, changedFolders, changedReleases, changedTags].some(
      (arr) => arr.length > CHANGED_CAP,
    );
    const capped = <T>(arr: T[]): T[] => (arr.length > CHANGED_CAP ? arr.slice(0, CHANGED_CAP) : arr);

    const users = changedUsers
      .map((u) => sanitizeUserProfile(u))
      .filter((u): u is NonNullable<ReturnType<typeof sanitizeUserProfile>> => u !== null);

    let openTask: SyncPayload["openTask"];
    if (opts.commentTaskId && (await canReadTaskComments(userId, opts.commentTaskId))) {
      const ignoredUserIds = await getIgnoredUserIds(userId);
      const count = await db.comment.count({
        where: {
          taskId: opts.commentTaskId,
          updatedAt: { gt: since },
          ...(ignoredUserIds.length > 0 ? { ownerId: { notIn: ignoredUserIds } } : {}),
        },
      });
      openTask = { commentsChanged: count > 0 };
    }

    return {
      serverTime,
      truncated,
      changed: {
        areas: capped(changedAreas) as unknown as SyncEntity[],
        projects: capped(changedProjects) as unknown as SyncEntity[],
        tasks: capped(changedTasks) as unknown as SyncEntity[],
        notes: capped(changedNotes) as unknown as SyncEntity[],
        folders: capped(changedFolders) as unknown as SyncEntity[],
        releases: capped(changedReleases) as unknown as SyncEntity[],
        tags: capped(changedTags) as unknown as SyncEntity[],
        users,
      },
      allIds: {
        areas: idsOf(areaAll as unknown as Array<{ id: string }>),
        projects: idsOf(projectAll as unknown as Array<{ id: string }>),
        tasks: idsOf(taskAll.items as unknown as Array<{ id: string }>),
        notes: idsOf(noteAll.items as unknown as Array<{ id: string }>),
        folders: idsOf(folderAll.items as unknown as Array<{ id: string }>),
        releases: idsOf(releases as unknown as Array<{ id: string }>),
        tags: idsOf(tags as unknown as Array<{ id: string }>),
      },
      ...(openTask ? { openTask } : {}),
    };
  },
};
