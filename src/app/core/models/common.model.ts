/** Shared primitive types used across entities. */
export type Role = 'ADMIN' | 'CASHIER';
export type Status = 'ACTIVE' | 'INACTIVE';
export type PaymentMode = 'CASH' | 'UPI' | 'CARD';
export type BankPaymentMode = 'CASH' | 'BANK' | 'UPI';

/** Every list endpoint returns this envelope. */
export interface PagedResult<T> {
  data: T[];
  total: number;
}

/** Query string accepted by list endpoints. Extra keys are module-specific filters. */
export interface ListQuery {
  page?: number;
  limit?: number;
  search?: string;
  /** Field name, prefixed with "-" for descending. e.g. "-createdAt" */
  sort?: string;
  [filter: string]: string | number | boolean | null | undefined;
}

/** Response of DELETE endpoints. When the record is referenced elsewhere the backend marks it inactive instead. */
export interface DeleteResult {
  deleted: boolean;
  message: string;
}

export interface ApiMessage {
  message: string;
}

/** Error body returned by the API (and the mock). `field` points at the offending form control when known. */
export interface ApiErrorBody {
  statusCode: number;
  message: string;
  field?: string;
}

export interface Option<T = string> {
  label: string;
  value: T;
}

/** Uploaded document (ID proof, invoice copy) stored as a data URL. */
export interface UploadedFile {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface Timestamped {
  createdAt: string;
  updatedAt: string;
}
