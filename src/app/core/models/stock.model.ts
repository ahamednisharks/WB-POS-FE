import { PagedResult, Timestamped } from './common.model';

/** Why raw material left the warehouse. PRODUCTION = sent to the production unit (the normal case). */
export type IssueReason = 'PRODUCTION' | 'WASTAGE' | 'EXPIRED' | 'DAMAGED' | 'OTHER';
export type StockIssueStatus = 'POSTED' | 'CANCELLED';

/** stock_ledger.txn_type */
export type StockTxnType =
  | 'OPENING'
  | 'PURCHASE'
  | 'SALE'
  | 'SALE_CANCEL'
  | 'PE_EDIT'
  | 'ADJUST'
  | 'ISSUE'
  | 'ISSUE_CANCEL'
  | 'PRODUCTION';

export interface StockIssueItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  unitCode: string;
  allowDecimal: boolean;
  qty: number;
  reason: IssueReason;
  /** Last purchase rate when the issue was posted. */
  rate: number;
  /** qty × rate */
  amount: number;
  remarks: string | null;
  /** The item's stock right now. */
  currentStock: number;
}

export interface StockIssue extends Timestamped {
  id: string;
  issueNo: string;
  /** yyyy-MM-dd */
  issueDate: string;
  remarks: string | null;
  itemCount: number;
  totalValue: number;
  status: StockIssueStatus;
  /** users.id of the creator (numeric, not an entity id string). */
  issuedBy: number;
  issuedByName: string;
  /** List rows only: "Maavu x 2, Sugar x 1". */
  itemsSummary?: string | null;
  /** List rows only: distinct line reasons, comma separated. */
  reasons?: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  cancelledByName: string | null;
  /** Posted, created today, and the logged-in user is the creator or an admin. Decided by the API. */
  isEditable: boolean;
  /** Empty on list rows (use get(id)). */
  items: StockIssueItem[];
}

/** Footer totals over every issue matching the list filters. */
export interface StockIssueTotals {
  postedCount: number;
  cancelledCount: number;
  /** Value of POSTED issues only. */
  totalValue: number;
}

export interface StockIssuePage extends PagedResult<StockIssue> {
  totals: StockIssueTotals;
}

export interface StockIssueItemInput {
  itemId: string;
  qty: number;
  reason: IssueReason;
  remarks: string | null;
}

export interface StockIssueSave {
  issueDate: string;
  remarks: string | null;
  items: StockIssueItemInput[];
}

/** One row of the stock register: opening + purchased + adjusted − used − wastage − sold = closing. */
export interface StockSummaryRow {
  id: string;
  code: string;
  name: string;
  type: 'RAW' | 'BOTH';
  categoryId: string;
  categoryName: string;
  unitCode: string;
  allowDecimal: boolean;
  opening: number;
  purchased: number;
  /** Sent to production. */
  used: number;
  /** Wastage / expired / damaged / other issues. */
  wastage: number;
  /** BOTH items only: sold on bills, net of cancellations. */
  sold: number;
  /** Opening stock entries and manual adjustments, net. */
  adjusted: number;
  closing: number;
  currentStock: number;
  minStock: number;
  /** Last purchase rate. */
  purchasePrice: number;
  /** currentStock × purchasePrice */
  stockValue: number;
  isLow: boolean;
}

export interface StockSummaryTotals {
  itemCount: number;
  lowCount: number;
  purchased: number;
  used: number;
  wastage: number;
  stockValue: number;
}

export interface StockSummaryPage extends PagedResult<StockSummaryRow> {
  totals: StockSummaryTotals;
}

/** Header of GET /items/:id/stock-ledger. */
export interface StockLedgerItem {
  id: string;
  code: string;
  name: string;
  type: 'RAW' | 'BOTH' | 'SALE';
  unitCode: string;
  categoryName: string;
  currentStock: number;
  minStock: number;
  purchasePrice: number;
}

export interface StockLedgerRow {
  id: string;
  txnDate: string;
  type: StockTxnType;
  refTable: string | null;
  refId: string | null;
  /** Bill / PE / stock issue number. */
  refNo: string | null;
  /** Stock issues: line reason and remarks, e.g. "PRODUCTION - morning batch". */
  refNote: string | null;
  qtyIn: number;
  qtyOut: number;
  balanceAfter: number;
  createdByName: string | null;
}

export interface StockLedgerPage extends PagedResult<StockLedgerRow> {
  item: StockLedgerItem;
}

export interface StockAdjustRequest {
  type: 'OPENING' | 'ADJUST';
  /** Positive adds stock, negative removes it. */
  qty: number;
  remarks: string | null;
}
