import { DeleteResult, Role } from '../models';
import { nowIso } from '../utils/date.util';
import { clone, MockDatabase, MockDb, newId } from './mock-db';
import { applyListQuery, MockRequest, MockRoute, notFound, whereEq } from './mock-http';

interface Entity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/** Declarative description of a standard REST resource for the mock backend. */
export interface CrudConfig<T extends Entity, O = T> {
  path: string;
  label: string;
  rows: (db: MockDatabase) => T[];
  readRoles?: Role[];
  writeRoles?: Role[];
  /** Adds computed / joined fields for responses (e.g. itemCount, names). */
  view: (row: T, db: MockDatabase) => O;
  search: (row: O) => (string | null | undefined)[];
  filter?: (rows: O[], params: Record<string, string>, req: MockRequest) => O[];
  /** Validates the body and returns the fields to store. Throw MockError on invalid input. */
  build: (body: Record<string, unknown>, existing: T | null, db: MockDb, req: MockRequest) => Omit<T, keyof Entity>;
  afterSave?: (row: T, previous: T | null, db: MockDb, req: MockRequest) => void;
  /** Non-null → record is in use; it is deactivated instead of deleted and this message returned. */
  inUse?: (row: T, db: MockDatabase) => string | null;
  deactivate?: (row: T, db: MockDb) => void;
  /** Throw to refuse deletion entirely. */
  beforeDelete?: (row: T, db: MockDb, req: MockRequest) => void;
  defaultSort?: string;
  /** true = `filter` handles the `status` param itself (e.g. PO's special `OPEN`). */
  ownStatusFilter?: boolean;
}

export function crudRoutes<T extends Entity, O = T>(cfg: CrudConfig<T, O>): MockRoute[] {
  const base = cfg.path.replace(/\//g, '\\/');
  const listRe = new RegExp(`^${base}$`);
  const oneRe = new RegExp(`^${base}\\/([^/]+)$`);
  const writeRoles = cfg.writeRoles ?? ['ADMIN'];

  const find = (db: MockDb, id: string): T => {
    const row = cfg.rows(db.data).find((r) => r.id === id);
    if (!row) throw notFound(cfg.label);
    return row;
  };

  return [
    {
      method: 'GET',
      pattern: listRe,
      roles: cfg.readRoles,
      handler: (req) => {
        const db = MockDb.get();
        let rows = cfg.rows(db.data).map((r) => cfg.view(r, db.data));
        if (!cfg.ownStatusFilter) rows = whereEq(rows, req.params, 'status', (r) => (r as { status?: string }).status);
        if (cfg.filter) rows = cfg.filter(rows, req.params, req);
        return clone(applyListQuery(rows, req.params, cfg.search, cfg.defaultSort));
      },
    },
    {
      method: 'GET',
      pattern: oneRe,
      roles: cfg.readRoles,
      handler: (req) => {
        const db = MockDb.get();
        return clone(cfg.view(find(db, req.match[1]), db.data));
      },
    },
    {
      method: 'POST',
      pattern: listRe,
      roles: writeRoles,
      status: 201,
      handler: (req) => {
        const db = MockDb.get();
        const fields = cfg.build((req.body ?? {}) as Record<string, unknown>, null, db, req);
        const now = nowIso();
        const row = { ...fields, id: newId(), createdAt: now, updatedAt: now } as T;
        cfg.rows(db.data).push(row);
        cfg.afterSave?.(row, null, db, req);
        db.save();
        return clone(cfg.view(row, db.data));
      },
    },
    {
      method: 'PUT',
      pattern: oneRe,
      roles: writeRoles,
      handler: (req) => {
        const db = MockDb.get();
        const row = find(db, req.match[1]);
        const previous = clone(row);
        const fields = cfg.build((req.body ?? {}) as Record<string, unknown>, row, db, req);
        Object.assign(row, fields, { updatedAt: nowIso() });
        cfg.afterSave?.(row, previous, db, req);
        db.save();
        return clone(cfg.view(row, db.data));
      },
    },
    {
      method: 'DELETE',
      pattern: oneRe,
      roles: writeRoles,
      handler: (req): DeleteResult => {
        const db = MockDb.get();
        const row = find(db, req.match[1]);
        cfg.beforeDelete?.(row, db, req);
        const reason = cfg.inUse?.(row, db.data) ?? null;
        if (reason) {
          if (cfg.deactivate) cfg.deactivate(row, db);
          else (row as unknown as { status: string }).status = 'INACTIVE';
          row.updatedAt = nowIso();
          db.save();
          return { deleted: false, message: reason };
        }
        const rows = cfg.rows(db.data);
        rows.splice(rows.indexOf(row), 1);
        db.save();
        return { deleted: true, message: `${cfg.label} deleted successfully` };
      },
    },
  ];
}
