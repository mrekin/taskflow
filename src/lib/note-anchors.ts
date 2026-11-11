/**
 * Text-quote anchoring for inline note comments (T-190).
 *
 * A comment is anchored to the note content by the exact quoted text plus
 * surrounding context (prefix/suffix) and an offset hint. After the note is
 * edited, anchors are re-resolved: exact match first, then a fuzzy match that
 * collapses whitespace and ignores common markdown emphasis markers, so a
 * comment survives any edit that keeps its text (requirement 5). An anchor
 * resolves to null only when the quoted text is genuinely gone.
 *
 * Pure string logic — no DOM — so it can run on both client and server.
 */

export interface NoteCommentAnchor {
  quote: string;
  prefix?: string;
  suffix?: string;
  offset?: number;
}

export interface ResolvedAnchor {
  start: number;
  end: number;
}

/** Chars kept in the markdown source but absent from rendered text. */
const STRIPPED_CHARS = new Set(['*', '_', '~', '`']);

const CONTEXT_LENGTH = 120;

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

/**
 * Build a comparable form of `text`: whitespace collapsed to single spaces,
 * markdown emphasis markers dropped. `map[i]` is the index in the original
 * string that produced `norm[i]` (used to map matches back to source offsets).
 */
export function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  let lastWasSpace = true; // trim leading whitespace
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (STRIPPED_CHARS.has(ch)) continue;
    if (isWhitespace(ch)) {
      if (!lastWasSpace) {
        norm += ' ';
        map.push(i);
        lastWasSpace = true;
      }
    } else {
      norm += ch;
      map.push(i);
      lastWasSpace = false;
    }
  }
  // trim trailing whitespace
  while (norm.length > 0 && norm.endsWith(' ')) {
    norm = norm.slice(0, -1);
    map.pop();
  }
  return { norm, map };
}

function normalize(text: string): string {
  return normalizeWithMap(text).norm;
}

/** Find all (case-sensitive) occurrences of `needle` in `haystack` via maps. */
function findOccurrences(
  haystack: { norm: string; map: number[] },
  needle: { norm: string; map: number[] },
): ResolvedAnchor[] {
  const results: ResolvedAnchor[] = [];
  if (needle.norm.length === 0) return results;
  let from = 0;
  while (true) {
    const idx = haystack.norm.indexOf(needle.norm, from);
    if (idx === -1) break;
    results.push({
      start: haystack.map[idx],
      end: haystack.map[idx + needle.norm.length - 1] + 1,
    });
    from = idx + 1;
  }
  return results;
}

function commonSuffixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1;
  return i;
}

function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  return i;
}

/**
 * Score a candidate occurrence by how much of the anchor's prefix/suffix
 * context matches (chars, not a boolean): repeated but distinct passages
 * disagree somewhere in the context window, so longer agreement wins.
 * Offset proximity is applied separately in resolveAnchor.
 */
function scoreCandidate(content: string, cand: ResolvedAnchor, anchor: NoteCommentAnchor): number {
  let score = 0;
  if (anchor.prefix) {
    const actual = content.slice(Math.max(0, cand.start - anchor.prefix.length), cand.start);
    score += commonSuffixLength(normalize(actual), normalize(anchor.prefix));
  }
  if (anchor.suffix) {
    const actual = content.slice(cand.end, cand.end + anchor.suffix.length);
    score += commonPrefixLength(normalize(actual), normalize(anchor.suffix));
  }
  return score;
}

/** Extract an anchor for range [start, end) of `content`. */
export function createAnchor(content: string, start: number, end: number): NoteCommentAnchor {
  const quote = content.slice(start, end);
  return {
    quote,
    prefix: content.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: content.slice(end, end + CONTEXT_LENGTH),
    offset: start,
  };
}

/**
 * How many normalized chars of the context recorded at creation time must
 * still agree with the text around a candidate occurrence for that occurrence
 * to be accepted as "the same spot". Deliberately strict: if the anchored
 * text itself was edited, the same quote usually still exists elsewhere
 * (repeated phrases), but silently rebinding the comment to a look-alike is
 * worse than honestly reporting the anchor as lost — the UI keeps such
 * comments and marks them unanchored.
 */
const IDENTITY_CONTEXT = 24;
const IDENTITY_MIN_AGREE = 16;

