import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js';
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { Subscription } from 'rxjs';
import { DashboardData, HourlySales, RecentBill } from '../../core/models';
import { DashboardService } from '../../core/services/dashboard.service';
import { ThemeService } from '../../core/services/theme.service';
import { DatePreset, DateRange, displayDate, presetRange } from '../../core/utils/date.util';
import { formatINR } from '../../core/utils/format.util';
import { apiErrorMessage } from '../../core/utils/http-error.util';
import { DateRangeFilterComponent } from '../../shared/components/date-range-filter/date-range-filter.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { IstDateTimePipe, IstTimePipe, QtyPipe } from '../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';

type SplitKey = keyof DashboardData['paymentSplit'];

/*
 * Chart palette comes from the theme (--chart-* in styles.scss). In Golden Ivory the brand yellow
 * is deepened one step (#F5B700 → #E0A800) so the marks clear the lightness band on a white card.
 * A canvas cannot use CSS variables, so the values are read here and re-read when the theme changes.
 */
interface ChartPalette {
  cash: string;
  cashHover: string;
  upi: string;
  card: string;
  grid: string;
  tick: string;
  surface: string;
  tooltip: string;
}

function readPalette(): ChartPalette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    cash: v('--chart-cash'),
    cashHover: v('--chart-cash-hover'),
    upi: v('--chart-upi'),
    card: v('--chart-card'),
    grid: v('--chart-grid'),
    tick: v('--chart-tick'),
    surface: v('--surface-card'),
    tooltip: v('--chart-tooltip'),
  };
}

const FONT = "Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const SPLIT_SERIES: { key: SplitKey; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'upi', label: 'UPI' },
  { key: 'card', label: 'Card' },
];

/** Shop hours plotted on the hourly chart: 7 AM … 11 PM. */
const HOURS = Array.from({ length: 17 }, (_, i) => 7 + i);

function hourLabel(hour: number): string {
  const h = hour % 24;
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h > 12 ? `${h - 12} PM` : `${h} AM`;
}

const PRESET_LABEL: Record<DatePreset, string> = {
  ALL: 'All time',
  TODAY: 'Today',
  YESTERDAY: 'Yesterday',
  WEEK: 'This week',
  MONTH: 'This month',
  CUSTOM: 'Custom range',
};

