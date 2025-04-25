import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Exercise } from '../models/exercise.model';
import { ExerciseSet } from '../models/exercise-set.model';

@Injectable({
  providedIn: 'root'
})
export class ExerciseService {
  private apiUrl = `${environment.apiUrl}/exercises`;

  constructor(private http: HttpClient) { }

  getAll(): Observable<Exercise[]> {
    return this.http.get<Exercise[]>(this.apiUrl);
  }

  getById(id: string): Observable<Exercise> {
    return this.http.get<Exercise>(`${this.apiUrl}/${id}`);
  }

  create(exercise: Exercise): Observable<Exercise> {
    return this.http.post<Exercise>(this.apiUrl, exercise);
  }
  
  update(id: string, exercise: Exercise): Observable<Exercise> {
    return this.http.put<Exercise>(`${this.apiUrl}/${id}`, exercise);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  addSetToExercise(exerciseId: string, set: ExerciseSet): Observable<Exercise> {
    return this.http.post<Exercise>(`${this.apiUrl}/${exerciseId}/sets`, set);
  }
  
  updateSetInExercise(exerciseId: string, orderPosition: number, set: ExerciseSet): Observable<Exercise> {
    return this.http.put<Exercise>(`${this.apiUrl}/${exerciseId}/sets/${orderPosition}`, set);
  }

  removeSet(exerciseId: string, orderPosition: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${exerciseId}/sets/${orderPosition}`);
  }
}