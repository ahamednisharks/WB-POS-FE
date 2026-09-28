import { Component, computed, input } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';

/** Loading placeholder row for p-table: `<tr appSkeletonRow [cols]="8"></tr>` */
@Component({
  selector: 'tr[appSkeletonRow]',
  imports: [SkeletonModule],
  template: `
    @for (c of columns(); track $index) {
      <td><p-skeleton [width]="$first ? '2rem' : '80%'" height="1rem" /></td>
    }
  `,
})
export class SkeletonRowComponent {
  readonly cols = input(6);
  protected readonly columns = computed(() => Array.from({ length: this.cols() }, (_, i) => i));
}
