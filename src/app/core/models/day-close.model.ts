export interface DayCloseRequest {
  /** yyyy-MM-dd */
  date: string;
  openingCash: number;
  cashSales: number;
  cashRefunds: number;
  cashOuts: number;
  /** opening + cash sales − cash refunds − cash-outs */
  expectedCash: number;
  countedCash: number;
  /** counted − expected */
  difference: number;
  remarks: string;
}

export interface DayClose extends DayCloseRequest {
  id: string;
  closedById: string;
  closedByName: string;
  createdAt: string;
}
