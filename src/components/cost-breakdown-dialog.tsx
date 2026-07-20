'use client';

import { useMemo } from 'react';
import { Copy, DollarSign, FileDown, X } from 'lucide-react';
import { toast } from 'sonner';

import { cn, copyToClipboard } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { paidAmount } from '@/lib/prices';
import { loadRobotoBase64 } from '@/lib/cost-pdf-font';
import type { Task } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

interface CostRow {
  /** Stable key for React (price id, namespaced by owner task). */
  key: string;
  /** 0 = cost belongs to the task itself, 1 = belongs to a direct subtask. */
  level: 0 | 1;
  /** The id of the task/subtask this cost belongs to — used to open it on row click. */
  taskId: string;
  description: string;
  paid: number;
  total: number;
  currency?: string;
  shortId: string;
}

/** Flatten a task's own costs + its direct subtasks' costs into display rows.
 *  Mirrors `aggregateTaskPriceSummary` (one level of subtasks) so the rows sum
 *  exactly to the badge's displayed { done, total }. */
function buildCostRows(task: Task): CostRow[] {
  const rows: CostRow[] = [];
  const ownCurrency = task.currency;

  for (const p of task.prices ?? []) {
    rows.push({
      key: p.id,
      level: 0,
      taskId: task.id,
      description: p.description,
      paid: paidAmount(p),
      total: p.amount,
      currency: ownCurrency,
      shortId: task.shortId || 'T-?',
    });
  }

  for (const sub of task.subtasks ?? []) {
    const subCurrency = sub.currency ?? ownCurrency;
    for (const p of sub.prices ?? []) {
      rows.push({
        key: `${sub.id}_${p.id}`,
        level: 1,
        taskId: sub.id,
        description: p.description,
        paid: paidAmount(p),
        total: p.amount,
        currency: subCurrency,
        shortId: sub.shortId || 'T-?',
      });
    }
  }

  return rows;
}

/** Quote a single CSV field per RFC 4180 when it contains a delimiter, quote,
 *  or newline. */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Build a CSV string (CRLF line endings — pastes cleanly into Excel). */
function buildCsv(rows: CostRow[]): string {
  const header = ['Cost', 'Paid', 'Total', 'Currency', 'Task'].map(csvField).join(',');
  const body = rows.map((r) =>
    [
      csvField(r.description),
      r.paid.toString(),
      r.total.toString(),
      r.currency ?? '',
      r.shortId,
    ].join(','),
  );
  return [header, ...body].join('\r\n');
}

