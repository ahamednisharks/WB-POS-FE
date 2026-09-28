import {
  Bill,
  BillCreate,
  BillLineInput,
  BillPayment,
  DashboardData,
  DayClose,
  DayCloseRequest,
  DiscountType,
  PaymentMode,
  Transaction,
  TransactionListResult,
  TransactionSummary,
} from '../../models';
import { istDate, istHour, nowIso, todayIST } from '../../utils/date.util';
import { discountAmountFor, round2 } from '../../utils/tax.util';
import { clone, MockDb, newId, pad } from '../mock-db';
import { paymentModeOf, priceBill } from '../mock-bill';
import { applyListQuery, badRequest, bodyOf, forbidden, MockRequest, MockRoute, notFound, num, str } from '../mock-http';
import { addTransaction } from '../mock-txn';
import { comboActive } from './master.handlers';

const CASHIER_MAX_DISCOUNT_PCT = 10;

function inRange(iso: string, from?: string, to?: string): boolean {
  const d = istDate(iso);
  return (!from || d >= from) && (!to || d <= to);
}

/** Server-side authority on prices: re-reads every line from the masters. */
function resolveLines(db: MockDb, inputs: BillLineInput[]): BillLineInput[] {
  if (!Array.isArray(inputs) || inputs.length === 0) throw badRequest('Add at least one item to the bill');
  return inputs.map((l) => {
    const qty = num(l.qty);
    if (qty <= 0) throw badRequest(`Quantity for ${l.name} must be greater than 0`);
    if (l.kind === 'COMBO') {
      const c = db.data.combos.find((x) => x.id === l.refId);
      if (!c || !comboActive(c, todayIST())) throw badRequest(`${l.name} is not available today`);
      if (!Number.isInteger(qty)) throw badRequest(`${c.name} quantity must be a whole number`);
      return { ...l, qty, code: 'COMBO', name: c.name, unitCode: 'PCS', allowDecimal: false, rate: c.comboPrice, gstPercent: c.gstPercent, priceIncludesGst: true };
    }
    const it = db.data.items.find((x) => x.id === l.refId);
    if (!it || it.status !== 'ACTIVE' || it.type === 'RAW') throw badRequest(`${l.name} is not available for sale`);
    const unit = db.data.units.find((u) => u.id === it.unitId);
    const allowDecimal = unit?.allowDecimal ?? it.allowDecimal;
    if (!allowDecimal && !Number.isInteger(qty)) throw badRequest(`${it.name} quantity must be a whole number`);
    return {
      kind: 'ITEM',
      refId: it.id,
      code: it.code,
      name: it.name,
      unitCode: unit?.shortCode ?? it.unitCode,
      allowDecimal,
      qty,
      rate: it.sellingPrice,
      gstPercent: it.gstPercent,
      priceIncludesGst: it.priceIncludesGst,
    };
  });
}

/** Sold BOTH-type items (bought and resold) reduce stock; in-house SALE items are not stock-tracked. */
function adjustStock(db: MockDb, bill: Bill, direction: 1 | -1): void {
  const move = (itemId: string, qty: number) => {
    const it = db.data.items.find((i) => i.id === itemId);
    if (it && it.type === 'BOTH') it.currentStock = round2(it.currentStock + direction * qty);
  };
  for (const l of bill.lines) {
    if (l.kind === 'ITEM') move(l.refId, l.qty);
    else db.data.combos.find((c) => c.id === l.refId)?.items.forEach((ci) => move(ci.itemId, ci.qty * l.qty));
  }
}

function canSee(req: MockRequest, bill: Bill): boolean {
  return req.user?.role === 'ADMIN' || bill.cashierId === req.user?.id;
}

