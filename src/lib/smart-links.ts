import type { Task, Project, Note, Area } from '@/lib/types';

export interface ContentProcessor {
  name: string;
  process(content: string): string;
}

const processors: ContentProcessor[] = [];

export function registerProcessor(processor: ContentProcessor) {
  processors.push(processor);
}

export function processContent(content: string): string {
  return processors.reduce((acc, p) => p.process(acc), content);
}

const ENTITY_REF_REGEX = /#([TPNA])-(\d+)/gi;

function splitByCodeBlocks(content: string): { text: string; isCode: boolean }[] {
  const parts: { text: string; isCode: boolean }[] = [];
  const fencedRegex = /(```[\s\S]*?```|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fencedRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: content.slice(lastIndex, match.index), isCode: false });
    }
    parts.push({ text: match[0], isCode: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ text: content.slice(lastIndex), isCode: false });
  }

  return parts;
}

export const entityRefProcessor: ContentProcessor = {
  name: 'entityRef',
  process(content: string): string {
    const parts = splitByCodeBlocks(content);
    return parts
      .map((part) => {
        if (part.isCode) return part.text;

        const linkPlaceholder = '\x00LINK\x00';
        const links: string[] = [];

        let result = part.text.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_m, text: string, url: string) => {
          links.push(`[${text}](${url})`);
          return `${linkPlaceholder}${links.length - 1}\x00`;
        });

        result = result.replace(
          ENTITY_REF_REGEX,
          (_match, type, num) =>
            `[#${type.toUpperCase()}-${num}](entity:${type.toUpperCase()}:${num})`
        );

        result = result.replace(new RegExp(`${linkPlaceholder.replace(/\x00/g, '\\x00')}(\\d+)\\x00`, 'g'), (_m, idx: string) => {
          return links[parseInt(idx, 10)];
        });

        return result;
      })
      .join('');
  },
};

export function isLocalEntityUrl(url: string): boolean {
  if (typeof window === 'undefined') return false;
  const { origin, pathname } = window.location;
  if (!url.startsWith(origin)) return false;
  const afterOrigin = url.substring(origin.length);
  return afterOrigin === pathname || afterOrigin.startsWith(pathname + '?') || afterOrigin.startsWith(pathname + '/');
}

const ENTITY_URL_REGEX =
  /(?:https?:\/\/[^\s<>)"']+?\?(?:[^\s<>)"']+&)*?(?:task|project|note|area)=([TPNAtpna])(?:-)(\d+)(?:[^\s<>)"']*)?)/gi;

function getLocalOrigin(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

export const entityUrlProcessor: ContentProcessor = {
  name: 'entityUrl',
  process(content: string): string {
    const parts = splitByCodeBlocks(content);
    return parts
      .map((part) => {
        if (part.isCode) return part.text;

        let result = part.text;
        const linkPlaceholder = '\x00LINK\x00';
        const links: string[] = [];

        result = result.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_m, text: string, url: string) => {
          links.push(`[${text}](${url})`);
          return `${linkPlaceholder}${links.length - 1}\x00`;
        });

        ENTITY_URL_REGEX.lastIndex = 0;
        result = result.replace(ENTITY_URL_REGEX, (match, type: string, num: string) => {
          if (!isLocalEntityUrl(match)) return match;
          const t = type.toUpperCase();
          return `[${t}-${num}](entity:${t}:${num})`;
        });

        result = result.replace(new RegExp(`${linkPlaceholder.replace(/\x00/g, '\\x00')}(\\d+)\\x00`, 'g'), (_m, idx: string) => {
          return links[parseInt(idx, 10)];
        });

        return result;
      })
      .join('');
  },
};

registerProcessor(entityRefProcessor);
registerProcessor(entityUrlProcessor);

export interface UserMentionItem {
  id: string;
  name: string | null;
  email: string | null;
  label: string;
}

export interface MentionItem {
  type: 'task' | 'project' | 'note' | 'area';
  id: string;
  shortId: string;
  label: string;
  shortIdNum: number | null;
}

export function filterEntities(
  query: string,
  tasks: Task[],
  projects: Project[],
  notes: Note[],
  areas: Area[]
): MentionItem[] {
  const q = query.toLowerCase();

  const all: MentionItem[] = [
    ...tasks.map((t) => ({ type: 'task' as const, id: t.id, shortId: t.shortId || '', label: t.title, shortIdNum: t.shortIdNum })),
    ...projects.map((p) => ({ type: 'project' as const, id: p.id, shortId: p.shortId || '', label: p.name, shortIdNum: p.shortIdNum })),
    ...notes.map((n) => ({ type: 'note' as const, id: n.id, shortId: n.shortId || '', label: n.title, shortIdNum: n.shortIdNum })),
    ...areas.map((a) => ({ type: 'area' as const, id: a.id, shortId: a.shortId || '', label: a.name, shortIdNum: a.shortIdNum })),
  ];

  if (!q) {
    return all.slice(0, 20);
  }

  const scored = all
    .map((entity) => {
      const sid = entity.shortId.toLowerCase();
      const lbl = entity.label.toLowerCase();
      let score = 0;

      if (sid === q) score = 100;
      else if (sid.startsWith(q)) score = 80;
      else if (lbl.includes(q)) score = 60;
      else if (sid.includes(q)) score = 40;

      return { entity, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.entity.label.localeCompare(b.entity.label));

  return scored.map((x) => x.entity).slice(0, 8);
}