function CostBreakdownBody({
  task,
  onRowClick,
}: {
  task: Task;
  onRowClick: (taskId: string) => void;
}) {
  const rows = useMemo(() => buildCostRows(task), [task]);

  const totals = useMemo(
    () => rows.reduce((acc, r) => ({ paid: acc.paid + r.paid, total: acc.total + r.total }), { paid: 0, total: 0 }),
    [rows],
  );
  // Currency is unified across a task and its subtasks (inheritance rules);
  // use the resolved task currency, falling back to the first row's currency.
  const currency = task.currency ?? rows[0]?.currency;

  const handleCopy = async () => {
    const ok = await copyToClipboard(buildCsv(rows));
    if (ok) toast.success('Costs copied as CSV');
    else toast.error('Failed to copy');
  };

  const handleExportPdf = async () => {
    try {
      // Dynamic-import so the ~400KB PDF libs are code-split out of the main
      // bundle, load only on click, and are never server-rendered.
      const { default: jsPDF } = await import('jspdf');
      const { autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();
      // jsPDF's built-in fonts don't support Cyrillic — embed Roboto (Unicode).
      const roboto = await loadRobotoBase64();
      doc.addFileToVFS('Roboto-Regular.ttf', roboto);
      doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
      doc.setFont('Roboto');
      doc.setFontSize(14);
      doc.text(`Costs — ${task.title}${task.shortId ? ` (${task.shortId})` : ''}`, 14, 18);
      autoTable(doc, {
        startY: 24,
        head: [['Cost', 'Paid', 'Total', 'Currency', 'Task']],
        body: rows.map((r) => [
          r.description || 'Untitled',
          String(r.paid),
          String(r.total),
          r.currency ?? '',
          r.shortId,
        ]),
        foot: [['Total', String(totals.paid), String(totals.total), currency ?? '', '']],
        styles: { font: 'Roboto', fontSize: 9 },
        headStyles: { fillColor: [120, 113, 108] },
      });
      doc.save(`costs-${task.shortId ?? 'export'}.pdf`);
      toast.success('Costs exported as PDF');
    } catch {
      toast.error('Failed to export PDF');
    }
  };

  return (
    <>
      <DialogHeader className="flex flex-row items-center justify-between gap-2">
        <DialogTitle className="truncate min-w-0 pr-2">
          Costs — {task.title}
        </DialogTitle>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleCopy}
            disabled={rows.length === 0}
          >
            <Copy className="size-3.5" />
            Copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleExportPdf}
            disabled={rows.length === 0}
          >
            <FileDown className="size-3.5" />
            PDF
          </Button>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="size-7" aria-label="Close">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        </div>
      </DialogHeader>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No costs</p>
      ) : (
        <div className="max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Cost</TableHead>
                <TableHead className="text-right">Paid / Total</TableHead>
                <TableHead>Task</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.key}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onRowClick(r.taskId)}
                >
                  <TableCell className={cn('font-medium', r.level === 1 && 'pl-6')}>
                    {r.level === 1 && (
                      <span className="text-muted-foreground/70 mr-1 select-none">↳</span>
                    )}
                    {r.description || (
                      <span className="text-muted-foreground italic">Untitled</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {r.paid} / {r.total}
                    {r.currency ? ` ${r.currency}` : ''}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-md bg-muted/60 border border-border/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                      {r.shortId}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">Total</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {totals.paid} / {totals.total}
                  {currency ? ` ${currency}` : ''}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </>
  );
}

/**
 * Renders the cost-breakdown dialog ONCE at the app root (see home-content.tsx),
 * outside any task card. Keeping it outside the card subtree means clicks inside
 * the dialog (content or overlay) never bubble to a card's onClick / drag
 * handlers — so Radix's overlay-click-to-close works naturally, and opening a
 * task from a row click does NOT also trigger the underlying card. Clicking a
 * row calls selectTask(sourceId) and leaves this dialog open; the task detail
 * opens on top, and each layer closes independently on its own outside click.
 */
export function CostBreakdownDialog() {
  const costBreakdownTaskId = useAppStore((s) => s.costBreakdownTaskId);
  const tasks = useAppStore((s) => s.tasks);
  const selectTask = useAppStore((s) => s.selectTask);
  const setCostBreakdownTask = useAppStore((s) => s.setCostBreakdownTask);

  const task = useMemo(
    () => tasks.find((t) => t.id === costBreakdownTaskId) ?? null,
    [tasks, costBreakdownTaskId],
  );

  return (
    <Dialog
      open={!!task}
      onOpenChange={(o) => {
        if (!o) setCostBreakdownTask(null);
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-2xl">
        {task && <CostBreakdownBody task={task} onRowClick={selectTask} />}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The cost-summary badge shown on task cards. Renders the same content as the
 * previous inline badge, but on click opens the cost-breakdown dialog (rendered
 * once at the app root) by setting `costBreakdownTaskId`. Click and pointer-down
 * are stopped so the surrounding card's select / drag handlers don't fire when
 * the badge is clicked.
 */
export function CostSummaryBadge({
  task,
  variant = 'outline',
  className,
}: {
  task: Task;
  variant?: 'outline' | 'secondary';
  className?: string;
}) {
  const setCostBreakdownTask = useAppStore((s) => s.setCostBreakdownTask);

  if (!task.priceSummary || task.priceSummary.total <= 0) return null;

  const stop = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation();

  return (
    <Badge
      variant={variant}
      role="button"
      tabIndex={0}
      title="Show cost breakdown"
      className={cn('cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors', className)}
      onClick={(e) => {
        stop(e);
        setCostBreakdownTask(task.id);
      }}
      onPointerDown={stop}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          setCostBreakdownTask(task.id);
        }
      }}
    >
      <DollarSign className="size-3" />
      {task.priceSummary.done} ({task.priceSummary.total})
      {task.currency ? ` ${task.currency}` : ''}
    </Badge>
  );
}