/** Normalized-context agreement (chars) on one side of a candidate. */
function adjacentAgreement(
  content: string,
  cand: ResolvedAnchor,
  ctx: string,
  side: 'prefix' | 'suffix',
): number {
  const norm = normalize(ctx);
  if (!norm) return Infinity; // nothing recorded on this side — skip check
  const actual =
    side === 'prefix'
      ? content.slice(Math.max(0, cand.start - ctx.length), cand.start)
      : content.slice(cand.end, cand.end + ctx.length);
  const normActual = normalize(actual);
  return side === 'prefix'
    ? commonSuffixLength(normActual, norm)
    : commonPrefixLength(normActual, norm);
}

/**
 * Locate the anchor's text in `content`. Returns null when the anchor is
 * lost — and, deliberately, also when the text exists elsewhere but the
 * original spot cannot be *proven*: in repetitive documents several
 * occurrences share identical surroundings, and silently rebinding the
 * comment to a look-alike ("it jumped") is worse than honestly reporting
 * the anchor as lost. The UI keeps such comments and marks them unanchored;
 * undoing the edit restores the anchor via the exact-offset fast path.
 */
export function resolveAnchor(content: string, anchor: NoteCommentAnchor): ResolvedAnchor | null {
  if (!anchor?.quote || !anchor.quote.trim()) return null;

  const haystack = normalizeWithMap(content);
  const needle = normalizeWithMap(anchor.quote);
  if (!needle.norm) return null;
  const offset = anchor.offset ?? 0;
  const candidates = findOccurrences(haystack, needle);
  if (candidates.length === 0) return null;

  // 1. Fast path: the quote still matches exactly at the recorded offset —
  // that IS the same spot, however repetitive the document is. Covers the
  // intact anchor and any global shift the offset heal has already followed.
  const atOffset = candidates.find((cand) => cand.start === offset);
  if (atOffset) return atOffset;

  // 2. Identity check: an occurrence elsewhere is "the same spot" only if
  // the context recorded at creation still agrees around it.
  const alive = candidates.filter((cand) => {
    const pAgree = adjacentAgreement(content, cand, anchor.prefix ?? '', 'prefix');
    const sAgree = adjacentAgreement(content, cand, anchor.suffix ?? '', 'suffix');
    const needP = anchor.prefix ? Math.min(IDENTITY_MIN_AGREE, normalize(anchor.prefix).length) : 0;
    const needS = anchor.suffix ? Math.min(IDENTITY_MIN_AGREE, normalize(anchor.suffix).length) : 0;
    return pAgree >= needP && sAgree >= needS;
  });
  if (alive.length === 0) return null;
  if (alive.length === 1) return alive[0];

  // 3. Several occurrences survive with indistinguishable surroundings —
  // a classic periodic wall. Content alone cannot prove which is the
  // original spot, so the anchor is lost (never rebound). A strictly
  // best-scoring survivor is still trusted (its context is measurably
  // closer to the creation-time one than any rival's).
  const scored = alive
    .map((cand) => ({ cand, score: scoreCandidate(content, cand, anchor) }))
    .sort((a, b) => b.score - a.score);
  if (scored[0].score === scored[1].score) return null;
  return scored[0].cand;
}

// --- rendered-text (DOM) mapping -------------------------------------------

/**
 * Source markdown contains syntax (table pipes, heading hashes, …) that never
 * reaches the rendered DOM, so source↔rendered alignment compares texts with
 * everything but word characters dropped — that form is identical on both
 * sides for the same visible text.
 */
const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;

function normalizeWordWithMap(text: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (WORD_CHAR_RE.test(text[i])) {
      norm += text[i];
      map.push(i);
    }
  }
  return { norm, map };
}

function normalizeWord(text: string): string {
  return normalizeWordWithMap(text).norm;
}

const MAPPING_CONTEXT = 60;

/**
 * Word-window sizes tried for exact alignment (words of context on each side
 * of the range). Grown until the window matches a single position; periodic
 * (repeating) text is pinned down as soon as the window reaches any
 * non-repeating content.
 */
const ALIGN_WINDOWS = [2, 4, 8, 16, 32, 64];

/** Convert a char range into a word-index range within `map`'s stream. */
function wordIndexOfRange(map: number[], start: number, end: number): [number, number] {
  let i0 = 0;
  while (i0 < map.length && map[i0] < start) i0 += 1;
  let i1 = i0;
  while (i1 < map.length && map[i1] < end) i1 += 1;
  return [i0, i1];
}

