import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { ExerciseTemplate } from '../models/exercise-template.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ExerciseTemplateService {
  private apiUrl = `${environment.apiUrl}/exercise-templates`;

  constructor(private http: HttpClient) { }

  getAll(): Observable<ExerciseTemplate[]> {
    return this.getAllTemplates();
  }

  getAllTemplates(): Observable<ExerciseTemplate[]> {
    console.log('Fetching all exercise templates');
    return this.http.get<ExerciseTemplate[]>(this.apiUrl)
      .pipe(
        tap(templates => console.log(`Fetched ${templates.length} templates`)),
        catchError(error => {
          console.error('Error fetching templates:', error);
          return throwError(() => new Error('Failed to load exercise templates'));
        })
      );
  }

  getTemplateById(id: string): Observable<ExerciseTemplate> {
    if (!id) {
      return throwError(() => new Error('Template ID is required'));
    }
    return this.http.get<ExerciseTemplate>(`${this.apiUrl}/${id}`)
      .pipe(
        tap(template => console.log(`Fetched template: ${template.name}`)),
        catchError(error => throwError(() => new Error('Template not found')))
      );
  }

  getTemplateByName(name: string): Observable<ExerciseTemplate> {
    return this.http.get<ExerciseTemplate>(`${this.apiUrl}/by-name`, { params: { name } })
      .pipe(
        catchError(error => throwError(() => new Error('Template not found')))
      );
  }

  getTemplatesByMuscleGroup(muscleGroup: string): Observable<ExerciseTemplate[]> {
    return this.http.get<ExerciseTemplate[]>(`${this.apiUrl}/by-muscle-group`, { params: { muscleGroup } })
      .pipe(
        catchError(error => throwError(() => new Error('Failed to load templates')))
      );
  }
}
