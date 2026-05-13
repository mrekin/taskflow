'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { useAppStore } from '@/store/app-store';
import { computeFileHash, isFilenameAllowed, isImageMime, formatFileSize } from '@/lib/attachment-utils';
import { api } from '@/lib/api-utils';

interface UseInlineFileUploadOptions {
  entityId: string | undefined;
  entityType: string | undefined;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
}

export function useInlineFileUpload({
  entityId,
  entityType,
  textareaRef,
  value,
  onChange,
}: UseInlineFileUploadOptions) {
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const { uploadAttachment, fetchAttachments, attachmentConfig, fetchAttachmentConfig } = useAppStore();

  const insertAtCursor = useCallback((text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = value.substring(0, start) + text + value.substring(end);
    onChange(newValue);
    requestAnimationFrame(() => {
      const newPos = start + text.length;
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }, [textareaRef, value, onChange]);

  const uploadAndInsert = useCallback(async (files: File[]) => {
    if (!entityId || !entityType) return;

    if (!attachmentConfig) {
      await fetchAttachmentConfig();
    }
    const config = useAppStore.getState().attachmentConfig;
    if (!config) return;

    const validFiles: File[] = [];
    for (const file of files) {
      if (file.size > config.maxSize) {
        setUploadError(`${file.name}: size exceeds ${formatFileSize(config.maxSize)}`);
        continue;
      }
      if (!isFilenameAllowed(file.name, config.allowedPatterns)) {
        setUploadError(`${file.name}: file type not allowed`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    setUploadingFiles(prev => [...prev, ...validFiles.map(f => f.name)]);
    setUploadError(null);

    const results = await Promise.allSettled(
      validFiles.map(async (file) => {
        const hash = await computeFileHash(file);
        const attachment = await uploadAttachment(file, entityId, entityType, hash);
        if (attachment?.blob) {
          const name = attachment.displayName || attachment.blob.originalName;
          const url = api(`/api/attachments/file/${attachment.blobId}?disposition=inline`);
          return isImageMime(attachment.blob.mimeType)
            ? `![${name}](${url})`
            : `[${name}](${url})`;
        }
        return '';
      })
    );

    const markdownParts: string[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        markdownParts.push(result.value);
      }
    }

    if (markdownParts.length > 0) {
      insertAtCursor(markdownParts.join('\n'));
    }

    setUploadingFiles([]);
    await fetchAttachments(entityId, entityType);
  }, [entityId, entityType, attachmentConfig, fetchAttachmentConfig, uploadAttachment, fetchAttachments, insertAtCursor]);

  const onPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files: File[] = [];

    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file && file.size > 0) files.push(file);
        }
      }
    }

    // Fallback: clipboardData.files (file manager copies on some OS)
    if (files.length === 0 && e.clipboardData?.files?.length) {
      for (let i = 0; i < e.clipboardData.files.length; i++) {
        const file = e.clipboardData.files[i];
        if (file.size > 0) files.push(file);
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      uploadAndInsert(files);
      return true;
    }
    return false;
  }, [uploadAndInsert]);

  const dragHandlers = useMemo(() => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
    },
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current++;
      setIsDragOver(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setIsDragOver(false);
      }
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        uploadAndInsert(Array.from(e.dataTransfer.files));
      }
    },
  }), [uploadAndInsert]);

  const triggerFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadAndInsert(Array.from(e.target.files));
      e.target.value = '';
    }
  }, [uploadAndInsert]);

  const fileInputElement = useMemo(() => (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      className="hidden"
      onChange={handleFileInputChange}
    />
  ), [handleFileInputChange]);

  return {
    uploadingFiles,
    uploadError,
    isDragOver,
    dragHandlers,
    onPaste,
    triggerFilePicker,
    fileInputElement,
  };
}
