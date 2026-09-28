import { AuthUser, LoginResponse, Role } from '../../models';
import { nowIso } from '../../utils/date.util';
import { MockDb } from '../mock-db';
import { bodyOf, MockError, MockRoute, str } from '../mock-http';

interface MockTokenPayload {
  sub: string;
  name: string;
  role: Role;
  exp: number;
}

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Fake JWT: header.payload.signature where payload is base64(JSON). Good enough for the mock. */
function issueToken(user: AuthUser): string {
  const payload: MockTokenPayload = { sub: user.id, name: user.name, role: user.role, exp: Date.now() + TOKEN_TTL_MS };
  return `mock.${btoa(encodeURIComponent(JSON.stringify(payload)))}.signature`;
}

/** Resolves the Authorization header to a user; null when missing/invalid/blocked. */
export function userFromToken(authHeader: string | null): AuthUser | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const parts = authHeader.slice(7).split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(decodeURIComponent(atob(parts[1]))) as MockTokenPayload;
    if (!payload.sub || payload.exp < Date.now()) return null;
    const login = MockDb.get().data.logins.find((l) => l.id === payload.sub);
    if (!login || login.status !== 'ACTIVE') return null;
    return { id: login.id, name: login.employeeName, role: login.role, username: login.username, employeeId: login.employeeId };
  } catch {
    return null;
  }
}

export const authRoutes: MockRoute[] = [
  {
    method: 'POST',
    pattern: /^\/auth\/login$/,
    auth: false,
    handler: (req): LoginResponse => {
      const db = MockDb.get();
      const body = bodyOf<{ username?: string; password?: string }>(req);
      const username = str(body.username).toLowerCase();
      const login = db.data.logins.find((l) => l.username.toLowerCase() === username);
      if (!login || login.password !== (body.password ?? '')) {
        throw new MockError(401, 'Invalid username or password');
      }
      const employee = db.data.employees.find((e) => e.id === login.employeeId);
      if (login.status === 'BLOCKED' || employee?.status === 'RESIGNED') {
        throw new MockError(403, 'Your account is blocked. Contact Admin.');
      }
      login.lastLogin = nowIso();
      db.save();
      const user: AuthUser = {
        id: login.id,
        name: employee?.fullName ?? login.employeeName,
        role: login.role,
        username: login.username,
        employeeId: login.employeeId,
      };
      return { token: issueToken(user), user };
    },
  },
];
