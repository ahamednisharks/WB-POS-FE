import { Component, DestroyRef, inject, input, OnInit, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';

/**
 * Standard list-page header: title, debounced search box, extra actions and the "+ Add" button.
 * Project extra buttons with `headerActions`, filters/content below with the default slot.
 */
@Component({
  selector: 'app-page-header',
  imports: [ButtonModule, IconFieldModule, InputIconModule, InputTextModule],
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
})
export class PageHeaderComponent implements OnInit {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly showSearch = input(true);
  readonly searchPlaceholder = input('Search…');
  readonly initialSearch = input('');
  readonly showAdd = input(true);
  readonly addLabel = input('Add');
  readonly addIcon = input('pi pi-plus');

  readonly search = output<string>();
  readonly add = output<void>();

  private readonly input$ = new Subject<string>();
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.input$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => this.search.emit(term.trim()));
  }

  onInput(event: Event): void {
    this.input$.next((event.target as HTMLInputElement).value);
  }
}
