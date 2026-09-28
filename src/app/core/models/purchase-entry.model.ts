import { BankPaymentMode, PagedResult, Timestamped, UploadedFile } from './common.model';

export type PurchasePaymentStatus = 'UNPAID' | 'PARTLY_PAID' | 'PAID';

export interface PurchaseEntryItem {
  itemId: string;
  itemName: string;
  unitCode: string;
  /** From the PO when raised against one. */
  orderedQty: number | null;
  receivedQty: number;
  rate: number;
  gstPercent: number;
  /** yyyy-MM-dd */
  expiryDate: string | null;
  /** receivedQty × rate (before GST) */
  amount: number;
  gstAmount: number;
}

export interface PurchasePayment {
  id: string;
  amount: number;
  mode: BankPaymentMode;
  /** yyyy-MM-dd */
  date: string;
  createdAt: string;
}

export interface PurchaseEntry extends Timestamped {
  id: string;
  peNo: string;
  /** yyyy-MM-dd */
  peDate: string;
  supplierId: string;
  supplierName: string;
  supplierState: string;
  isInterState: boolean;
  poId: string | null;
  poNo: string | null;
  invoiceNo: string;
  /** yyyy-MM-dd */
  invoiceDate: string;
  invoiceCopy: UploadedFile | null;
  items: PurchaseEntryItem[];
  subTotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  discount: number;
  otherCharges: number;
  roundOff: number;
  grandTotal: number;
  paidAmount: number;
  balance: number;
  /** yyyy-MM-dd — invoice date + supplier payment terms. */
  dueDate: string | null;
  paymentStatus: PurchasePaymentStatus;
  payments: PurchasePayment[];
}

/** Footer totals over every entry matching the list filters. */
export interface PurchaseEntryTotals {
  grandTotal: number;
  paidAmount: number;
  balance: number;
}

/** GET /purchase-entries — rows carry no items / payments (use get(id) for those). */
export interface PurchaseEntryPage extends PagedResult<PurchaseEntry> {
  totals: PurchaseEntryTotals;
}

export interface PurchaseEntryItemInput {
  itemId: string;
  orderedQty: number | null;
  receivedQty: number;
  rate: number;
  gstPercent: number;
  expiryDate: string | null;
}

export interface PurchaseEntrySave {
  peDate: string;
  supplierId: string;
  poId: string | null;
  invoiceNo: string;
  invoiceDate: string;
  invoiceCopy: UploadedFile | null;
  items: PurchaseEntryItemInput[];
  discount: number;
  otherCharges: number;
  /** Payment made while saving (0 … grand total). Ignored on edit. */
  paidNow: number;
  paymentMode: BankPaymentMode | null;
}

export interface PurchasePaymentRequest {
  amount: number;
  mode: BankPaymentMode;
  date: string;
}
