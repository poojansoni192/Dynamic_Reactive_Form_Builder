// src/app/process.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { HttpParams } from '@angular/common/http';


export interface GridItem {
  name: string;
  showRight: boolean;
  showBelow: boolean;
  gridname: string;
}
  
export interface Process {
  id: string;
  process_name: string;
  grid_data: GridItem[];
}

@Injectable({ providedIn: 'root' })
export class ProcessService {
  private apiUrl = 'http://localhost:8000/processes';  // FastAPI base

  constructor(private http: HttpClient) {}

  getProcesses(): Observable<Process[]> {
    return this.http.get<Process[]>(this.apiUrl);
  }

  getProcessById(id: string): Observable<Process> {
    return this.http.get<Process>(`${this.apiUrl}/${id}`);
  }

  getProcessByName(name: string): Observable<Process> {
  return this.http.get<Process>(`${this.apiUrl}/by-name/${name}`);
  }

  getProcessByIdOrName(processId?: number, processName?: string): Observable<Process> {
    let params = new HttpParams();

    if (processId) {
      params = params.set('process_id', processId.toString());
    } else if (processName) {
      params = params.set('process_name', processName);
    }

    return this.http.get<Process>(`${this.apiUrl}/fetch`, { params });
  }
}