/**
 * Map word-norm indices from stream `nd` into stream `hay` when the range sits
 * in a region where the two word-normalized streams are provably identical —
 * inside the common prefix or inside the common suffix. There the same norm
 * index denotes the same text on both sides (modulo a constant shift from the
 * suffix), so repeated passages bind exactly. Returns null when the range
 * reaches the divergent middle.
 */
function alignByCommonEdges(
  hay: { norm: string },
  nd: { norm: string },
  ndStart: number,
  ndEnd: number,
): ResolvedAnchor | null {
  const lcp = commonPrefixLength(hay.norm, nd.norm);
  if (ndEnd <= lcp) return { start: ndStart, end: ndEnd };
  const diff = nd.norm.length - hay.norm.length;
  const lcs = commonSuffixLength(hay.norm, nd.norm);
  if (ndStart >= nd.norm.length - lcs) {
    return { start: ndStart - diff, end: ndEnd - diff };
  }
  return null;
}

/**
 * Align a word range [ndStart, ndEnd) of stream `nd` into stream `hay` — two
 * word-normalized views of the same (mostly identical) text. Finds the window
 * nd[ndStart-h .. ndEnd+h) in `hay`, growing h until the match is unique;
 * ambiguous matches (truly periodic text) fall back to the occurrence closest
 * to `hayHint` (a word index in `hay`). Returns a word-index range in `hay`.
 */
function alignWordWindow(
  hay: { norm: string },
  nd: { norm: string },
  ndStart: number,
  ndEnd: number,
  hayHint: number,
): ResolvedAnchor | null {
  if (ndEnd <= ndStart || ndStart < 0 || ndEnd > nd.norm.length) return null;
  let best: number[] | null = null;
  let bestOffset = 0;
  for (const h of ALIGN_WINDOWS) {
    const w0 = Math.max(0, ndStart - h);
    const w1 = Math.min(nd.norm.length, ndEnd + h);
    if (w1 <= w0) continue;
    const window = nd.norm.slice(w0, w1);
    const found: number[] = [];
    let from = 0;
    for (;;) {
      const i = hay.norm.indexOf(window, from);
      if (i === -1) break;
      found.push(i);
      from = i + 1;
    }
    if (found.length === 1) {
      const c = found[0] + (ndStart - w0);
      return { start: c, end: c + (ndEnd - ndStart) };
    }
    if (found.length > 1) {
      best = found;
      bestOffset = ndStart - w0;
    } else if (best) {
      // Window grew past a divergence — stop with the best ambiguous result.
      break;
    }
  }
  if (!best) return null;
  let chosen = best[0];
  let bestDist = Infinity;
  for (const i of best) {
    const d = Math.abs(i + bestOffset - hayHint);
    if (d < bestDist) {
      bestDist = d;
      chosen = i;
    }
  }
  const c = chosen + bestOffset;
  return { start: c, end: c + (ndEnd - ndStart) };
}

/**
 * Pick the occurrence of `needle` in `haystack` that best agrees with the
 * context found around `needle` (ctxBefore/ctxAfter, taken from the other
 * representation of the same text), falling back to proximity to `hint`
 * (an index in haystack coordinates).
 */
function bestWordOccurrence(
  haystack: string,
  needle: string,
  ctxBefore: string,
  ctxAfter: string,
  hint: number,
  contextLength: number,
): ResolvedAnchor | null {
  const hay = normalizeWordWithMap(haystack);
  const nd = normalizeWordWithMap(needle);
  if (!nd.norm || !hay.norm) return null;
  const candidates = findOccurrences(hay, nd);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const beforeN = normalizeWord(ctxBefore);
  const afterN = normalizeWord(ctxAfter);
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const cand of candidates) {
    const hb = normalizeWord(haystack.slice(Math.max(0, cand.start - contextLength), cand.start));
    const ha = normalizeWord(haystack.slice(cand.end, cand.end + contextLength));
    const score =
      commonSuffixLength(hb, beforeN) * 10000 +
      commonPrefixLength(ha, afterN) * 100 -
      Math.abs(cand.start - hint);
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  return best;
}

/**
 * Map a selection made in the rendered note text back to markdown-source
 * coordinates. Uses the selection's rendered context, so repeated text binds
 * where the user actually selected, not at the first occurrence.
 */