function createBill(req: MockRequest): Bill {
  const db = MockDb.get();
  const body = bodyOf<BillCreate>(req);
  const user = req.user!;
  const lines = resolveLines(db, body.lines);
  const discountType: DiscountType = body.discountType === 'PERCENT' ? 'PERCENT' : 'AMOUNT';
  const discountValue = Math.max(0, num(body.discountValue));
  const { lines: priced, totals } = priceBill(lines, discountType, discountValue);

  if (user.role === 'CASHIER') {
    const maxAllowed = discountAmountFor(totals.subTotal, 'PERCENT', CASHIER_MAX_DISCOUNT_PCT);
    if (totals.discountAmount > maxAllowed + 0.01) throw forbidden(`Cashiers can give at most ${CASHIER_MAX_DISCOUNT_PCT}% discount`);
  }

  const customerMobile = str(body.customerMobile);
  if (customerMobile && !/^\d{10}$/.test(customerMobile)) throw badRequest('Customer mobile must be 10 digits', 'customerMobile');

  const held = body.heldBillId ? db.data.bills.find((b) => b.id === body.heldBillId && b.status === 'HELD') : undefined;
  if (body.heldBillId && !held) throw badRequest('The held bill was already completed or cancelled');
  const now = nowIso();

  const base = {
    customerMobile,
    customerName: str(body.customerName),
    lines: priced,
    itemCount: priced.length,
    discountType,
    discountValue,
    ...totals,
    updatedAt: now,
  };

  if (body.status === 'HELD') {
    if (held) {
      Object.assign(held, base, { billDate: now });
      held.history.push({ status: 'HELD', at: now, by: user.name, note: 'Updated' });
      db.save();
      return held;
    }
    const bill: Bill = {
      ...base,
      id: newId(),
      billNo: `H-${pad(db.next('held'), 4)}`,
      billDate: now,
      cashierId: user.id,
      cashierName: user.name,
      payments: [],
      paymentMode: null,
      cashReceived: null,
      changeReturned: null,
      status: 'HELD',
      cancelReason: null,
      history: [{ status: 'HELD', at: now, by: user.name, note: null }],
      createdAt: now,
    };
    db.data.bills.push(bill);
    db.save();
    return bill;
  }

  // ---- COMPLETED: validate payments
  const modes: PaymentMode[] = ['CASH', 'UPI', 'CARD'];
  const payments: BillPayment[] = (Array.isArray(body.payments) ? body.payments : [])
    .map((p) => ({ mode: p.mode, amount: round2(num(p.amount)), reference: str(p.reference) || null }))
    .filter((p) => p.amount > 0);
  if (payments.length === 0) throw badRequest('Payment details are required');
  if (payments.some((p) => !modes.includes(p.mode))) throw badRequest('Invalid payment mode');
  const paid = round2(payments.reduce((s, p) => s + p.amount, 0));
  if (Math.abs(paid - totals.grandTotal) > 0.01) {
    throw badRequest(`Payment total ₹${paid.toFixed(2)} must equal the grand total ₹${totals.grandTotal.toFixed(2)}`);
  }
  const cashPart = payments.filter((p) => p.mode === 'CASH').reduce((s, p) => s + p.amount, 0);
  const cashReceived = cashPart > 0 ? round2(Math.max(num(body.cashReceived, cashPart), cashPart)) : null;

  const completed = {
    ...base,
    billNo: `B-${pad(db.next('bill'), 5)}`,
    billDate: now,
    payments,
    paymentMode: paymentModeOf(payments),
    cashReceived,
    changeReturned: cashReceived !== null ? round2(cashReceived - cashPart) : null,
    status: 'COMPLETED' as const,
  };

  let bill: Bill;
  if (held) {
    Object.assign(held, completed);
    held.history.push({ status: 'COMPLETED', at: now, by: user.name, note: `Resumed from hold` });
    bill = held;
  } else {
    bill = {
      ...completed,
      id: newId(),
      cashierId: user.id,
      cashierName: user.name,
      cancelReason: null,
      history: [{ status: 'COMPLETED', at: now, by: user.name, note: null }],
      createdAt: now,
    };
    db.data.bills.push(bill);
  }
  for (const p of payments) {
    addTransaction(db, user, { type: 'PAYMENT', mode: p.mode, amount: p.amount, reference: p.reference, billId: bill.id, billNo: bill.billNo, at: now });
  }
  adjustStock(db, bill, -1);
  db.save();
  return bill;
}

