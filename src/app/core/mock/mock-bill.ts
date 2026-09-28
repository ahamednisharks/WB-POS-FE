import { BillLine, BillLineInput, BillPayment, BillPaymentMode, BillTotals, DiscountType } from '../models';
import { calculateBill, round2, round3 } from '../utils/tax.util';

/** Server-side recalculation of a bill — never trust totals sent by the client. */
export function priceBill(
  inputs: BillLineInput[],
  discountType: DiscountType,
  discountValue: number,
): { lines: BillLine[]; totals: BillTotals } {
  const cleaned = inputs.map((l) => ({ ...l, qty: round3(l.qty), rate: round2(l.rate) }));
  const calc = calculateBill(cleaned, discountType, discountValue);
  const lines: BillLine[] = cleaned.map((l, i) => ({ ...l, ...calc.lines[i] }));
  const { lines: _ignored, ...totals } = calc;
  return { lines, totals };
}

export function paymentModeOf(payments: BillPayment[]): BillPaymentMode | null {
  const modes = new Set(payments.filter((p) => p.amount > 0).map((p) => p.mode));
  if (modes.size === 0) return null;
  if (modes.size > 1) return 'SPLIT';
  return [...modes][0];
}
