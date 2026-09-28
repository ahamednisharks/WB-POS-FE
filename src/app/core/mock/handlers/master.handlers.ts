import { Category, Combo, ComboItem, GstRate, Item, ItemType, Status, Supplier, Unit } from '../../models';
import { GST_RATES, INDIAN_STATES, PATTERNS } from '../../utils/constants';
import { round2 } from '../../utils/tax.util';
import { crudRoutes } from '../mock-crud';
import { MockDatabase, pad } from '../mock-db';
import {
  badRequest,
  bool,
  ensureUnique,
  maxLen,
  MockRoute,
  num,
  oneOf,
  optionalMatch,
  required,
  str,
  whereEq,
} from '../mock-http';

const STATUSES: readonly Status[] = ['ACTIVE', 'INACTIVE'];
const ITEM_TYPES: readonly ItemType[] = ['SALE', 'RAW', 'BOTH'];
const ALL_ROLES = ['ADMIN', 'CASHIER'] as const;

function gst(value: unknown, fallback?: GstRate): GstRate {
  const n = num(value, fallback ?? -1);
  if (!(GST_RATES as number[]).includes(n)) throw badRequest('GST % must be one of 0, 5, 12, 18, 28', 'gstPercent');
  return n as GstRate;
}

function imageOf(value: unknown, maxMb: number): string | null {
  const s = str(value);
  if (!s) return null;
  // base64 inflates by ~4/3
  if (s.length > maxMb * 1024 * 1024 * 1.37 + 200) throw badRequest(`Image must be ${maxMb} MB or smaller`, 'image');
  return s;
}

/** Joins item → category/unit so names are always current. */
export function viewItem(item: Item, db: MockDatabase): Item {
  const cat = db.categories.find((c) => c.id === item.categoryId);
  const unit = db.units.find((u) => u.id === item.unitId);
  return {
    ...item,
    categoryName: cat?.name ?? item.categoryName,
    unitName: unit?.name ?? item.unitName,
    unitCode: unit?.shortCode ?? item.unitCode,
    allowDecimal: unit?.allowDecimal ?? item.allowDecimal,
  };
}

export function supplierBalance(s: Supplier, db: MockDatabase): number {
  const entries = db.purchaseEntries.filter((e) => e.supplierId === s.id);
  return round2(s.openingBalance + entries.reduce((sum, e) => sum + e.grandTotal - e.paidAmount, 0));
}

export function comboActive(c: Combo, date: string): boolean {
  return c.status === 'ACTIVE' && (!c.validFrom || c.validFrom <= date) && (!c.validTo || c.validTo >= date);
}

const unitRoutes = crudRoutes<Unit>({
  path: '/units',
  label: 'Unit',
  rows: (db) => db.units,
  readRoles: [...ALL_ROLES],
  view: (u) => u,
  search: (u) => [u.name, u.shortCode],
  build: (b, existing, db) => {
    const name = maxLen(required(b['name'], 'Unit name', 'name'), 30, 'Unit name', 'name');
    const shortCode = maxLen(required(b['shortCode'], 'Short code', 'shortCode').toUpperCase(), 5, 'Short code', 'shortCode');
    ensureUnique(db.data.units, existing?.id ?? null, (u) => u.name, name, 'A unit with this name already exists', 'name');
    ensureUnique(db.data.units, existing?.id ?? null, (u) => u.shortCode, shortCode, 'This short code is already used', 'shortCode');
    return { name, shortCode, allowDecimal: bool(b['allowDecimal']), status: oneOf(b['status'], STATUSES, 'Status', 'status', 'ACTIVE') };
  },
  inUse: (u, db) => {
    const n = db.items.filter((i) => i.unitId === u.id).length;
    return n ? `Unit is used by ${n} item(s), so it was marked Inactive instead of deleted.` : null;
  },
});

const categoryRoutes = crudRoutes<Category>({
  path: '/categories',
  label: 'Category',
  rows: (db) => db.categories,
  readRoles: [...ALL_ROLES],
  view: (c, db) => ({ ...c, itemCount: db.items.filter((i) => i.categoryId === c.id).length }),
  search: (c) => [c.name],
  defaultSort: 'displayOrder',
  build: (b, existing, db) => {
    const name = maxLen(required(b['name'], 'Category name', 'name'), 50, 'Category name', 'name');
    ensureUnique(db.data.categories, existing?.id ?? null, (c) => c.name, name, 'A category with this name already exists', 'name');
    return {
      name,
      image: imageOf(b['image'], 1),
      displayOrder: Math.max(0, Math.round(num(b['displayOrder']))),
      status: oneOf(b['status'], STATUSES, 'Status', 'status', 'ACTIVE'),
      itemCount: 0,
    };
  },
  inUse: (c, db) => {
    const n = db.items.filter((i) => i.categoryId === c.id).length;
    return n ? `Category has ${n} item(s), so it was marked Inactive instead of deleted.` : null;
  },
});