function summarize(rows: Transaction[]): TransactionSummary {
  const sum = (f: (t: Transaction) => boolean) => round2(rows.filter(f).reduce((s, t) => s + t.amount, 0));
  const pay = (t: Transaction) => t.type === 'PAYMENT';
  const totalReceived = sum(pay);
  const refunds = sum((t) => t.type === 'REFUND');
  const cashOuts = sum((t) => t.type === 'CASH_OUT');
  return {
    totalReceived,
    cash: sum((t) => pay(t) && t.mode === 'CASH'),
    upi: sum((t) => pay(t) && t.mode === 'UPI'),
    card: sum((t) => pay(t) && t.mode === 'CARD'),
    refunds,
    cashRefunds: sum((t) => t.type === 'REFUND' && t.mode === 'CASH'),
    cashOuts,
    net: round2(totalReceived - refunds - cashOuts),
  };
}

export const salesRoutes: MockRoute[] = [
  {
    method: 'POST',
    pattern: /^\/bills$/,
    status: 201,
    handler: (req) => clone(createBill(req)),
  },
  {
    method: 'GET',
    pattern: /^\/bills$/,
    handler: (req) => {
      const db = MockDb.get();
      const p = req.params;
      let rows = db.data.bills.filter((b) => canSee(req, b));
      if (p['cashierId']) rows = rows.filter((b) => b.cashierId === p['cashierId']);
      if (p['status'] && p['status'] !== 'ALL') rows = rows.filter((b) => b.status === p['status']);
      if (p['paymentMode'] && p['paymentMode'] !== 'ALL') {
        const m = p['paymentMode'];
        rows = rows.filter((b) => b.paymentMode === m || b.payments.some((x) => x.mode === m));
      }
      if (p['from'] || p['to']) rows = rows.filter((b) => inRange(b.billDate, p['from'], p['to']));
      return clone(applyListQuery(rows, p, (b) => [b.billNo, b.customerMobile, b.customerName], '-billDate'));
    },
  },
  {
    method: 'GET',
    pattern: /^\/bills\/([^/]+)$/,
    handler: (req) => {
      const bill = MockDb.get().data.bills.find((b) => b.id === req.match[1]);
      if (!bill || !canSee(req, bill)) throw notFound('Bill');
      return clone(bill);
    },
  },
  {
    method: 'POST',
    pattern: /^\/bills\/([^/]+)\/cancel$/,
    handler: (req) => {
      const db = MockDb.get();
      const bill = db.data.bills.find((b) => b.id === req.match[1]);
      if (!bill || !canSee(req, bill)) throw notFound('Bill');
      const reason = str(bodyOf<{ reason?: string }>(req).reason);
      if (!reason) throw badRequest('Cancel reason is required', 'reason');
      if (bill.status === 'CANCELLED') throw badRequest('Bill is already cancelled');
      if (bill.status === 'COMPLETED' && req.user?.role !== 'ADMIN') throw forbidden('Only Admin can cancel a completed bill');
      const now = nowIso();
      if (bill.status === 'COMPLETED') {
        for (const p of bill.payments) {
          addTransaction(db, req.user, { type: 'REFUND', mode: p.mode, amount: p.amount, reference: p.reference, billId: bill.id, billNo: bill.billNo, note: `Refund: ${reason}`, at: now });
        }
        adjustStock(db, bill, 1);
      }
      bill.status = 'CANCELLED';
      bill.cancelReason = reason;
      bill.updatedAt = now;
      bill.history.push({ status: 'CANCELLED', at: now, by: req.user?.name ?? 'System', note: reason });
      db.save();
      return clone(bill);
    },
  },
  {
    method: 'GET',
    pattern: /^\/transactions$/,
    handler: (req): TransactionListResult => {
      const db = MockDb.get();
      const p = { ...req.params };
      let rows = db.data.transactions;
      if (req.user?.role === 'CASHIER') {
        // Cashiers see only their own transactions for today.
        p['cashierId'] = req.user.id;
        p['from'] = p['to'] = todayIST();
      }
      if (p['cashierId']) rows = rows.filter((t) => t.cashierId === p['cashierId']);
      if (p['mode'] && p['mode'] !== 'ALL') rows = rows.filter((t) => t.mode === p['mode']);
      if (p['type'] && p['type'] !== 'ALL') rows = rows.filter((t) => t.type === p['type']);
      if (p['from'] || p['to']) rows = rows.filter((t) => inRange(t.txnDate, p['from'], p['to']));
      const summaryRows = rows;
      const page = applyListQuery(rows, p, (t) => [t.txnNo, t.billNo, t.reference, t.note, t.cashierName], '-txnDate');
      return clone({ ...page, summary: summarize(summaryRows) });
    },
  },
  {
    method: 'POST',
    pattern: /^\/day-close$/,
    status: 201,
    handler: (req): DayClose => {
      const db = MockDb.get();
      const b = bodyOf<DayCloseRequest>(req);
      const date = str(b.date) || todayIST();
      const openingCash = round2(Math.max(0, num(b.openingCash)));
      const countedCash = round2(num(b.countedCash, -1));
      if (countedCash < 0) throw badRequest('Counted cash is required', 'countedCash');
      // Recompute from the till so the slip is trustworthy.
      const todays = db.data.transactions.filter(
        (t) => istDate(t.txnDate) === date && (req.user?.role === 'ADMIN' || t.cashierId === req.user?.id),
      );
      const s = summarize(todays);
      const expectedCash = round2(openingCash + s.cash - s.cashRefunds - s.cashOuts);
      const difference = round2(countedCash - expectedCash);
      const remarks = str(b.remarks);
      if (difference !== 0 && !remarks) throw badRequest('Remarks are required when there is a difference', 'remarks');
      const record: DayClose = {
        id: newId(),
        date,
        openingCash,
        cashSales: s.cash,
        cashRefunds: s.cashRefunds,
        cashOuts: s.cashOuts,
        expectedCash,
        countedCash,
        difference,
        remarks,
        closedById: req.user?.id ?? '',
        closedByName: req.user?.name ?? '',
        createdAt: nowIso(),
      };
      db.data.dayCloses.push(record);
      db.save();
      return clone(record);
    },
  },
  {
    method: 'GET',
    pattern: /^\/dashboard$/,
    roles: ['ADMIN'],
    handler: (req): DashboardData => {
      const db = MockDb.get();
      const from = req.params['from'] || todayIST();
      const to = req.params['to'] || from;
      const inPeriod = db.data.bills.filter((b) => inRange(b.billDate, from, to));
      const completed = inPeriod.filter((b) => b.status === 'COMPLETED');
      const cancelled = inPeriod.filter((b) => b.status === 'CANCELLED');
      const totalSales = round2(completed.reduce((s, b) => s + b.grandTotal, 0));
      const split = { cash: 0, upi: 0, card: 0 };
      for (const b of completed) {
        for (const p of b.payments) {
          if (p.mode === 'CASH') split.cash += p.amount;
          else if (p.mode === 'UPI') split.upi += p.amount;
          else split.card += p.amount;
        }
      }
      const hours = Array.from({ length: 17 }, (_, i) => ({ hour: 7 + i, amount: 0, bills: 0 }));
      for (const b of completed) {
        const h = hours.find((x) => x.hour === istHour(b.billDate));
        if (h) {
          h.amount = round2(h.amount + b.grandTotal);
          h.bills++;
        }
      }
      const byItem = new Map<string, { name: string; qty: number; amount: number }>();
      for (const b of completed) {
        for (const l of b.lines) {
          const key = `${l.kind}:${l.refId}`;
          const agg = byItem.get(key) ?? { name: l.name, qty: 0, amount: 0 };
          agg.qty = round2(agg.qty + l.qty);
          agg.amount = round2(agg.amount + l.total);
          byItem.set(key, agg);
        }
      }
      return {
        from,
        to,
        totalSales,
        totalBills: completed.length,
        averageBill: completed.length ? round2(totalSales / completed.length) : 0,
        cancelledCount: cancelled.length,
        cancelledAmount: round2(cancelled.reduce((s, b) => s + b.grandTotal, 0)),
        paymentSplit: { cash: round2(split.cash), upi: round2(split.upi), card: round2(split.card) },
        salesByHour: hours,
        topItems: [...byItem.values()].sort((a, b) => b.amount - a.amount).slice(0, 5),
        recentBills: [...completed]
          .sort((a, b) => b.billDate.localeCompare(a.billDate))
          .slice(0, 10)
          .map((b) => ({ id: b.id, billNo: b.billNo, billDate: b.billDate, cashierName: b.cashierName, grandTotal: b.grandTotal, paymentMode: b.paymentMode })),
      };
    },
  },
];
