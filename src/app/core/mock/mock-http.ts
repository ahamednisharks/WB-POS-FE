import { AuthUser, PagedResult, Role } from '../models';

/** Parsed request handed to mock route handlers. */
export interface MockRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  body: unknown;
  user: AuthUser | null;
  match: RegExpMatchArray;
}

export interface MockRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  pattern: RegExp;
  /** false = no token needed (login). Default true. */
  auth?: boolean;
  /** Roles allowed; omitted = any logged-in user. */
  roles?: Role[];
  handler: (req: MockRequest) => unknown;
  /** HTTP status for success (default 200, POST 201). */
  status?: number;
}

export class MockError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new MockError(404, `${what} not found`);
export const badRequest = (message: string, field?: string) => new MockError(400, message, field);
export const conflict = (message: string, field?: string) => new MockError(409, message, field);
export const forbidden = (message = 'You do not have permission to do this.') => new MockError(403, message);

/** Typed accessor for JSON bodies. */
export function bodyOf<T>(req: MockRequest): T {
  if (!req.body || typeof req.body !== 'object') throw badRequest('Request body is required');
  return req.body as T;
}

export function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim();
}

export function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function bool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string, field: string, fallback?: T): T {
  const s = str(value) as T;
  if (allowed.includes(s)) return s;
  if (fallback !== undefined && !s) return fallback;
  throw badRequest(`${label} is invalid`, field);
}

/** Validates an optional value against a pattern (empty passes). */
export function optionalMatch(value: unknown, re: RegExp, message: string, field: string): string {
  const s = str(value);
  if (s && !re.test(s)) throw badRequest(message, field);
  return s;
}

export function maxLen(value: string, max: number, label: string, field: string): string {
  if (value.length > max) throw badRequest(`${label} must be at most ${max} characters`, field);
  return value;
}

export function required(value: unknown, label: string, field: string): string {
  const s = str(value);
  if (!s) throw badRequest(`${label} is required`, field);
  return s;
}

export function ensureUnique<T extends { id: string }>(
  rows: T[],
  currentId: string | null,
  getter: (row: T) => string,
  value: string,
  message: string,
  field: string,
): void {
  const v = value.trim().toLowerCase();
  if (!v) return;
  if (rows.some((r) => r.id !== currentId && getter(r).trim().toLowerCase() === v)) throw conflict(message, field);
}

/** search → sort → paginate, the same way the real API is expected to. */
export function applyListQuery<T>(
  rows: T[],
  params: Record<string, string>,
  searchText: (row: T) => (string | null | undefined)[],
  defaultSort = '-createdAt',
): PagedResult<T> {
  let result = rows;
  const search = (params['search'] ?? '').trim().toLowerCase();
  if (search) {
    result = result.filter((r) => searchText(r).some((t) => (t ?? '').toLowerCase().includes(search)));
  }

  const sort = params['sort'] || defaultSort;
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  result = [...result].sort((a, b) => {
    const av = (a as Record<string, unknown>)[key];
    const bv = (b as Record<string, unknown>)[key];
    let cmp: number;
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else if (typeof av === 'boolean' && typeof bv === 'boolean') cmp = Number(av) - Number(bv);
    else cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'en', { numeric: true, sensitivity: 'base' });
    return desc ? -cmp : cmp;
  });

  const total = result.length;
  const limit = Math.max(1, Math.min(10000, Number(params['limit']) || 10));
  const page = Math.max(1, Number(params['page']) || 1);
  return { data: result.slice((page - 1) * limit, page * limit), total };
}

/** Filter helper: keep rows where `getter(row) === params[key]` when the param is present. */
export function whereEq<T>(rows: T[], params: Record<string, string>, key: string, getter: (row: T) => unknown): T[] {
  const v = params[key];
  if (v === undefined || v === '' || v === 'ALL') return rows;
  return rows.filter((r) => String(getter(r)) === v);
}