const itemRoutes = crudRoutes<Item>({
  path: '/items',
  label: 'Item',
  rows: (db) => db.items,
  readRoles: [...ALL_ROLES],
  view: viewItem,
  search: (i) => [i.name, i.code, i.barcode, i.categoryName],
  filter: (rows, p) => {
    let r = whereEq(rows, p, 'categoryId', (i) => i.categoryId);
    r = whereEq(r, p, 'type', (i) => i.type);
    r = whereEq(r, p, 'barcode', (i) => i.barcode);
    if (p['saleable'] === 'true') r = r.filter((i) => i.type !== 'RAW');
    if (p['purchasable'] === 'true') r = r.filter((i) => i.type !== 'SALE');
    if (p['lowStock'] === 'true') r = r.filter((i) => i.type !== 'SALE' && i.currentStock <= i.minStock);
    return r;
  },
  build: (b, existing, db) => {
    const items = db.data.items;
    let code = str(b['code']).toUpperCase();
    if (!code) {
      let n = db.next('item');
      while (items.some((i) => i.code === `ITM${pad(n, 4)}`)) n = db.next('item');
      code = `ITM${pad(n, 4)}`;
    }
    maxLen(code, 20, 'Item code', 'code');
    ensureUnique(items, existing?.id ?? null, (i) => i.code, code, 'This item code is already used', 'code');

    const name = maxLen(required(b['name'], 'Item name', 'name'), 60, 'Item name', 'name');
    ensureUnique(items, existing?.id ?? null, (i) => i.name, name, 'An item with this name already exists', 'name');
    const type = oneOf(b['type'], ITEM_TYPES, 'Item type', 'type');

    const categoryId = required(b['categoryId'], 'Category', 'categoryId');
    const cat = db.data.categories.find((c) => c.id === categoryId);
    if (!cat) throw badRequest('Category not found', 'categoryId');
    const unitId = required(b['unitId'], 'Unit', 'unitId');
    const unit = db.data.units.find((u) => u.id === unitId);
    if (!unit) throw badRequest('Unit not found', 'unitId');

    const sellingPrice = round2(num(b['sellingPrice']));
    if (type !== 'RAW' && sellingPrice <= 0) throw badRequest('Selling price is required for sale items', 'sellingPrice');

    const barcode = str(b['barcode']);
    ensureUnique(items, existing?.id ?? null, (i) => i.barcode, barcode, 'This barcode is already assigned to another item', 'barcode');

    return {
      code,
      name,
      type,
      categoryId,
      categoryName: cat.name,
      unitId,
      unitName: unit.name,
      unitCode: unit.shortCode,
      allowDecimal: unit.allowDecimal,
      sellingPrice: type === 'RAW' ? 0 : sellingPrice,
      purchasePrice: existing?.purchasePrice ?? 0,
      gstPercent: gst(b['gstPercent']),
      priceIncludesGst: bool(b['priceIncludesGst']),
      hsnCode: optionalMatch(b['hsnCode'], PATTERNS.hsn, 'HSN code must be 4 to 8 digits', 'hsnCode'),
      barcode,
      currentStock: existing?.currentStock ?? 0,
      minStock: Math.max(0, num(b['minStock'])),
      image: imageOf(b['image'], 1),
      status: oneOf(b['status'], STATUSES, 'Status', 'status', 'ACTIVE'),
    };
  },
  inUse: (i, db) => {
    const used =
      db.combos.some((c) => c.items.some((ci) => ci.itemId === i.id)) ||
      db.bills.some((b) => b.lines.some((l) => l.kind === 'ITEM' && l.refId === i.id)) ||
      db.purchaseOrders.some((p) => p.items.some((pi) => pi.itemId === i.id)) ||
      db.purchaseEntries.some((p) => p.items.some((pi) => pi.itemId === i.id));
    return used ? 'Item is used in bills, combos or purchases, so it was marked Inactive instead of deleted.' : null;
  },
});

