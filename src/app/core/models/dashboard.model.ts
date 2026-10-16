import { BillPaymentMode } from './bill.model';

export interface HourlySales {
  /** 7 … 23 */
  hour: number;
  amount: number;
  bills: number;
}

export interface TopItem {
  name: string;
  qty: number;
  amount: number;
}

export interface RecentBill {
  id: string;
  billNo: string;
  billDate: string;
  cashierName: string;
  grandTotal: number;
  paymentMode: BillPaymentMode | null;
}

/** Stock-tracked item at or below its minimum stock (right now, not date-bound). */
export interface LowStockItem {
  id: string;
  code: string;
  name: string;
  type: 'RAW' | 'BOTH';
  unitCode: string;
  currentStock: number;
  minStock: number;
}

export interface DashboardData {
  from: string;
  to: string;
  totalSales: number;
  totalBills: number;
  averageBill: number;
  cancelledCount: number;
  cancelledAmount: number;
  paymentSplit: { cash: number; upi: number; card: number };
  salesByHour: HourlySales[];
  topItems: TopItem[];
  recentBills: RecentBill[];
  /** Items at or below their min stock right now. */
  lowStockCount: number;
  /** Up to 20 of them, lowest first. */
  lowStock: LowStockItem[];
}
