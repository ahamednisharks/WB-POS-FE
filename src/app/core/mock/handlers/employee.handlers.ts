import {
  ApiMessage,
  BankPaymentMode,
  Employee,
  EmployeeStatus,
  EmployeeType,
  Gender,
  LoginAccount,
  LoginStatus,
  Role,
  SalaryPayment,
  SalaryPaymentStatus,
  SalarySetup,
  SalaryType,
  Status,
  UploadedFile,
} from '../../models';
import { PATTERNS } from '../../utils/constants';
import { ageInYears, monthLabel, nowIso, todayIST } from '../../utils/date.util';
import { round2 } from '../../utils/tax.util';
import { crudRoutes } from '../mock-crud';
import { clone, MockDatabase, MockDb, MockLogin, pad } from '../mock-db';
import {
  badRequest,
  bodyOf,
  bool,
  conflict,
  ensureUnique,
  maxLen,
  MockRoute,
  notFound,
  num,
  oneOf,
  optionalMatch,
  required,
  str,
  whereEq,
} from '../mock-http';
import { addTransaction } from '../mock-txn';

const STATUSES: readonly Status[] = ['ACTIVE', 'INACTIVE'];
const EMP_STATUSES: readonly EmployeeStatus[] = ['ACTIVE', 'RESIGNED'];
const GENDERS: readonly Gender[] = ['MALE', 'FEMALE', 'OTHER'];
const SALARY_TYPES: readonly SalaryType[] = ['MONTHLY', 'DAILY'];
const PAY_STATUSES: readonly SalaryPaymentStatus[] = ['PENDING', 'PAID'];
const PAY_MODES: readonly BankPaymentMode[] = ['CASH', 'BANK', 'UPI'];
const ROLES: readonly Role[] = ['ADMIN', 'CASHIER'];
const LOGIN_STATUSES: readonly LoginStatus[] = ['ACTIVE', 'BLOCKED'];

function employeeOf(db: MockDatabase, id: string, field = 'employeeId'): Employee {
  const e = db.employees.find((x) => x.id === id);
  if (!e) throw badRequest('Employee not found', field);
  return e;
}

function dateStr(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw badRequest('Invalid date');
  return s;
}

function fileOf(value: unknown, maxMb: number, field: string): UploadedFile | null {
  if (!value || typeof value !== 'object') return null;
  const f = value as Partial<UploadedFile>;
  if (!f.dataUrl || !f.name) return null;
  if ((f.size ?? 0) > maxMb * 1024 * 1024) throw badRequest(`File must be ${maxMb} MB or smaller`, field);
  return { name: f.name, type: f.type ?? '', size: f.size ?? 0, dataUrl: f.dataUrl };
}

function toAccount(l: MockLogin, db: MockDatabase): LoginAccount {
  const { password: _pw, ...account } = l;
  const emp = db.employees.find((e) => e.id === l.employeeId);
  return { ...account, employeeName: emp?.fullName ?? l.employeeName, empCode: emp?.empCode ?? l.empCode };
}

// ------------------------------------------------------------ employee types
const employeeTypeRoutes = crudRoutes<EmployeeType>({
  path: '/employee-types',
  label: 'Employee type',
  rows: (db) => db.employeeTypes,
  view: (t) => t,
  search: (t) => [t.name, t.description],
  filter: (rows, p) => whereEq(rows, p, 'canLogin', (t) => t.canLogin),
  build: (b, existing, db) => {
    const name = maxLen(required(b['name'], 'Type name', 'name'), 40, 'Type name', 'name');
    ensureUnique(db.data.employeeTypes, existing?.id ?? null, (t) => t.name, name, 'This employee type already exists', 'name');
    return {
      name,
      description: maxLen(str(b['description']), 200, 'Description', 'description'),
      canLogin: bool(b['canLogin']),
      status: oneOf(b['status'], STATUSES, 'Status', 'status', 'ACTIVE'),
    };
  },
  inUse: (t, db) => {
    const n = db.employees.filter((e) => e.employeeTypeId === t.id).length;
    return n ? `${n} employee(s) have this type, so it was marked Inactive instead of deleted.` : null;
  },
});

