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
    return this.http.get<Workout[]>(`${this.apiUrl}`);
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
    return this.http.get<Exercise[]>(`${this.apiUrl}/${workoutId}/exercises`).pipe(
      switchMap(exercises => {
        // Fetch templates for exercises that have a template ID but no name
        const templateRequests = exercises
          .filter(ex => ex.exerciseTemplateId && !ex.name)
          .map(ex => this.exerciseTemplateService.getTemplateById(ex.exerciseTemplateId!)
            .pipe(
              map(template => ({
                exerciseId: ex.exerciseId,
                templateName: template.name
              })),
              catchError(() => of({ exerciseId: ex.exerciseId, templateName: 'Unknown Exercise' }))
            )
          );

        if (templateRequests.length === 0) {
          return of(exercises);
        }

        return forkJoin(templateRequests).pipe(
          map(templates => {
            // Create a map of exercise ID to template name
            const nameMap = new Map(
              templates.map(t => [t.exerciseId, t.templateName])
            );
            
            // Update each exercise with its template name if needed
            return exercises.map(ex => {
              if (ex.exerciseId && nameMap.has(ex.exerciseId) && !ex.name) {
                return {
                  ...ex,
                  name: nameMap.get(ex.exerciseId) || 'Unknown Exercise'
                };
              }
              return ex;
            });
          })
        );
      })
    );
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

  createWorkoutWithExercises(workout: Workout, exercises: Exercise[]): Observable<Workout> {
    return this.http.post<Workout>(`${this.apiUrl}`, workout).pipe(
      switchMap(createdWorkout => {
        if (exercises.length === 0) {
          return of(createdWorkout);
        }
        
        const exerciseRequests = exercises.map(exercise => {
          // Make sure to include exerciseTemplateId in the payload
          const exercisePayload = {
            ...exercise,
            workoutId: createdWorkout.workoutId,
            exerciseTemplateId: exercise.exerciseTemplateId // Make sure it's included
          };
          
          return this.http.post<Exercise>(
            `${this.apiUrl}/${createdWorkout.workoutId}/exercises`,
            exercisePayload
          );
        });
        
        return forkJoin(exerciseRequests).pipe(
          map(() => createdWorkout)
        );
      })
    );
  }

  updateWorkoutWithExercises(workout: Workout, exercises: Exercise[]): Observable<Workout> {
    return this.http.put<Workout>(`${this.apiUrl}/${workout.workoutId}`, workout).pipe(
      switchMap(updatedWorkout => {
        return this.getExercisesForWorkout(updatedWorkout.workoutId!).pipe(
          switchMap(existingExercises => {
            const existingExerciseMap = new Map(
              existingExercises.map(e => [e.exerciseId, e])
            );
            
            const exerciseRequests = exercises.map(exercise => {
              // Create payload ensuring exerciseTemplateId is included
              const exercisePayload = {
                ...exercise,
                workoutId: updatedWorkout.workoutId,
                exerciseTemplateId: exercise.exerciseTemplateId // Make sure it's included
              };
              
              if (exercise.exerciseId && existingExerciseMap.has(exercise.exerciseId)) {
                return this.http.put<Exercise>(
                  `${this.apiUrl}/${updatedWorkout.workoutId}/exercises/${exercise.exerciseId}`,
                  exercisePayload
                );
              } else {
                return this.http.post<Exercise>(
                  `${this.apiUrl}/${updatedWorkout.workoutId}/exercises`,
                  exercisePayload
                );
              }
            });
            
            const newExerciseIds = new Set(
              exercises
                .filter(e => e.exerciseId)
                .map(e => e.exerciseId)
            );
            
            const deleteRequests = existingExercises
              .filter(e => e.exerciseId && !newExerciseIds.has(e.exerciseId))
              .map(e => this.http.delete(
                `${this.apiUrl}/${updatedWorkout.workoutId}/exercises/${e.exerciseId}`
              ));
            
            return forkJoin([...exerciseRequests, ...deleteRequests]).pipe(
              map(() => updatedWorkout)
            );
          })
        );
      })
    );
  }

  getExerciseSetsForExercise(workoutId: string, exerciseId: string): Observable<ExerciseSet[]> {
    return this.http.get<ExerciseSet[]>(
      `${this.apiUrl}/${workoutId}/exercises/${exerciseId}/sets`
    );
  }

  getWorkoutsWithExercises(): Observable<{workout: Workout, exercises: Exercise[]}[]> {
    return this.getUserWorkouts().pipe(
      switchMap(workouts => {
        if (workouts.length === 0) {
          return of([]);
        }
        
        const workoutWithExercisesRequests = workouts.map(workout => {
          if (!workout.workoutId) {
            return of({ workout, exercises: [] });
          }
          
          return this.getExercisesForWorkout(workout.workoutId).pipe(
            map(exercises => ({
              workout,
              exercises
            })),
            catchError(err => {
              console.error(`Error fetching exercises for workout ${workout.workoutId}:`, err);
              return of({ workout, exercises: [] });
            })
          );
        });
        
        return forkJoin(workoutWithExercisesRequests);
      }),
      catchError(error => {
        console.error('Error in getWorkoutsWithExercises:', error);
        return of([]);
      })
    );
  }

  loadExerciseWithSets(workoutId: string, exerciseId: string): Observable<Exercise> {
    return this.getWorkoutExerciseById(workoutId, exerciseId).pipe(
      switchMap(exercise => {
        if (!exercise.exerciseSetIds?.length) {
          return of(exercise);
        }
        
        return this.getExerciseSetsForExercise(workoutId, exerciseId).pipe(
          map(sets => {
            return {
              ...exercise,
              sets: sets
            };
          })
        );
      })
    );
  }

  getWorkoutExerciseById(workoutId: string, exerciseId: string): Observable<Exercise> {
    return this.http.get<Exercise>(`${this.apiUrl}/${workoutId}/exercises/${exerciseId}`);
  }
}