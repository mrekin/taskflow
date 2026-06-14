import type { TaskPrice, TaskPayment, TaskPriceStatus } from '@/lib/types';

/**
 * Pure helpers for the cost ("price") domain. Shared by the server
 * (src/services/task.service.ts) and the client store (src/store/app-store.ts)
 * so aggregation logic stays in one place. No DB / fetch / React deps.
 */

/** Actually-paid amount for one cost: sum of payments if present, else legacy
 *  fallback (done ? amount : 0) for rows that predate the payments feature. */
export function paidAmount(price: TaskPrice): number {
  const payments = price.payments ?? [];
  if (payments.length > 0) {
    return payments.reduce((sum, p) => sum + p.amount, 0);
  }
  return price.status === 'done' ? price.amount : 0;
}

/** Derive status from paid vs amount. Pure. */
export function deriveStatus(paid: number, amount: number): TaskPriceStatus {
  if (paid <= 0) return 'planned';
  if (paid >= amount) return 'done';
  return 'in_progress';
}

/** Materialise the implicit prior full payment on a paymentless done row so
 *  that adding a payment does not regress the displayed paid amount. */
function materialiseLegacyPaid(price: TaskPrice): TaskPayment[] {
  if ((price.payments?.length ?? 0) === 0 && price.status === 'done' && price.amount > 0) {
    return [{ id: `${price.id}_seed`, amount: price.amount, date: price.createdAt }];
  }
  return price.payments ?? [];
}

/** Apply a payment. Returns { price, overshoot }; overshoot > 0 means the
 *  caller must confirm raising the cost amount to the new paid total.
 *  amount <= 0 is a no-op. Pure — returns a new price object. */
export function applyPayment(
  price: TaskPrice,
  amount: number,
  date?: string,
  paymentId?: string,
): { price: TaskPrice; overshoot: number } {
  if (!(amount > 0)) return { price, overshoot: 0 };

  const payments = [
    ...materialiseLegacyPaid(price),
    {
      id: paymentId ?? `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      amount,
      date: date ?? new Date().toISOString(),
    },
  ];
  const paid = payments.reduce((sum, p) => sum + p.amount, 0);
  const overshoot = Math.max(0, paid - price.amount);
  const status = deriveStatus(paid, price.amount);
  return { price: { ...price, payments, status }, overshoot };
}

/** Remove one payment by id and recompute status. Pure. */
export function removePayment(price: TaskPrice, paymentId: string): TaskPrice {
  const payments = (price.payments ?? []).filter((p) => p.id !== paymentId);
  const paid = payments.reduce((sum, p) => sum + p.amount, 0);
  const status = deriveStatus(paid, price.amount);
  return { ...price, payments, status };
}

/** Mark a cost done by creating a payment for the remaining balance.
 *  No-op if already fully paid. Pure. */
export function markDone(price: TaskPrice, date?: string): TaskPrice {
  const paid = paidAmount(price);
  const remaining = price.amount - paid;
  if (remaining <= 0) {
    return { ...price, status: 'done' };
  }
  const payments = [
    ...materialiseLegacyPaid(price),
    {
      id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      amount: remaining,
      date: date ?? new Date().toISOString(),
    },
  ];
  return { ...price, payments, status: 'done' };
}

/** Wipe all payments and reset to planned. Pure. */
export function resetToPlanned(price: TaskPrice): TaskPrice {
  return { ...price, status: 'planned', payments: [] };
}

/** Recompute a cost's status from its current paid amount (use after a
 *  manual amount edit that may change the paid/amount relationship). Pure. */
export function recomputeStatus(price: TaskPrice): TaskPrice {
  return { ...price, status: deriveStatus(paidAmount(price), price.amount) };
}

/** Aggregate { done, total } over a flat list of prices.
 *  done = Σ paidAmount; total = Σ amount. Returns {0,0} for empty input. */
export function summarize(prices: TaskPrice[]): { done: number; total: number } {
  return prices.reduce(
    (acc, p) => {
      acc.total += p.amount;
      acc.done += paidAmount(p);
      return acc;
    },
    { done: 0, total: 0 },
  );
}
