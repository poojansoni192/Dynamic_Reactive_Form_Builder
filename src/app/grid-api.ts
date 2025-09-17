// grid-api.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

// Interfaces matching your backend models
export interface GridItem {
  name: string;
  showRight: boolean;
  showBelow: boolean;
  gridname: string;
}

export interface ProcessCreate {
  process_name: string;
  description?: string;
  grid_data: GridItem[];
}

export interface ProcessResponse {
  id: string;
  process_name: string;
  description?: string;
  grid_data: GridItem[];
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface ProcessListResponse {
  id: string;
  process_name: string;
  description?: string;
  grid_count: number;
  created_at: string;
  is_active: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class GridApiService {
  private readonly baseUrl = 'http://localhost:8000'; // Your FastAPI backend URL

  constructor(private http: HttpClient) {}

  // 🔥 Create a new process with grid data
  createProcess(processData: ProcessCreate): Observable<ProcessResponse> {
    return this.http.post<ProcessResponse>(`${this.baseUrl}/processes/`, processData)
      .pipe(catchError(this.handleError));
  }

  // 🔥 Get all processes
  getProcesses(skip: number = 0, limit: number = 100, activeOnly: boolean = true): Observable<ProcessListResponse[]> {
    const params = new HttpParams()
      .set('skip', skip.toString())
      .set('limit', limit.toString())
      .set('active_only', activeOnly.toString());

    return this.http.get<ProcessListResponse[]>(`${this.baseUrl}/processes/`, { params })
      .pipe(catchError(this.handleError));
  }

  // 🔥 Get a specific process by ID
  getProcess(processId: string): Observable<ProcessResponse> {
    return this.http.get<ProcessResponse>(`${this.baseUrl}/processes/${processId}`)
      .pipe(catchError(this.handleError));
  }

  // 🔥 Update a process
  updateProcess(processId: string, updateData: Partial<ProcessCreate>): Observable<ProcessResponse> {
    return this.http.put<ProcessResponse>(`${this.baseUrl}/processes/${processId}`, updateData)
      .pipe(catchError(this.handleError));
  }

  // 🔥 Delete a process (soft delete by default)
  deleteProcess(processId: string, softDelete: boolean = true): Observable<any> {
    const params = new HttpParams().set('soft_delete', softDelete.toString());
    return this.http.delete(`${this.baseUrl}/processes/${processId}`, { params })
      .pipe(catchError(this.handleError));
  }

  // 🔥 Search processes
  searchProcesses(searchTerm: string): Observable<ProcessListResponse[]> {
    return this.http.get<ProcessListResponse[]>(`${this.baseUrl}/processes/search/${searchTerm}`)
      .pipe(catchError(this.handleError));
  }

  // 🔥 Error handling
  private handleError(error: any): Observable<never> {
    console.error('API Error:', error);
    let errorMessage = 'An unknown error occurred';
    
    if (error.error?.detail) {
      errorMessage = error.error.detail;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return throwError(() => new Error(errorMessage));
  }
}