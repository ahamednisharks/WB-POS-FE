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
}
