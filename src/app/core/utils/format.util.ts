const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWholeFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const plainAmountFormatter = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 123456.5 → "₹1,23,456.50" */
export function formatINR(value: number | null | undefined, wholeRupees = false): string {
  const n = Number(value ?? 0);
  return (wholeRupees ? inrWholeFormatter : inrFormatter).format(Number.isFinite(n) ? n : 0);
}

/** 123456.5 → "1,23,456.50" (no symbol — for PDF fonts without ₹). */
export function formatAmount(value: number | null | undefined): string {
  return plainAmountFormatter.format(Number(value ?? 0));
}

export function formatQty(value: number | null | undefined): string {
  return numberFormatter.format(Number(value ?? 0));
}

/** "123456789012" → "XXXX XXXX 9012" */
export function maskAadhaar(value: string | null | undefined): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return digits;
  return `XXXX XXXX ${digits.slice(-4)}`;
}

/** Up to two initials for avatar placeholders ("Brown Bread 400g" → "BB", "Butter" → "BU"). */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const all = name.trim().split(/\s+/).filter(Boolean);
  const words = all.filter((w) => /^[A-Za-z]/.test(w));
  const parts = words.length ? words : all;
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const second = parts.length > 1 ? parts[1][0] : (parts[0][1] ?? '');
  return (first + second).toUpperCase();
}

/** "ITM0025" + prefix "ITM" + width 4 → "ITM0026" */
export function nextCode(prefix: string, lastCode: string | null | undefined, width: number): string {
  const lastNumber = lastCode ? Number(lastCode.replace(/\D/g, '')) || 0 : 0;
  return `${prefix}${String(lastNumber + 1).padStart(width, '0')}`;
}

/** Human label for enum-like values: "PARTLY_PAID" → "Partly Paid" */
export function titleCase(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
