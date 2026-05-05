'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/app-store';
import { processContent, isLocalEntityUrl } from '@/lib/smart-links';
import { useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { copyToClipboard } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  compact?: boolean;
  stripFirstH1?: boolean;
}

function EntityMentionBadge({ type, num }: { type: string; num: number }) {
  const { tasks, projects, notes, areas } = useAppStore();
  const [copiedLink, setCopiedLink] = useState(false);

  const upperType = type.toUpperCase();

  let entityId: string | null = null;
  let entityName: string | null = null;
  let entityType: 'task' | 'project' | 'note' | 'area' | null = null;

  if (upperType === 'T') {
    const task = tasks.find((t) => t.shortIdNum === num);
    if (task) { entityId = task.id; entityName = task.title; entityType = 'task'; }
  } else if (upperType === 'P') {
    const project = projects.find((p) => p.shortIdNum === num);
    if (project) { entityId = project.id; entityName = project.name; entityType = 'project'; }
  } else if (upperType === 'N') {
    const note = notes.find((n) => n.shortIdNum === num);
    if (note) { entityId = note.id; entityName = note.title; entityType = 'note'; }
  } else if (upperType === 'A') {
    const area = areas.find((a) => a.shortIdNum === num);
    if (area) { entityId = area.id; entityName = area.name; entityType = 'area'; }
  }

  const displayId = `${upperType}-${num}`;
  const truncatedTitle = entityName
    ? entityName.length > 30
      ? entityName.slice(0, 30) + '\u2026'
      : entityName
    : displayId;

  const paramMap: Record<string, string> = { T: 'task', P: 'project', N: 'note', A: 'area' };
  const param = paramMap[upperType] || 'task';
  const href = entityId ? `${window.location.origin}${window.location.pathname}?${param}=${displayId}` : '#';

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!entityId) return;
    const ok = await copyToClipboard(href);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1500);
    }
  };

  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-md bg-primary/10 text-primary text-xs font-mono border border-primary/20"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="px-1.5 py-0.5 hover:bg-primary/20 transition-colors flex items-center gap-1 max-w-[200px]"
        title={entityName ? `${displayId}: ${entityName}` : displayId}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="shrink-0 text-[10px] font-semibold opacity-70">{displayId}</span>
        {entityName && (
          <span className="truncate text-[11px] opacity-80">{truncatedTitle}</span>
        )}
      </a>
      <button
        type="button"
        onClick={handleCopyLink}
        className="px-1 py-0.5 hover:bg-primary/20 transition-colors border-l border-primary/20"
        title="Copy link"
      >
        {copiedLink ? (
          <Check className="size-2.5 text-emerald-500" />
        ) : (
          <Link2 className="size-2.5" />
        )}
      </button>
    </span>
  );
}

export function MarkdownRenderer({ content, className = '', compact = false, stripFirstH1 = false }: MarkdownRendererProps) {
  if (!content.trim()) {
    return <span className="text-muted-foreground text-xs">No content</span>;
  }

  let processedContent = processContent(content);

  if (stripFirstH1 && !compact) {
    processedContent = processedContent.replace(/^#\s+.+\n?/, '');
  }

  processedContent = processedContent.replace(/\n{3,}/g, '\n\n\u00A0\n\n');

  const proseSize = compact ? 'prose-xs' : 'prose-sm';

  return (
    <div className={`prose ${proseSize} dark:prose-invert max-w-none prose-headings:font-semibold prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent prose-code:before:content-none prose-code:after:content-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        urlTransform={(url) => url}
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
              <div className="rounded-lg overflow-hidden my-2 max-w-full">
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    borderRadius: '0.5rem',
                    fontSize: compact ? '0.7rem' : '0.8125rem',
                    maxWidth: '100%',
                    overflowX: 'auto',
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
            if (href?.startsWith('entity:')) {
              const parts = href.split(':');
              const type = parts[1];
              const num = parseInt(parts[2], 10);
              if (type && !isNaN(num)) {
                return <EntityMentionBadge type={type} num={num} />;
              }
            }

            const entityUrlMatch = href && href.match(/^https?:\/\/[^/]+\/[^\s]*[?&](task|project|note|area)=([TPNAtpna]-\d+)/i);
            if (entityUrlMatch && href && isLocalEntityUrl(href)) {
              const prefix = entityUrlMatch[2].split('-')[0].toUpperCase();
              const numStr = entityUrlMatch[2].split('-')[1];
              if (numStr) {
                return <EntityMentionBadge type={prefix} num={parseInt(numStr, 10)} />;
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