const comboRoutes = crudRoutes<Combo>({
  path: '/combos',
  label: 'Combo',
  rows: (db) => db.combos,
  readRoles: [...ALL_ROLES],
  view: (c, db) => ({
    ...c,
    items: c.items.map((ci) => ({ ...ci, itemName: db.items.find((i) => i.id === ci.itemId)?.name ?? ci.itemName })),
  }),
  search: (c) => [c.name, ...c.items.map((i) => i.itemName)],
  filter: (rows, p) => (p['activeOn'] ? rows.filter((c) => comboActive(c, p['activeOn'])) : rows),
  build: (b, existing, db) => {
    const name = maxLen(required(b['name'], 'Combo name', 'name'), 60, 'Combo name', 'name');
    ensureUnique(db.data.combos, existing?.id ?? null, (c) => c.name, name, 'A combo with this name already exists', 'name');
    const rawItems = Array.isArray(b['items']) ? (b['items'] as Partial<ComboItem>[]) : [];
    const items: ComboItem[] = rawItems.map((ri) => {
      const it = db.data.items.find((i) => i.id === ri.itemId);
      if (!it) throw badRequest('One of the combo items no longer exists', 'items');
      const qty = num(ri.qty);
      if (qty <= 0) throw badRequest('Quantity must be greater than 0', 'items');
      return { itemId: it.id, itemName: it.name, qty, price: it.sellingPrice };
    });
    if (items.length < 2) throw badRequest('A combo needs at least 2 items', 'items');
    if (new Set(items.map((i) => i.itemId)).size !== items.length) throw badRequest('Each item can be added only once', 'items');
    const actualPrice = round2(items.reduce((s, i) => s + i.price * i.qty, 0));
    const comboPrice = round2(num(b['comboPrice']));
    if (comboPrice <= 0) throw badRequest('Combo price must be greater than 0', 'comboPrice');
    if (comboPrice >= actualPrice) throw badRequest('Combo price must be less than the actual price', 'comboPrice');
    const highestGst = Math.max(...items.map((i) => db.data.items.find((x) => x.id === i.itemId)?.gstPercent ?? 0)) as GstRate;
    const validFrom = str(b['validFrom']) || null;
    const validTo = str(b['validTo']) || null;
    if (validFrom && validTo && validTo < validFrom) throw badRequest('Valid To must be on or after Valid From', 'validTo');
    return {
      name,
      items,
      actualPrice,
      comboPrice,
      savings: round2(actualPrice - comboPrice),
      gstPercent: b['gstPercent'] === null || b['gstPercent'] === undefined || b['gstPercent'] === '' ? highestGst : gst(b['gstPercent']),
      validFrom,
      validTo,
      image: imageOf(b['image'], 1),
      status: oneOf(b['status'], STATUSES, 'Status', 'status', 'ACTIVE'),
    };
  },
  inUse: (c, db) =>
    db.bills.some((b) => b.lines.some((l) => l.kind === 'COMBO' && l.refId === c.id))
      ? 'Combo has been billed before, so it was marked Inactive instead of deleted.'
      : null,
});

const supplierRoutes = crudRoutes<Supplier>({
  path: '/suppliers',
  label: 'Supplier',
  rows: (db) => db.suppliers,
  view: (s, db) => ({ ...s, currentBalance: supplierBalance(s, db) }),
  search: (s) => [s.name, s.code, s.mobile, s.gstin, s.contactPerson],
  filter: (rows, p) => whereEq(rows, p, 'state', (s) => s.state),
  build: (b, existing, db) => {
    const name = maxLen(required(b['name'], 'Supplier name', 'name'), 80, 'Supplier name', 'name');
    ensureUnique(db.data.suppliers, existing?.id ?? null, (s) => s.name, name, 'A supplier with this name already exists', 'name');
    const mobile = required(b['mobile'], 'Mobile', 'mobile');
    if (!PATTERNS.anyTenDigits.test(mobile)) throw badRequest('Mobile must be 10 digits', 'mobile');
    const state = required(b['state'], 'State', 'state');
    if (!INDIAN_STATES.includes(state)) throw badRequest('Select a valid state', 'state');
    const gstin = optionalMatch(str(b['gstin']).toUpperCase(), PATTERNS.gstin, 'Enter a valid 15-character GSTIN', 'gstin');
    ensureUnique(db.data.suppliers, existing?.id ?? null, (s) => s.gstin, gstin, 'Another supplier has this GSTIN', 'gstin');
    let code = existing?.code ?? '';
    if (!code) code = `SUP${pad(db.next('supplier'), 3)}`;
    return {
      code,
      name,
      contactPerson: str(b['contactPerson']),
      mobile,
      email: optionalMatch(b['email'], /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email', 'email'),
      address: required(b['address'], 'Address', 'address'),
      state,
      gstin,
      openingBalance: round2(num(b['openingBalance'])),
      paymentTermsDays: Math.max(0, Math.round(num(b['paymentTermsDays']))),
      currentBalance: existing?.currentBalance ?? 0,
      status: oneOf(b['status'], STATUSES, 'Status', 'status', 'ACTIVE'),
    };
  },
  inUse: (s, db) =>
    db.purchaseOrders.some((p) => p.supplierId === s.id) || db.purchaseEntries.some((p) => p.supplierId === s.id)
      ? 'Supplier has purchase records, so it was marked Inactive instead of deleted.'
      : null,
});

export const masterRoutes: MockRoute[] = [
  ...unitRoutes,
  ...categoryRoutes,
  ...itemRoutes,
  ...comboRoutes,
  ...supplierRoutes,
];

