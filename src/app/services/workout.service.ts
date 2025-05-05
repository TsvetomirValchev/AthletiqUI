import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, forkJoin, throwError, from } from 'rxjs';
import { map, catchError, switchMap, concatMap, toArray, tap, finalize } from 'rxjs/operators';
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

  /**
   * Generic error handler for HTTP requests
   */
  private handleError(operation: string, fallbackValue: any = null) {
    return catchError(error => {
      console.error(`Error in ${operation}:`, error);
      return fallbackValue !== null ? of(fallbackValue) : throwError(() => error);
    });
  }

  /**
   * Get all workouts for the current user
   */
  public getUserWorkouts(): Observable<Workout[]> {
    return this.http.get<Workout[]>(`${this.apiUrl}`)
      .pipe(this.handleError('getUserWorkouts', []));
  }

  /**
   * Get workout by ID
   */
  public getById(id: string): Observable<Workout> {
    return this.http.get<Workout>(`${this.apiUrl}/${id}`)
      .pipe(this.handleError('getById'));
  }

  /**
   * Create a new workout
   */
  public createWorkout(workout: Workout): Observable<Workout> {
    return this.http.post<Workout>(this.apiUrl, workout)
      .pipe(this.handleError('createWorkout'));
  }

  /**
   * Update an existing workout
   */
  public update(id: string, workout: Workout): Observable<Workout> {
    return this.http.put<Workout>(`${this.apiUrl}/${id}`, workout)
      .pipe(this.handleError('update'));
  }

  /**
   * Delete a workout by ID
   */
  public deleteWorkout(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`)
      .pipe(this.handleError('deleteWorkout'));
  }

  /**
   * Get exercise sets for a specific exercise in a workout
   */
  public getExerciseSetsForExercise(workoutId: string, exerciseId: string): Observable<ExerciseSet[]> {
    return this.http.get<ExerciseSet[]>(`${this.apiUrl}/${workoutId}/exercises/${exerciseId}/sets`)
      .pipe(this.handleError('getExerciseSetsForExercise', []));
  }

  /**
   * Get a specific exercise from a workout
   */
  public getWorkoutExerciseById(workoutId: string, exerciseId: string): Observable<Exercise> {
    return this.http.get<Exercise>(`${this.apiUrl}/${workoutId}/exercises/${exerciseId}`)
      .pipe(this.handleError('getWorkoutExerciseById'));
  }

  /**
   * Add an exercise to a workout
   */
  public addExerciseToWorkout(workoutId: string, exerciseId: string): Observable<Workout> {
    return this.http.put<Workout>(
      `${this.apiUrl}/${workoutId}/exercises`, 
      { exerciseTemplateId: exerciseId }
    ).pipe(this.handleError('addExerciseToWorkout'));
  }

  /**
   * Add a set to an exercise
   */
  public addSetToExercise(workoutId: string, exerciseId: string, set: ExerciseSet): Observable<Workout> {
    // Create a clean payload with exerciseId
    const setPayload = {
      ...set,
      exerciseId: exerciseId
    };
    
    return this.http.post<Workout>(
      `${this.apiUrl}/${workoutId}/exercises/${exerciseId}/sets`,
      setPayload
    ).pipe(
      tap(response => console.log('Set added successfully')),
      this.handleError('addSetToExercise')
    );
  }

  /**
   * Get all exercises for a workout with populated template names
   */
  public getExercisesForWorkout(workoutId: string): Observable<Exercise[]> {
    return this.http.get<Exercise[]>(`${this.apiUrl}/${workoutId}/exercises`).pipe(
      switchMap(exercises => {
        // If no exercises require template data, return early
        const exercisesNeedingTemplates = exercises.filter(ex => ex.exerciseTemplateId && !ex.name);
        if (exercisesNeedingTemplates.length === 0) {
          return of(exercises);
        }
        
        // Create requests for each template needed
        const templateRequests = exercisesNeedingTemplates.map(ex => 
          this.exerciseTemplateService.getTemplateById(ex.exerciseTemplateId!)
            .pipe(
              map(template => ({
                exerciseId: ex.exerciseId,
                templateName: template.name
              })),
              this.handleError('getTemplateById', { 
                exerciseId: ex.exerciseId, 
                templateName: 'Unknown Exercise' 
              })
            )
        );

        // Merge template data with exercises
        return forkJoin(templateRequests).pipe(
          map(templates => {
            // Create a map of exercise ID to template name
            const nameMap = new Map(templates.map(t => [t.exerciseId, t.templateName]));
            
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
      }),
      this.handleError('getExercisesForWorkout', [])
    );
  }

  /**
   * Check if there is an active workout in progress
   */
  public isActiveWorkoutInProgress(): Observable<boolean> {
    return this.activeWorkoutService.getActiveWorkouts().pipe(
      map(workouts => workouts.length > 0),
      this.handleError('isActiveWorkoutInProgress', false)
    );
  }

  /**
   * Start a workout
   */
  public startWorkout(workout: Workout): Observable<any> {
    const activeWorkout = {
      ...workout,
      startTime: new Date().toISOString()
    };
    return this.activeWorkoutService.startWorkout(activeWorkout)
      .pipe(this.handleError('startWorkout'));
  }

  /**
   * Get all exercise templates
   */
  public getExerciseTemplates(): Observable<ExerciseTemplate[]> {
    return this.exerciseTemplateService.getAllTemplates()
      .pipe(this.handleError('getExerciseTemplates', []));
  }

  /**
   * Create a workout with exercises and sets in a single operation
   */
  public createWorkoutWithExercises(workout: Workout, exercises: Exercise[]): Observable<Workout> {
    // First create the workout
    return this.http.post<Workout>(`${this.apiUrl}`, workout).pipe(
      // Process each exercise sequentially
      switchMap(createdWorkout => {
        if (!exercises.length) {
          return of(createdWorkout);
        }
        
        // Track which sets we've already processed to avoid duplicates
        const processedSets = new Map<string, boolean>();
        
        return from(exercises).pipe(
          concatMap(exercise => this.createExerciseWithSets(
            createdWorkout.workoutId!, 
            exercise, 
            processedSets
          )),
          toArray(),
          map(() => createdWorkout)
        );
      }),
      tap(() => {
        console.log('Workout created successfully, triggering refresh');
      }),
      this.handleError('createWorkoutWithExercises')
    );
  }
  
  /**
   * Helper method to create an exercise with its sets
   */
  private createExerciseWithSets(
    workoutId: string, 
    exercise: Exercise, 
    processedSets: Map<string, boolean>
  ): Observable<any> {
    // Create a clean copy of the exercise WITHOUT sets
    const exercisePayload = {
      ...exercise,
      workoutId: workoutId,
      exerciseTemplateId: exercise.exerciseTemplateId,
      sets: undefined
    };
    
    // First create the exercise
    return this.http.post<any>(
      `${this.apiUrl}/${workoutId}/exercises`, 
      exercisePayload
    ).pipe(
      switchMap(response => {
        // Get the exercise ID from the response
        let exerciseId: string | undefined;
        
        if (response.exerciseId) {
          exerciseId = response.exerciseId;
        } else if (response.exerciseIds && response.exerciseIds.length > 0) {
          exerciseId = response.exerciseIds[response.exerciseIds.length - 1];
        } else {
          return throwError(() => new Error('Created exercise has no valid ID'));
        }
        
        // If no sets, we're done
        if (!exercise.sets || exercise.sets.length === 0) {
          return of({ ...response, exerciseId });
        }
        
        // Filter duplicate sets using a unique key for each set
        const uniqueSets = exercise.sets.filter(set => {
          const setKey = `${exerciseId}-${set.weight}-${set.reps}-${set.type}-${set.orderPosition}`;
          if (processedSets.has(setKey)) {
            return false;
          }
          processedSets.set(setKey, true);
          return true;
        });
        
        // Process each set sequentially
        return from(uniqueSets).pipe(
          concatMap((set, index) => {
            const setPayload: ExerciseSet = {
              ...set,
              exerciseId: exerciseId,
              orderPosition: index + 1
            };
            
            return this.http.post<Workout>(
              `${this.apiUrl}/${workoutId}/exercises/${exerciseId}/sets`,
              setPayload
            ).pipe(
              this.handleError(`addSet-${index}`, null)
            );
          }),
          toArray(),
          map(() => ({ ...response, exerciseId }))
        );
      }),
      this.handleError('createExerciseWithSets')
    );
  }

  /**
   * Update a workout with its exercises and sets
   */
  public updateWorkoutWithExercises(workout: Workout, exercises: Exercise[]): Observable<Workout> {
    return this.http.patch<Workout>(`${this.apiUrl}/${workout.workoutId}`, workout).pipe(
      switchMap(updatedWorkout => this.updateExercisesForWorkout(updatedWorkout, exercises)),
      this.handleError('updateWorkoutWithExercises')
    );
  }

  /**
   * Helper method to update exercises for a workout
   */
  private updateExercisesForWorkout(updatedWorkout: Workout, exercises: Exercise[]): Observable<Workout> {
    return this.getExercisesForWorkout(updatedWorkout.workoutId!).pipe(
      switchMap(existingExercises => {
        const existingExerciseMap = new Map(
          existingExercises.map(e => [e.exerciseId, e])
        );
        
        // Create/update exercises
        const exerciseRequests = exercises.map(exercise => {
          const exercisePayload = {
            ...exercise,
            workoutId: updatedWorkout.workoutId,
            exerciseTemplateId: exercise.exerciseTemplateId,
            // Include properly formatted sets
            sets: (exercise.sets || []).map(set => ({
              ...set,
              exerciseId: exercise.exerciseId
            }))
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
        
        // Delete removed exercises
        const newExerciseIds = new Set(
          exercises.filter(e => e.exerciseId).map(e => e.exerciseId)
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
  }

  /**
   * Get workouts with their exercises
   */
  public getWorkoutsWithExercises(): Observable<{workout: Workout, exercises: Exercise[]}[]> {
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
            map(exercises => ({ workout, exercises })),
            this.handleError(`getExercisesForWorkout-${workout.workoutId}`, { workout, exercises: [] })
          );
        });
        
        return forkJoin(workoutWithExercisesRequests);
      }),
      this.handleError('getWorkoutsWithExercises', [])
    );
  }

  /**
   * Load an exercise with all its sets
   */
  public loadExerciseWithSets(workoutId: string, exerciseId: string): Observable<Exercise> {
    return this.getWorkoutExerciseById(workoutId, exerciseId).pipe(
      switchMap(exercise => {
        if (!exercise.exerciseSetIds?.length) {
          return of(exercise);
        }
        
        return this.getExerciseSetsForExercise(workoutId, exerciseId).pipe(
          map(sets => ({
            ...exercise,
            sets: sets
          }))
        );
      }),
      this.handleError('loadExerciseWithSets')
    );
  }

  /**
   * Force refresh workouts data
   */
  public refreshWorkouts(): Observable<{workout: Workout, exercises: Exercise[]}[]> {
    // Clear any cached data if needed
    return this.getWorkoutsWithExercises();
  }
}