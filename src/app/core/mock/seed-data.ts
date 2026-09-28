import {
  Bill,
  BillHistoryEntry,
  BillLineInput,
  BillPayment,
  Category,
  Combo,
  Employee,
  EmployeeType,
  GstRate,
  Item,
  ItemType,
  PaymentMode,
  PurchaseEntry,
  PurchaseEntryItem,
  PurchaseOrder,
  PurchaseOrderItem,
  SalaryPayment,
  SalarySetup,
  Supplier,
  Transaction,
  Unit,
} from '../models';
import { addDays, daysInMonth, istDateTime, istHour, startOfMonth, todayIST } from '../utils/date.util';
import { calculatePurchase, round2 } from '../utils/tax.util';
import type { MockDatabase, MockLogin } from './mock-db';
import { paymentModeOf, priceBill } from './mock-bill';

export const SEED_VERSION = 1;

/** Deterministic PRNG so the demo data looks the same on every fresh install. */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSeed(): MockDatabase {
  const rand = mulberry32(20260926);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const today = todayIST();
  const stamp = (daysAgo: number, minute = 0) => istDateTime(addDays(today, -daysAgo), 9, minute);

  // ---------------------------------------------------------------- units
  const unit = (id: string, name: string, shortCode: string, allowDecimal: boolean, minute: number): Unit => ({
    id,
    name,
    shortCode,
    allowDecimal,
    status: 'ACTIVE',
    createdAt: stamp(40, minute),
    updatedAt: stamp(40, minute),
  });
  const units: Unit[] = [
    unit('unit-pcs', 'Pieces', 'PCS', false, 1),
    unit('unit-kg', 'Kilogram', 'KG', true, 2),
    unit('unit-ltr', 'Litre', 'LTR', true, 3),
    unit('unit-pkt', 'Packet', 'PKT', false, 4),
    unit('unit-box', 'Box', 'BOX', false, 5),
  ];
  const unitById = new Map(units.map((u) => [u.id, u]));

  // ----------------------------------------------------------- categories
  const category = (id: string, name: string, displayOrder: number): Category => ({
    id,
    name,
    image: null,
    displayOrder,
    status: 'ACTIVE',
    itemCount: 0,
    createdAt: stamp(39, displayOrder),
    updatedAt: stamp(39, displayOrder),
  });
  const categories: Category[] = [
    category('cat-cakes', 'Cakes', 1),
    category('cat-breads', 'Breads', 2),
    category('cat-puffs', 'Puffs', 3),
    category('cat-cookies', 'Cookies', 4),
    category('cat-beverages', 'Beverages', 5),
    category('cat-snacks', 'Snacks', 6),
    category('cat-raw', 'Raw Materials', 99),
  ];
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // ---------------------------------------------------------------- items
  type ItemDef = [
    name: string,
    type: ItemType,
    categoryId: string,
    unitId: string,
    sellingPrice: number,
    purchasePrice: number,
    gst: GstRate,
    includesGst: boolean,
    hsn: string,
    barcode: string,
    stock: number,
    minStock: number,
  ];
  const itemDefs: ItemDef[] = [
    ['Black Forest Cake', 'SALE', 'cat-cakes', 'unit-kg', 750, 0, 18, true, '1905', '', 0, 0],
    ['Chocolate Truffle Cake', 'SALE', 'cat-cakes', 'unit-kg', 900, 0, 18, true, '1905', '', 0, 0],
    ['Pineapple Pastry', 'SALE', 'cat-cakes', 'unit-pcs', 60, 0, 18, true, '1905', '', 0, 0],
    ['Red Velvet Pastry', 'SALE', 'cat-cakes', 'unit-pcs', 90, 0, 18, true, '1905', '', 0, 0],
    ['Plum Cake 250g', 'SALE', 'cat-cakes', 'unit-pkt', 150, 0, 18, true, '1905', '8906001234501', 0, 0],
    ['Milk Bread 400g', 'SALE', 'cat-breads', 'unit-pkt', 45, 0, 0, true, '1905', '8906001234518', 0, 0],
    ['Brown Bread 400g', 'SALE', 'cat-breads', 'unit-pkt', 55, 0, 0, true, '1905', '8906001234525', 0, 0],
    ['Garlic Bread', 'SALE', 'cat-breads', 'unit-pcs', 70, 0, 5, true, '1905', '', 0, 0],
    ['Sweet Bun', 'SALE', 'cat-breads', 'unit-pcs', 15, 0, 5, true, '1905', '', 0, 0],
    ['Veg Puff', 'SALE', 'cat-puffs', 'unit-pcs', 25, 0, 5, true, '1905', '', 0, 0],
    ['Egg Puff', 'SALE', 'cat-puffs', 'unit-pcs', 30, 0, 5, true, '1905', '', 0, 0],
    ['Chicken Puff', 'SALE', 'cat-puffs', 'unit-pcs', 40, 0, 5, true, '1905', '', 0, 0],
    ['Butter Cookies', 'SALE', 'cat-cookies', 'unit-kg', 480, 0, 18, true, '1905', '', 0, 0],
    ['Choco Chip Cookies', 'SALE', 'cat-cookies', 'unit-kg', 560, 0, 18, true, '1905', '', 0, 0],
    ['Rusk 300g', 'SALE', 'cat-cookies', 'unit-pkt', 60, 0, 5, true, '1905', '8906001234532', 0, 0],
    ['Filter Coffee', 'SALE', 'cat-beverages', 'unit-pcs', 25, 0, 5, false, '2101', '', 0, 0],
    ['Masala Tea', 'SALE', 'cat-beverages', 'unit-pcs', 20, 0, 5, false, '2101', '', 0, 0],
    ['Cold Coffee', 'SALE', 'cat-beverages', 'unit-pcs', 80, 0, 5, false, '2101', '', 0, 0],
    ['Mineral Water 1L', 'BOTH', 'cat-beverages', 'unit-pcs', 20, 12, 18, true, '2201', '8901058000017', 48, 12],
    ['Cola Can 300ml', 'BOTH', 'cat-beverages', 'unit-pcs', 40, 28, 28, true, '2202', '8901764012273', 36, 12],
    ['Samosa', 'SALE', 'cat-snacks', 'unit-pcs', 15, 0, 5, true, '2106', '', 0, 0],
    ['Veg Sandwich', 'SALE', 'cat-snacks', 'unit-pcs', 60, 0, 5, false, '2106', '', 0, 0],
    ['Maida Flour', 'RAW', 'cat-raw', 'unit-kg', 0, 42, 5, false, '1101', '', 75, 25],
    ['Sugar', 'RAW', 'cat-raw', 'unit-kg', 0, 44, 5, false, '1701', '', 40, 15],
    ['Butter', 'RAW', 'cat-raw', 'unit-kg', 0, 520, 12, false, '0405', '', 8, 10],
  ];
  const items: Item[] = itemDefs.map((d, i) => {
    const [name, type, categoryId, unitId, sellingPrice, purchasePrice, gst, incl, hsn, barcode, stock, minStock] = d;
    const u = unitById.get(unitId)!;
    const c = categoryById.get(categoryId)!;
    const code = `ITM${String(i + 1).padStart(4, '0')}`;
    return {
      id: `item-${String(i + 1).padStart(4, '0')}`,
      code,
      name,
      type,
      categoryId,
      categoryName: c.name,
      unitId,
      unitName: u.name,
      unitCode: u.shortCode,
      allowDecimal: u.allowDecimal,
      sellingPrice,
      purchasePrice,
      gstPercent: gst,
      priceIncludesGst: incl,
      hsnCode: hsn,
      barcode,
      currentStock: stock,
      minStock,
      image: null,
      status: 'ACTIVE',
      createdAt: stamp(38, i),
      updatedAt: stamp(38, i),
    };
  });
  const itemByName = new Map(items.map((i) => [i.name, i]));
  const itemN = (name: string) => itemByName.get(name)!;

  // --------------------------------------------------------------- combos
  const combo = (id: string, name: string, parts: [string, number][], comboPrice: number, gst: GstRate, age: number): Combo => {
    const comboItems = parts.map(([n, qty]) => ({ itemId: itemN(n).id, itemName: n, qty, price: itemN(n).sellingPrice }));
    const actualPrice = round2(comboItems.reduce((s, c) => s + c.price * c.qty, 0));
    return {
      id,
      name,
      items: comboItems,
      actualPrice,
      comboPrice,
      savings: round2(actualPrice - comboPrice),
      gstPercent: gst,
      validFrom: addDays(today, -30),
      validTo: addDays(today, 60),
      image: null,
      status: 'ACTIVE',
      createdAt: stamp(age),
      updatedAt: stamp(age),
    };
  };
  const combos: Combo[] = [
    combo('combo-tea', 'Tea Time Combo', [['Masala Tea', 1], ['Veg Puff', 1], ['Samosa', 1]], 50, 5, 20),
    combo('combo-breakfast', 'Breakfast Combo', [['Filter Coffee', 1], ['Veg Sandwich', 1], ['Sweet Bun', 1]], 85, 5, 19),
    combo('combo-party', 'Party Pack', [['Veg Puff', 6], ['Pineapple Pastry', 4], ['Mineral Water 1L', 4]], 420, 18, 18),
  ];

  // ------------------------------------------------------------ suppliers
  const supplier = (
    n: number,
    name: string,
    contactPerson: string,
    mobile: string,
    email: string,
    address: string,
    state: string,
    gstin: string,
    openingBalance: number,
    terms: number,
  ): Supplier => ({
    id: `sup-${n}`,
    code: `SUP${String(n).padStart(3, '0')}`,
    name,
    contactPerson,
    mobile,
    email,
    address,
    state,
    gstin,
    openingBalance,
    paymentTermsDays: terms,
    currentBalance: openingBalance,
    status: 'ACTIVE',
    createdAt: stamp(35, n),
    updatedAt: stamp(35, n),
  });
  const suppliers: Supplier[] = [
    supplier(1, 'Sri Lakshmi Flour Mills', 'Venkatesh R', '9444012345', 'orders@srilakshmiflour.in', '45, Mill Road, Ambattur Industrial Estate, Chennai - 600058', 'Tamil Nadu', '33AAACS1234K1Z2', 5000, 30),
    supplier(2, 'Chennai Dairy Traders', 'Meena K', '9444067890', 'sales@chennaidairy.in', '8, Market Street, Koyambedu, Chennai - 600107', 'Tamil Nadu', '33AABCD5678L1Z9', 0, 15),
    supplier(3, 'Bengaluru Beverages Pvt Ltd', 'Suresh Gowda', '9845098450', 'dispatch@blrbev.com', '221, 4th Phase, Peenya Industrial Area, Bengaluru - 560058', 'Karnataka', '29AAFCB4321M1Z3', 0, 30),
  ];

  // ------------------------------------------------------- employee types
  const empType = (id: string, name: string, description: string, canLogin: boolean, i: number): EmployeeType => ({
    id,
    name,
    description,
    canLogin,
    status: 'ACTIVE',
    createdAt: stamp(45, i),
    updatedAt: stamp(45, i),
  });
  const employeeTypes: EmployeeType[] = [
    empType('etype-manager', 'Manager', 'Runs the shop, manages stock, staff and accounts', true, 1),
    empType('etype-cashier', 'Cashier', 'Billing counter and customer payments', true, 2),
    empType('etype-baker', 'Baker', 'Prepares breads, cakes and puffs', false, 3),
    empType('etype-helper', 'Helper', 'Kitchen and counter support', false, 4),
    empType('etype-delivery', 'Delivery', 'Home and bulk order delivery', false, 5),
  ];
  const typeById = new Map(employeeTypes.map((t) => [t.id, t]));

  // ------------------------------------------------------------ employees
  const employee = (
    n: number,
    fullName: string,
    typeId: string,
    mobile: string,
    gender: Employee['gender'],
    dob: string,
    joiningDate: string,
    address: string,
    aadhaar: string,
  ): Employee => ({
    id: `emp-${n}`,
    empCode: `EMP${String(n).padStart(3, '0')}`,
    photo: null,
    fullName,
    employeeTypeId: typeId,
    employeeTypeName: typeById.get(typeId)!.name,
    mobile,
    altMobile: '',
    email: `${fullName.split(' ')[0].toLowerCase()}@wbbakery.in`,
    gender,
    dob,
    joiningDate,
    address,
    aadhaar,
    idProof: null,
    emergencyName: '',
    emergencyMobile: '',
    bankAccount: `50100${String(234567 + n * 1111).padStart(9, '0')}`,
    ifsc: 'HDFC0001234',
    status: 'ACTIVE',
    resignDate: null,
    createdAt: stamp(44, n),
    updatedAt: stamp(44, n),
  });
  const employees: Employee[] = [
    employee(1, 'Ahamed Nishar', 'etype-manager', '9840011111', 'MALE', '1985-04-12', '2019-06-01', '5, 2nd Street, Ashok Nagar, Chennai - 600083', '234567891234'),
    employee(2, 'Priya Sharma', 'etype-cashier', '9840022222', 'FEMALE', '1996-08-21', '2022-01-10', '17, Lake View Road, West Mambalam, Chennai - 600033', '345678912345'),
    employee(3, 'Murugan S', 'etype-baker', '9840033333', 'MALE', '1988-11-02', '2020-03-15', '3/12, Kamaraj Salai, Saidapet, Chennai - 600015', '456789123456'),
    employee(4, 'Lakshmi Devi', 'etype-helper', '9840044444', 'FEMALE', '1992-02-17', '2023-07-01', '22, Anna Street, K.K. Nagar, Chennai - 600078', '567891234567'),
    employee(5, 'Arjun Singh', 'etype-delivery', '9840055555', 'MALE', '1999-09-09', '2024-02-05', '9, Nehru Colony, Guindy, Chennai - 600032', '678912345678'),
  ];
  employees[0].emergencyName = 'Kavitha Ramesh';
  employees[0].emergencyMobile = '9840099999';

  // --------------------------------------------------------------- logins
  const logins: MockLogin[] = [
    {
      id: 'login-admin',
      employeeId: 'emp-1',
      empCode: 'EMP001',
      employeeName: 'Ahamed Nishar',
      username: 'admin',
      password: 'admin@123',
      role: 'ADMIN',
      status: 'ACTIVE',
      lastLogin: null,
      createdAt: stamp(44, 30),
      updatedAt: stamp(44, 30),
    },
    {
      id: 'login-cashier',
      employeeId: 'emp-2',
      empCode: 'EMP002',
      employeeName: 'Priya Sharma',
      username: 'cashier',
      password: 'cashier123',
      role: 'CASHIER',
      status: 'ACTIVE',
      lastLogin: null,
      createdAt: stamp(44, 31),
      updatedAt: stamp(44, 31),
    },
  ];

  // --------------------------------------------------------------- salary
  const setupDefs: [number, SalarySetup['salaryType'], number, number][] = [
    [1, 'MONTHLY', 32000, 3000],
    [2, 'MONTHLY', 18000, 1500],
    [3, 'MONTHLY', 22000, 2000],
    [4, 'DAILY', 600, 500],
    [5, 'MONTHLY', 15000, 2500],
  ];
  const salarySetups: SalarySetup[] = setupDefs.map(([n, salaryType, basicSalary, allowances]) => ({
    id: `sal-setup-${n}`,
    employeeId: `emp-${n}`,
    empCode: employees[n - 1].empCode,
    employeeName: employees[n - 1].fullName,
    salaryType,
    basicSalary,
    allowances,
    effectiveFrom: '2025-04-01',
    createdAt: stamp(43, n),
    updatedAt: stamp(43, n),
  }));

  const prevMonth = addDays(startOfMonth(today), -1).slice(0, 7);
  const workingDays = daysInMonth(prevMonth) - 4;
  const salaryPayments: SalaryPayment[] = setupDefs.map(([n, type, basic, allowances], i) => {
    const daysPresent = workingDays - [0, 1, 2, 0, 3][i];
    const gross =
      type === 'MONTHLY'
        ? round2(((basic + allowances) * daysPresent) / workingDays)
        : round2(basic * daysPresent + allowances);
    const bonus = n === 3 ? 1000 : 0;
    const advanceDeduction = n === 5 ? 2000 : 0;
    const paymentDate = `${startOfMonth(today).slice(0, 7)}-01`;
    return {
      id: `sal-pay-${n}`,
      month: prevMonth,
      employeeId: `emp-${n}`,
      empCode: employees[n - 1].empCode,
      employeeName: employees[n - 1].fullName,
      workingDays,
      daysPresent,
      gross,
      bonus,
      advanceDeduction,
      otherDeductions: 0,
      deductionReason: '',
      net: round2(gross + bonus - advanceDeduction),
      paymentDate,
      paymentMode: n === 4 ? 'CASH' : 'BANK',
      status: 'PAID',
      createdAt: istDateTime(paymentDate, 10, n),
      updatedAt: istDateTime(paymentDate, 10, n),
    };
  });

  // ---------------------------------------------------------------- bills
  const saleItems = items.filter((i) => i.type !== 'RAW');
  const customers: [string, string][] = [
    ['9876543210', 'Anitha'],
    ['9789012345', 'Karthik'],
    ['9003456789', 'Fathima'],
    ['9551234567', 'Rahul'],
    ['9962345678', 'Divya'],
  ];
  const cashiers = [
    { id: 'login-cashier', name: 'Priya Sharma' },
    { id: 'login-admin', name: 'Ahamed Nishar' },
  ];
  const nowMs = Date.now();
  const perDay = [6, 5, 6, 5, 6, 6, 6]; // 6 days ago … today → 40 bills
  type Draft = Omit<Bill, 'billNo'>;
  const drafts: Draft[] = [];

  perDay.forEach((count, idx) => {
    const daysAgo = 6 - idx;
    const date = addDays(today, -daysAgo);
    for (let k = 0; k < count; k++) {
      let hour = 7 + Math.floor(rand() * 16); // 7 … 22
      const minute = Math.floor(rand() * 60);
      let when = istDateTime(date, hour, minute);
      if (new Date(when).getTime() > nowMs - 5 * 60_000) {
        when = new Date(nowMs - (k + 1) * 23 * 60_000).toISOString();
        hour = istHour(when);
      }

      const lineInputs: BillLineInput[] = [];
      const lineCount = 1 + Math.floor(rand() * 4);
      const used = new Set<string>();
      for (let l = 0; l < lineCount; l++) {
        const it = pick(saleItems);
        if (used.has(it.id)) continue;
        used.add(it.id);
        const qty = it.allowDecimal ? pick([0.25, 0.5, 1]) : 1 + Math.floor(rand() * 3);
        lineInputs.push({
          kind: 'ITEM',
          refId: it.id,
          code: it.code,
          name: it.name,
          unitCode: it.unitCode,
          allowDecimal: it.allowDecimal,
          qty,
          rate: it.sellingPrice,
          gstPercent: it.gstPercent,
          priceIncludesGst: it.priceIncludesGst,
        });
      }
      if (rand() < 0.2) {
        const c = pick(combos);
        lineInputs.push({
          kind: 'COMBO',
          refId: c.id,
          code: 'COMBO',
          name: c.name,
          unitCode: 'PCS',
          allowDecimal: false,
          qty: 1,
          rate: c.comboPrice,
          gstPercent: c.gstPercent,
          priceIncludesGst: true,
        });
      }

      const discountValue = rand() < 0.12 ? 5 : 0;
      const { lines, totals } = priceBill(lineInputs, 'PERCENT', discountValue);
      const r = rand();
      let payments: BillPayment[];
      let cashReceived: number | null = null;
      let changeReturned: number | null = null;
      if (r < 0.08 && totals.grandTotal > 60) {
        const cashPart = Math.floor(totals.grandTotal / 2);
        payments = [
          { mode: 'CASH', amount: cashPart, reference: null },
          { mode: 'UPI', amount: round2(totals.grandTotal - cashPart), reference: null },
        ];
      } else {
        const mode: PaymentMode = r < 0.55 ? 'CASH' : r < 0.88 ? 'UPI' : 'CARD';
        payments = [
          {
            mode,
            amount: totals.grandTotal,
            reference: mode === 'CARD' ? String(1000 + Math.floor(rand() * 9000)) : null,
          },
        ];
        if (mode === 'CASH') {
          const step = totals.grandTotal > 500 ? 500 : totals.grandTotal > 100 ? 100 : 50;
          cashReceived = Math.ceil(totals.grandTotal / step) * step;
          changeReturned = round2(cashReceived - totals.grandTotal);
        }
      }
      const cashier = rand() < 0.75 ? cashiers[0] : cashiers[1];
      const customer = rand() < 0.3 ? pick(customers) : null;
      const history: BillHistoryEntry[] = [{ status: 'COMPLETED', at: when, by: cashier.name, note: null }];
      drafts.push({
        id: `bill-${drafts.length + 1}`,
        billDate: when,
        cashierId: cashier.id,
        cashierName: cashier.name,
        customerMobile: customer?.[0] ?? '',
        customerName: customer?.[1] ?? '',
        lines,
        itemCount: lines.length,
        discountType: 'PERCENT',
        discountValue,
        ...totals,
        payments,
        paymentMode: paymentModeOf(payments),
        cashReceived,
        changeReturned,
        status: 'COMPLETED',
        cancelReason: null,
        history,
        createdAt: when,
        updatedAt: when,
      });
    }
  });

  drafts.sort((a, b) => a.billDate.localeCompare(b.billDate));
  // Two cancelled bills and one bill on hold (the latest one).
  const cancelIdx: [number, string][] = [
    [8, 'Wrong item'],
    [27, 'Customer returned'],
  ];
  cancelIdx.forEach(([i, reason]) => {
    const b = drafts[i];
    const at = new Date(new Date(b.billDate).getTime() + 15 * 60_000).toISOString();
    b.status = 'CANCELLED';
    b.cancelReason = reason;
    b.history.push({ status: 'CANCELLED', at, by: 'Ahamed Nishar', note: reason });
    b.updatedAt = at;
  });
  const held = drafts[drafts.length - 1];
  held.status = 'HELD';
  held.payments = [];
  held.paymentMode = null;
  held.cashReceived = null;
  held.changeReturned = null;
  held.history = [{ status: 'HELD', at: held.billDate, by: held.cashierName, note: null }];

  let billCounter = 0;
  const bills: Bill[] = drafts.map((d) =>
    d.status === 'HELD' ? { ...d, billNo: 'H-0001' } : { ...d, billNo: `B-${String(++billCounter).padStart(5, '0')}` },
  );

  // --------------------------------------------------------- transactions
  type TxnDraft = Omit<Transaction, 'txnNo'>;
  const txnDrafts: TxnDraft[] = [];
  for (const b of bills) {
    if (b.status === 'HELD') continue;
    for (const p of b.payments) {
      txnDrafts.push({
        id: `txn-${txnDrafts.length + 1}`,
        txnDate: b.billDate,
        type: 'PAYMENT',
        mode: p.mode,
        amount: p.amount,
        reference: p.reference,
        billId: b.id,
        billNo: b.billNo,
        note: null,
        cashierId: b.cashierId,
        cashierName: b.cashierName,
      });
    }
    if (b.status === 'CANCELLED') {
      const at = b.updatedAt;
      for (const p of b.payments) {
        txnDrafts.push({
          id: `txn-${txnDrafts.length + 1}`,
          txnDate: at,
          type: 'REFUND',
          mode: p.mode,
          amount: p.amount,
          reference: p.reference,
          billId: b.id,
          billNo: b.billNo,
          note: `Refund: ${b.cancelReason}`,
          cashierId: 'login-admin',
          cashierName: 'Ahamed Nishar',
        });
      }
    }
  }
  const cashOut = (daysAgo: number, hour: number, amount: number, note: string) => {
    const when = istDateTime(addDays(today, -daysAgo), hour, 15);
    if (new Date(when).getTime() > nowMs) return;
    txnDrafts.push({
      id: `txn-${txnDrafts.length + 1}`,
      txnDate: when,
      type: 'CASH_OUT',
      mode: 'CASH',
      amount,
      reference: null,
      billId: null,
      billNo: null,
      note,
      cashierId: 'login-admin',
      cashierName: 'Ahamed Nishar',
    });
  };
  cashOut(3, 11, 350, 'Petty cash - milk purchase');
  cashOut(1, 16, 120, 'Tea & snacks for staff');
  txnDrafts.sort((a, b) => a.txnDate.localeCompare(b.txnDate));
  const transactions: Transaction[] = txnDrafts.map((t, i) => ({ ...t, txnNo: `TXN-${String(i + 1).padStart(6, '0')}` }));

  // ------------------------------------------------------ purchase orders
  const poItem = (name: string, qty: number, rate: number, receivedQty: number): PurchaseOrderItem => {
    const it = itemN(name);
    const amount = round2(qty * rate);
    return {
      itemId: it.id,
      itemName: it.name,
      unitCode: it.unitCode,
      qty,
      receivedQty,
      rate,
      gstPercent: it.gstPercent,
      amount,
      gstAmount: round2((amount * it.gstPercent) / 100),
    };
  };
  const po = (
    n: number,
    sup: Supplier,
    daysAgo: number,
    lines: PurchaseOrderItem[],
    status: PurchaseOrder['status'],
    notes: string,
  ): PurchaseOrder => {
    const interState = sup.state !== 'Tamil Nadu';
    const calc = calculatePurchase(lines, interState, 0);
    const poDate = addDays(today, -daysAgo);
    return {
      id: `po-${n}`,
      poNo: `PO-${String(n).padStart(4, '0')}`,
      poDate,
      supplierId: sup.id,
      supplierName: sup.name,
      supplierGstin: sup.gstin,
      supplierState: sup.state,
      supplierMobile: sup.mobile,
      isInterState: interState,
      expectedDate: addDays(poDate, 3),
      notes,
      items: lines,
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
      createdAt: istDateTime(poDate, 10, n),
      updatedAt: istDateTime(poDate, 10, n),
    };
  };
  const purchaseOrders: PurchaseOrder[] = [
    po(1, suppliers[0], 10, [poItem('Maida Flour', 50, 42, 50), poItem('Sugar', 25, 44, 25)], 'RECEIVED', 'Deliver before 9 AM'),
    po(2, suppliers[1], 2, [poItem('Butter', 10, 520, 0)], 'SENT', 'Salted butter, 500g blocks'),
    po(3, suppliers[2], 0, [poItem('Mineral Water 1L', 48, 12, 0), poItem('Cola Can 300ml', 48, 28, 0)], 'DRAFT', ''),
  ];

  // ----------------------------------------------------- purchase entries
  const peItem = (name: string, ordered: number | null, received: number, rate: number, expiry: string | null): PurchaseEntryItem => {
    const it = itemN(name);
    const amount = round2(received * rate);
    return {
      itemId: it.id,
      itemName: it.name,
      unitCode: it.unitCode,
      orderedQty: ordered,
      receivedQty: received,
      rate,
      gstPercent: it.gstPercent,
      expiryDate: expiry,
      amount,
      gstAmount: round2((amount * it.gstPercent) / 100),
    };
  };
  const pe = (
    n: number,
    sup: Supplier,
    daysAgo: number,
    poRef: PurchaseOrder | null,
    invoiceNo: string,
    lines: PurchaseEntryItem[],
    paid: number,
    mode: 'BANK' | 'UPI',
  ): PurchaseEntry => {
    const interState = sup.state !== 'Tamil Nadu';
    const calc = calculatePurchase(
      lines.map((l) => ({ qty: l.receivedQty, rate: l.rate, gstPercent: l.gstPercent })),
      interState,
      0,
      0,
    );
    const peDate = addDays(today, -daysAgo);
    const paidAmount = Math.min(paid, calc.grandTotal);
    const created = istDateTime(peDate, 11, n);
    return {
      id: `pe-${n}`,
      peNo: `PE-${String(n).padStart(4, '0')}`,
      peDate,
      supplierId: sup.id,
      supplierName: sup.name,
      supplierState: sup.state,
      isInterState: interState,
      poId: poRef?.id ?? null,
      poNo: poRef?.poNo ?? null,
      invoiceNo,
      invoiceDate: peDate,
      invoiceCopy: null,
      items: lines,
      subTotal: calc.subTotal,
      cgst: calc.cgst,
      sgst: calc.sgst,
      igst: calc.igst,
      totalGst: calc.totalGst,
      discount: 0,
      otherCharges: 0,
      roundOff: calc.roundOff,
      grandTotal: calc.grandTotal,
      paidAmount,
      balance: round2(calc.grandTotal - paidAmount),
      dueDate: addDays(peDate, sup.paymentTermsDays),
      paymentStatus: paidAmount <= 0 ? 'UNPAID' : paidAmount >= calc.grandTotal ? 'PAID' : 'PARTLY_PAID',
      payments: paidAmount > 0 ? [{ id: `pe-pay-${n}`, amount: paidAmount, mode, date: peDate, createdAt: created }] : [],
      createdAt: created,
      updatedAt: created,
    };
  };
  const purchaseEntries: PurchaseEntry[] = [
    pe(1, suppliers[0], 8, purchaseOrders[0], 'SLF/2526/118', [peItem('Maida Flour', 50, 50, 42, null), peItem('Sugar', 25, 25, 44, null)], 2000, 'BANK'),
    pe(2, suppliers[2], 5, null, 'BB-7781', [peItem('Mineral Water 1L', null, 48, 12, addDays(today, 360)), peItem('Cola Can 300ml', null, 36, 28, addDays(today, 180))], 100000, 'UPI'),
  ];

  return {
    version: SEED_VERSION,
    counters: {
      item: items.length,
      supplier: suppliers.length,
      employee: employees.length,
      bill: billCounter,
      held: 1,
      txn: transactions.length,
      po: purchaseOrders.length,
      pe: purchaseEntries.length,
    },
    units,
    categories,
    items,
    combos,
    suppliers,
    employeeTypes,
    employees,
    salarySetups,
    salaryPayments,
    logins,
    bills,
    transactions,
    dayCloses: [],
    purchaseOrders,
    purchaseEntries,
  };
}
