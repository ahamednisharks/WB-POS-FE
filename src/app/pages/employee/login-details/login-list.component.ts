import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { ListQuery, LoginAccount, LoginStatus, Role } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { LoginAccountService } from '../../../core/services/login-account.service';
import { ListPageBase } from '../../../shared/base/list-page.base';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonRowComponent } from '../../../shared/components/skeleton-row/skeleton-row.component';
import { StatusTagComponent } from '../../../shared/components/status-tag/status-tag.component';
import { IstDateTimePipe } from '../../../shared/pipes/display.pipes';
import { LOGIN_STATUS_OPTIONS, ROLE_OPTIONS } from '../employee.shared';
import { LoginFormComponent } from './login-form.component';
import { ResetPasswordDialogComponent } from './reset-password-dialog.component';

@Component({
  selector: 'app-login-list',
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    SelectModule,
    TooltipModule,
    PageHeaderComponent,
    StatusTagComponent,
    EmptyStateComponent,
    SkeletonRowComponent,
    IstDateTimePipe,
    LoginFormComponent,
    ResetPasswordDialogComponent,
  ],
  templateUrl: './login-list.component.html',
})
export class LoginListComponent extends ListPageBase<LoginAccount> {
  private readonly logins = inject(LoginAccountService);
  private readonly auth = inject(AuthService);

  protected readonly roleFilter = signal<Role | null>(null);
  protected readonly statusFilter = signal<LoginStatus | null>(null);
  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly statusOptions = LOGIN_STATUS_OPTIONS;

  protected readonly formVisible = signal(false);
  protected readonly editing = signal<LoginAccount | null>(null);
  protected readonly resetVisible = signal(false);
  protected readonly resetting = signal<LoginAccount | null>(null);
  /** Login id whose block/unblock request is in flight. */
  protected readonly busyId = signal<string | null>(null);

  protected fetch(query: ListQuery) {
    return this.logins.list(query);
  }

  protected override filters(): ListQuery {
    return { role: this.roleFilter(), status: this.statusFilter() };
  }

  protected setRole(value: Role | null): void {
    this.roleFilter.set(value ?? null);
    this.applyFilters();
  }

  protected setStatus(value: LoginStatus | null): void {
    this.statusFilter.set(value ?? null);
    this.applyFilters();
  }

  /** The signed-in admin cannot block or delete their own login. */
  protected isSelf(login: LoginAccount): boolean {
    return this.auth.user()?.id === login.id;
  }

  protected openForm(login: LoginAccount | null = null): void {
    this.editing.set(login);
    this.formVisible.set(true);
  }

  protected openReset(login: LoginAccount): void {
    this.resetting.set(login);
    this.resetVisible.set(true);
  }

  protected async toggleBlock(login: LoginAccount): Promise<void> {
    const block = login.status !== 'BLOCKED';
    const ok = await this.confirm.ask({
      header: block ? 'Block login' : 'Unblock login',
      message: block
        ? `Block "${login.username}" (${login.employeeName})? They will not be able to sign in until unblocked.`
        : `Unblock "${login.username}" (${login.employeeName})? They will be able to sign in again.`,
      acceptLabel: block ? 'Block' : 'Unblock',
      icon: block ? 'pi pi-ban' : 'pi pi-lock-open',
      danger: block,
    });
    if (!ok) return;
    this.busyId.set(login.id);
    this.logins.setBlocked(login.id, block).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.notify.success(`Login "${updated.username}" ${block ? 'blocked' : 'unblocked'}`);
        this.load();
      },
      error: () => this.busyId.set(null),
    });
  }

  protected remove(login: LoginAccount): void {
    void this.confirmAndDelete(`login "${login.username}"`, () => this.logins.remove(login.id));
  }
}
