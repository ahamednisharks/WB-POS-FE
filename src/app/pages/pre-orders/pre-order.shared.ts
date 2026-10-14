import { DeliveryType, Option, PreOrderStatus, PreOrderSummary } from '../../core/models';
import { addDays, DateRange, istDate, todayIST } from '../../core/utils/date.util';

export type PreOrderStatusFilter = PreOrderStatus | 'OPEN' | 'ALL';

export const PRE_ORDER_STATUS_OPTIONS: Option<PreOrderStatusFilter>[] = [
  { label: 'Open (booked + ready)', value: 'OPEN' },
  { label: 'Booked', value: 'BOOKED' },
  { label: 'Ready', value: 'READY' },
  { label: 'Delivered', value: 'DELIVERED' },
  { label: 'Cancelled', value: 'CANCELLED' },
  { label: 'All', value: 'ALL' },
];

export const DELIVERY_TYPE_OPTIONS: Option<DeliveryType>[] = [
  { label: 'Shop pickup', value: 'PICKUP' },
  { label: 'Home delivery', value: 'HOME' },
];

export const DELIVERY_TYPE_LABEL: Record<DeliveryType, string> = {
  PICKUP: 'Shop pickup',
  HOME: 'Home delivery',
};

export const PRE_ORDER_CANCEL_REASONS = ['Customer cancelled', 'Order changed', 'Duplicate order', 'Other'];

export type DeliveryPreset = 'ALL' | 'TODAY' | 'TOMORROW' | 'WEEK' | 'CUSTOM';

export const DELIVERY_PRESET_OPTIONS: Option<DeliveryPreset>[] = [
  { label: 'All dates', value: 'ALL' },
  { label: 'Today', value: 'TODAY' },
  { label: 'Tomorrow', value: 'TOMORROW' },
  { label: 'Next 7 days', value: 'WEEK' },
  { label: 'Custom range', value: 'CUSTOM' },
];

/** Delivery date range for a preset; null = no date filter. */
export function deliveryRange(preset: Exclude<DeliveryPreset, 'CUSTOM'>): DateRange | null {
  const today = todayIST();
  switch (preset) {
    case 'ALL':
      return null;
    case 'TODAY':
      return { from: today, to: today };
    case 'TOMORROW': {
      const t = addDays(today, 1);
      return { from: t, to: t };
    }
    case 'WEEK':
      return { from: today, to: addDays(today, 6) };
  }
}

/** Booked or ready: can still be edited, paid, delivered or cancelled. */
export function isOpen(order: Pick<PreOrderSummary, 'status'>): boolean {
  return order.status === 'BOOKED' || order.status === 'READY';
}

/** Open and the delivery time has already passed. */
export function isOverdue(order: Pick<PreOrderSummary, 'status' | 'deliveryAt'>, now = Date.now()): boolean {
  return isOpen(order) && new Date(order.deliveryAt).getTime() < now;
}

/** Open and due later today (IST). */
export function isDueToday(order: Pick<PreOrderSummary, 'status' | 'deliveryAt'>, now = Date.now()): boolean {
  return isOpen(order) && !isOverdue(order, now) && istDate(order.deliveryAt) === istDate(now);
}
