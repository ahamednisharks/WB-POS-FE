/**
 * Same rule as the API (sp_item_list, sp_dashboard_summary, sp_stock_summary): a stock-tracked item
 * with a minimum set, at or below it. SALE items and items with no minimum are never low.
 */
export function isLowStock(item: { type: string; minStock: number; currentStock: number }): boolean {
  return item.type !== 'SALE' && item.minStock > 0 && item.currentStock <= item.minStock;
}
