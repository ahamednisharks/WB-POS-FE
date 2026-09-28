import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DashboardData } from '../models';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiService);

  get(from: string, to: string): Observable<DashboardData> {
    return this.api.get<DashboardData>('/dashboard', { from, to });
  }
}
