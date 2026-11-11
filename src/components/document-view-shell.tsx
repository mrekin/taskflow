'use client';

import type { ReactNode } from 'react';
import { ArrowLeft, Columns2, Eye, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group';

export type DocumentViewMode = 'preview' | 'edit' | 'split';

interface DocumentViewShellProps {
  /** Crumbs row rendered under the header bar (optional). */
  breadcrumb?: ReactNode;
  /** Current mode for the built-in View/Edit toggle. Omit to hide the toggle. */
  mode?: DocumentViewMode;
  onModeChange?: (mode: DocumentViewMode) => void;
  /** Read-only: hides the Edit toggle item and shows a "Read-only" badge. */
  readOnly?: boolean;
  /** Back (arrow) button handler. Omit to hide the button. */
  onBack?: () => void;
  /** Slot right after the back button's separator: save status, badges, save button, … */
  headerLeft?: ReactNode;
  /** Right-side actions rendered after the mode toggle. */
  headerActions?: ReactNode;
  /** Main content: toolbars, editor/preview panes. Stretches to fill the shell. */
  children: ReactNode;
  /** Bottom area below the content (e.g. attachments). */
  footer?: ReactNode;
}

/**
 * Shared presentational shell for full-page document views (note editor,
 * large comment view). Markup only — no data logic: header bar with back
 * button + optional View/Edit toggle, optional breadcrumb row, content
 * area and optional footer.
 */
export function DocumentViewShell({
  breadcrumb,
  mode,
  onModeChange,
  readOnly,
  onBack,
  headerLeft,
  headerActions,
  children,
  footer,
}: DocumentViewShellProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Compact header bar */}
      <div className="flex items-center justify-between gap-3 px-2 py-2 border-b shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 size-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <Separator orientation="vertical" className="h-5" />
          {headerLeft}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Built-in mode toggle */}
          {mode && onModeChange && (
            <>
              {readOnly && (
                <Badge variant="secondary" className="text-xs h-5">Read-only</Badge>
              )}
              <ToggleGroup
                type="single"
                value={mode}
                onValueChange={(value) => {
                  if (value) onModeChange(value as DocumentViewMode);
                }}
                className="gap-0"
              >
                <ToggleGroupItem value="preview" className="h-7 px-2.5 text-xs gap-1.5" title="View">
                  <Eye className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">View</span>
                </ToggleGroupItem>
                {!readOnly && (
                  <ToggleGroupItem value="edit" className="h-7 px-2.5 text-xs gap-1.5" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Edit</span>
                  </ToggleGroupItem>
                )}
                {!readOnly && (
                  <ToggleGroupItem value="split" className="h-7 px-2.5 text-xs gap-1.5" title="Side by side">
                    <Columns2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Split</span>
                  </ToggleGroupItem>
                )}
              </ToggleGroup>
            </>
          )}
          {headerActions}
        </div>
      </div>

      {breadcrumb && (
        <div className="shrink-0 border-b px-4 md:px-6 py-2 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-1">
            {breadcrumb}
          </div>
        </div>
      )}

      {/* Content area - takes most of the screen */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {children}
      </div>

      {footer}
    </div>
  );
}
