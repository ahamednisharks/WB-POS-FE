import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number;
  /** Excel column width in characters. */
  width?: number;
  align?: 'left' | 'right';
}

/** Excel (.xlsx) and PDF export. Libraries are lazy-loaded on first use. */
@Injectable({ providedIn: 'root' })
export class ExportService {
  async toExcel<T>(fileName: string, sheetName: string, columns: ExportColumn<T>[], rows: T[]): Promise<void> {
    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const header = columns.map((c) => ({ value: c.header, fontWeight: 'bold' as const }));
    const body = rows.map((row) => columns.map((c) => c.value(row)));
    const blob = await writeXlsxFile([header, ...body], {
      sheet: sheetName.slice(0, 31),
      columns: columns.map((c) => ({ width: c.width ?? 16 })),
    }).toBlob();
    this.download(blob, `${fileName}.xlsx`);
  }

  async toPdf<T>(fileName: string, title: string, subtitle: string, columns: ExportColumn<T>[], rows: T[]): Promise<void> {
    const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
    doc.setFontSize(14);
    doc.text(`${environment.shop.name} — ${title}`, 40, 40);
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(subtitle, 40, 56);
    autoTable(doc, {
      startY: 70,
      head: [columns.map((c) => c.header)],
      body: rows.map((row) => columns.map((c) => String(c.value(row)))),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [245, 183, 0], textColor: [43, 33, 4] },
      columnStyles: Object.fromEntries(
        columns.map((c, i) => [i, { halign: c.align === 'right' ? 'right' : 'left' }]),
      ),
    });
    doc.save(`${fileName}.pdf`);
  }

  private download(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