export function locateSelectionInContent(
  content: string,
  renderedText: string,
  renderedStart: number,
  renderedEnd: number,
): ResolvedAnchor | null {
  if (renderedEnd <= renderedStart) return null;
  const sel = renderedText.slice(renderedStart, renderedEnd);
  if (!sel.trim()) return null;

  const srcW = normalizeWordWithMap(content);
  const renW = normalizeWordWithMap(renderedText);
  if (srcW.norm && renW.norm) {
    const [ri0, ri1] = wordIndexOfRange(renW.map, renderedStart, renderedEnd);
    if (ri1 > ri0) {
      // Inside the provably-identical prefix/suffix the same norm index maps
      // 1:1 — exact even for walls of repeated text.
      const edge = alignByCommonEdges(srcW, renW, ri0, ri1);
      if (edge) {
        return { start: srcW.map[edge.start], end: srcW.map[edge.end - 1] + 1 };
      }
      // Word-proportional hint over the divergent middle only.
      const lcp = commonPrefixLength(srcW.norm, renW.norm);
      const lcs = commonSuffixLength(srcW.norm, renW.norm);
      const ndMid = renW.norm.length - lcp - lcs;
      const hayMid = srcW.norm.length - lcp - lcs;
      const hint =
        ndMid > 0 && hayMid > 0
          ? lcp + Math.round((Math.max(0, ri0 - lcp) / ndMid) * hayMid)
          : Math.round((renW.map[ri0] / renW.norm.length) * srcW.norm.length);
      const aligned = alignWordWindow(srcW, renW, ri0, ri1, hint);
      if (aligned) {
        return {
          start: srcW.map[aligned.start],
          end: srcW.map[aligned.end - 1] + 1,
        };
      }
    }
  }

  // Fallback: context heuristic.
  const ctxBefore = renderedText.slice(Math.max(0, renderedStart - MAPPING_CONTEXT), renderedStart);
  const ctxAfter = renderedText.slice(renderedEnd, renderedEnd + MAPPING_CONTEXT);
  const hint = Math.round((renderedStart / renderedText.length) * content.length);
  return bestWordOccurrence(content, sel, ctxBefore, ctxAfter, hint, MAPPING_CONTEXT);
}

/**
 * Map a source range back into rendered-text coordinates (used to place
 * highlights/clouds in the DOM). `hint` is the expected rendered index of the
 * range start (monotonic interpolation across an ordered comment list);
 * context agreement decides when it is ambiguous.
 */
export function locateRangeInRendered(
  content: string,
  renderedText: string,
  sourceStart: number,
  sourceEnd: number,
  hint: number,
): ResolvedAnchor | null {
  const quote = content.slice(sourceStart, sourceEnd);
  if (!quote.trim()) return null;

  const srcW = normalizeWordWithMap(content);
  const renW = normalizeWordWithMap(renderedText);
  if (srcW.norm && renW.norm) {
    const [si0, si1] = wordIndexOfRange(srcW.map, sourceStart, sourceEnd);
    if (si1 > si0) {
      // Same 1:1 mapping, mirrored: source range → rendered indices.
      const edge = alignByCommonEdges(renW, srcW, si0, si1);
      if (edge) {
        return { start: renW.map[edge.start], end: renW.map[edge.end - 1] + 1 };
      }
      const lcp = commonPrefixLength(srcW.norm, renW.norm);
      const lcs = commonSuffixLength(srcW.norm, renW.norm);
      const srcMid = srcW.norm.length - lcp - lcs;
      const renMid = renW.norm.length - lcp - lcs;
      const wordHint = wordIndexOfRange(renW.map, hint, hint)[0];
      const adjHint =
        srcMid > 0 && renMid > 0
          ? lcp + Math.round((Math.max(0, si0 - lcp) / srcMid) * renMid)
          : wordHint;
      const aligned = alignWordWindow(renW, srcW, si0, si1, adjHint);
      if (aligned) {
        return {
          start: renW.map[aligned.start],
          end: renW.map[aligned.end - 1] + 1,
        };
      }
    }
  }

  // Fallback: context heuristic.
  const ctxBefore = content.slice(Math.max(0, sourceStart - MAPPING_CONTEXT), sourceStart);
  const ctxAfter = content.slice(sourceEnd, sourceEnd + MAPPING_CONTEXT);
  return bestWordOccurrence(renderedText, quote, ctxBefore, ctxAfter, hint, MAPPING_CONTEXT);
}