@Component({
  selector: 'app-dashboard',
  imports: [
    ButtonModule,
    ChartModule,
    SkeletonModule,
    TableModule,
    PageHeaderComponent,
    DateRangeFilterComponent,
    EmptyStateComponent,
    InrCurrencyPipe,
    QtyPipe,
    IstTimePipe,
    IstDateTimePipe,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly dashboard = inject(DashboardService);
  private readonly router = inject(Router);
  private readonly themes = inject(ThemeService);

  /** Re-read on every theme change (ThemeService sets data-theme before the signal changes). */
  private readonly palette = computed(() => {
    this.themes.theme();
    return readPalette();
  });

  protected readonly preset = signal<DatePreset>('TODAY');
  protected readonly range = signal<DateRange>(presetRange('TODAY'));
  protected readonly data = signal<DashboardData | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  private sub?: Subscription;

  protected readonly skeletonCards = [0, 1, 2, 3, 4];
  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  protected readonly periodLabel = computed(() => {
    const { from, to } = this.range();
    const dates = from === to ? displayDate(from) : `${displayDate(from)} – ${displayDate(to)}`;
    const p = this.preset();
    return p === 'CUSTOM' ? `Sales overview · ${dates}` : `${PRESET_LABEL[p]} · ${dates}`;
  });

  /** Recent bills show the date as well when the period spans several days. */
  protected readonly multiDay = computed(() => {
    const { from, to } = this.range();
    return from !== to;
  });

  // ---------------------------------------------------------------- payment split (donut)
  protected readonly split = computed(() => {
    const d = this.data();
    const total = d ? d.paymentSplit.cash + d.paymentSplit.upi + d.paymentSplit.card : 0;
    const palette = this.palette();
    return SPLIT_SERIES.map((s) => {
      const amount = d?.paymentSplit[s.key] ?? 0;
      return { ...s, color: palette[s.key], amount, pct: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0 };
    });
  });

  protected readonly splitTotal = computed(() =>
    this.split().reduce((sum, s) => sum + s.amount, 0),
  );

  protected readonly donutData = computed<ChartData<'doughnut'>>(() => {
    const rows = this.split();
    const surface = this.palette().surface;
    return {
      labels: rows.map((s) => s.label),
      datasets: [
        {
          data: rows.map((s) => s.amount),
          backgroundColor: rows.map((s) => s.color),
          hoverBackgroundColor: rows.map((s) => s.color),
          // 2px surface-coloured gap between segments (not an outline).
          borderColor: surface,
          hoverBorderColor: surface,
          borderWidth: 2,
          hoverOffset: 4,
        },
      ],
    };
  });

  protected readonly donutOptions = computed<ChartOptions<'doughnut'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    layout: { padding: 6 },
    plugins: {
      // The legend (with values) is rendered in HTML under the chart.
      legend: { display: false },
      tooltip: {
        backgroundColor: this.palette().tooltip,
        padding: 10,
        cornerRadius: 8,
        titleFont: { family: FONT },
        bodyFont: { family: FONT },
        callbacks: {
          label: (ctx: TooltipItem<'doughnut'>) => {
            const row = this.split()[ctx.dataIndex];
            return ` ${ctx.label}: ${formatINR(ctx.parsed)} (${row?.pct ?? 0}%)`;
          },
        },
      },
    },
  }));

  // ---------------------------------------------------------------- sales by hour (bar)
  private readonly hourly = computed<HourlySales[]>(() => {
    const byHour = new Map((this.data()?.salesByHour ?? []).map((h) => [h.hour, h]));
    return HOURS.map((hour) => byHour.get(hour) ?? { hour, amount: 0, bills: 0 });
  });

  protected readonly peak = computed(() => {
    const top = this.hourly().reduce<HourlySales | null>(
      (best, h) => (h.amount > (best?.amount ?? 0) ? h : best),
      null,
    );
    return top
      ? { label: `${hourLabel(top.hour)} – ${hourLabel(top.hour + 1)}`, amount: top.amount }
      : null;
  });

  protected readonly barData = computed<ChartData<'bar'>>(() => {
    const rows = this.hourly();
    return {
      labels: rows.map((h) => hourLabel(h.hour)),
      datasets: [
        {
          label: 'Sales',
          data: rows.map((h) => h.amount),
          backgroundColor: this.palette().cash,
          hoverBackgroundColor: this.palette().cashHover,
          borderRadius: 4,
          borderSkipped: 'start',
          maxBarThickness: 24,
          categoryPercentage: 0.8,
          barPercentage: 0.9,
        },
      ],
    };
  });

  protected readonly barOptions = computed<ChartOptions<'bar'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: this.palette().tooltip,
        padding: 10,
        cornerRadius: 8,
        displayColors: false,
        titleFont: { family: FONT },
        bodyFont: { family: FONT },
        callbacks: {
          title: (items: TooltipItem<'bar'>[]) => {
            const h = HOURS[items[0]?.dataIndex ?? 0];
            return `${hourLabel(h)} – ${hourLabel(h + 1)}`;
          },
          label: (ctx: TooltipItem<'bar'>) => {
            const bills = this.hourly()[ctx.dataIndex]?.bills ?? 0;
            return `${formatINR(ctx.parsed.y)} · ${bills} ${bills === 1 ? 'bill' : 'bills'}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: this.palette().tick,
          maxRotation: 0,
          autoSkip: true,
          autoSkipPadding: 8,
          font: { family: FONT, size: 11 },
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: this.palette().grid, lineWidth: 1 },
        border: { display: false },
        ticks: {
          color: this.palette().tick,
          maxTicksLimit: 5,
          padding: 6,
          font: { family: FONT, size: 11 },
          callback: (value) => formatINR(Number(value), true),
        },
      },
    },
  }));

  constructor() {
    this.load();
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected load(): void {
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    const { from, to } = this.range();
    this.sub = this.dashboard.get(from, to).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.data.set(null);
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  protected newBill(): void {
    void this.router.navigate(['/billing']);
  }

  protected openCancelled(): void {
    const { from, to } = this.range();
    void this.router.navigate(['/orders'], { queryParams: { status: 'CANCELLED', from, to } });
  }

  protected openBill(bill: RecentBill): void {
    void this.router.navigate(['/orders', bill.id]);
  }

  /** Stock Summary filtered to the items at or below their minimum. */
  protected openLowStock(): void {
    void this.router.navigate(['/stock/summary'], { queryParams: { low: 1 } });
  }

  /** "Maavu, Sugar +3 more · view all" or "All items above minimum". */
  protected lowStockNote(d: DashboardData): string {
    if (d.lowStockCount === 0) return 'All items above minimum';
    const names = d.lowStock.slice(0, 2).map((i) => i.name);
    const more = d.lowStockCount - names.length;
    return `${names.join(', ')}${more > 0 ? ` +${more} more` : ''} · view all`;
  }
}
