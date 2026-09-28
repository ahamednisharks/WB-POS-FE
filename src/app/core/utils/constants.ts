import { BankPaymentMode, Option, PaymentMode, Status } from '../models/common.model';
import { GstRate, ItemType } from '../models/item.model';

export const PAGE_SIZE_OPTIONS = [10, 25, 50];

export const GST_RATES: GstRate[] = [0, 5, 12, 18, 28];
export const GST_OPTIONS: Option<GstRate>[] = GST_RATES.map((r) => ({ label: `${r}%`, value: r }));

export const STATUS_OPTIONS: Option<Status>[] = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Inactive', value: 'INACTIVE' },
];

export const ITEM_TYPE_OPTIONS: Option<ItemType>[] = [
  { label: 'Sale Item', value: 'SALE' },
  { label: 'Raw Material', value: 'RAW' },
  { label: 'Both', value: 'BOTH' },
];

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  SALE: 'Sale Item',
  RAW: 'Raw Material',
  BOTH: 'Both',
};

export const PAYMENT_MODE_OPTIONS: Option<PaymentMode>[] = [
  { label: 'Cash', value: 'CASH' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Card', value: 'CARD' },
];

export const PAYMENT_MODE_LABEL: Record<PaymentMode | 'SPLIT', string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  SPLIT: 'Split',
};

export const BANK_PAYMENT_MODE_OPTIONS: Option<BankPaymentMode>[] = [
  { label: 'Cash', value: 'CASH' },
  { label: 'Bank Transfer', value: 'BANK' },
  { label: 'UPI', value: 'UPI' },
];

export const BANK_PAYMENT_MODE_LABEL: Record<BankPaymentMode, string> = {
  CASH: 'Cash',
  BANK: 'Bank Transfer',
  UPI: 'UPI',
};

export const BILL_CANCEL_REASONS = ['Wrong item', 'Customer returned', 'Duplicate bill', 'Other'];

export const INDIAN_STATES: string[] = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

/** Reusable validation patterns. */
export const PATTERNS = {
  username: /^\S{3,30}$/,
  noSpaces: /^\S+$/,
  mobile: /^[6-9]\d{9}$/,
  anyTenDigits: /^\d{10}$/,
  gstin: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  hsn: /^\d{4,8}$/,
  aadhaar: /^\d{12}$/,
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  bankAccount: /^\d{9,18}$/,
  last4: /^\d{4}$/,
};
