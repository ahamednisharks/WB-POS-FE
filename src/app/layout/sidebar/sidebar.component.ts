import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { IonContent, MenuController } from '@ionic/angular/standalone';
import { filter } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { NavItem, navFor } from './nav-items';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, IonContent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly menu = inject(MenuController);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly shop = environment.shop;
  protected readonly items = computed(() => navFor(this.auth.user()?.role));
  protected readonly open = signal<Set<string>>(new Set());

  ngOnInit(): void {
    this.expandActiveGroup(this.router.url);
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => this.expandActiveGroup(e.urlAfterRedirects));
  }

  protected isOpen(item: NavItem): boolean {
    return this.open().has(item.label);
  }

  protected toggle(item: NavItem): void {
    const next = new Set(this.open());
    if (next.has(item.label)) next.delete(item.label);
    else next.add(item.label);
    this.open.set(next);
  }

  protected groupActive(item: NavItem): boolean {
    return !!item.children?.some((c) => c.route && this.router.url.startsWith(c.route));
  }

  protected navigated(): void {
    void this.menu.close('main-menu');
  }

  private expandActiveGroup(url: string): void {
    const group = this.items().find((g) => g.children?.some((c) => c.route && url.startsWith(c.route)));
    if (group && !this.open().has(group.label)) {
      this.open.set(new Set([...this.open(), group.label]));
    }
  }
}
