import { PaymentMode, Timestamped } from './common.model';

export type PreOrderStatus = 'BOOKED' | 'READY' | 'DELIVERED' | 'CANCELLED';
export type DeliveryType = 'PICKUP' | 'HOME';

export interface PreOrderLine {
  itemId: string;
  itemCode: string;
  itemName: string;
  categoryName: string;
  unitCode: string;
  allowDecimal: boolean;
  qty: number;
  /** Actual Price: the Item Master price when the item was booked. */
  masterRate: number;
  /** Item Price: the price agreed for this order (cashiers may change it). */
  rate: number;
  /** rate − masterRate */
  rateDiff: number;
  gstPercent: number;
  priceIncludesGst: boolean;
  /** qty × rate */
  amount: number;
  discount: number;
  taxable: number;
  gstAmount: number;
  total: number;
  /** Cake message, eggless, flavour … */
  notes: string;
  /** Reference photo link, if one was uploaded. */
  designUrl: string | null;
}

export interface PreOrderPayment {
  id: string;
  paidAt: string;
  mode: PaymentMode;
  amount: number;
  reference: string | null;
  txnNo: string | null;
  /** Collected with the bill when the order was delivered. */
  atDelivery: boolean;
  receivedByName: string;
}

/** List row. */
export interface PreOrderSummary extends Timestamped {
  id: string;
  /** WB-PRE-2026-0001 */
  orderNo: string;
  orderDate: string;
  customerMobile: string;
  customerName: string;
  altMobile: string;
  /** ISO date-time (IST offset). */
  deliveryAt: string;
  deliveryType: DeliveryType;
  deliveryAddress: string;
  /** Home delivery only; not taxed. */
  deliveryCharge: number;
  itemCount: number;
  subTotal: number;
  discountAmount: number;
  grandTotal: number;
  /** Everything received so far (all advances, plus the balance once delivered). */
  paidAmount: number;
  /** grandTotal − paidAmount */
  balance: number;
  status: PreOrderStatus;
  /** Bill generated on delivery. */
  billId: string | null;
  billNo: string | null;
  bookedByName: string;
  /** "Black Forest x 1.5, Plum Cake x 2" (list only). */
  itemsSummary?: string | null;
}

export interface PreOrder extends PreOrderSummary {
  taxableAmount: number;
  cgst: number;
  sgst: number;
  totalGst: number;
  roundOff: number;
  readyAt: string | null;
  deliveredAt: string | null;
  cancelReason: string | null;
  /** Amount given back on cancel; the rest of paidAmount was kept by the shop. */
  refundAmount: number | null;
  refundMode: PaymentMode | null;
  cancelledAt: string | null;
  lines: PreOrderLine[];
  payments: PreOrderPayment[];
}

/** Shown on the New Pre-Order screen; the number is only taken on save, so another counter booking first moves it on. */
export interface PreOrderNextNo {
  orderNo: string;
  orderDate: string;
}

export interface PreOrderPaymentInput {
  mode: PaymentMode;
  amount: number;
  referenceNo: string | null;
  /** Cash handed over (delivery, CASH only) — the change is worked out by the server. */
  cashReceived?: number | null;
}

export interface PreOrderLineSave {
  itemId: string;
  qty: number;
  /** Item Price. The Actual Price is always read from Item Master by the server. */
  rate: number;
  notes: string | null;
  /** New photo as a data URL, the existing link to keep it, or null. */
  design: string | null;
}

export interface PreOrderSave {
  customerMobile: string;
  customerName: string;
  altMobile: string | null;
  /** ISO date-time with offset. */
  deliveryAt: string;
  deliveryType: DeliveryType;
  deliveryAddress: string | null;
  deliveryCharge: number;
  discountAmount: number;
  items: PreOrderLineSave[];
  /** Payments taken with this save (advance). */
  payments: PreOrderPaymentInput[];
}

export interface PreOrderCancel {
  reason: string;
  /** 0 … paidAmount — the admin decides; the rest is kept by the shop. */
  refundAmount: number;
  refundMode: PaymentMode | null;
  referenceNo: string | null;
}

/** Returning customer found by mobile number. */
export interface CustomerLookup {
  id: string;
  mobile: string;
  name: string;
  totalSpent: number;
  visitCount: number;
  lastVisitAt: string | null;
}
