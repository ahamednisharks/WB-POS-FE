import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Bill, PurchaseOrder } from '../models';
import { PAYMENT_MODE_LABEL } from '../utils/constants';
import { displayDate, displayDateTime } from '../utils/date.util';
import { formatINR, formatQty } from '../utils/format.util';

/** Builds WhatsApp share links (wa.me) for bills and purchase orders. */
@Injectable({ providedIn: 'root' })
export class ShareService {
  whatsApp(text: string, mobile?: string | null): void {
    const digits = (mobile ?? '').replace(/\D/g, '');
    const phone = digits.length === 10 ? `91${digits}` : digits.length === 12 ? digits : '';
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
  }

  shareBill(bill: Bill): void {
    this.whatsApp(this.billText(bill), bill.customerMobile);
  }

  sharePurchaseOrder(po: PurchaseOrder): void {
    this.whatsApp(this.poText(po), po.supplierMobile);
  }

  billText(bill: Bill): string {
    const shop = environment.shop;
    const lines = bill.lines.map((l) => `• ${l.name} × ${formatQty(l.qty)} = ${formatINR(l.amount)}`);
    const mode = bill.paymentMode ? PAYMENT_MODE_LABEL[bill.paymentMode] : '-';
    return [
      `*${shop.name}*`,
      `Bill No: ${bill.billNo}`,
      `Date: ${displayDateTime(bill.billDate)}`,
      bill.customerName ? `Customer: ${bill.customerName}` : '',
      '',
      ...lines,
      '',
      `Sub Total: ${formatINR(bill.subTotal)}`,
      bill.discountAmount ? `Discount: -${formatINR(bill.discountAmount)}` : '',
      `GST: ${formatINR(bill.totalGst)}`,
      `*Total: ${formatINR(bill.grandTotal)}*`,
      `Paid by: ${mode}`,
      '',
      'Thank you, visit again!',
    ]
      .filter((l, i, arr) => l !== '' || arr[i - 1] !== '')
      .join('\n');
  }

  poText(po: PurchaseOrder): string {
    const shop = environment.shop;
    const lines = po.items.map((i) => `• ${i.itemName} — ${formatQty(i.qty)} ${i.unitCode} @ ${formatINR(i.rate)}`);
    return [
      `*Purchase Order ${po.poNo}* from ${shop.name}`,
      `PO Date: ${displayDate(po.poDate)}`,
      po.expectedDate ? `Expected by: ${displayDate(po.expectedDate)}` : '',
      '',
      ...lines,
      '',
      `*Grand Total: ${formatINR(po.grandTotal)}*`,
      po.notes ? `Notes: ${po.notes}` : '',
      '',
      `${shop.name}, ${shop.address}. Ph: ${shop.phone}`,
    ]
      .filter((l, i, arr) => l !== '' || arr[i - 1] !== '')
      .join('\n');
  }
}
