import { Status, Timestamped } from './common.model';
import { GstRate } from './item.model';

export interface ComboItem {
  itemId: string;
  itemName: string;
  qty: number;
  /** Selling price of the item at the time the combo was saved. */
  price: number;
}

export interface Combo extends Timestamped {
  id: string;
  name: string;
  items: ComboItem[];
  actualPrice: number;
  comboPrice: number;
  savings: number;
  gstPercent: GstRate;
  /** yyyy-MM-dd */
  validFrom: string | null;
  /** yyyy-MM-dd */
  validTo: string | null;
  image: string | null;
  status: Status;
}

export type ComboSave = Pick<
  Combo,
  'name' | 'items' | 'comboPrice' | 'gstPercent' | 'validFrom' | 'validTo' | 'image' | 'status'
>;
