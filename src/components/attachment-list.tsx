'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Paperclip, Upload, Download, Trash2, Copy, FileText, File, Loader2, ChevronDown, ChevronUp, Check, AlertCircle } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { api } from '@/lib/api-utils';
import { formatFileSize, computeFileHash, validateAttachmentFiles, uploadFilesConcurrently, uploadAttachmentApi } from '@/lib/attachment-utils';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
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
  compact?: boolean;
  refreshTrigger?: number;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) return <File className="h-4 w-4 text-blue-500" />;
  if (mimeType.includes('pdf')) return <FileText className="h-4 w-4 text-red-500" />;
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return <FileText className="h-4 w-4 text-yellow-600" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

export function AttachmentList({ entityId, entityType, ownerId, compact, refreshTrigger }: AttachmentListProps) {
  const {
    attachmentConfig,
    fetchAttachmentConfig,
    currentUserId,
  } = useAppStore();

  const [localAttachments, setLocalAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<{ name: string; size: number; status: 'pending' | 'uploading' | 'success' | 'error'; error?: string }[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxAllowed = compact ? (attachmentConfig?.maxPerComment ?? 3) : (attachmentConfig?.maxPerEntity ?? 10);

  const loadAttachments = useCallback(async () => {
    try {
      const res = await fetch(api(`/api/attachments?entityId=${entityId}&entityType=${entityType}`));
      if (res.ok) {
        const data: Attachment[] = await res.json();
        setLocalAttachments(data);
      }
    } catch {}
  }, [entityId, entityType]);

  useEffect(() => {
    loadAttachments();
  }, [loadAttachments, refreshTrigger]);

  useEffect(() => {
    if (!attachmentConfig) fetchAttachmentConfig();
  }, [attachmentConfig, fetchAttachmentConfig]);

  const VISIBLE_COUNT = compact ? 2 : 3;
  const showSpoiler = localAttachments.length > VISIBLE_COUNT;
  const visibleAttachments = showSpoiler && !attachmentsExpanded
    ? localAttachments.slice(0, VISIBLE_COUNT)
    : localAttachments;

  const isOwner = currentUserId === ownerId;
  const canUpload = isOwner;

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (!attachmentConfig) return;

    const fileArray = Array.from(files);
    const { validFiles, errors } = validateAttachmentFiles(
      fileArray,
      attachmentConfig,
      localAttachments.length + uploadQueue.length,
      maxAllowed,
    );

    for (const err of errors) {
      toast.error(err);
    }

    const queueIndexStart = uploadQueue.length;

    const newEntries = validFiles.map(f => ({ name: f.name, size: f.size, status: 'pending' as const }));
    setUploadQueue(prev => [...prev, ...newEntries]);

    await uploadFilesConcurrently(validFiles, async (file, i) => {
      const queueIdx = queueIndexStart + i;
      setUploadQueue(prev => prev.map((item, j) => j === queueIdx ? { ...item, status: 'uploading' } : item));
      try {
        const hash = await computeFileHash(file);
        await uploadAttachmentApi(file, entityId, entityType, hash);
        setUploadQueue(prev => prev.filter((_, j) => j !== queueIdx));
      } catch (e: any) {
        setUploadQueue(prev => prev.map((item, j) => j === queueIdx ? { ...item, status: 'error', error: e.message || 'Upload failed' } : item));
      }
    });

    await loadAttachments();
  }, [entityId, entityType, attachmentConfig, localAttachments.length, uploadQueue.length, maxAllowed, loadAttachments]);

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
      await fetch(api(`/api/attachments?id=${deleteTarget.id}`), { method: 'DELETE' });
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    } finally {
      setDeleteTarget(null);
      await loadAttachments();
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

  if (compact && localAttachments.length === 0 && uploadQueue.length === 0) {
    return null;
  }

  // Compact mode: just the file list, no header/upload
  if (compact) {
    return (
      <>
        {localAttachments.length > 0 && (
          <div className="space-y-0.5">
            {localAttachments.map((att) => (
              <div key={att.id} className="flex items-center gap-1.5 text-xs group">
                {att.blob && <FileIcon mimeType={att.blob.mimeType} />}
                <span className="truncate min-w-0">{att.displayName || att.blob?.originalName}</span>
                {att.blob && (
                  <span className="text-muted-foreground whitespace-nowrap">{formatFileSize(att.blob.size)}</span>
                )}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => handleDownload(att)} title="Download">
                    <Download className="h-2.5 w-2.5" />
                  </Button>
                  {isOwner && (
                    <Button variant="ghost" size="icon" className="h-4 w-4 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ id: att.id, name: att.displayName || att.blob?.originalName || '' })} title="Delete">
                      <Trash2 className="h-2.5 w-2.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
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
      </>
    );
  }

  // Full mode (tasks, notes)
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
          Attachments ({localAttachments.length})
        </h4>
        {canUpload && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadQueue.some(f => f.status === 'uploading')}
          >
            {uploadQueue.some(f => f.status === 'uploading') ? (
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

      {isDragging && canUpload && (
        <div className="border-2 border-dashed border-primary/50 rounded-md p-4 text-center text-xs text-muted-foreground">
          Drop files here
        </div>
      )}

      {localAttachments.length > 0 && (
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
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopyLink(att)} title="Copy link">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(att)} title="Download">
                  <Download className="h-3.5 w-3.5" />
                </Button>
                {isOwner && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ id: att.id, name: att.displayName || att.blob?.originalName || '' })} title="Delete">
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
                  Show {localAttachments.length - VISIBLE_COUNT} more
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {uploadQueue.length > 0 && (
        <div className="space-y-1">
          {uploadQueue.map((item, idx) => (
            <div
              key={`${item.name}-${idx}`}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                item.status === 'error' && "border-destructive/50 bg-destructive/5",
                item.status === 'success' && "border-green-500/30 bg-green-500/5",
              )}
            >
              {item.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
              {item.status === 'success' && <Check className="h-4 w-4 text-green-500 shrink-0" />}
              {item.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}
              {item.status === 'pending' && <span className="h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/30" />}
              <span className="flex-1 truncate min-w-0" title={item.name}>{item.name}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{formatFileSize(item.size)}</span>
              {item.status === 'error' && item.error && (
                <span className="text-xs text-destructive truncate max-w-[150px]" title={item.error}>{item.error}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {localAttachments.length === 0 && uploadQueue.length === 0 && !isDragging && (
        <p className="text-xs text-muted-foreground text-center py-1">
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
