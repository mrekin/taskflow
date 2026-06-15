'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Plus, Trash2, ChevronRight, CalendarIcon, Wallet } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { TaskPrice } from '@/lib/types';
import {
  paidAmount,
  applyPayment,
  removePayment,
  markDone,
  resetToPlanned,
  recomputeStatus,
} from '@/lib/prices';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

interface CostRowProps {
  price: TaskPrice;
  currency: string;
  mode: 'view' | 'edit';
  onChange: (next: TaskPrice) => void;
  onDelete: () => void;
}

function statusLabel(status: TaskPrice['status']) {
  return status === 'done' ? 'Done' : status === 'in_progress' ? 'In progress' : 'Planned';
}

function StatusBadge({ price }: { price: TaskPrice }) {
  const variant =
    price.status === 'done'
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      : price.status === 'in_progress'
        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
        : 'bg-muted text-muted-foreground';
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded shrink-0 text-center min-w-[68px]', variant)}>
      {statusLabel(price.status)}
    </span>
  );
}

export function CostRow({ price, currency, mode, onChange, onDelete }: CostRowProps) {
  const isEditing = mode === 'edit';
  const paid = paidAmount(price);
  const payments = price.payments ?? [];
  const hasPayments = payments.length > 0;
  const isInProgress = price.status === 'in_progress';

  const [expanded, setExpanded] = useState(false);
  const [amountStr, setAmountStr] = useState<string | undefined>(undefined);
  const [draftPayment, setDraftPayment] = useState('');
  const [draftDate, setDraftDate] = useState<Date | undefined>(() => new Date());
  const [dateOpen, setDateOpen] = useState(false);

  // Overpay confirmation: conditionally mounted so it unmounts instantly on
  // confirm (no stale "to 0" flash during the Radix exit animation).
  const [pendingOverpay, setPendingOverpay] = useState<{
    amount: number;
    date: string;
    proposedTotal: number;
  } | null>(null);
  // Done -> Planned wipe confirmation: snapshot count + conditional mount.
  const [wipePending, setWipePending] = useState<{ count: number } | null>(null);

  const handleAmountChange = (raw: string) => {
    const sanitized = raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setAmountStr(sanitized);
    const amount = parseFloat(sanitized) || 0;
    let next: TaskPrice = { ...price, amount };
    if (payments.length > 0) {
      next = recomputeStatus(next);
    }
    onChange(next);
  };

  const handleAddPayment = () => {
    const amt = parseFloat(draftPayment) || 0;
    if (amt <= 0) return;
    const date = draftDate?.toISOString() ?? new Date().toISOString();
    const { price: next, overshoot } = applyPayment(price, amt, date);
    setDraftPayment('');
    if (overshoot > 0) {
      setPendingOverpay({ amount: amt, date, proposedTotal: paidAmount(next) });
    } else {
      onChange(next);
    }
  };

  const confirmOverpay = () => {
    if (!pendingOverpay) return;
    const { price: next } = applyPayment(price, pendingOverpay.amount, pendingOverpay.date);
    onChange({ ...next, amount: paidAmount(next), status: 'done' });
    setPendingOverpay(null);
  };

  const handleRemovePayment = (paymentId: string) => {
    onChange(removePayment(price, paymentId));
  };

  const handleSwitchChange = (checked: boolean) => {
    if (checked) {
      onChange(markDone(price));
    } else if (price.status === 'done') {
      setWipePending({ count: payments.length });
    }
  };

  const confirmWipe = () => {
    onChange(resetToPlanned(price));
    setWipePending(null);
  };

  // Payments toggle: always available in edit (so a first payment can be added);
  // in view mode only when there is history to show.
  const showToggle = isEditing ? price.amount > 0 : hasPayments;

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/60 px-2 py-1.5 transition-colors hover:border-border">
      {/* Main compact row */}
      <div className="flex items-center gap-2 text-sm">
        {isEditing ? (
          <>
            <Input
              value={price.description}
              onChange={(e) => onChange({ ...price, description: e.target.value })}
              placeholder="Description"
              className="h-7 text-xs flex-1 min-w-0"
            />
            <Input
              value={amountStr ?? String(price.amount)}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0"
              className="h-7 text-xs w-20 shrink-0"
            />
            <div className="flex items-center gap-1 shrink-0 w-[96px] justify-end">
              <Switch
                checked={price.status === 'done'}
                onCheckedChange={handleSwitchChange}
                className="scale-75"
              />
              <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap text-right w-[56px]">
                {isInProgress ? `${paid}/${price.amount}` : statusLabel(price.status)}
              </span>
            </div>
            {showToggle && (
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 w-9 shrink-0 justify-center px-0 text-muted-foreground',
                  expanded && 'bg-muted',
                )}
                onClick={() => setExpanded((v) => !v)}
                title="Payments"
                type="button"
              >
                <Wallet className="size-3.5" />
                {hasPayments && <span className="text-[10px] tabular-nums">{payments.length}</span>}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              type="button"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </>
        ) : (
          <>
            <StatusBadge price={price} />
            <span className="flex-1 truncate text-xs">{price.description}</span>
            <span className="text-xs font-mono font-medium whitespace-nowrap tabular-nums shrink-0 w-24 text-right">
              {isInProgress ? (
                <>
                  <span className="text-amber-600 dark:text-amber-400">{paid}</span>
                  <span className="text-muted-foreground">/{price.amount}</span>
                </>
              ) : (
                price.amount
              )}
              <span className="text-muted-foreground font-normal ml-0.5">{currency}</span>
            </span>
            {hasPayments ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 text-muted-foreground"
                onClick={() => setExpanded((v) => !v)}
                title={`${payments.length} payment${payments.length > 1 ? 's' : ''}`}
                type="button"
              >
                <ChevronRight className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} />
              </Button>
            ) : (
              <span className="size-6 shrink-0" aria-hidden />
            )}
          </>
        )}
      </div>

      {/* Expandable payments panel — collapsed by default */}
      {expanded && (
        <div className="ml-1 pl-3 border-l border-border/60 flex flex-col gap-1 py-0.5">
          {hasPayments ? (
            payments.map((pmt) => (
              <div key={pmt.id} className="flex items-center gap-2 text-[11px]">
                <span className="font-mono">{pmt.amount}</span>
                <span className="text-muted-foreground">{currency}</span>
                <span className="text-muted-foreground ml-auto">
                  {format(new Date(pmt.date), 'dd MMM yyyy')}
                </span>
                {isEditing && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemovePayment(pmt.id)}
                    type="button"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </div>
            ))
          ) : (
            <span className="text-[10px] text-muted-foreground">No payments yet</span>
          )}

          {isEditing && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <Input
                value={draftPayment}
                onChange={(e) =>
                  setDraftPayment(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddPayment();
                  }
                }}
                placeholder="Pay"
                className="h-6 text-xs w-16"
              />
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-6 px-2 text-[11px] gap-1" type="button">
                    <CalendarIcon className="size-3" />
                    {draftDate ? format(draftDate, 'dd MMM') : 'Date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={draftDate}
                    onSelect={(date) => {
                      setDraftDate(date ?? undefined);
                      setDateOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-emerald-600 dark:text-emerald-400"
                onClick={handleAddPayment}
                disabled={!(parseFloat(draftPayment) > 0)}
                type="button"
              >
                <Plus className="size-3 mr-0.5" />
                Add
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Overpay: increase cost amount confirmation */}
      {pendingOverpay && (
        <AlertDialog open onOpenChange={(open) => !open && setPendingOverpay(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Increase cost amount?</AlertDialogTitle>
              <AlertDialogDescription>
                The payment exceeds the remaining balance. The cost amount will be increased from{' '}
                <strong>{price.amount} {currency}</strong> to{' '}
                <strong>{pendingOverpay.proposedTotal} {currency}</strong> and marked as done.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPendingOverpay(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmOverpay}>Increase amount</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Done -> Planned: wipe payment history confirmation */}
      {wipePending && (
        <AlertDialog open onOpenChange={(open) => !open && setWipePending(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset to Planned?</AlertDialogTitle>
              <AlertDialogDescription>
                Switching this cost back to Planned will permanently delete all{' '}
                <strong>{wipePending.count}</strong> payment record{wipePending.count === 1 ? '' : 's'}. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setWipePending(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmWipe}>Reset and delete payments</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
