import {
  Bill,
  Category,
  Combo,
  DayClose,
  Employee,
  EmployeeType,
  Item,
  LoginAccount,
  PurchaseEntry,
  PurchaseOrder,
  SalaryPayment,
  SalarySetup,
  Supplier,
  Transaction,
  Unit,
} from '../models';
import { buildSeed, SEED_VERSION } from './seed-data';

/** Login account as stored by the mock (the real backend keeps a password hash). */
export interface MockLogin extends LoginAccount {
  password: string;
}

export type CounterKey = 'item' | 'supplier' | 'employee' | 'bill' | 'held' | 'txn' | 'po' | 'pe';

export interface MockDatabase {
  version: number;
  counters: Record<CounterKey, number>;
  units: Unit[];
  categories: Category[];
  items: Item[];
  combos: Combo[];
  suppliers: Supplier[];
  employeeTypes: EmployeeType[];
  employees: Employee[];
  salarySetups: SalarySetup[];
  salaryPayments: SalaryPayment[];
  logins: MockLogin[];
  bills: Bill[];
  transactions: Transaction[];
  dayCloses: DayClose[];
  purchaseOrders: PurchaseOrder[];
  purchaseEntries: PurchaseEntry[];
}

export const MOCK_DB_VERSION = SEED_VERSION;
const STORAGE_KEY = 'wbpos.mockdb';

/** In-memory database persisted to localStorage. Seeded on first run. */
export class MockDb {
  private static instance: MockDb | null = null;
  data: MockDatabase;

  private constructor() {
    this.data = this.load() ?? buildSeed();
    // TEMP: force the admin password so DBs seeded before the change pick it up.
    const admin = this.data.logins.find((l) => l.id === 'login-admin');
    if (admin) {
      admin.username = 'admin';
      admin.password = 'admin@123';
      admin.status = 'ACTIVE';
    }
    this.save();
  }

  static get(): MockDb {
    if (!MockDb.instance) MockDb.instance = new MockDb();
    return MockDb.instance;
  }

  /** Wipes all mock data and re-seeds (exposed on window for debugging: `wbposResetMock()`). */
  static reset(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    MockDb.instance = null;
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('[mock] Could not persist mock DB (storage full or blocked). Data lives in memory only.', e);
    }
  }

  next(counter: CounterKey): number {
    this.data.counters[counter] = (this.data.counters[counter] ?? 0) + 1;
    return this.data.counters[counter];
  }

  private load(): MockDatabase | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as MockDatabase;
      return parsed.version === MOCK_DB_VERSION ? parsed : null;
    } catch {
      return null;
    }
  }
}

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** Deep copy so callers can never mutate the store by accident. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
