'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  MessageSquare,
  X,
  Save,
  Loader2,
  CheckCircle2,
  Circle,
  Trash2,
  ChevronRight,
  Unlink,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAppStore, useIsGuest } from '@/store/app-store';
import { api } from '@/lib/api-utils';
import {
  resolveAnchor,
  createAnchor,
  locateSelectionInContent,
  locateRangeInRendered,
  type NoteCommentAnchor,
} from '@/lib/note-anchors';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface NoteCommentData extends NoteCommentAnchor {
  id: string;
  noteId: string;
  prefix: string;
  suffix: string;
  offset: number;
  content: string;
  resolved: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner?: { id: string; name?: string | null; email?: string | null; image?: null | string };
}

interface NoteInlineCommentsProps {
  noteId: string;
  noteOwnerId: string;
  content: string;
  /** Preview DOM is mounted (View or Split mode) — gutter + selection are active. */
  active: boolean;
  /** Authenticated (non-guest) user — selection "add comment" button. */
  allowCreate: boolean;
  /**
   * Change of this value (e.g. editor mode View↔Split) remounts the preview
   * DOM; triggers a re-sync of highlights/clouds onto the new container.
   */
  syncKey?: string | number;
}

/** Small speech-bubble SVG for DOM-injected clouds (no React there). */
const BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/></svg>`;

/** Cloud styles for a group with ≥1 unresolved (amber) vs all-resolved (muted) comment. */
const CLOUD_OPEN_CLS =
  'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200 dark:bg-amber-900/60 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900';
const CLOUD_RESOLVED_CLS =
  'bg-muted text-muted-foreground border-border opacity-70 hover:opacity-100';

const HL_BASE_CLS = 'nc-highlight';
const HL_RESOLVED_CLS = 'nc-resolved';

/** Highlight + cloud styles (injected once; supports dark theme via .dark). */
const ANNOTATION_STYLES = `
.nc-highlight {
  background-color: rgb(251 191 36 / 0.28);
  border-radius: 3px;
  cursor: pointer;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
.nc-highlight.${HL_RESOLVED_CLS} { background-color: rgb(148 163 184 / 0.18); }
.dark .nc-highlight { background-color: rgb(251 191 36 / 0.18); }
.dark .nc-highlight.${HL_RESOLVED_CLS} { background-color: rgb(148 163 184 / 0.12); }
.nc-cloud { box-shadow: 0 1px 2px rgb(0 0 0 / 0.08); }
.nc-cloud-count {
  position: absolute;
  top: -5px;
  right: -6px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 9999px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  font-size: 9px;
  font-weight: 600;
  line-height: 14px;
  text-align: center;
}
/* Comments panel open: shift the note content container left so the panel
   never covers the text — context around anchored quotes stays visible.
   Narrow screens keep the old overlay behavior (panel is max-w-full there). */
@media (min-width: 768px) {
  body.nc-panel-open [data-note-preview] { margin-right: 380px; }
}
`;

/**
 * True when a preview container has rendered prose and cloud badges but no
 * highlight spans — i.e. React replaced the markdown subtree and dropped the
 * injected highlights (they live outside React's virtual DOM).
 */
function isHighlightsWiped(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-note-preview]')).some(
    (c) =>
      c.querySelector('[data-note-prose]') &&
      !c.querySelector(`.${HL_BASE_CLS}`) &&
      c.querySelector('[data-nc-ids]'),
  );
}

interface SegmentedText {
  full: string;
  segs: { node: Text; start: number; end: number }[];
}

/** Concatenated visible text of the note prose with per-node offsets. */
function collectRenderedText(root: Element): SegmentedText {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const segs: SegmentedText['segs'] = [];
  let full = '';
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (!parent) continue;
    if (parent.tagName === 'STYLE' || parent.tagName === 'SCRIPT') continue;
    if (parent.closest('.nc-cloud')) continue;
    const text = node.textContent ?? '';
    segs.push({ node, start: full.length, end: full.length + text.length });
    full += text;
  }
  return { full, segs };
}

/** Translate a DOM Range into offsets within `segs`' concatenated text. */
function selectionInSegments(segs: SegmentedText['segs'], range: Range) {
  let start = -1;
  let end = -1;
  for (const seg of segs) {
    if (seg.node === range.startContainer) start = seg.start + range.startOffset;
    if (seg.node === range.endContainer) end = seg.start + range.endOffset;
  }
  if (start === -1 || end === -1 || end < start) return null;
  return { start, end };
}

/** Remove highlight spans, restoring their text (merged back into one node). */
function unwrapHighlights(container: HTMLElement) {
  const spans = Array.from(container.querySelectorAll<HTMLElement>(`.${HL_BASE_CLS}`));
  for (const span of spans) {
    const parent = span.parentNode;
    if (!parent) continue;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    span.remove();
  }
  container.normalize();
}

/**
 * Inline note comments (T-190): selection → right-side form, highlighted
 * anchors with cloud badges in a right-hand gutter column (grouped per line
 * with a counter), resolve/delete, show-resolved toggle. Comments are
 * anchored to the note text via src/lib/note-anchors.ts (fuzzy re-anchoring
 * after edits). A comment whose anchored text was deleted from the note is
 * kept (not deleted) and marked as unanchored in the comments list.
 */
export function NoteInlineComments({
  noteId,
  noteOwnerId,
  content,
  active,
  allowCreate,
  syncKey,
}: NoteInlineCommentsProps) {
  const currentUserId = useAppStore((s) => s.currentUserId);
  const isGuest = useIsGuest();

  const [comments, setComments] = useState<NoteCommentData[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [groupIds, setGroupIds] = useState<string[] | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [draft, setDraft] = useState<{ anchor: NoteCommentAnchor; text: string } | null>(null);
  const [editText, setEditText] = useState('');
  const [btnPos, setBtnPos] = useState<{ top: number; left: number } | null>(null);
  const pendingSelectionRef = useRef<{
    rendered: string;
    start: number;
    end: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Annotation bookkeeping (DOM outside React — plain refs, no re-renders).
  const injectingRef = useRef(false);
  const lastSyncRef = useRef(0);
  const scheduledRef = useRef(false);
  const syncRef = useRef<() => void>(() => {});
  const sigRef = useRef<Map<HTMLElement, string>>(new Map());
  const observersRef = useRef<Map<HTMLElement, MutationObserver>>(new Map());
  // Anchor self-heal: pending offset updates, flushed in one debounced batch.
  const reanchorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reanchorPendingRef = useRef<Map<string, { offset: number }>>(new Map());
  // Last seen note content — lets an incoming edit be located precisely.
  const lastContentRef = useRef<string | null>(null);

  const activeComment = comments.find((c) => c.id === activeCommentId) ?? null;

  // Flush pending anchor offset updates to the API (one PUT per comment) and
  // merge them into local state so the next sync sees fresh offsets.
  const flushReanchor = useCallback(() => {
    if (reanchorTimerRef.current) {
      clearTimeout(reanchorTimerRef.current);
      reanchorTimerRef.current = null;
    }
    const pending = Array.from(reanchorPendingRef.current.entries());
    reanchorPendingRef.current.clear();
    if (pending.length === 0) return;
    void (async () => {
      for (const [id, anchor] of pending) {
        try {
          const res = await fetch(api(`/api/note-comments/${id}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(anchor),
          });
          if (!res.ok) continue;
          setComments((prev) => prev.map((c) => (c.id === id ? { ...c, offset: anchor.offset } : c)));
        } catch {
          // Network failure: the next resolution will re-schedule the update.
        }
      }
    })();
  }, []);

  const scheduleReanchorFlush = useCallback(() => {
    if (reanchorTimerRef.current) return;
    reanchorTimerRef.current = setTimeout(flushReanchor, 1000);
  }, [flushReanchor]);

  // --- data loading -------------------------------------------------------
  const refetch = useCallback(async () => {
    if (!noteId) return;
    try {
      const res = await fetch(api(`/api/note-comments?noteId=${encodeURIComponent(noteId)}`));
      if (res.ok) {
        const list = await res.json();
        setComments(Array.isArray(list) ? (list as NoteCommentData[]) : []);
      }
    } catch (error) {
      console.error('Failed to load note comments:', error);
    }
  }, [noteId]);

  useEffect(() => {
    setComments([]);
    setActiveCommentId(null);
    setGroupIds(null);
    setListOpen(false);
    setDraft(null);
    setShowResolved(false);
    void refetch();
  }, [noteId, refetch]);

  const openComments = useCallback(
    (ids: string[]) => {
      if (ids.length === 1) {
        const c = comments.find((x) => x.id === ids[0]);
        if (!c) return;
        setGroupIds(null);
        setListOpen(false);
        setActiveCommentId(c.id);
        setEditText(c.content);
      } else {
        setActiveCommentId(null);
        setGroupIds(ids);
        setListOpen(true);
      }
    },
    [comments],
  );

  // --- annotation sync (highlights + gutter clouds) -----------------------
  const syncContainer = useCallback(
    (container: HTMLElement) => {
      const gutter = container.querySelector<HTMLElement>('[data-note-gutter]');
      const prose = container.querySelector('[data-note-prose]');

      // Resolve every visible comment against the current content; a comment
      // whose text is gone resolves to null (unanchored → no highlight/cloud).
      const targets = comments
        .filter((c) => showResolved || !c.resolved)
        .map((c) => ({ c, t: resolveAnchor(content, c) }))
        .filter((x): x is { c: NoteCommentData; t: NonNullable<ReturnType<typeof resolveAnchor>> } => !!x.t)
        .sort((a, b) => a.t.start - b.t.start);

      // Self-heal anchors: after a content edit the stored offset hint goes
      // stale (text shifts), and proximity tie-breaking then binds the
      // comment to a wrong occurrence and drifts further on every next edit.
      // Persist the freshly resolved position + fresh context so the hint
      // keeps tracking the text. Debounced, batched, permission-checked.
      let reanchorDirty = false;
      for (const x of targets) {
        if (x.t.start === x.c.offset) continue;
        if (!canResolveOrDelete(x.c)) continue;
        // Persist ONLY the offset hint. quote/prefix/suffix stay frozen at
        // their creation-time values: they are the anchor's identity, and the
        // long prefix context is what pulls the comment back to its original
        // spot if an edit (or our own proximity guess) temporarily moved it.
        // Rebinding the context itself would make any wrong guess permanent.
        reanchorPendingRef.current.set(x.c.id, { offset: x.t.start });
        reanchorDirty = true;
      }
      if (reanchorDirty) scheduleReanchorFlush();

      // Highlights: rebuild only when the structure changed or the DOM lost
      // them (React replaced the markdown subtree); otherwise just update
      // resolved classes in place (no text mutation → no flicker).
      const sig = JSON.stringify({
        k: content.length,
        t: targets.map((x) => [x.c.id, x.t.start, x.t.end]),
      });
      const spansPresent =
        targets.every((x) => container.querySelector(`[data-nc-ids~="${x.c.id}"]`)) &&
        (targets.length === 0 || container.querySelectorAll(`.${HL_BASE_CLS}`).length > 0);

      if (sig !== sigRef.current.get(container) || !spansPresent) {
        sigRef.current.set(container, sig);
        if (prose) {
          unwrapHighlights(container);
          const { full, segs } = collectRenderedText(prose);
          // Merge overlapping source ranges → one span, ids joined.
          type Piece = { start: number; end: number; ids: string[]; resolved: boolean };
          const pieces: Piece[] = [];
          // Monotonic hint: rendered position of each quote is interpolated
          // from the previously placed one (comments are sorted by start).
          let prevSrc = 0;
          let prevRend = 0;
          const scale = full.length / Math.max(1, content.length);
          for (const x of targets) {
            const hint = Math.round(prevRend + (x.t.start - prevSrc) * scale);
            const pos = locateRangeInRendered(content, full, x.t.start, x.t.end, hint);
            if (!pos) continue;
            const resolved = x.c.resolved;
            const last = pieces[pieces.length - 1];
            if (last && pos.start < last.end) {
              // Overlapping/adjacent anchor: extend the existing piece.
              last.end = Math.max(last.end, pos.end);
              if (!last.ids.includes(x.c.id)) last.ids.push(x.c.id);
              last.resolved = last.resolved && resolved;
            } else {
              pieces.push({ start: pos.start, end: pos.end, ids: [x.c.id], resolved });
            }
            prevSrc = x.t.start;
            prevRend = pos.start;
          }

          // Wrap in a single left-to-right pass; within a text node, splits
          // are applied right-to-left so earlier offsets stay valid.
          const bySeg = new Map<Text, Piece[]>();
          for (const p of pieces) {
            for (const seg of segs) {
              if (p.start < seg.end && p.end > seg.start) {
                const arr = bySeg.get(seg.node) ?? [];
                arr.push({
                  start: Math.max(0, p.start - seg.start),
                  end: Math.min(seg.node.length, p.end - seg.start),
                  ids: p.ids,
                  resolved: p.resolved,
                });
                bySeg.set(seg.node, arr);
              }
            }
          }
          for (const [node, slices] of bySeg) {
            slices.sort((a, b) => b.start - a.start); // right-to-left
            for (const s of slices) {
              if (s.end <= s.start) continue;
              let mid: Text = node;
              if (s.end < mid.length) mid.splitText(s.end);
              if (s.start > 0) mid = mid.splitText(s.start);
              const span = document.createElement('span');
              span.className = HL_BASE_CLS + (s.resolved ? ` ${HL_RESOLVED_CLS}` : '');
              span.dataset.ncIds = s.ids.join(' ');
              span.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openComments(s.ids);
              });
              mid.parentNode?.insertBefore(span, mid);
              span.appendChild(mid);
            }
          }
        }
      } else {
        // Structure unchanged — toggle resolved styling in place.
        for (const x of targets) {
          container.querySelectorAll(`[data-nc-ids~="${x.c.id}"]`).forEach((el) => {
            el.classList.toggle(HL_RESOLVED_CLS, x.c.resolved);
          });
        }
      }

      // Clouds: cheap to rebuild (gutter only, never touches text).
      if (gutter) {
        gutter.replaceChildren();
        const gRect = gutter.getBoundingClientRect();
        const items: { top: number; c: NoteCommentData }[] = [];
        for (const x of targets) {
          const el = container.querySelector(`[data-nc-ids~="${x.c.id}"]`);
          if (!el) continue;
          items.push({ top: el.getBoundingClientRect().top - gRect.top, c: x.c });
        }
        items.sort((a, b) => a.top - b.top);
        const groups: { top: number; items: NoteCommentData[] }[] = [];
        for (const it of items) {
          const g = groups[groups.length - 1];
          // Same visual line → one cloud with a counter.
          if (g && it.top - g.top <= 16) g.items.push(it.c);
          else groups.push({ top: it.top, items: [it.c] });
        }
        for (const g of groups) {
          const anyOpen = g.items.some((c) => !c.resolved);
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.dataset.ncIds = g.items.map((c) => c.id).join(' ');
          btn.className = `nc-cloud absolute flex items-center justify-center h-5 w-5 rounded-full border transition-colors ${anyOpen ? CLOUD_OPEN_CLS : CLOUD_RESOLVED_CLS}`;
          btn.style.top = `${Math.max(0, g.top - 2)}px`;
          btn.style.left = '10px';
          btn.innerHTML =
            BADGE_SVG +
            (g.items.length > 1 ? `<span class="nc-cloud-count">${g.items.length}</span>` : '');
          const ids = g.items.map((c) => c.id);
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openComments(ids);
          });
          gutter.appendChild(btn);
        }
      }

      // Watch the container (not document.body): React re-renders of the
      // markdown subtree drop injected spans → re-sync. Our own mutations
      // are suppressed via injectingRef + lastSyncRef.
      let mo = observersRef.current.get(container);
      if (!mo) {
        mo = new MutationObserver(() => {
          if (injectingRef.current) return;
          if (Date.now() - lastSyncRef.current < 250) {
            // Usually our own injection, but a React re-commit (e.g. typing
            // in split mode) may have wiped the highlights — recover at once
            // instead of waiting out the suppression window.
            if (isHighlightsWiped()) scheduleSync();
            return;
          }
          scheduleSync();
        });
        mo.observe(container, { childList: true, subtree: true });
        observersRef.current.set(container, mo);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comments, showResolved, content, openComments],
  );

  const cleanupAll = useCallback(() => {
    const containers = Array.from(document.querySelectorAll<HTMLElement>('[data-note-preview]'));
    containers.forEach((c) => {
      unwrapHighlights(c);
      c.querySelectorAll('[data-note-gutter]').forEach((g) => g.replaceChildren());
    });
    sigRef.current.clear();
  }, []);

  // Precise edit tracking: diff the previous content against the new one
  // (longest common prefix/suffix → the edited region and its length delta).
  // A comment whose anchored range lies entirely outside the edited region
  // shifts deterministically — even inside a repetitive "wall", where
  // content heuristics cannot tell one occurrence from another. A comment
  // the edit touches is left to resolveAnchor, which reports it unanchored
  // when its original spot can no longer be proven (never rebound).
  const applyEditDiff = useCallback(
    (prev: string, next: string) => {
      if (prev === next) return;
      const minLen = Math.min(prev.length, next.length);
      let p = 0;
      while (p < minLen && prev[p] === next[p]) p += 1;
      let s = 0;
      while (s < minLen - p && prev[prev.length - 1 - s] === next[next.length - 1 - s]) s += 1;
      const delta = next.length - prev.length;
      const editEnd = prev.length - s; // edited region in prev coords: [p, editEnd)
      const shiftedComments: NoteCommentData[] = [];
      const updated = comments.map((c) => {
        if (c.resolved) return c;
        const aStart = c.offset ?? 0;
        const aEnd = aStart + (c.quote?.length ?? 0);
        if (aEnd <= p) return c; // edit entirely after the anchor — no move
        if (aStart >= editEnd) {
          // Edit entirely before the anchor — follow the shift exactly.
          const shifted = { ...c, offset: aStart + delta };
          shiftedComments.push(shifted);
          return shifted;
        }
        return c; // edit touches the anchor — the resolver judges it
      });
      setComments(updated);
      // Persist the shifted hints (debounced) so a reload stays consistent.
      let dirty = false;
      for (const c of shiftedComments) {
        if (!canResolveOrDelete(c)) continue;
        reanchorPendingRef.current.set(c.id, { offset: c.offset ?? 0 });
        dirty = true;
      }
      if (dirty) scheduleReanchorFlush();
    },
    [comments, scheduleReanchorFlush],
  );

  const syncAll = useCallback(() => {
    injectingRef.current = true;
    lastSyncRef.current = Date.now();
    try {
      // On a content change, locate the edit precisely first and shift
      // untouched anchors before resolving (see applyEditDiff). The current
      // pass still uses the pre-shift offsets; the state update triggers a
      // re-sync that lands the highlights on the shifted positions.
      const lastContent = lastContentRef.current;
      if (lastContent !== content) {
        lastContentRef.current = content;
        if (lastContent !== null) applyEditDiff(lastContent, content);
      }
      const containers = Array.from(
        document.querySelectorAll<HTMLElement>('[data-note-preview]'),
      );
      // Drop observers for containers that no longer exist (mode switch).
      for (const [el, mo] of observersRef.current) {
        if (!el.isConnected || !containers.includes(el)) {
          mo.disconnect();
          observersRef.current.delete(el);
          sigRef.current.delete(el);
        }
      }
      if (!active) {
        cleanupAll();
        return;
      }
      containers.forEach(syncContainer);
      // React may replace the markdown subtree right after this sync (inside
      // the observer's suppression window) and wipe the highlights. Watch a
      // few animation frames and recover immediately; stops once the
      // highlights stick (isHighlightsWiped distinguishes "wiped" from
      // "nothing to highlight" via the clouds, which survive re-commits).
      let frames = 0;
      const verify = () => {
        if (!active) return;
        if (isHighlightsWiped()) {
          syncRef.current();
          return;
        }
        frames += 1;
        if (frames < 20) requestAnimationFrame(verify);
      };
      requestAnimationFrame(verify);
    } finally {
      injectingRef.current = false;
    }
  }, [active, cleanupAll, syncContainer, applyEditDiff, content]);

  syncRef.current = syncAll;

  const scheduleSync = useCallback(() => {
    if (scheduledRef.current) return;
    scheduledRef.current = true;
    setTimeout(() => {
      scheduledRef.current = false;
      syncRef.current();
    }, 60);
  }, []);

  useEffect(() => {
    // Let react-markdown commit its DOM first. syncKey covers preview-DOM
    // remounts (editor mode switch) that don't change syncAll's identity.
    const t = setTimeout(syncAll, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncAll, noteId, syncKey]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      observersRef.current.forEach((mo) => mo.disconnect());
      observersRef.current.clear();
      if (reanchorTimerRef.current) clearTimeout(reanchorTimerRef.current);
    };
  }, []);

  // Inject annotation styles once.
  useEffect(() => {
    if (document.getElementById('note-inline-comments-styles')) return;
    const style = document.createElement('style');
    style.id = 'note-inline-comments-styles';
    style.textContent = ANNOTATION_STYLES;
    document.head.appendChild(style);
  }, []);

  const panelOpen = !!draft || !!activeCommentId || listOpen;

  // Panel open/close: body class shifts [data-note-preview] left (see
  // ANNOTATION_STYLES) so the panel doesn't cover the text. The reflow moves
  // cloud/highlight positions, which no MutationObserver sees — re-sync.
  useEffect(() => {
    document.body.classList.toggle('nc-panel-open', panelOpen);
    if (panelOpen) scheduleSync();
    return () => document.body.classList.remove('nc-panel-open');
  }, [panelOpen, scheduleSync]);

  // --- selection → floating "add comment" button ---------------------------
  useEffect(() => {
    if (!active || !allowCreate) {
      setBtnPos(null);
      return;
    }
    const handleMouseUp = () => {
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        const text = sel.toString();
        if (!text.trim()) return;
        const range = sel.getRangeAt(0);
        const anchorEl =
          range.commonAncestorContainer.nodeType === Node.TEXT_NODE
            ? range.commonAncestorContainer.parentElement
            : (range.commonAncestorContainer as Element);
        const container = anchorEl?.closest('[data-note-preview]');
        const prose = container?.querySelector('[data-note-prose]');
        if (!container || !prose || !prose.contains(range.commonAncestorContainer)) return;
        // Record the selection's exact position in rendered-text
        // coordinates (not just its text) so the anchor lands where the
        // user selected, not at the first identical occurrence.
        const { full, segs } = collectRenderedText(prose);
        const pos = selectionInSegments(segs, range);
        if (!pos) return;
        pendingSelectionRef.current = { rendered: full, start: pos.start, end: pos.end };
        const rect = range.getBoundingClientRect();
        setBtnPos({ top: Math.max(8, rect.top - 38), left: rect.left + rect.width / 2 });
      }, 0);
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [active, allowCreate]);

  // Hide the floating button as soon as the selection moves/collapses.
  useEffect(() => {
    if (!btnPos) return;
    const hide = () => {
      pendingSelectionRef.current = null;
      setBtnPos(null);
    };
    document.addEventListener('selectionchange', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('selectionchange', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, [btnPos]);

  const startCreate = () => {
    const pending = pendingSelectionRef.current;
    pendingSelectionRef.current = null;
    setBtnPos(null);
    if (!pending) return;
    const target = locateSelectionInContent(content, pending.rendered, pending.start, pending.end);
    if (!target) {
      toast.error('Could not anchor the selection to the note text');
      return;
    }
    const anchor = createAnchor(content, target.start, target.end);
    setDraft({ anchor, text: '' });
  };

  // --- mutations -----------------------------------------------------------
  const saveDraft = async () => {
    if (!draft || !draft.text.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(api('/api/note-comments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteId,
          quote: draft.anchor.quote,
          prefix: draft.anchor.prefix ?? '',
          suffix: draft.anchor.suffix ?? '',
          offset: draft.anchor.offset ?? 0,
          content: draft.text.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Failed (${res.status})`);
      }
      setDraft(null);
      await refetch();
      toast.success('Comment added');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add comment');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!activeComment || saving) return;
    if (editText.trim() === activeComment.content) return;
    setSaving(true);
    try {
      const res = await fetch(api(`/api/note-comments/${activeComment.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editText.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Failed (${res.status})`);
      }
      await refetch();
      toast.success('Comment saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save comment');
    } finally {
      setSaving(false);
    }
  };

  const toggleResolved = async (c: NoteCommentData) => {
    // Optimistic: flip locally so highlight/clouds update instantly; the
    // request reconciles in the background.
    setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, resolved: !c.resolved } : x)));
    try {
      const res = await fetch(api(`/api/note-comments/${c.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: !c.resolved }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Failed (${res.status})`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update comment');
      await refetch();
    }
  };

  const deleteComment = async (id: string) => {
    try {
      const res = await fetch(api(`/api/note-comments/${id}`), { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Failed (${res.status})`);
      }
      if (activeCommentId === id) setActiveCommentId(null);
      setGroupIds((prev) => (prev ? prev.filter((x) => x !== id) : prev));
      await refetch();
      toast.success('Comment deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete comment');
    }
  };

  // Server rule (mirrored): edit text = author; resolve/delete = author or note owner.
  // Guests are read-only. Server enforces the same and answers 403 otherwise.
  const canEdit = (c: NoteCommentData) => !isGuest && !!currentUserId && c.ownerId === currentUserId;
  const canResolveOrDelete = (c: NoteCommentData) =>
    !isGuest &&
    !!currentUserId &&
    (c.ownerId === currentUserId || noteOwnerId === currentUserId);

  // A comment is "unanchored" when its quoted text no longer exists in the
  // note (resolveAnchor returns null only then). Such comments are kept, not
  // deleted, and shown with a marker in the list and detail view.
  const isUnanchored = useCallback((c: NoteCommentData) => !resolveAnchor(content, c), [content]);

  const visibleComments = comments.filter((c) => showResolved || !c.resolved);
  const listedComments = groupIds
    ? visibleComments.filter((c) => groupIds.includes(c.id))
    : visibleComments;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Floating "add comment" button near the selection */}
      {btnPos && (
        <button
          type="button"
          className="fixed z-[65] inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium shadow-md hover:bg-muted transition-colors"
          style={{ top: btnPos.top, left: btnPos.left, transform: 'translateX(-50%)' }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={startCreate}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Comment
        </button>
      )}

      {/* Entry point into the comments panel: without it the list (and the
          "Show resolved" toggle) is unreachable once all clouds are hidden. */}
      {active && comments.length > 0 && !panelOpen && !btnPos && (
        <button
          type="button"
          className="fixed top-14 right-4 z-[55] inline-flex items-center gap-1.5 rounded-full border bg-background/95 px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur hover:bg-muted transition-colors"
          onClick={() => setListOpen(true)}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {comments.filter((c) => !c.resolved).length || comments.length}
        </button>
      )}

      {/* Right-side panel. The note content container is shifted left via
          body.nc-panel-open (see ANNOTATION_STYLES) so the panel never covers
          the text — the context around the anchored quote stays visible. */}
      {panelOpen && (
        <div data-nc-panel="" className="fixed inset-y-0 right-0 z-[60] w-[380px] max-w-full border-l bg-background shadow-2xl flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b shrink-0">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{draft ? 'Add comment' : 'Comments'}</span>
            {!draft && (
              <div className="flex items-center gap-1.5 ml-auto mr-1">
                <Switch
                  id="show-resolved"
                  checked={showResolved}
                  onCheckedChange={setShowResolved}
                  className="scale-90"
                />
                <Label
                  htmlFor="show-resolved"
                  className="text-[11px] text-muted-foreground cursor-pointer"
                >
                  Show resolved
                </Label>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => {
                setDraft(null);
                setActiveCommentId(null);
                setGroupIds(null);
                setListOpen(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-3">
            {/* Create form */}
            {draft && (
              <div className="space-y-2">
                <div className="rounded-md border-l-2 border-amber-400 bg-amber-500/5 px-2.5 py-1.5 text-xs text-muted-foreground line-clamp-3">
                  {draft.anchor.quote}
                </div>
                <Textarea
                  value={draft.text}
                  onChange={(e) => setDraft((d) => (d ? { ...d, text: e.target.value } : d))}
                  placeholder="Write a comment..."
                  className="min-h-[120px] text-sm"
                  autoFocus
                />
                <div className="flex items-center gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void saveDraft()}
                    disabled={!draft.text.trim() || saving}
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <MessageSquare className="h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            )}

            {/* Single comment view */}
            {!draft && activeComment && (
              <div className="space-y-2">
                {isUnanchored(activeComment) ? (
                  <div className="flex items-center gap-1.5 rounded-md border-l-2 border-destructive/50 bg-destructive/5 px-2.5 py-1.5 text-xs text-muted-foreground">
                    <Unlink className="h-3.5 w-3.5 shrink-0 text-destructive/70" />
                    Anchored text was removed from the note
                  </div>
                ) : (
                  <div className="rounded-md border-l-2 border-amber-400 bg-amber-500/5 px-2.5 py-1.5 text-xs text-muted-foreground line-clamp-3">
                    {activeComment.quote}
                  </div>
                )}
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {activeComment.owner?.name || activeComment.owner?.email || 'Unknown'}
                  </span>
                  <span>
                    {formatDistanceToNow(new Date(activeComment.createdAt), { addSuffix: true })}
                  </span>
                  {activeComment.resolved && (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Resolved
                    </span>
                  )}
                </div>
                {canEdit(activeComment) ? (
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="min-h-[100px] text-sm"
                  />
                ) : (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">
                    {activeComment.content}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 justify-end">
                  {canResolveOrDelete(activeComment) && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          'gap-1.5',
                          activeComment.resolved && 'text-emerald-600 dark:text-emerald-400',
                        )}
                        onClick={() => void toggleResolved(activeComment)}
                      >
                        {activeComment.resolved ? (
                          <Circle className="h-3.5 w-3.5" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        {activeComment.resolved ? 'Unresolve' : 'Resolve'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-destructive hover:text-destructive"
                        onClick={() => setConfirmDeleteId(activeComment.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </>
                  )}
                  {canEdit(activeComment) && editText.trim() !== activeComment.content && (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => void saveEdit()}
                      disabled={saving}
                    >
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Comments list (panel opened without a specific comment) */}
            {!draft && !activeComment && (
              <div className="space-y-1.5">
                {listedComments.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    {comments.length === 0 ? 'No inline comments yet.' : 'All comments are resolved.'}
                  </p>
                )}
                {listedComments.map((c) => {
                  const unanchored = isUnanchored(c);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left rounded-md border px-2.5 py-2 hover:bg-muted/50 transition-colors space-y-1"
                      onClick={() => {
                        setActiveCommentId(c.id);
                        setEditText(c.content);
                      }}
                    >
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span
                          className={cn(
                            'inline-flex items-center justify-center h-3.5 w-3.5 rounded-full border shrink-0',
                            c.resolved
                              ? 'bg-muted text-muted-foreground border-border'
                              : 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700',
                          )}
                        >
                          <MessageSquare className="h-2 w-2" />
                        </span>
                        <span className="font-medium text-foreground truncate">
                          {c.owner?.name || c.owner?.email || 'Unknown'}
                        </span>
                        {c.resolved && (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                        )}
                        {unanchored && (
                          <span className="inline-flex items-center gap-0.5 shrink-0 text-destructive/80">
                            <Unlink className="h-3 w-3" />
                            Unanchored
                          </span>
                        )}
                        <span className="truncate">
                          {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                        </span>
                        <ChevronRight className="h-3 w-3 ml-auto shrink-0" />
                      </div>
                      <p className="text-xs line-clamp-2">{c.content}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete comment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this inline comment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteId) void deleteComment(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>,
    document.body,
  );
}
