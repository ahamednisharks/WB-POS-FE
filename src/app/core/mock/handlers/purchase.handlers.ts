import { environment } from '../../../../environments/environment';
import {
  BankPaymentMode,
  PurchaseEntry,
  PurchaseEntryItem,
  PurchaseEntryItemInput,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderItemInput,
  PurchasePaymentStatus,
  Supplier,
  UploadedFile,
} from '../../models';
import { addDays, istDate, nowIso, todayIST } from '../../utils/date.util';
import { calculatePurchase, round2, round3 } from '../../utils/tax.util';
import { crudRoutes } from '../mock-crud';
import { clone, MockDatabase, MockDb, newId, pad } from '../mock-db';
import { badRequest, bodyOf, conflict, MockRoute, notFound, num, oneOf, required, str, whereEq } from '../mock-http';
import { addTransaction } from '../mock-txn';

const PAY_MODES: readonly BankPaymentMode[] = ['CASH', 'BANK', 'UPI'];

function supplierOf(db: MockDatabase, id: string): Supplier {
  const s = db.suppliers.find((x) => x.id === id);
  if (!s) throw badRequest('Supplier not found', 'supplierId');
  return s;
}

function dateOf(value: unknown, label: string, field: string): string {
  const s = str(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw badRequest(`${label} is required`, field);
  return s;
}

function purchasableItem(db: MockDatabase, itemId: string) {
  const it = db.items.find((i) => i.id === itemId);
  if (!it) throw badRequest('One of the items no longer exists', 'items');
  if (it.type === 'SALE') throw badRequest(`${it.name} is a sale-only item and cannot be purchased`, 'items');
  return it;
}

function inDateRange(date: string, from?: string, to?: string): boolean {
  return (!from || date >= from) && (!to || date <= to);
}

function paymentStatusOf(grand: number, paid: number): PurchasePaymentStatus {
  if (paid <= 0) return 'UNPAID';
  return paid + 0.009 >= grand ? 'PAID' : 'PARTLY_PAID';
}

// ------------------------------------------------------------ purchase orders
const poCrud = crudRoutes<PurchaseOrder>({
  path: '/purchase-orders',
  label: 'Purchase order',
  rows: (db) => db.purchaseOrders,
  view: (po) => po,
  search: (po) => [po.poNo, po.supplierName, ...po.items.map((i) => i.itemName)],
  ownStatusFilter: true,
  filter: (rows, p) => {
    let r = whereEq(rows, p, 'supplierId', (po) => po.supplierId);
    if (p['status'] === 'OPEN') r = r.filter((po) => po.status === 'SENT' || po.status === 'PARTIAL');
    else r = whereEq(r, p, 'status', (po) => po.status);
    if (p['from'] || p['to']) r = r.filter((po) => inDateRange(po.poDate, p['from'], p['to']));
    return r;
  },
  build: (b, existing, db) => {
    if (existing && existing.status !== 'DRAFT') throw badRequest('Only draft purchase orders can be edited');
    const supplier = supplierOf(db.data, required(b['supplierId'], 'Supplier', 'supplierId'));
    const poDate = dateOf(b['poDate'], 'PO date', 'poDate');
    const expectedDate = str(b['expectedDate']) || null;
    if (expectedDate && expectedDate < poDate) throw badRequest('Expected delivery date cannot be before the PO date', 'expectedDate');
    const inputs = (Array.isArray(b['items']) ? b['items'] : []) as PurchaseOrderItemInput[];
    if (inputs.length === 0) throw badRequest('Add at least one item', 'items');
    const items: PurchaseOrderItem[] = inputs.map((i) => {
      const it = purchasableItem(db.data, i.itemId);
      const qty = round3(num(i.qty));
      const rate = round2(num(i.rate));
      if (qty <= 0) throw badRequest(`Quantity for ${it.name} must be greater than 0`, 'items');
      if (rate <= 0) throw badRequest(`Rate for ${it.name} must be greater than 0`, 'items');
      const gstPercent = num(i.gstPercent, it.gstPercent);
      const amount = round2(qty * rate);
      return { itemId: it.id, itemName: it.name, unitCode: it.unitCode, qty, receivedQty: 0, rate, gstPercent, amount, gstAmount: round2((amount * gstPercent) / 100) };
    });
    const interState = supplier.state !== environment.shop.state;
    const calc = calculatePurchase(items, interState, Math.max(0, num(b['otherCharges'])));
    const status = oneOf(b['status'], ['DRAFT', 'SENT'] as const, 'Status', 'status', 'DRAFT');
    return {
      poNo: existing?.poNo ?? `PO-${pad(db.next('po'), 4)}`,
      poDate,
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierGstin: supplier.gstin,
      supplierState: supplier.state,
      supplierMobile: supplier.mobile,
      isInterState: interState,
      expectedDate,
      notes: str(b['notes']),
      items,
      subTotal: calc.subTotal,
      cgst: calc.cgst,
      sgst: calc.sgst,
      igst: calc.igst,
      totalGst: calc.totalGst,
      otherCharges: calc.otherCharges,
      roundOff: calc.roundOff,
      grandTotal: calc.grandTotal,
      status,
      cancelReason: null,
    };
  },
  beforeDelete: (po) => {
    if (po.status !== 'DRAFT') throw badRequest('Only draft purchase orders can be deleted. Cancel it instead.');
  },
});

function refreshPoStatus(po: PurchaseOrder): void {
  if (po.status === 'CANCELLED' || po.status === 'DRAFT') return;
  const anyReceived = po.items.some((i) => i.receivedQty > 0);
  const allReceived = po.items.every((i) => i.receivedQty + 0.0001 >= i.qty);
  po.status = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : 'SENT';
}

// ----------------------------------------------------------- purchase entries
/** Applies (+1) or reverts (−1) the stock / PO effects of a purchase entry. */
function applyEntry(db: MockDb, pe: PurchaseEntry, direction: 1 | -1): void {
  for (const line of pe.items) {
    const it = db.data.items.find((i) => i.id === line.itemId);
    if (it) {
      it.currentStock = round3(it.currentStock + direction * line.receivedQty);
      if (direction === 1) it.purchasePrice = line.rate;
    }
  }
  if (pe.poId) {
    const po = db.data.purchaseOrders.find((p) => p.id === pe.poId);
    if (po) {
      for (const line of pe.items) {
        const pl = po.items.find((i) => i.itemId === line.itemId);
        if (pl) pl.receivedQty = Math.max(0, round3(pl.receivedQty + direction * line.receivedQty));
      }
      refreshPoStatus(po);
      po.updatedAt = nowIso();
    }
  }
}

function assertSameDay(pe: PurchaseEntry, action: string): void {
  if (istDate(pe.createdAt) !== todayIST()) throw badRequest(`Purchase entries can only be ${action} on the day they were created`);
}

const peCrud = crudRoutes<PurchaseEntry>({
  path: '/purchase-entries',
  label: 'Purchase entry',
  rows: (db) => db.purchaseEntries,
  view: (pe) => pe,
  search: (pe) => [pe.peNo, pe.invoiceNo, pe.supplierName, pe.poNo],
  filter: (rows, p) => {
    let r = whereEq(rows, p, 'supplierId', (pe) => pe.supplierId);
    r = whereEq(r, p, 'paymentStatus', (pe) => pe.paymentStatus);
    if (p['from'] || p['to']) r = r.filter((pe) => inDateRange(pe.peDate, p['from'], p['to']));
    return r;
  },
  build: (b, existing, db) => {
    if (existing) assertSameDay(existing, 'edited');
    const supplier = supplierOf(db.data, required(b['supplierId'], 'Supplier', 'supplierId'));
    const peDate = dateOf(b['peDate'], 'PE date', 'peDate');
    if (peDate > todayIST()) throw badRequest('PE date cannot be in the future', 'peDate');
    const invoiceNo = required(b['invoiceNo'], 'Supplier invoice no.', 'invoiceNo');
    if (
      db.data.purchaseEntries.some(
        (e) => e.id !== existing?.id && e.supplierId === supplier.id && e.invoiceNo.toLowerCase() === invoiceNo.toLowerCase(),
      )
    ) {
      throw conflict('This invoice number is already entered for this supplier', 'invoiceNo');
    }
    const invoiceDate = dateOf(b['invoiceDate'], 'Invoice date', 'invoiceDate');
    if (invoiceDate > peDate) throw badRequest('Invoice date cannot be after the PE date', 'invoiceDate');

    let poId: string | null = str(b['poId']) || null;
    let poNo: string | null = null;
    if (poId) {
      const po = db.data.purchaseOrders.find((p) => p.id === poId);
      if (!po || po.supplierId !== supplier.id) throw badRequest('Selected PO does not belong to this supplier', 'poId');
      const stillOpen = po.status === 'SENT' || po.status === 'PARTIAL' || existing?.poId === po.id;
      if (!stillOpen) throw badRequest(`${po.poNo} is not open for receiving`, 'poId');
      poNo = po.poNo;
    } else {
      poId = null;
    }

    const inputs = (Array.isArray(b['items']) ? b['items'] : []) as PurchaseEntryItemInput[];
    if (inputs.length === 0) throw badRequest('Add at least one item', 'items');
    const items: PurchaseEntryItem[] = inputs.map((i) => {
      const it = purchasableItem(db.data, i.itemId);
      const receivedQty = round3(num(i.receivedQty));
      const rate = round2(num(i.rate));
      if (receivedQty <= 0) throw badRequest(`Received qty for ${it.name} must be greater than 0`, 'items');
      if (rate <= 0) throw badRequest(`Rate for ${it.name} must be greater than 0`, 'items');
      const gstPercent = num(i.gstPercent, it.gstPercent);
      const amount = round2(receivedQty * rate);
      return {
        itemId: it.id,
        itemName: it.name,
        unitCode: it.unitCode,
        orderedQty: i.orderedQty === null || i.orderedQty === undefined ? null : num(i.orderedQty),
        receivedQty,
        rate,
        gstPercent,
        expiryDate: str(i.expiryDate) || null,
        amount,
        gstAmount: round2((amount * gstPercent) / 100),
      };
    });

    const interState = supplier.state !== environment.shop.state;
    const discount = Math.max(0, num(b['discount']));
    const calc = calculatePurchase(
      items.map((i) => ({ qty: i.receivedQty, rate: i.rate, gstPercent: i.gstPercent })),
      interState,
      Math.max(0, num(b['otherCharges'])),
      discount,
    );

    let payments = existing?.payments ?? [];
    if (!existing) {
      const paidNow = round2(Math.max(0, num(b['paidNow'])));
      if (paidNow > calc.grandTotal) throw badRequest('Paid amount cannot exceed the grand total', 'paidNow');
      if (paidNow > 0) {
        const mode = oneOf(b['paymentMode'], PAY_MODES, 'Payment mode', 'paymentMode');
        payments = [{ id: newId(), amount: paidNow, mode, date: peDate, createdAt: nowIso() }];
      }
    }
    const paidAmount = round2(payments.reduce((s, p) => s + p.amount, 0));
    if (paidAmount > calc.grandTotal) throw badRequest('Grand total cannot be less than the amount already paid');

    const file = b['invoiceCopy'] as UploadedFile | null | undefined;
    if (file && file.size > 5 * 1024 * 1024) throw badRequest('Invoice copy must be 5 MB or smaller', 'invoiceCopy');
    return {
      peNo: existing?.peNo ?? `PE-${pad(db.next('pe'), 4)}`,
      peDate,
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierState: supplier.state,
      isInterState: interState,
      poId,
      poNo,
      invoiceNo,
      invoiceDate,
      invoiceCopy: file?.dataUrl ? file : null,
      items,
      subTotal: calc.subTotal,
      cgst: calc.cgst,
      sgst: calc.sgst,
      igst: calc.igst,
      totalGst: calc.totalGst,
      discount: calc.discount,
      otherCharges: calc.otherCharges,
      roundOff: calc.roundOff,
      grandTotal: calc.grandTotal,
      paidAmount,
      balance: round2(calc.grandTotal - paidAmount),
      dueDate: addDays(invoiceDate, supplier.paymentTermsDays),
      paymentStatus: paymentStatusOf(calc.grandTotal, paidAmount),
      payments,
    };
  },
  afterSave: (pe, previous, db, req) => {
    if (previous) applyEntry(db, previous, -1);
    applyEntry(db, pe, 1);
    if (!previous) {
      for (const p of pe.payments) {
        if (p.mode === 'CASH') {
          addTransaction(db, req.user, { type: 'CASH_OUT', mode: 'CASH', amount: p.amount, note: `Supplier payment - ${pe.supplierName} (${pe.peNo})` });
        }
      }
    }
  },
  beforeDelete: (pe, db) => {
    assertSameDay(pe, 'deleted');
    applyEntry(db, pe, -1);
    // Undo the till cash-outs recorded for cash payments against this entry.
    const tag = `(${pe.peNo})`;
    db.data.transactions = db.data.transactions.filter((t) => !(t.type === 'CASH_OUT' && t.note?.endsWith(tag)));
  },
});

export const purchaseRoutes: MockRoute[] = [
  ...poCrud,
  {
    method: 'POST',
    pattern: /^\/purchase-orders\/([^/]+)\/cancel$/,
    roles: ['ADMIN'],
    handler: (req) => {
      const db = MockDb.get();
      const po = db.data.purchaseOrders.find((p) => p.id === req.match[1]);
      if (!po) throw notFound('Purchase order');
      if (po.status === 'CANCELLED' || po.status === 'RECEIVED') throw badRequest(`A ${po.status.toLowerCase()} PO cannot be cancelled`);
      const reason = str(bodyOf<{ reason?: string }>(req).reason);
      if (!reason) throw badRequest('Cancel reason is required', 'reason');
      po.status = 'CANCELLED';
      po.cancelReason = reason;
      po.updatedAt = nowIso();
      db.save();
      return clone(po);
    },
  },
  ...peCrud,
  {
    method: 'POST',
    pattern: /^\/purchase-entries\/([^/]+)\/payments$/,
    roles: ['ADMIN'],
    status: 201,
    handler: (req) => {
      const db = MockDb.get();
      const pe = db.data.purchaseEntries.find((p) => p.id === req.match[1]);
      if (!pe) throw notFound('Purchase entry');
      const b = bodyOf<Record<string, unknown>>(req);
      const amount = round2(num(b['amount']));
      if (amount <= 0) throw badRequest('Amount must be greater than 0', 'amount');
      if (amount > pe.balance + 0.009) throw badRequest(`Amount cannot exceed the balance ₹${pe.balance.toFixed(2)}`, 'amount');
      const mode = oneOf(b['mode'], PAY_MODES, 'Payment mode', 'mode');
      const date = dateOf(b['date'], 'Payment date', 'date');
      if (date > todayIST()) throw badRequest('Payment date cannot be in the future', 'date');
      pe.payments.push({ id: newId(), amount, mode, date, createdAt: nowIso() });
      pe.paidAmount = round2(pe.paidAmount + amount);
      pe.balance = round2(pe.grandTotal - pe.paidAmount);
      pe.paymentStatus = paymentStatusOf(pe.grandTotal, pe.paidAmount);
      pe.updatedAt = nowIso();
      if (mode === 'CASH') {
        addTransaction(db, req.user, { type: 'CASH_OUT', mode: 'CASH', amount, note: `Supplier payment - ${pe.supplierName} (${pe.peNo})` });
      }
      db.save();
      return clone(pe);
    },
  },
];
