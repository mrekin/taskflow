'use client';

import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/app-store';
import { shortId } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  compact?: boolean;
}

// Entity reference patterns: #T-id, #P-id, #N-id, #A-id
const ENTITY_REF_REGEX = /^#([TPNA])-([a-z0-9]+)$/i;

function EntityReferenceLink({ type, id }: { type: string; id: string }) {
  const { tasks, projects, notes, areas, selectTask, selectNote, selectProject, selectArea, setCurrentView, fetchTasks, fetchNotes } = useAppStore();

  const entityTypeMap: Record<string, string> = { T: 'task', P: 'project', N: 'note', A: 'area' };
  const entityPrefixMap: Record<string, string> = { T: 'T', P: 'P', N: 'N', A: 'A' };

  // Try to find the entity name from store data
  let entityName: string | null = null;

  if (type === 'T' || type === 't') {
    const task = tasks.find((t) => t.id.startsWith(id));
    if (task) entityName = task.title;
  } else if (type === 'P' || type === 'p') {
    const project = projects.find((p) => p.id.startsWith(id));
    if (project) entityName = project.name;
  } else if (type === 'N' || type === 'n') {
    const note = notes.find((n) => n.id.startsWith(id));
    if (note) entityName = note.title;
  } else if (type === 'A' || type === 'a') {
    const area = areas.find((a) => a.id.startsWith(id));
    if (area) entityName = area.name;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const upperType = type.toUpperCase();

    if (upperType === 'T') {
      // Find full task ID from partial
      const task = tasks.find((t) => t.id.startsWith(id));
      if (task) selectTask(task.id);
    } else if (upperType === 'P') {
      const project = projects.find((p) => p.id.startsWith(id));
      if (project) {
        selectProject(project.id);
        setCurrentView('projects');
        fetchTasks(project.id);
        fetchNotes(project.id);
      }
    } else if (upperType === 'N') {
      const note = notes.find((n) => n.id.startsWith(id));
      if (note) {
        selectNote(note.id);
        setCurrentView('note-editor');
      }
    } else if (upperType === 'A') {
      const area = areas.find((a) => a.id.startsWith(id));
      if (area) {
        selectArea(area.id);
        setCurrentView('areas');
      }
    }
  };

  const prefix = entityPrefixMap[type.toUpperCase()] || type.toUpperCase();
  const displayName = entityName
    ? `${prefix}: ${entityName}`
    : `${prefix}-${id}`;

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-mono hover:bg-primary/20 transition-colors cursor-pointer border border-primary/20"
      title={`Open ${entityTypeMap[type.toUpperCase()] || 'entity'} ${id}`}
    >
      <span className="font-semibold">{prefix}</span>
      <span className="opacity-60">{entityName ? `"${entityName}"` : id}</span>
    </button>
  );
}

export function MarkdownRenderer({ content, className = '', compact = false }: MarkdownRendererProps) {
  if (!content.trim()) {
    return <span className="text-muted-foreground text-xs">No content</span>;
  }

  // Pre-process content to convert entity references into a special format
  // that ReactMarkdown won't swallow. We'll convert #T-abc123 into [#T-abc123](entity:T:abc123)
  const processedContent = content.replace(
    /#([TPNA])-([a-z0-9]+)/gi,
    (_match, type, id) => `[#${type}-${id}](entity:${type.toUpperCase()}:${id})`
  );

  const proseSize = compact ? 'prose-xs' : 'prose-sm';

  return (
    <div className={`prose ${proseSize} dark:prose-invert max-w-none prose-headings:font-semibold prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent prose-code:before:content-none prose-code:after:content-none ${className}`}>
      <ReactMarkdown
        components={{
          code(props) {
            const { children, className, ...rest } = props;
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match;

            if (isInline) {
              return (
                <code
                  className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
                  {...rest}
                >
                  {children}
                </code>
              );
            }

            return (
              <div className="rounded-lg overflow-hidden my-2">
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    borderRadius: '0.5rem',
                    fontSize: compact ? '0.7rem' : '0.8125rem',
                  }}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              </div>
            );
          },
          h1({ children }) {
            return compact ? (
              <p className="font-bold text-sm m-0">{children}</p>
            ) : (
              <h1 className="text-2xl">{children}</h1>
            );
          },
          h2({ children }) {
            return compact ? (
              <p className="font-bold text-sm m-0">{children}</p>
            ) : (
              <h2 className="text-xl">{children}</h2>
            );
          },
          h3({ children }) {
            return compact ? (
              <p className="font-semibold text-xs m-0">{children}</p>
            ) : (
              <h3 className="text-lg">{children}</h3>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 border-primary/30 pl-3 italic text-muted-foreground my-1">
                {children}
              </blockquote>
            );
          },
          a({ children, href }) {
            // Handle entity references
            if (href?.startsWith('entity:')) {
              const [, type, id] = href.split(':');
              return <EntityReferenceLink type={type} id={id} />;
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                {children}
              </a>
            );
          },
          hr() {
            return <Separator className="my-4" />;
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-2">
                <table className="min-w-full border-collapse border border-border text-xs">
                  {children}
                </table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border border-border bg-muted px-2 py-1 text-left font-semibold">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border border-border px-2 py-1">
                {children}
              </td>
            );
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 space-y-0.5">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 space-y-0.5">{children}</ol>;
          },
          img({ src, alt }) {
            return (
              <img
                src={src}
                alt={alt || ''}
                className="rounded-lg max-w-full my-2"
              />
            );
          },
          p({ children }) {
            return compact ? (
              <p className="m-0 leading-relaxed">{children}</p>
            ) : (
              <p>{children}</p>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
