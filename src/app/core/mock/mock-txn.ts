import { AuthUser, PaymentMode, Transaction, TxnType } from '../models';
import { nowIso } from '../utils/date.util';
import { MockDb, newId, pad } from './mock-db';

/** Records a till movement (payment, refund, cash-out). */
export function addTransaction(
  db: MockDb,
  user: AuthUser | null,
  t: { type: TxnType; mode: PaymentMode; amount: number; reference?: string | null; billId?: string | null; billNo?: string | null; note?: string | null; at?: string },
): Transaction {
  const txn: Transaction = {
    id: newId(),
    txnNo: `TXN-${pad(db.next('txn'), 6)}`,
    txnDate: t.at ?? nowIso(),
    type: t.type,
    mode: t.mode,
    amount: t.amount,
    reference: t.reference ?? null,
    billId: t.billId ?? null,
    billNo: t.billNo ?? null,
    note: t.note ?? null,
    cashierId: user?.id ?? 'system',
    cashierName: user?.name ?? 'System',
  };
  db.data.transactions.push(txn);
  return txn;
}
