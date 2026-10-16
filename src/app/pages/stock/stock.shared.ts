import { IssueReason, Item, Option, StockIssueItem, StockIssueStatus, StockTxnType } from '../../core/models';

export const ISSUE_REASON_OPTIONS: Option<IssueReason>[] = [
  { label: 'Sent to Production', value: 'PRODUCTION' },
  { label: 'Wastage', value: 'WASTAGE' },
  { label: 'Expired', value: 'EXPIRED' },
  { label: 'Damaged', value: 'DAMAGED' },
  { label: 'Other', value: 'OTHER' },
];

export const ISSUE_REASON_LABEL: Record<IssueReason, string> = {
  PRODUCTION: 'Sent to Production',
  WASTAGE: 'Wastage',
  EXPIRED: 'Expired',
  DAMAGED: 'Damaged',
  OTHER: 'Other',
};

export const ISSUE_STATUS_OPTIONS: Option<StockIssueStatus>[] = [
  { label: 'Posted', value: 'POSTED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export const STOCK_TXN_LABEL: Record<StockTxnType, string> = {
  OPENING: 'Opening stock',
  PURCHASE: 'Purchase',
  SALE: 'Sale',
  SALE_CANCEL: 'Sale cancelled',
  PE_EDIT: 'Purchase reversal',
  ADJUST: 'Adjustment',
  ISSUE: 'Stock issue',
  ISSUE_CANCEL: 'Issue cancelled',
  PRODUCTION: 'Production',
};

export const STOCK_TYPE_OPTIONS: Option<'RAW' | 'BOTH'>[] = [
  { label: 'Raw Material', value: 'RAW' },
  { label: 'Both (made & sold)', value: 'BOTH' },
];

/** The API returns at most 1000 rows per page; exports page through everything. */
export const EXPORT_PAGE_SIZE = 1000;

/** Item as offered in the Stock Issue picker (RAW / BOTH items). */
export interface StockItemOption {
  id: string;
  name: string;
  code: string;
  unitCode: string;
  allowDecimal: boolean;
  /** Stock right now (the picker shows it as "available"). */
  currentStock: number;
  /** Last purchase rate — values the issue line. */
  purchasePrice: number;
}

export function toStockItemOption(i: Item): StockItemOption {
  return {
    id: i.id,
    name: i.name,
    code: i.code,
    unitCode: i.unitCode,
    allowDecimal: i.allowDecimal,
    currentStock: i.currentStock,
    purchasePrice: i.purchasePrice,
  };
}

/** Option for an item on a saved issue that is no longer active. */
export function fallbackStockItemOption(line: StockIssueItem): StockItemOption {
  return {
    id: line.itemId,
    name: line.itemName,
    code: line.itemCode,
    unitCode: line.unitCode,
    allowDecimal: line.allowDecimal,
    currentStock: line.currentStock,
    purchasePrice: line.rate,
  };
}
