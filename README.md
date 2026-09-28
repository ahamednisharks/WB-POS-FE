# WB-POS — Frontend

Bakery billing (POS) app that runs as a **web app** and as an **Android / iOS app** from one codebase.

- **Angular 21** (standalone components, signals, `@if` / `@for`, lazy routes)
- **Ionic 8** app shell (split-pane sidebar, mobile modals / bottom sheet) + **Capacitor 8** for native builds
- **PrimeNG 21** (Aura preset re-tinted to the bakery yellow `#F5B700`) + PrimeIcons
- Reactive Forms, RxJS, HttpClient with interceptors
- INR (₹) amounts, `dd-MM-yyyy` dates, Asia/Kolkata time zone

The NestJS backend (`WB-POS/Backend`) is not required to try the app: a **mock API** answers every call from
data kept in the browser's `localStorage` (switch it off with one flag, see below).

---

## 1. Install

Requirements: Node.js 20.19+ / 22.12+ / 24.x and npm 10+.

```bash
cd WB-POS/Frontend
npm install
```

## 2. Run

```bash
npm start            # ng serve → http://localhost:4300
```

### Mock logins

| Username  | Password     | Role    | Lands on   |
| --------- | ------------ | ------- | ---------- |
| `admin`   | `admin123`   | ADMIN   | Dashboard  |
| `cashier` | `cashier123` | CASHIER | Billing    |

The mock database is seeded on first run with 5 units, 7 categories (Cakes, Breads, Puffs, Cookies, Beverages,
Snacks + Raw Materials), 25 items with realistic prices and GST, 3 combos, 3 suppliers, 5 employees,
salary records, 2 purchase orders + entries and ~40 bills over the last 7 days.
Every change you make is saved to `localStorage` (`wbpos.mockdb`).
To start over, run `wbposResetMock()` in the browser console (or clear site data).

## 3. Build for the web

```bash
npm run build        # production build → dist/frontend/browser
```

Serve `dist/frontend/browser` from any static host; configure it to fall back to `index.html` for deep links.

## 4. Build for Android / iOS (Capacitor)

`capacitor.config.ts`: `appId: com.wbpos.app`, `appName: WB-POS`, `webDir: dist/frontend/browser`.

```bash
npm run build
npx cap add android        # first time only (creates ./android)
npx cap sync android       # copy the web build + plugins into the native project
npx cap open android       # open in Android Studio → Run / Build APK
```

iOS (on macOS with Xcode): `npx cap add ios`, `npx cap sync ios`, `npx cap open ios`.

Shortcut scripts: `npm run cap:sync` (build + sync all platforms) and `npm run android` (build, sync, open Android Studio).

> On a phone the API URL must be reachable from the device — use your PC's LAN IP (e.g. `http://192.168.1.20:3000/api`)
> instead of `localhost` when `useMock` is `false`.

## 5. Switch to the real backend

Edit **`src/environments/environment.ts`** (production build) and **`src/environments/environment.development.ts`** (`npm start`):

```ts
apiUrl: 'http://localhost:3000/api', // your NestJS base URL
useMock: false,                       // ← turn the mock off
```

No other code changes are needed: the mock interceptor is simply not registered when `useMock` is `false`.
The same files hold the shop profile printed on receipts (name, address, GSTIN, state, UPI id).

### API contract the frontend calls

JSON everywhere, JWT in `Authorization: Bearer <token>`.

```
POST   /auth/login                       { username, password } → { token, user: { id, name, role } }
GET    /dashboard?from=&to=
CRUD   /units  /categories  /items  /combos  /suppliers
CRUD   /employee-types  /employees  /salary-setups  /salary-payments  /logins
POST   /logins/:id/reset-password   PATCH /logins/:id/block
POST   /bills        GET /bills?from=&to=&status=&cashierId=   GET /bills/:id   POST /bills/:id/cancel
GET    /transactions?from=&to=&mode=&type=     POST /day-close
CRUD   /purchase-orders   POST /purchase-orders/:id/cancel
CRUD   /purchase-entries  POST /purchase-entries/:id/payments
```

- List endpoints accept `?page=&limit=&search=&sort=` (`sort=-createdAt` = descending) plus module filters, and return `{ data: T[], total: number }`.
- `DELETE` returns `{ deleted: boolean, message: string }` — when a record is used elsewhere the backend marks it Inactive and says so.
- Errors: `{ statusCode, message, field? }`. `message` is shown in a toast; `field` highlights the form control (e.g. duplicate name).
- `401` logs the user out. Request/response shapes are the interfaces in `src/app/core/models/`.
- The mock handlers in `src/app/core/mock/handlers/` are an executable reference of the expected rules (validation, soft delete, stock, refunds, day close).

## 6. Features at a glance

| Area | Notes |
| --- | --- |
| Login | Username/password validation, show/hide password, "Remember me" (7 days, otherwise 12 h), blocked-account message |
| Roles | `authGuard` on every route except `/login`; `roleGuard` reads `data.roles`; sidebar filtered by role |
| Dashboard (Admin) | Period filter, sales cards, cancelled drill-down, payment donut, sales-by-hour bar, top items, recent bills |
| Masters (Admin) | Units, Categories, Items (setup banner on empty list), Combos (item rows, auto actual price/savings), Suppliers |
| Employees (Admin) | Types, Employee details + profile (Details · Salary · Login), Salary setup & monthly payments (slip printing), Login accounts (reset password, block/unblock) |
| Billing | Touch item grid, category tabs, search, barcode scan, weight pad for KG items, customer lookup, ₹/% discount (cashier ≤ 10 %), hold/resume, Cash/UPI/Card/Split payment, 80 mm receipt, WhatsApp share |
| Orders | Filters, reprint (DUPLICATE), share, cancel with reason (Admin → refunds), resume held bills, detail page with GST split and history |
| Transactions | Sales transactions with summary + Excel/PDF export (Admin), day close with cash tally slip, Purchase Orders, Purchase Entries (stock in, payments) |

### Billing keyboard shortcuts (web)

| Key | Action |
| --- | --- |
| `F2` | Focus item search |
| `F4` | Pay |
| `F8` | Hold bill |
| `Esc` | Close the open dialog |
| `Enter` in search | Add the exact code / only match |

### Tax logic

- Item "Price includes GST" → tax is back-calculated from the price; otherwise GST is added on top.
- A bill discount is spread across rows before tax. CGST = SGST = GST ÷ 2. The grand total is rounded to the rupee (Round Off line).
- Purchases: same state as the shop → CGST + SGST, other state → IGST.

## 7. Project structure

```
src/app/
├── core/          models · services · guards · interceptors · mock (backend) · utils · theme
├── shared/        page-header · confirm-delete · status-tag · empty-state · form-dialog · field-error ·
│                  image/file pickers · date-range filter · print layouts · pipes (inr, dates…)
├── layout/        main-layout (ion-split-pane) · sidebar · header
└── pages/         login · dashboard · master/* · employee/* · billing · orders · transactions/*
```

## 8. Scripts

| Script | What it does |
| --- | --- |
| `npm start` | Dev server with the development environment |
| `npm run build` | Production build to `dist/frontend/browser` |
| `npm run watch` | Development build in watch mode |
| `npm run cap:sync` | Production build + `npx cap sync` |
| `npm run android` | Production build + sync + open Android Studio |
