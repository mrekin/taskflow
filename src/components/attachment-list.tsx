'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Paperclip, Upload, Download, Trash2, Copy, FileText, File, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { api } from '@/lib/api-utils';
import { formatFileSize, computeFileHash, isFilenameAllowed } from '@/lib/attachment-utils';
import { Button } from '@/components/ui/button';
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
import type { Attachment } from '@/lib/types';

interface AttachmentListProps {
  entityId: string;
  entityType: string;
  ownerId: string;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) return <File className="h-4 w-4 text-blue-500" />;
  if (mimeType.includes('pdf')) return <FileText className="h-4 w-4 text-red-500" />;
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return <FileText className="h-4 w-4 text-yellow-600" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

export function AttachmentList({ entityId, entityType, ownerId }: AttachmentListProps) {
  const {
    attachments,
    attachmentConfig,
    fetchAttachments,
    fetchAttachmentConfig,
    uploadAttachment,
    deleteAttachment,
    currentUserId,
  } = useAppStore();

  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const VISIBLE_COUNT = 3;
  const showSpoiler = attachments.length > VISIBLE_COUNT;
  const visibleAttachments = showSpoiler && !attachmentsExpanded
    ? attachments.slice(0, VISIBLE_COUNT)
    : attachments;

  const isOwner = currentUserId === ownerId;
  const canUpload = isOwner;

  useEffect(() => {
    fetchAttachments(entityId, entityType);
  }, [entityId, entityType, fetchAttachments]);

  useEffect(() => {
    if (!attachmentConfig) fetchAttachmentConfig();
  }, [attachmentConfig, fetchAttachmentConfig]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (!attachmentConfig) return;

    const fileArray = Array.from(files);
    setError(null);

    for (const file of fileArray) {
      if (file.size > attachmentConfig.maxSize) {
        setError(`${file.name}: size exceeds ${formatFileSize(attachmentConfig.maxSize)}`);
        continue;
      }
      if (!isFilenameAllowed(file.name, attachmentConfig.allowedPatterns)) {
        setError(`${file.name}: file type not allowed`);
        continue;
      }
      if (attachments.length + uploading.length >= attachmentConfig.maxPerEntity) {
        setError(`Maximum ${attachmentConfig.maxPerEntity} attachments`);
        break;
      }

      setUploading(prev => [...prev, file.name]);
      try {
        const hash = await computeFileHash(file);
        await uploadAttachment(file, entityId, entityType, hash);
      } catch (e: any) {
        setError(e.message || 'Upload failed');
      } finally {
        setUploading(prev => prev.filter(n => n !== file.name));
      }
    }

    await fetchAttachments(entityId, entityType);
  }, [entityId, entityType, attachmentConfig, attachments.length, uploading.length]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!canUpload) return;
    handleFiles(e.dataTransfer.files);
  }, [canUpload, handleFiles]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (canUpload) setIsDragging(true);
  }, [canUpload]);

  const onDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAttachment(deleteTarget.id);
    } catch (e: any) {
      setError(e.message || 'Delete failed');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleDownload = (attachment: Attachment) => {
    const url = api(`/api/attachments/file/${attachment.blobId}?disposition=attachment`);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.displayName || attachment.blob?.originalName || 'file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyLink = (attachment: Attachment) => {
    if (!attachment.blob) return;
    const url = `${window.location.origin}${api(`/api/attachments/file/${attachment.blobId}`)}`;
    navigator.clipboard.writeText(url);
  };

  return (
    <div
      className="space-y-2"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <Paperclip className="h-4 w-4" />
          Attachments ({attachments.length})
        </h4>
        {canUpload && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading.length > 0}
          >
            {uploading.length > 0 ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Upload className="h-4 w-4 mr-1" />
            )}
            Upload
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {isDragging && canUpload && (
        <div className="border-2 border-dashed border-primary/50 rounded-md p-6 text-center text-sm text-muted-foreground">
          Drop files here
        </div>
      )}

      {attachments.length > 0 && (
        <div className="space-y-1">
          {visibleAttachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm group"
            >
              {att.blob && <FileIcon mimeType={att.blob.mimeType} />}
              <span className="flex-1 truncate min-w-0" title={att.displayName || ''}>
                {att.displayName || att.blob?.originalName}
              </span>
              {att.blob && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatFileSize(att.blob.size)}
                </span>
              )}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleCopyLink(att)}
                  title="Copy link"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleDownload(att)}
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
                {isOwner && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget({ id: att.id, name: att.displayName || att.blob?.originalName || '' })}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {showSpoiler && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={() => setAttachmentsExpanded((prev) => !prev)}
            >
              {attachmentsExpanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5 mr-1" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5 mr-1" />
                  Show {attachments.length - VISIBLE_COUNT} more
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {uploading.length > 0 && (
        <div className="space-y-1">
          {uploading.map(name => (
            <div key={name} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="truncate">{name}</span>
            </div>
          ))}
        </div>
      )}

      {attachments.length === 0 && uploading.length === 0 && !isDragging && (
        <p className="text-xs text-muted-foreground text-center py-2">
          No attachments
        </p>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Attachment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
