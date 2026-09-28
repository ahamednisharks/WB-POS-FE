import { BillTotals, DiscountType } from '../models/bill.model';
import { PurchaseTotals } from '../models/purchase-order.model';

/** Round to 2 decimals (paise), avoiding binary float drift. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Round quantities to 3 decimals (grams). */
export function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export interface TaxLineInput {
  qty: number;
  rate: number;
  gstPercent: number;
  priceIncludesGst: boolean;
}

export interface TaxLineResult {
  amount: number;
  discount: number;
  taxable: number;
  gstAmount: number;
  total: number;
}

export interface BillCalculation extends BillTotals {
  lines: TaxLineResult[];
}

/** Discount in ₹ for a sub total. Percent is capped at 100. */
export function discountAmountFor(subTotal: number, type: DiscountType, value: number): number {
  if (!value || value <= 0 || subTotal <= 0) return 0;
  const amount = type === 'PERCENT' ? (subTotal * Math.min(value, 100)) / 100 : value;
  return round2(Math.min(amount, subTotal));
}

/**
 * Bill tax logic:
 *  - Bill discount is spread over rows in proportion to their amount.
 *  - "Price includes GST" rows: tax is back-calculated from the discounted amount.
 *  - Other rows: GST is added on top of the discounted amount.
 *  - CGST = SGST = GST / 2. Grand total is rounded to the nearest rupee.
 */
export function calculateBill(lines: TaxLineInput[], discountType: DiscountType, discountValue: number): BillCalculation {
  const amounts = lines.map((l) => round2(l.qty * l.rate));
  const subTotal = round2(amounts.reduce((s, a) => s + a, 0));
  const discountAmount = discountAmountFor(subTotal, discountType, discountValue);

  let allocated = 0;
  const results: TaxLineResult[] = lines.map((line, i) => {
    const amount = amounts[i];
    let discount = subTotal > 0 ? round2((discountAmount * amount) / subTotal) : 0;
    if (i === lines.length - 1) discount = round2(discountAmount - allocated);
    allocated = round2(allocated + discount);

    const net = amount - discount;
    const rate = line.gstPercent / 100;
    let taxable: number;
    let gstAmount: number;
    if (line.priceIncludesGst) {
      taxable = round2(net / (1 + rate));
      gstAmount = round2(net - taxable);
    } else {
      taxable = round2(net);
      gstAmount = round2(net * rate);
    }
    return { amount, discount, taxable, gstAmount, total: round2(taxable + gstAmount) };
  });

  const taxableAmount = round2(results.reduce((s, r) => s + r.taxable, 0));
  const totalGst = round2(results.reduce((s, r) => s + r.gstAmount, 0));
  const cgst = round2(totalGst / 2);
  const sgst = round2(totalGst - cgst);
  const exact = round2(taxableAmount + totalGst);
  const grandTotal = Math.round(exact);
  const roundOff = round2(grandTotal - exact);

  return { lines: results, subTotal, discountAmount, taxableAmount, cgst, sgst, totalGst, roundOff, grandTotal };
}

export interface PurchaseLineInput {
  qty: number;
  rate: number;
  gstPercent: number;
}

export interface PurchaseCalculation extends PurchaseTotals {
  lines: { amount: number; gstAmount: number }[];
  discount: number;
}

/**
 * Purchase tax logic (rates are before GST):
 *  - Same state as the shop → CGST + SGST, other state → IGST.
 *  - Grand total = sub total + GST − discount + other charges, rounded to the rupee.
 */
export function calculatePurchase(
  lines: PurchaseLineInput[],
  interState: boolean,
  otherCharges = 0,
  discount = 0,
): PurchaseCalculation {
  const calc = lines.map((l) => {
    const amount = round2((l.qty || 0) * (l.rate || 0));
    return { amount, gstAmount: round2((amount * (l.gstPercent || 0)) / 100) };
  });
  const subTotal = round2(calc.reduce((s, l) => s + l.amount, 0));
  const totalGst = round2(calc.reduce((s, l) => s + l.gstAmount, 0));
  const igst = interState ? totalGst : 0;
  const cgst = interState ? 0 : round2(totalGst / 2);
  const sgst = interState ? 0 : round2(totalGst - cgst);
  const exact = round2(subTotal + totalGst - (discount || 0) + (otherCharges || 0));
  const grandTotal = Math.max(0, Math.round(exact));
  const roundOff = round2(grandTotal - exact);
  return {
    lines: calc,
    subTotal,
    cgst,
    sgst,
    igst,
    totalGst,
    discount: round2(discount || 0),
    otherCharges: round2(otherCharges || 0),
    roundOff,
    grandTotal,
  };
}
