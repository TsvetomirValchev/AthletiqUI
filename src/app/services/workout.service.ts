import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, forkJoin, throwError } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Workout } from '../models/workout.model';
import { Exercise } from '../models/exercise.model';
import { ExerciseSet } from '../models/exercise-set.model';
import { ExerciseTemplateService } from './exercise-template.service';
import { ExerciseTemplate } from '../models/exercise-template.model';
import { ActiveWorkoutService } from './active-workout.service';

@Injectable({
  providedIn: 'root'
})
export class WorkoutService {
  private apiUrl = `${environment.apiUrl}/workouts`;
  
  constructor(
    private http: HttpClient,
    private exerciseTemplateService: ExerciseTemplateService,
    private activeWorkoutService: ActiveWorkoutService
  ) {}

  getUserWorkouts(): Observable<Workout[]> {
    return this.http.get<Workout[]>(this.apiUrl);
  }

  getById(id: string): Observable<Workout> {
    return this.http.get<Workout>(`${this.apiUrl}/${id}`);
  }

  createWorkout(workout: Workout): Observable<Workout> {
    return this.http.post<Workout>(this.apiUrl, workout);
  }

  update(id: string, workout: Workout): Observable<Workout> {
    return this.http.put<Workout>(`${this.apiUrl}/${id}`, workout);
  }

  deleteWorkout(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  getExercisesForWorkout(workoutId: string): Observable<Exercise[]> {
    return this.http.get<Exercise[]>(`${this.apiUrl}/${workoutId}/exercises`);
  }

  addExerciseToWorkout(workoutId: string, exerciseId: string): Observable<Workout> {
    return this.http.put<Workout>(
      `${this.apiUrl}/${workoutId}/exercises`, 
      { exerciseTemplateId: exerciseId }
    );
  }

  isActiveWorkoutInProgress(): Observable<boolean> {
    return this.activeWorkoutService.getActiveWorkouts().pipe(
      map(workouts => workouts.length > 0),
      catchError(() => of(false))
    );
  }

  startWorkout(workout: Workout): Observable<any> {
    const activeWorkout = {
      ...workout,
      startTime: new Date().toISOString()
    };
    return this.activeWorkoutService.startWorkout(activeWorkout);
  }


  getExerciseTemplates(): Observable<ExerciseTemplate[]> {
    return this.exerciseTemplateService.getAllTemplates();
  }

  // Add this method to properly handle the exercises with sets
  createWorkoutWithExercises(workout: Workout, exercises: Exercise[]): Observable<Workout> {
    // First create the workout
    return this.http.post<Workout>(`${this.apiUrl}`, workout).pipe(
      switchMap(createdWorkout => {
        if (!createdWorkout.workoutId) {
          return throwError(() => new Error('Failed to create workout - no ID returned'));
        }
        
        // Then add each exercise with sets to the workout
        const addExercises$ = exercises.map(exercise => {
          // Set the workoutId on the exercise
          exercise.workoutId = createdWorkout.workoutId;
          
          // Add the exercise to the workout
          return this.http.post<Exercise>(
            `${this.apiUrl}/${createdWorkout.workoutId}/exercises`, 
            exercise
          );
        });
        
        // Wait for all exercises to be added
        return forkJoin(addExercises$).pipe(
          map(() => createdWorkout) // Return the created workout
        );
      })
    );
  }
}