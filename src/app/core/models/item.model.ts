import { Status, Timestamped } from './common.model';

export type ItemType = 'SALE' | 'RAW' | 'BOTH';
export type GstRate = 0 | 5 | 12 | 18 | 28;

export interface Item extends Timestamped {
  id: string;
  code: string;
  name: string;
  type: ItemType;
  categoryId: string;
  categoryName: string;
  unitId: string;
  unitName: string;
  unitCode: string;
  /** Copied from the unit: true for KG/L style units that allow 0.500 qty. */
  allowDecimal: boolean;
  sellingPrice: number;
  /** Read-only: last rate from a Purchase Entry. */
  purchasePrice: number;
  gstPercent: GstRate;
  priceIncludesGst: boolean;
  hsnCode: string;
  barcode: string;
  /** Read-only: maintained by Purchase Entries and sales. */
  currentStock: number;
  minStock: number;
  image: string | null;
  status: Status;
}

export type ItemSave = Pick<
  Item,
  | 'code'
  | 'name'
  | 'type'
  | 'categoryId'
  | 'unitId'
  | 'sellingPrice'
  | 'gstPercent'
  | 'priceIncludesGst'
  | 'hsnCode'
  | 'barcode'
  | 'minStock'
  | 'image'
  | 'status'
>;
