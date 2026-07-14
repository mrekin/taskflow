'use client';

import { useState, useCallback, useRef, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, Loader2, FileJson, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-utils';

type ImportMode = 'replace' | 'merge-skip' | 'merge-overwrite';

interface ImportDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MODES: { value: ImportMode; label: string; description: string; danger?: boolean }[] = [
  {
    value: 'merge-skip',
    label: 'Merge (add new only)',
    description: 'Add entities from the file. Existing records (same ID) are skipped — nothing is overwritten or deleted.',
  },
  {
    value: 'merge-overwrite',
    label: 'Merge (add & overwrite)',
    description: "Add new entities and overwrite existing ones (same ID) with the file's version. Existing data is updated, not deleted.",
  },
  {
    value: 'replace',
    label: 'Replace (restore)',
    description: 'DELETE all your current data first, then load the file. Destructive — cannot be undone.',
    danger: true,
  },
];

const LABELS: Record<string, string> = {
  tags: 'tags',
  areas: 'areas',
  projects: 'projects',
  tasks: 'tasks',
  noteFolders: 'folders',
  notes: 'notes',
  noteVersions: 'versions',
  comments: 'comments',
  webhooks: 'webhooks',
  webhookTriggers: 'triggers',
};

function summarize(data: any): ReactNode[] {
  const parts: ReactNode[] = [];
  for (const [key, label] of Object.entries(LABELS)) {
    const n = Array.isArray(data?.[key]) ? data[key].length : 0;
    if (n) parts.push(<span key={key}>{`${n} ${label}`}</span>);
  }
  return parts;
}

export function ImportDataDialog({ open, onOpenChange }: ImportDataDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<any | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge-skip');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setFile(null);
    setParsed(null);
    setParseError(null);
    setMode('merge-skip');
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const handleFile = useCallback((f: File | null) => {
    setFile(f);
    setParsed(null);
    setParseError(null);
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!data || data.app !== 'taskflow' || !data.data) {
          setParseError('Not a TaskFlow export file');
          return;
        }
        setParsed(data);
      } catch {
        setParseError('Invalid JSON file');
      }
    };
    reader.onerror = () => setParseError('Failed to read file');
    reader.readAsText(f);
  }, []);

  const preview = parsed ? summarize(parsed.data) : null;

  const handleImport = useCallback(async () => {
    if (!parsed || busy) return;
    setBusy(true);
    try {
      const res = await fetch(api('/api/import'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, data: parsed }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(result?.error || 'Import failed');
        setBusy(false);
        return;
      }
      const total = (result.created || 0) + (result.updated || 0);
      const skipped = result.skipped || 0;
      toast.success(
        `Import complete: ${total} item${total === 1 ? '' : 's'} written${skipped ? `, ${skipped} skipped` : ''}`,
      );
      onOpenChange(false);
      reset();
      // No single refresh action in the store — reload to guarantee consistency.
      setTimeout(() => window.location.reload(), 400);
    } catch {
      toast.error('Import failed');
      setBusy(false);
    }
  }, [parsed, mode, busy, onOpenChange, reset]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Data</DialogTitle>
          <DialogDescription>
            Restore data from a previously exported TaskFlow JSON file. Attachments are not included.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              <Upload className="h-4 w-4" />
              {file ? file.name : 'Choose export file…'}
            </Button>
            {parseError && <p className="text-xs text-destructive">{parseError}</p>}
            {preview && preview.length > 0 && (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <FileJson className="h-3.5 w-3.5" /> Detected content
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">{preview}</div>
              </div>
            )}
          </div>

          <RadioGroup value={mode} onValueChange={(v) => setMode(v as ImportMode)} className="gap-2">
            {MODES.map((m) => (
              <Label
                key={m.value}
                htmlFor={`imp-${m.value}`}
                className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-accent"
              >
                <RadioGroupItem id={`imp-${m.value}`} value={m.value} className="mt-0.5" />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    {m.danger && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                    {m.label}
                  </div>
                  <p className="text-xs text-muted-foreground">{m.description}</p>
                </div>
              </Label>
            ))}
          </RadioGroup>

          {mode === 'replace' && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This permanently deletes ALL your current data (areas, projects, tasks, notes,
                comments, tags, webhooks) before loading the file. This cannot be undone.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
              reset();
            }}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!parsed || busy}
            variant={mode === 'replace' ? 'destructive' : 'default'}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Importing…' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
