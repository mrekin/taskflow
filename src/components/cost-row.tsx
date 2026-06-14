'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Plus, Trash2, ChevronDown, CalendarIcon, History } from 'lucide-react';

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
import { Badge } from '@/components/ui/badge';
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

function StatusBadge({ price }: { price: TaskPrice }) {
  const variant =
    price.status === 'done'
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      : price.status === 'in_progress'
        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
        : 'bg-muted text-muted-foreground';
  const label =
    price.status === 'done' ? 'Done' : price.status === 'in_progress' ? 'In progress' : 'Planned';
  return <span className={cn('text-[10px] px-1.5 py-0.5 rounded shrink-0', variant)}>{label}</span>;
}

export function CostRow({ price, currency, mode, onChange, onDelete }: CostRowProps) {
  const isEditing = mode === 'edit';
  const paid = paidAmount(price);
  const payments = price.payments ?? [];

  const [amountStr, setAmountStr] = useState<string | undefined>(undefined);
  const [draftPayment, setDraftPayment] = useState('');
  const [draftDate, setDraftDate] = useState<Date | undefined>(() => new Date());
  const [dateOpen, setDateOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Overpay (increase cost amount) confirmation — stores the pending payment
  // plus a snapshot of the proposed total for the dialog text. The AlertDialog
  // is conditionally mounted (not just toggled) so it unmounts instantly on
  // confirm and never flashes a stale "to 0" during the exit animation.
  const [pendingOverpay, setPendingOverpay] = useState<{
    amount: number;
    date: string;
    proposedTotal: number;
  } | null>(null);
  // Done -> Planned wipe confirmation — snapshot count + conditional mount.
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
    // Reset the input immediately in both branches to avoid any stale value
    // re-triggering an action while the overpay dialog is open.
    setDraftPayment('');
    if (overshoot > 0) {
      setPendingOverpay({ amount: amt, date, proposedTotal: paidAmount(next) });
    } else {
      onChange(next);
    }
  };

  const confirmOverpay = () => {
    if (!pendingOverpay) return;
    // Recompute from the CURRENT price (not a snapshot) so the proposal can't
    // go stale across re-renders, then raise the amount to the new paid total.
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

  return (
    <div className="flex flex-col gap-1.5 py-0.5">
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
              className="h-7 text-xs w-20"
            />
            <div className="flex items-center gap-1">
              <Switch
                checked={price.status === 'done'}
                onCheckedChange={handleSwitchChange}
                className="scale-75"
              />
              <span className="text-[10px] font-medium text-muted-foreground w-16">
                {price.status === 'done' ? 'Done' : price.status === 'in_progress' ? 'In progress' : 'Planned'}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </>
        ) : (
          <>
            <StatusBadge price={price} />
            <span className="flex-1 truncate text-xs">{price.description}</span>
            <span className="text-xs font-mono font-medium">
              {price.amount} {currency}
            </span>
            {price.status === 'in_progress' && (
              <span className="text-[10px] text-muted-foreground">{paid}/{price.amount} paid</span>
            )}
            {payments.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="size-6 p-0 text-muted-foreground"
                onClick={() => setShowHistory((v) => !v)}
                title={`${payments.length} payment${payments.length > 1 ? 's' : ''}`}
              >
                <History className="size-3.5" />
              </Button>
            )}
          </>
        )}
      </div>

      {/* Progress line for in_progress in edit mode */}
      {isEditing && price.status === 'in_progress' && (
        <div className="flex items-center gap-2 pl-1 text-[10px] text-muted-foreground">
          <span>{paid} / {price.amount} {currency} paid</span>
          <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-amber-500/60"
              style={{ width: `${price.amount > 0 ? Math.min(100, (paid / price.amount) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Payment history */}
      {payments.length > 0 && (showHistory || isEditing) && (
        <div className="flex flex-col gap-1 pl-2 ml-1 border-l border-border">
          {!isEditing && (
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Payments</span>
          )}
          {payments.map((pmt) => (
            <div key={pmt.id} className="flex items-center gap-2 text-xs">
              <span className="font-mono">{pmt.amount} {currency}</span>
              <span className="text-muted-foreground">{format(new Date(pmt.date), 'dd MMM yyyy')}</span>
              {isEditing && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-5 ml-auto text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemovePayment(pmt.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add payment form */}
      {isEditing && (
        <div className="flex items-center gap-2 pl-2 ml-1 border-l border-border">
          <Input
            value={draftPayment}
            onChange={(e) => setDraftPayment(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddPayment();
              }
            }}
            placeholder="Pay"
            className="h-6 text-xs w-20"
          />
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-6 px-2 text-xs gap-1" type="button">
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
            className="h-6 px-2 text-xs text-emerald-600 dark:text-emerald-400"
            onClick={handleAddPayment}
            disabled={!(parseFloat(draftPayment) > 0)}
          >
            <Plus className="size-3 mr-1" />
            Add payment
          </Button>
        </div>
      )}

      {/* Overpay: increase cost amount confirmation — conditionally mounted so it
          unmounts instantly on confirm (no stale "to 0" flash during exit). */}
      {pendingOverpay && (
        <AlertDialog
          open
          onOpenChange={(open) => !open && setPendingOverpay(null)}
        >
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

      {/* Done -> Planned: wipe payment history confirmation — conditional mount. */}
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
