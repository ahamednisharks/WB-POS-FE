import { Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-empty-state',
  imports: [ButtonModule],
  template: `
    <div class="empty" [class.compact]="compact()" role="status">
      <i [class]="icon()" aria-hidden="true"></i>
      <h3>{{ title() }}</h3>
      @if (message()) {
        <p>{{ message() }}</p>
      }
      @if (actionLabel()) {
        <p-button [label]="actionLabel()" [icon]="actionIcon()" size="small" [outlined]="true" (onClick)="action.emit()" />
      }
    </div>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 0.4rem;
      padding: 2.5rem 1rem;
      color: var(--text-muted);
    }
    .empty.compact {
      padding: 1.25rem 0.5rem;
    }
    i {
      font-size: 2rem;
      color: #d9a300;
      margin-bottom: 0.25rem;
    }
    h3 {
      margin: 0;
      font-size: 1rem;
      color: var(--text-main);
    }
    p {
      margin: 0 0 0.5rem;
      font-size: 0.85rem;
      max-width: 420px;
    }
  `,
})
export class EmptyStateComponent {
  readonly icon = input('pi pi-inbox');
  readonly title = input('Nothing here yet');
  readonly message = input<string | null>('');
  readonly actionLabel = input('');
  readonly actionIcon = input('pi pi-refresh');
  readonly compact = input(false);
  readonly action = output<void>();
}
