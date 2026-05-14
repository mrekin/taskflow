'use client';

import { useCallback, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Code,
  Quote,
  Link,
  Minus,
  Table,
  Paperclip,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/app-store';
import { isFilenameAllowed, isImageMime, computeFileHash } from '@/lib/attachment-utils';

const toolbarConfig = [
  { icon: Bold, label: 'Bold', prefix: '**', suffix: '**', defaultText: 'bold text' },
  { icon: Italic, label: 'Italic', prefix: '*', suffix: '*', defaultText: 'italic text' },
  { icon: Heading1, label: 'Heading 1', prefix: '# ', suffix: '', defaultText: 'Heading 1' },
  { icon: Heading2, label: 'Heading 2', prefix: '## ', suffix: '', defaultText: 'Heading 2' },
  { icon: List, label: 'Bullet List', prefix: '- ', suffix: '', defaultText: 'list item' },
  { icon: ListOrdered, label: 'Numbered List', prefix: '1. ', suffix: '', defaultText: 'list item' },
  { icon: Code, label: 'Code', prefix: '`', suffix: '`', defaultText: 'code' },
  { icon: Quote, label: 'Quote', prefix: '> ', suffix: '', defaultText: 'quote' },
  { icon: Link, label: 'Link', prefix: '[', suffix: '](url)', defaultText: 'link text' },
  { icon: Minus, label: 'Divider', prefix: '\n---\n', suffix: '', defaultText: '' },
  { icon: Table, label: 'Table', prefix: '\n| Header | Header | Header |\n|--------|--------|--------|\n| Cell   | Cell   | Cell   |\n| Cell   | Cell   | Cell   |\n', suffix: '', defaultText: '' },
] as const;

interface MarkdownToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  entityId?: string;
  entityType?: string;
}

export function useMarkdownInsert(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (value: string) => void,
) {
  return useCallback((prefix: string, suffix: string = '', defaultText: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const textToInsert = selectedText || defaultText;

    const newContent =
      textarea.value.substring(0, start) +
      prefix +
      textToInsert +
      suffix +
      textarea.value.substring(end);

    onChange(newContent);

    requestAnimationFrame(() => {
      const newCursorPos = start + prefix.length + textToInsert.length + suffix.length;
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, newCursorPos - suffix.length);
      const insertLine = newContent.substring(0, newCursorPos).split('\n').length;
      const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
      textarea.scrollTop = Math.max(0, insertLine * lineHeight - textarea.clientHeight / 2);
    });
  }, [textareaRef, value, onChange]);
}

export function MarkdownToolbar({ textareaRef, value, onChange, className, entityId, entityType }: MarkdownToolbarProps) {
  const insertMarkdown = useMarkdownInsert(textareaRef, value, onChange);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { uploadAttachment, fetchAttachments, attachmentConfig, fetchAttachmentConfig } = useAppStore();

  const canUpload = !!entityId && !!entityType;

  const handleFileUpload = useCallback(async (files: FileList) => {
    if (!entityId || !entityType) return;

    if (!attachmentConfig) {
      await fetchAttachmentConfig();
    }
    const config = useAppStore.getState().attachmentConfig;
    if (!config) return;

    const fileArray = Array.from(files);

    for (const file of fileArray) {
      if (file.size > config.maxSize) continue;
      if (!isFilenameAllowed(file.name, config.allowedPatterns)) continue;

      setUploading(true);
      try {
        const hash = await computeFileHash(file);
        const attachment = await uploadAttachment(file, entityId, entityType, hash);
        if (attachment?.blob) {
          const name = attachment.displayName || attachment.blob.originalName;
          const url = `/api/attachments/file/${attachment.blobId}?disposition=inline`;
          if (isImageMime(attachment.blob.mimeType)) {
            insertMarkdown(`![${name}](${url})`, '', '');
          } else {
            insertMarkdown(`[${name}](${url})`, '', '');
          }
        }
      } catch {
        // silently fail — attachment-list shows its own errors
      } finally {
        setUploading(false);
      }
    }

    await fetchAttachments(entityId, entityType);
  }, [entityId, entityType, attachmentConfig, insertMarkdown, uploadAttachment, fetchAttachments, fetchAttachmentConfig]);

  return (
    <div className={`flex items-center gap-0.5 ${className ?? ''}`}>
      {toolbarConfig.map((tool) => (
        <Button
          key={tool.label}
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => insertMarkdown(tool.prefix, tool.suffix, tool.defaultText)}
          title={tool.label}
        >
          <tool.icon className="size-3.5" />
        </Button>
      ))}
      {canUpload && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            title="Upload attachment"
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Paperclip className="size-3.5" />
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileUpload(e.target.files);
                e.target.value = '';
              }
            }}
          />
        </>
      )}
    </div>
  );
}
