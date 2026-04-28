'use client';

import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/app-store';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  compact?: boolean;
}

// Entity reference pattern: #T-7, #P-3, #N-258, #A-2
const ENTITY_REF_REGEX = /#([TPNA])-(\d+)/gi;

function EntityReferenceLink({ type, num }: { type: string; num: number }) {
  const { tasks, projects, notes, areas, selectTask, selectNote, selectProject, selectArea, setCurrentView, fetchTasks, fetchNotes } = useAppStore();

  const upperType = type.toUpperCase();

  // Find entity by shortIdNum
  let entityId: string | null = null;
  let entityName: string | null = null;

  if (upperType === 'T') {
    const task = tasks.find((t) => t.shortIdNum === num);
    if (task) { entityId = task.id; entityName = task.title; }
  } else if (upperType === 'P') {
    const project = projects.find((p) => p.shortIdNum === num);
    if (project) { entityId = project.id; entityName = project.name; }
  } else if (upperType === 'N') {
    const note = notes.find((n) => n.shortIdNum === num);
    if (note) { entityId = note.id; entityName = note.title; }
  } else if (upperType === 'A') {
    const area = areas.find((a) => a.shortIdNum === num);
    if (area) { entityId = area.id; entityName = area.name; }
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!entityId) return;

    if (upperType === 'T') {
      selectTask(entityId);
    } else if (upperType === 'P') {
      selectProject(entityId);
      setCurrentView('projects');
      fetchTasks(entityId);
      fetchNotes(entityId);
    } else if (upperType === 'N') {
      selectNote(entityId);
      setCurrentView('note-editor');
    } else if (upperType === 'A') {
      selectArea(entityId);
      setCurrentView('areas');
    }
  };

  const displayId = `${upperType}-${num}`;

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-mono hover:bg-primary/20 transition-colors cursor-pointer border border-primary/20"
      title={entityName ? `Open ${displayId}: ${entityName}` : `Open ${displayId}`}
    >
      <span className="font-semibold">{displayId}</span>
      {entityName && <span className="opacity-70 max-w-[120px] truncate">"{entityName}"</span>}
    </button>
  );
}

export function MarkdownRenderer({ content, className = '', compact = false }: MarkdownRendererProps) {
  if (!content.trim()) {
    return <span className="text-muted-foreground text-xs">No content</span>;
  }

  // Pre-process content to convert entity references into markdown links
  // #T-7 → [#T-7](entity:T:7)
  const processedContent = content.replace(
    ENTITY_REF_REGEX,
    (_match, type, num) => `[#${type}-${num}](entity:${type.toUpperCase()}:${num})`
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
              <p className="bold text-sm m-0">{children}</p>
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
              const parts = href.split(':');
              const type = parts[1];
              const num = parseInt(parts[2], 10);
              if (type && !isNaN(num)) {
                return <EntityReferenceLink type={type} num={num} />;
              }
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