// ----------------------------------------------------------------- employees
const employeeCrudRoutes = crudRoutes<Employee>({
  path: '/employees',
  label: 'Employee',
  rows: (db) => db.employees,
  view: (e, db) => ({ ...e, employeeTypeName: db.employeeTypes.find((t) => t.id === e.employeeTypeId)?.name ?? e.employeeTypeName }),
  search: (e) => [e.fullName, e.empCode, e.mobile, e.employeeTypeName],
  filter: (rows, p) => whereEq(rows, p, 'employeeTypeId', (e) => e.employeeTypeId),
  build: (b, existing, db) => {
    const fullName = maxLen(required(b['fullName'], 'Full name', 'fullName'), 80, 'Full name', 'fullName');
    const employeeTypeId = required(b['employeeTypeId'], 'Employee type', 'employeeTypeId');
    const type = db.data.employeeTypes.find((t) => t.id === employeeTypeId);
    if (!type) throw badRequest('Employee type not found', 'employeeTypeId');
    const mobile = required(b['mobile'], 'Mobile', 'mobile');
    if (!PATTERNS.anyTenDigits.test(mobile)) throw badRequest('Mobile must be 10 digits', 'mobile');
    ensureUnique(db.data.employees, existing?.id ?? null, (e) => e.mobile, mobile, 'Another employee has this mobile number', 'mobile');
    const dob = dateStr(b['dob']);
    if (dob && ageInYears(dob) < 18) throw badRequest('Employee must be at least 18 years old', 'dob');
    const joiningDate = dateStr(b['joiningDate']);
    if (!joiningDate) throw badRequest('Joining date is required', 'joiningDate');
    if (joiningDate > todayIST()) throw badRequest('Joining date cannot be in the future', 'joiningDate');
    const aadhaar = optionalMatch(b['aadhaar'], PATTERNS.aadhaar, 'Aadhaar must be 12 digits', 'aadhaar');
    ensureUnique(db.data.employees, existing?.id ?? null, (e) => e.aadhaar, aadhaar, 'Another employee has this Aadhaar number', 'aadhaar');
    const status = oneOf(b['status'], EMP_STATUSES, 'Status', 'status', 'ACTIVE');
    const resignDate = status === 'RESIGNED' ? dateStr(b['resignDate']) : null;
    if (status === 'RESIGNED' && !resignDate) throw badRequest('Resign date is required', 'resignDate');
    return {
      empCode: existing?.empCode ?? `EMP${pad(db.next('employee'), 3)}`,
      photo: str(b['photo']) || null,
      fullName,
      employeeTypeId,
      employeeTypeName: type.name,
      mobile,
      altMobile: optionalMatch(b['altMobile'], PATTERNS.anyTenDigits, 'Alternate mobile must be 10 digits', 'altMobile'),
      email: optionalMatch(b['email'], /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email', 'email'),
      gender: oneOf(b['gender'], GENDERS, 'Gender', 'gender'),
      dob,
      joiningDate,
      address: required(b['address'], 'Address', 'address'),
      aadhaar,
      idProof: fileOf(b['idProof'], 2, 'idProof'),
      emergencyName: str(b['emergencyName']),
      emergencyMobile: optionalMatch(b['emergencyMobile'], PATTERNS.anyTenDigits, 'Emergency contact must be 10 digits', 'emergencyMobile'),
      bankAccount: optionalMatch(b['bankAccount'], PATTERNS.bankAccount, 'Account number must be 9 to 18 digits', 'bankAccount'),
      ifsc: optionalMatch(str(b['ifsc']).toUpperCase(), PATTERNS.ifsc, 'Enter a valid IFSC code', 'ifsc'),
      status,
      resignDate,
    };
  },
  afterSave: (e, _prev, db) => {
    // A resigned employee can no longer log in.
    if (e.status === 'RESIGNED') {
      db.data.logins.filter((l) => l.employeeId === e.id).forEach((l) => (l.status = 'BLOCKED'));
    }
  },
  inUse: (e, db) =>
    db.logins.some((l) => l.employeeId === e.id) ||
    db.salaryPayments.some((s) => s.employeeId === e.id) ||
    db.salarySetups.some((s) => s.employeeId === e.id)
      ? 'Employee has login or salary records, so they were marked Resigned instead of deleted.'
      : null,
  deactivate: (e, db) => {
    e.status = 'RESIGNED';
    e.resignDate = e.resignDate ?? todayIST();
    db.data.logins.filter((l) => l.employeeId === e.id).forEach((l) => (l.status = 'BLOCKED'));
  },
});

// ------------------------------------------------------------- salary setups
const salarySetupRoutes = crudRoutes<SalarySetup>({
  path: '/salary-setups',
  label: 'Salary setup',
  rows: (db) => db.salarySetups,
  view: (s, db) => {
    const e = db.employees.find((x) => x.id === s.employeeId);
    return { ...s, employeeName: e?.fullName ?? s.employeeName, empCode: e?.empCode ?? s.empCode };
  },
  search: (s) => [s.employeeName, s.empCode],
  filter: (rows, p) => whereEq(whereEq(rows, p, 'employeeId', (s) => s.employeeId), p, 'salaryType', (s) => s.salaryType),
  defaultSort: '-effectiveFrom',
  build: (b, existing, db) => {
    const emp = employeeOf(db.data, required(b['employeeId'], 'Employee', 'employeeId'));
    const effectiveFrom = dateStr(b['effectiveFrom']);
    if (!effectiveFrom) throw badRequest('Effective from date is required', 'effectiveFrom');
    if (db.data.salarySetups.some((s) => s.id !== existing?.id && s.employeeId === emp.id && s.effectiveFrom === effectiveFrom)) {
      throw conflict('This employee already has a salary setup from this date', 'effectiveFrom');
    }
    const basicSalary = round2(num(b['basicSalary']));
    if (basicSalary <= 0) throw badRequest('Basic salary must be greater than 0', 'basicSalary');
    return {
      employeeId: emp.id,
      empCode: emp.empCode,
      employeeName: emp.fullName,
      salaryType: oneOf(b['salaryType'], SALARY_TYPES, 'Salary type', 'salaryType'),
      basicSalary,
      allowances: Math.max(0, round2(num(b['allowances']))),
      effectiveFrom,
    };
  },
});

// ----------------------------------------------------------- salary payments
const salaryPaymentRoutes = crudRoutes<SalaryPayment>({
  path: '/salary-payments',
  label: 'Salary payment',
  rows: (db) => db.salaryPayments,
  view: (s, db) => {
    const e = db.employees.find((x) => x.id === s.employeeId);
    return { ...s, employeeName: e?.fullName ?? s.employeeName, empCode: e?.empCode ?? s.empCode };
  },
  search: (s) => [s.employeeName, s.empCode],
  filter: (rows, p) => whereEq(whereEq(rows, p, 'month', (s) => s.month), p, 'employeeId', (s) => s.employeeId),
  defaultSort: '-month',
  build: (b, existing, db) => {
    const month = required(b['month'], 'Month', 'month');
    if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest('Invalid month', 'month');
    const emp = employeeOf(db.data, required(b['employeeId'], 'Employee', 'employeeId'));
    if (db.data.salaryPayments.some((s) => s.id !== existing?.id && s.employeeId === emp.id && s.month === month)) {
      throw conflict(`Salary for ${emp.fullName} for ${monthLabel(month)} already exists`, 'month');
    }
    const workingDays = Math.round(num(b['workingDays']));
    if (workingDays < 1 || workingDays > 31) throw badRequest('Working days must be between 1 and 31', 'workingDays');
    const daysPresent = num(b['daysPresent']);
    if (daysPresent < 0 || daysPresent > workingDays) throw badRequest('Days present cannot exceed working days', 'daysPresent');
    const gross = round2(num(b['gross']));
    const bonus = round2(Math.max(0, num(b['bonus'])));
    const advanceDeduction = round2(Math.max(0, num(b['advanceDeduction'])));
    const otherDeductions = round2(Math.max(0, num(b['otherDeductions'])));
    const deductionReason = str(b['deductionReason']);
    if (otherDeductions > 0 && !deductionReason) throw badRequest('Reason is required for other deductions', 'deductionReason');
    const status = oneOf(b['status'], PAY_STATUSES, 'Status', 'status', 'PENDING');
    const paymentDate = dateStr(b['paymentDate']);
    const paymentMode = str(b['paymentMode']) ? oneOf(b['paymentMode'], PAY_MODES, 'Payment mode', 'paymentMode') : null;
    if (status === 'PAID' && (!paymentDate || !paymentMode)) throw badRequest('Payment date and mode are required to mark as paid', 'paymentDate');
    return {
      month,
      employeeId: emp.id,
      empCode: emp.empCode,
      employeeName: emp.fullName,
      workingDays,
      daysPresent,
      gross,
      bonus,
      advanceDeduction,
      otherDeductions,
      deductionReason,
      net: round2(gross + bonus - advanceDeduction - otherDeductions),
      paymentDate,
      paymentMode,
      status,
    };
  },
  afterSave: (s, prev, db, req) => {
    if (s.status === 'PAID' && prev?.status !== 'PAID' && s.paymentMode === 'CASH') {
      addTransaction(db, req.user, {
        type: 'CASH_OUT',
        mode: 'CASH',
        amount: s.net,
        note: `Salary - ${s.employeeName} (${monthLabel(s.month)})`,
      });
    }
  },
  beforeDelete: (s) => {
    if (s.status === 'PAID') throw badRequest('Paid salary records cannot be deleted');
  },
});

// -------------------------------------------------------------------- logins
function findLogin(db: MockDb, id: string): MockLogin {
  const l = db.data.logins.find((x) => x.id === id);
  if (!l) throw notFound('Login');
  return l;
}

const loginRoutes: MockRoute[] = [
  {
    method: 'GET',
    pattern: /^\/logins$/,
    roles: ['ADMIN'],
    handler: (req) => {
      const db = MockDb.get();
      let rows = db.data.logins.map((l) => toAccount(l, db.data));
      rows = whereEq(rows, req.params, 'status', (l) => l.status);
      rows = whereEq(rows, req.params, 'role', (l) => l.role);
      rows = whereEq(rows, req.params, 'employeeId', (l) => l.employeeId);
      const search = (req.params['search'] ?? '').toLowerCase();
      if (search) rows = rows.filter((l) => [l.username, l.employeeName, l.empCode].some((t) => t.toLowerCase().includes(search)));
      const sort = req.params['sort'] || '-createdAt';
      const key = sort.replace('-', '') as keyof LoginAccount;
      rows.sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')) * (sort.startsWith('-') ? -1 : 1));
      const limit = Number(req.params['limit']) || 10;
      const page = Number(req.params['page']) || 1;
      return clone({ data: rows.slice((page - 1) * limit, page * limit), total: rows.length });
    },
  },
  {
    method: 'GET',
    pattern: /^\/logins\/([^/]+)$/,
    roles: ['ADMIN'],
    handler: (req) => {
      const db = MockDb.get();
      return clone(toAccount(findLogin(db, req.match[1]), db.data));
    },
  },
  {
    method: 'POST',
    pattern: /^\/logins$/,
    roles: ['ADMIN'],
    status: 201,
    handler: (req) => {
      const db = MockDb.get();
      const b = bodyOf<Record<string, unknown>>(req);
      const emp = employeeOf(db.data, required(b['employeeId'], 'Employee', 'employeeId'));
      const type = db.data.employeeTypes.find((t) => t.id === emp.employeeTypeId);
      if (!type?.canLogin) throw badRequest(`${type?.name ?? 'This'} employees cannot have a login`, 'employeeId');
      if (emp.status !== 'ACTIVE') throw badRequest('Resigned employees cannot have a login', 'employeeId');
      if (db.data.logins.some((l) => l.employeeId === emp.id)) throw conflict('This employee already has a login', 'employeeId');
      const username = required(b['username'], 'Username', 'username');
      if (!PATTERNS.username.test(username)) throw badRequest('Username must be 3-30 characters with no spaces', 'username');
      ensureUnique(db.data.logins, null, (l) => l.username, username, 'This username is already taken', 'username');
      const password = str(b['password']);
      if (password.length < 6) throw badRequest('Password must be at least 6 characters', 'password');
      const now = nowIso();
      const login: MockLogin = {
        id: `login-${Date.now().toString(36)}`,
        employeeId: emp.id,
        empCode: emp.empCode,
        employeeName: emp.fullName,
        username,
        password,
        role: oneOf(b['role'], ROLES, 'Role', 'role'),
        status: oneOf(b['status'], LOGIN_STATUSES, 'Status', 'status', 'ACTIVE'),
        lastLogin: null,
        createdAt: now,
        updatedAt: now,
      };
      db.data.logins.push(login);
      db.save();
      return clone(toAccount(login, db.data));
    },
  },
  {
    method: 'PUT',
    pattern: /^\/logins\/([^/]+)$/,
    roles: ['ADMIN'],
    handler: (req) => {
      const db = MockDb.get();
      const login = findLogin(db, req.match[1]);
      const b = bodyOf<Record<string, unknown>>(req);
      const username = required(b['username'], 'Username', 'username');
      if (!PATTERNS.username.test(username)) throw badRequest('Username must be 3-30 characters with no spaces', 'username');
      ensureUnique(db.data.logins, login.id, (l) => l.username, username, 'This username is already taken', 'username');
      const role = oneOf(b['role'], ROLES, 'Role', 'role');
      const status = oneOf(b['status'], LOGIN_STATUSES, 'Status', 'status', login.status);
      if (login.id === req.user?.id && (role !== 'ADMIN' || status === 'BLOCKED')) {
        throw badRequest('You cannot remove your own admin access or block yourself', 'role');
      }
      Object.assign(login, { username, role, status, updatedAt: nowIso() });
      db.save();
      return clone(toAccount(login, db.data));
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/logins\/([^/]+)$/,
    roles: ['ADMIN'],
    handler: (req) => {
      const db = MockDb.get();
      const login = findLogin(db, req.match[1]);
      if (login.id === req.user?.id) throw badRequest('You cannot delete your own login');
      const used = db.data.bills.some((b) => b.cashierId === login.id);
      if (used) {
        login.status = 'BLOCKED';
        login.updatedAt = nowIso();
        db.save();
        return { deleted: false, message: 'This login has billed before, so it was Blocked instead of deleted.' };
      }
      db.data.logins.splice(db.data.logins.indexOf(login), 1);
      db.save();
      return { deleted: true, message: 'Login deleted successfully' };
    },
  },
  {
    method: 'POST',
    pattern: /^\/logins\/([^/]+)\/reset-password$/,
    roles: ['ADMIN'],
    handler: (req): ApiMessage => {
      const db = MockDb.get();
      const login = findLogin(db, req.match[1]);
      const password = str(bodyOf<Record<string, unknown>>(req)['password']);
      if (password.length < 6) throw badRequest('Password must be at least 6 characters', 'password');
      login.password = password;
      login.updatedAt = nowIso();
      db.save();
      return { message: `Password reset for ${login.username}` };
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/logins\/([^/]+)\/block$/,
    roles: ['ADMIN'],
    handler: (req) => {
      const db = MockDb.get();
      const login = findLogin(db, req.match[1]);
      const blocked = bool(bodyOf<Record<string, unknown>>(req)['blocked']);
      if (blocked && login.id === req.user?.id) throw badRequest('You cannot block your own login');
      login.status = blocked ? 'BLOCKED' : 'ACTIVE';
      login.updatedAt = nowIso();
      db.save();
      return clone(toAccount(login, db.data));
    },
  },
];

export const employeeModuleRoutes: MockRoute[] = [
  ...employeeTypeRoutes,
  ...employeeCrudRoutes,
  ...salarySetupRoutes,
  ...salaryPaymentRoutes,
  ...loginRoutes,
];
