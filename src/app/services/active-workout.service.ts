import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { ActiveWorkout } from '../models/active-workout.model';
import { Exercise } from '../models/exercise.model';
import { ExerciseSet } from '../models/exercise-set.model';

@Injectable({
  providedIn: 'root'
})
export class ActiveWorkoutService {
  private apiUrl = `${environment.apiUrl}/active-workouts`;
  private currentWorkoutSubject = new BehaviorSubject<ActiveWorkout | null>(null);

  constructor(private http: HttpClient) {
    this.loadCurrentWorkout();
  }

  get currentWorkout$(): Observable<ActiveWorkout | null> {
    return this.currentWorkoutSubject.asObservable();
  }

  loadCurrentWorkout(): void {
    this.getActiveWorkouts().subscribe(workouts => {
      if (workouts && workouts.length > 0) {
        this.currentWorkoutSubject.next(workouts[0]);
      } else {
        this.currentWorkoutSubject.next(null);
      }
    });
  }

  getActiveWorkouts(): Observable<ActiveWorkout[]> {
    return this.http.get<ActiveWorkout[]>(this.apiUrl);
  }

  startWorkout(workout: ActiveWorkout): Observable<ActiveWorkout> {
    return this.http.post<ActiveWorkout>(this.apiUrl, workout)
      .pipe(
        tap(startedWorkout => this.currentWorkoutSubject.next(startedWorkout))
      );
  }

  finishWorkout(id: string): Observable<ActiveWorkout> {
    return this.http.post<ActiveWorkout>(`${this.apiUrl}/${id}/finish`, {})
      .pipe(
        tap(() => this.currentWorkoutSubject.next(null))
      );
  }

  getExercisesByWorkoutId(workoutId: string): Observable<Exercise[]> {
    return this.http.get<Exercise[]>(`${this.apiUrl}/${workoutId}/exercises`);
  }

  addExerciseToWorkout(workoutId: string, exercise: Exercise): Observable<ActiveWorkout> {
    return this.http.post<ActiveWorkout>(`${this.apiUrl}/${workoutId}/exercises`, exercise)
      .pipe(
        tap(updatedWorkout => this.currentWorkoutSubject.next(updatedWorkout))
      );
  }

  getWorkoutExerciseById(workoutId: string, exerciseId: string): Observable<Exercise> {
    return this.http.get<Exercise>(`${this.apiUrl}/${workoutId}/exercises/${exerciseId}`);
  }

  updateWorkoutExercise(workoutId: string, exerciseId: string, exercise: Exercise): Observable<ActiveWorkout> {
    return this.http.put<ActiveWorkout>(`${this.apiUrl}/${workoutId}/exercises/${exerciseId}`, exercise)
      .pipe(
        tap(updatedWorkout => this.currentWorkoutSubject.next(updatedWorkout))
      );
  }

  removeExerciseFromWorkout(workoutId: string, exerciseId: string): Observable<ActiveWorkout> {
    return this.http.delete<ActiveWorkout>(`${this.apiUrl}/${workoutId}/exercises/${exerciseId}`)
      .pipe(
        tap(updatedWorkout => this.currentWorkoutSubject.next(updatedWorkout))
      );
  }

  getExerciseSets(workoutId: string, exerciseId: string): Observable<ExerciseSet[]> {
    return this.http.get<ExerciseSet[]>(`${this.apiUrl}/${workoutId}/exercises/${exerciseId}/sets`);
  }

  addSetToExercise(workoutId: string, exerciseId: string, set: ExerciseSet): Observable<ActiveWorkout> {
    return this.http.post<ActiveWorkout>(`${this.apiUrl}/${workoutId}/exercises/${exerciseId}/sets`, set)
      .pipe(
        tap(updatedWorkout => this.currentWorkoutSubject.next(updatedWorkout))
      );
  }

  completeSet(workoutId: string, exerciseId: string, setId: string): Observable<ActiveWorkout> {
    return this.http.put<ActiveWorkout>(`${this.apiUrl}/${workoutId}/exercises/${exerciseId}/sets/${setId}`, {})
      .pipe(
        tap(updatedWorkout => this.currentWorkoutSubject.next(updatedWorkout))
      );
  }

  removeSetFromExercise(workoutId: string, exerciseId: string, orderPosition: number): Observable<ActiveWorkout> {
    return this.http.delete<ActiveWorkout>(`${this.apiUrl}/${workoutId}/exercises/${exerciseId}/sets/${orderPosition}`)
      .pipe(
        tap(updatedWorkout => this.currentWorkoutSubject.next(updatedWorkout))
      );
  }
}
