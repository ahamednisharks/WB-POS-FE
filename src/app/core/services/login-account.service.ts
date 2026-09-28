import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiMessage, LoginAccount, LoginAccountCreate, LoginAccountUpdate } from '../models';
import { CrudService } from './crud.service';

@Injectable({ providedIn: 'root' })
export class LoginAccountService extends CrudService<LoginAccount, LoginAccountCreate, LoginAccountUpdate> {
  protected readonly path = '/logins';

  resetPassword(id: string, password: string): Observable<ApiMessage> {
    return this.api.post<ApiMessage>(`${this.path}/${id}/reset-password`, { password });
  }

  setBlocked(id: string, blocked: boolean): Observable<LoginAccount> {
    return this.api.patch<LoginAccount>(`${this.path}/${id}/block`, { blocked });
  }
}
