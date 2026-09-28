import { Item, PurchasePaymentStatus } from '../../../core/models';

/** Item as offered in the PO / PE item pickers (RAW / BOTH items). */
export interface PurchaseItemOption {
  id: string;
  name: string;
  code: string;
  unitCode: string;
  /** Last purchase rate — default rate for new rows. */
  purchasePrice: number;
  gstPercent: number;
  allowDecimal: boolean;
}

export function toPurchaseItemOption(i: Item): PurchaseItemOption {
  return {
    id: i.id,
    name: i.name,
    code: i.code,
    unitCode: i.unitCode,
    purchasePrice: i.purchasePrice,
    gstPercent: i.gstPercent,
    allowDecimal: i.allowDecimal,
  };
}

/** Option for an item that is referenced by a saved document but no longer active. */
export function fallbackItemOption(line: {
  itemId: string;
  itemName: string;
  unitCode: string;
  rate: number;
  gstPercent: number;
}): PurchaseItemOption {
  return {
    id: line.itemId,
    name: line.itemName,
    code: '',
    unitCode: line.unitCode,
    purchasePrice: line.rate,
    gstPercent: line.gstPercent,
    allowDecimal: true,
  };
}

/** Adds fallback options for lines whose item is missing from the active list. */
export function withFallbackItems(
  options: PurchaseItemOption[],
  lines: { itemId: string; itemName: string; unitCode: string; rate: number; gstPercent: number }[],
): PurchaseItemOption[] {
  const result = [...options];
  for (const l of lines) {
    if (!result.some((o) => o.id === l.itemId)) result.push(fallbackItemOption(l));
  }
  return result;
}

/** Equality for id lists so dependent computeds only re-run when the picked items change. */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** For every row: all items except the ones already picked in other rows (prevents duplicates). */
export function optionsPerRow(ids: readonly string[], all: PurchaseItemOption[]): PurchaseItemOption[][] {
  return ids.map((id) => all.filter((it) => it.id === id || !ids.includes(it.id)));
}

/** Same rule as the backend: nothing paid → Unpaid, fully paid → Paid, else Partly Paid. */
export function purchasePaymentStatus(grandTotal: number, paid: number): PurchasePaymentStatus {
  if (paid <= 0) return 'UNPAID';
  return paid + 0.009 >= grandTotal ? 'PAID' : 'PARTLY_PAID';
}
