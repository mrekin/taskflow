'use client';

import { RefreshCw, PenLine, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore, type SyncConflict } from '@/store/app-store';

const ENTITY_LABELS: Record<SyncConflict['entityType'], string> = {
  task: 'Задача',
  note: 'Заметка',
  folder: 'Папка',
  project: 'Проект',
  area: 'Область',
  tag: 'Тег',
  release: 'Релиз',
};

/**
 * Banner for externally changed entities that are currently open for editing
 * (dirty task dialog / note editor, or a card mid-drag). Queued by the sync
 * merge; each conflict is resolved by the user: apply the server version or
 * keep editing the local one (a newer external revision re-prompts).
 */
export function SyncConflictBanner() {
  const pendingConflicts = useAppStore((s) => s.pendingConflicts);
  const resolveConflict = useAppStore((s) => s.resolveConflict);

  if (pendingConflicts.length === 0) return null;

  // z-[60]: above the Sheet dialog (z-50) — conflicts most often fire with the edit dialog open
  return (
    <div className="fixed top-10 inset-x-0 z-[60] flex justify-center pointer-events-none px-4">
      <div className="bg-destructive text-destructive-foreground rounded-lg shadow-md pointer-events-auto divide-y divide-destructive-foreground/20">
        {pendingConflicts.map((conflict) => (
          <div key={`${conflict.entityType}-${conflict.id}`} className="flex items-center gap-3 px-4 py-2 text-sm">
            {conflict.kind === 'deleted' ? (
              <Trash2 className="size-4 shrink-0" />
            ) : (
              <PenLine className="size-4 shrink-0" />
            )}
            <span>
              <strong>{ENTITY_LABELS[conflict.entityType]}</strong>{' '}
              &laquo;{conflict.title}&raquo;{conflict.kind === 'deleted' ? ' удалена' : ' изменена'} извне
            </span>
            <div className="flex items-center gap-2 ml-2">
              <Button
                size="sm"
                variant="secondary"
                className="h-7 px-2 text-xs"
                onClick={() => resolveConflict(conflict.id, conflict.entityType, 'apply')}
              >
                <RefreshCw className="size-3 mr-1" />
                Обновить
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-destructive-foreground hover:bg-destructive-foreground/10"
                onClick={() => resolveConflict(conflict.id, conflict.entityType, 'keep')}
              >
                Продолжить редактирование
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
