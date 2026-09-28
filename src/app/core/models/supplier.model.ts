import { Status, Timestamped } from './common.model';

export interface Supplier extends Timestamped {
  id: string;
  code: string;
  name: string;
  contactPerson: string;
  mobile: string;
  email: string;
  address: string;
  state: string;
  gstin: string;
  openingBalance: number;
  paymentTermsDays: number;
  /** Read-only: opening balance + purchases − payments. */
  currentBalance: number;
  /** Read-only: supplier's state differs from the shop's (IGST instead of CGST + SGST). */
  isInterState?: boolean;
  status: Status;
}

export type SupplierSave = Pick<
  Supplier,
  | 'name'
  | 'contactPerson'
  | 'mobile'
  | 'email'
  | 'address'
  | 'state'
  | 'gstin'
  | 'openingBalance'
  | 'paymentTermsDays'
  | 'status'
>;
