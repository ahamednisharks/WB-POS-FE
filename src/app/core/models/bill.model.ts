import { PaymentMode, Timestamped } from './common.model';

export type BillStatus = 'COMPLETED' | 'HELD' | 'CANCELLED';
export type DiscountType = 'AMOUNT' | 'PERCENT';
export type BillPaymentMode = PaymentMode | 'SPLIT';
export type BillLineKind = 'ITEM' | 'COMBO';

/** What the billing screen sends for each cart row. */
export interface BillLineInput {
  kind: BillLineKind;
  /** itemId or comboId */
  refId: string;
  code: string;
  name: string;
  unitCode: string;
  allowDecimal: boolean;
  qty: number;
  rate: number;
  gstPercent: number;
  priceIncludesGst: boolean;
}

/** Stored bill row with tax break-up (computed server side). */
export interface BillLine extends BillLineInput {
  /** qty × rate */
  amount: number;
  /** Share of the bill discount allocated to this row. */
  discount: number;
  taxable: number;
  gstAmount: number;
  /** taxable + gstAmount */
  total: number;
}

export interface BillPayment {
  mode: PaymentMode;
  amount: number;
  reference: string | null;
}

export interface BillHistoryEntry {
  status: BillStatus;
  at: string;
  by: string;
  note: string | null;
}

export interface BillTotals {
  /** Σ qty × rate */
  subTotal: number;
  discountAmount: number;
  /** Value before GST after discount. */
  taxableAmount: number;
  cgst: number;
  sgst: number;
  totalGst: number;
  roundOff: number;
  grandTotal: number;
}

export interface Bill extends BillTotals, Timestamped {
  id: string;
  billNo: string;
  /** ISO date-time of the sale. */
  billDate: string;
  cashierId: string;
  cashierName: string;
  customerMobile: string;
  customerName: string;
  lines: BillLine[];
  itemCount: number;
  discountType: DiscountType;
  discountValue: number;
  payments: BillPayment[];
  paymentMode: BillPaymentMode | null;
  cashReceived: number | null;
  changeReturned: number | null;
  status: BillStatus;
  cancelReason: string | null;
  history: BillHistoryEntry[];
}

export interface BillCreate {
  /** When completing or re-holding a held bill. */
  heldBillId: string | null;
  status: 'COMPLETED' | 'HELD';
  customerMobile: string;
  customerName: string;
  lines: BillLineInput[];
  discountType: DiscountType;
  discountValue: number;
  payments: BillPayment[];
  cashReceived: number | null;
  changeReturned: number | null;
}

export interface BillCancelRequest {
  reason: string;
}
