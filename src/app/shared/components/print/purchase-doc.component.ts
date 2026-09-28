import { Component, computed, input } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { PurchaseEntry, PurchaseOrder } from '../../../core/models';
import { IstDatePipe, QtyPipe } from '../../pipes/display.pipes';
import { InrCurrencyPipe } from '../../pipes/inr-currency.pipe';

interface DocLine {
  name: string;
  unit: string;
  qty: number;
  rate: number;
  gst: number;
  amount: number;
}

/** A4 print for a Purchase Order or Purchase Entry. */
@Component({
  selector: 'app-purchase-doc',
  imports: [InrCurrencyPipe, QtyPipe],
  template: `
    @let d = doc();
    <div class="doc">
      <div class="head">
        <div>
          <div class="shop">{{ shop.name }}</div>
          <div class="muted">{{ shop.address }}</div>
          <div class="muted">Ph: {{ shop.phone }} · GSTIN: {{ shop.gstin }}</div>
        </div>
        <div class="doc-title">
          {{ d.title }}<br />
          <span class="muted">{{ d.number }}</span>
        </div>
      </div>
      <div class="grid2">
        <div class="box">
          <h4>Supplier</h4>
          <div><strong>{{ d.supplier }}</strong></div>
          <div class="muted">{{ d.supplierState }}</div>
          @if (d.supplierGstin) {
            <div class="muted">GSTIN: {{ d.supplierGstin }}</div>
          }
        </div>
        <div class="box">
          <h4>Details</h4>
          @for (m of d.meta; track m[0]) {
            <div>{{ m[0] }}: <strong>{{ m[1] }}</strong></div>
          }
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">GST %</th><th class="r">Amount</th>
          </tr>
        </thead>
        <tbody>
          @for (l of d.lines; track $index) {
            <tr>
              <td>{{ $index + 1 }}</td>
              <td>{{ l.name }}</td>
              <td class="r">{{ l.qty | qty }} {{ l.unit }}</td>
              <td class="r">{{ l.rate | inr }}</td>
              <td class="r">{{ l.gst }}%</td>
              <td class="r">{{ l.amount | inr }}</td>
            </tr>
          }
        </tbody>
      </table>
      <div class="totals">
        @for (t of d.totals; track t[0]) {
          <div class="kv"><span>{{ t[0] }}</span><span>{{ t[1] | inr }}</span></div>
        }
        <div class="kv grand"><span>Grand Total</span><span>{{ d.grandTotal | inr }}</span></div>
      </div>
      @if (d.notes) {
        <p><strong>Notes:</strong> {{ d.notes }}</p>
      }
      <div class="sign"><div>Prepared by</div><div>Authorised signatory</div></div>
    </div>
  `,
  styleUrl: './print-a4.scss',
})
export class PurchaseDocComponent {
  readonly po = input<PurchaseOrder | null>(null);
  readonly pe = input<PurchaseEntry | null>(null);
  protected readonly shop = environment.shop;
  private readonly datePipe = new IstDatePipe();

  protected readonly doc = computed(() => {
    const po = this.po();
    const pe = this.pe();
    const lines: DocLine[] = [];
    const totals: [string, number][] = [];
    if (po) {
      po.items.forEach((i) => lines.push({ name: i.itemName, unit: i.unitCode, qty: i.qty, rate: i.rate, gst: i.gstPercent, amount: i.amount }));
      totals.push(['Sub Total', po.subTotal]);
      if (po.isInterState) totals.push(['IGST', po.igst]);
      else totals.push(['CGST', po.cgst], ['SGST', po.sgst]);
      if (po.otherCharges) totals.push(['Other charges', po.otherCharges]);
      if (po.roundOff) totals.push(['Round off', po.roundOff]);
      const meta: [string, string][] = [
        ['PO Date', this.datePipe.transform(po.poDate)],
        ['Expected by', po.expectedDate ? this.datePipe.transform(po.expectedDate) : '—'],
        ['Status', po.status],
      ];
      return {
        title: 'PURCHASE ORDER',
        number: po.poNo,
        supplier: po.supplierName,
        supplierState: po.supplierState,
        supplierGstin: po.supplierGstin,
        meta,
        lines,
        totals,
        grandTotal: po.grandTotal,
        notes: po.notes,
      };
    }
    const e = pe!;
    e.items.forEach((i) => lines.push({ name: i.itemName, unit: i.unitCode, qty: i.receivedQty, rate: i.rate, gst: i.gstPercent, amount: i.amount }));
    totals.push(['Sub Total', e.subTotal]);
    if (e.isInterState) totals.push(['IGST', e.igst]);
    else totals.push(['CGST', e.cgst], ['SGST', e.sgst]);
    if (e.discount) totals.push(['Discount', -e.discount]);
    if (e.otherCharges) totals.push(['Freight / Other', e.otherCharges]);
    if (e.roundOff) totals.push(['Round off', e.roundOff]);
    totals.push(['Paid', e.paidAmount], ['Balance', e.balance]);
    const meta: [string, string][] = [
      ['PE Date', this.datePipe.transform(e.peDate)],
      ['Invoice No', e.invoiceNo],
      ['Invoice Date', this.datePipe.transform(e.invoiceDate)],
      ['Against PO', e.poNo ?? '—'],
      ['Due Date', e.dueDate ? this.datePipe.transform(e.dueDate) : '—'],
    ];
    return {
      title: 'PURCHASE ENTRY',
      number: e.peNo,
      supplier: e.supplierName,
      supplierState: e.supplierState,
      supplierGstin: '',
      meta,
      lines,
      totals,
      grandTotal: e.grandTotal,
      notes: '',
    };
  });
}
