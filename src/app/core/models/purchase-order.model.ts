import { Timestamped } from './common.model';

export type PoStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

export interface PurchaseTotals {
  subTotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  otherCharges: number;
  roundOff: number;
  grandTotal: number;
}

export interface PurchaseOrderItem {
  itemId: string;
  itemName: string;
  unitCode: string;
  qty: number;
  /** Updated by Purchase Entries raised against this PO. */
  receivedQty: number;
  rate: number;
  gstPercent: number;
  /** qty × rate (before GST) */
  amount: number;
  gstAmount: number;
}

export interface PurchaseOrder extends PurchaseTotals, Timestamped {
  id: string;
  poNo: string;
  /** yyyy-MM-dd */
  poDate: string;
  supplierId: string;
  supplierName: string;
  supplierGstin: string;
  supplierState: string;
  supplierMobile: string;
  /** Supplier state differs from shop state → IGST. */
  isInterState: boolean;
  /** yyyy-MM-dd */
  expectedDate: string | null;
  notes: string;
  items: PurchaseOrderItem[];
  status: PoStatus;
  cancelReason: string | null;
}

export interface PurchaseOrderItemInput {
  itemId: string;
  qty: number;
  rate: number;
  gstPercent: number;
}

export interface PurchaseOrderSave {
  poDate: string;
  supplierId: string;
  expectedDate: string | null;
  notes: string;
  items: PurchaseOrderItemInput[];
  otherCharges: number;
  status: 'DRAFT' | 'SENT';
}

export interface PurchaseOrderCancelRequest {
  reason: string;
}
