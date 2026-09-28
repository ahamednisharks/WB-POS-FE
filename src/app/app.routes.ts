import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { Role } from './core/models';
import { AuthService } from './core/services/auth.service';
import { MainLayoutComponent } from './layout/main-layout/main-layout.component';

const ADMIN: Role[] = ['ADMIN'];
const ALL: Role[] = ['ADMIN', 'CASHIER'];

export const routes: Routes = [
  {
    path: 'login',
    title: 'Login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    canActivateChild: [authGuard, roleGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: () => inject(AuthService).homeUrl() },
      {
        path: 'dashboard',
        title: 'Dashboard',
        data: { roles: ADMIN },
        loadComponent: () => import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'master',
        data: { roles: ADMIN },
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'items' },
          {
            path: 'categories',
            title: 'Category',
            loadComponent: () => import('./pages/master/category/category-list.component').then((m) => m.CategoryListComponent),
          },
          {
            path: 'items',
            title: 'Item Master',
            loadComponent: () => import('./pages/master/item/item-list.component').then((m) => m.ItemListComponent),
          },
          {
            path: 'units',
            title: 'Unit Master',
            loadComponent: () => import('./pages/master/unit/unit-list.component').then((m) => m.UnitListComponent),
          },
          {
            path: 'combos',
            title: 'Combo Master',
            loadComponent: () => import('./pages/master/combo/combo-list.component').then((m) => m.ComboListComponent),
          },
          {
            path: 'suppliers',
            title: 'Supplier Master',
            loadComponent: () => import('./pages/master/supplier/supplier-list.component').then((m) => m.SupplierListComponent),
          },
        ],
      },
      {
        path: 'employee',
        data: { roles: ADMIN },
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'details' },
          {
            path: 'types',
            title: 'Employee Type',
            loadComponent: () =>
              import('./pages/employee/employee-type/employee-type-list.component').then((m) => m.EmployeeTypeListComponent),
          },
          {
            path: 'details',
            title: 'Employee Details',
            loadComponent: () =>
              import('./pages/employee/employee-details/employee-list.component').then((m) => m.EmployeeListComponent),
          },
          {
            path: 'details/:id',
            title: 'Employee Profile',
            loadComponent: () =>
              import('./pages/employee/employee-details/employee-profile.component').then((m) => m.EmployeeProfileComponent),
          },
          {
            path: 'salary',
            title: 'Salary Details',
            loadComponent: () => import('./pages/employee/salary/salary.component').then((m) => m.SalaryComponent),
          },
          {
            path: 'logins',
            title: 'Login Details',
            loadComponent: () => import('./pages/employee/login-details/login-list.component').then((m) => m.LoginListComponent),
          },
        ],
      },
      {
        path: 'billing',
        title: 'Billing',
        data: { roles: ALL, fullBleed: true },
        loadComponent: () => import('./pages/billing/billing.component').then((m) => m.BillingComponent),
      },
      {
        path: 'orders',
        title: 'Orders',
        data: { roles: ALL },
        loadComponent: () => import('./pages/orders/order-list.component').then((m) => m.OrderListComponent),
      },
      {
        path: 'orders/:id',
        title: 'Order Details',
        data: { roles: ALL },
        loadComponent: () => import('./pages/orders/order-detail.component').then((m) => m.OrderDetailComponent),
      },
      {
        path: 'transactions',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'sales' },
          {
            path: 'sales',
            title: 'Sales Transactions',
            data: { roles: ALL },
            loadComponent: () => import('./pages/transactions/sales/sales-list.component').then((m) => m.SalesListComponent),
          },
          {
            path: 'purchase-orders',
            title: 'Purchase Order (PO)',
            data: { roles: ADMIN },
            loadComponent: () =>
              import('./pages/transactions/purchase-order/po-list.component').then((m) => m.PurchaseOrderListComponent),
          },
          {
            path: 'purchase-entries',
            title: 'Purchase Entry (PE)',
            data: { roles: ADMIN },
            loadComponent: () =>
              import('./pages/transactions/purchase-entry/pe-list.component').then((m) => m.PurchaseEntryListComponent),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
