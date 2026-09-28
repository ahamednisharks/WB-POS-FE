import { PagedResult, PaymentMode } from './common.model';

export type TxnType = 'PAYMENT' | 'REFUND' | 'CASH_OUT';

export interface Transaction {
  id: string;
  txnNo: string;
  /** ISO date-time */
  txnDate: string;
  type: TxnType;
  mode: PaymentMode;
  /** Always positive; the type tells the direction. */
  amount: number;
  reference: string | null;
  billId: string | null;
  billNo: string | null;
  note: string | null;
  cashierId: string;
  cashierName: string;
}

export interface TransactionSummary {
  totalReceived: number;
  cash: number;
  upi: number;
  card: number;
  refunds: number;
  cashRefunds: number;
  cashOuts: number;
  /** totalReceived − refunds − cashOuts */
  net: number;
}

export interface TransactionListResult extends PagedResult<Transaction> {
  summary: TransactionSummary;
}
