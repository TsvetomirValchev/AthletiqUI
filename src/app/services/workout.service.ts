import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, forkJoin, throwError, from, BehaviorSubject, Subject, Subscription } from 'rxjs';
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
export class WorkoutService implements OnDestroy {
  private apiUrl = `${environment.apiUrl}/workouts`;
  
  private workoutsRefreshSubject = new Subject<void>();
  public workoutsRefresh$ = this.workoutsRefreshSubject.asObservable();
  
  private workoutsCache: any = null;
  private subscriptions = new Subscription();

  constructor(
    private http: HttpClient,
    private exerciseTemplateService: ExerciseTemplateService,
    private activeWorkoutService: ActiveWorkoutService
  ) {
    // Listen for workout modifications from ActiveWorkoutService
    this.subscriptions.add(
      this.activeWorkoutService.workoutModified$.subscribe(workoutId => {
        console.log(`Workout ${workoutId} was modified, refreshing workouts data`);
        this.refreshWorkouts();
      })
    );
  }
  
  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }
  
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
    if (this.workoutsCache) {
      return of(this.workoutsCache);
    }
    
    return this.http.get<Workout[]>(this.apiUrl).pipe(
      tap(workouts => {
        this.workoutsCache = workouts;
      }),
      this.handleError('getUserWorkouts', [])
    );
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
  public addExerciseToWorkout(workoutId: string, exerciseTemplateId: string): Observable<Workout> {
    return this.http.post<Workout>(
      `${this.apiUrl}/${workoutId}/exercises`, 
      { exerciseTemplateId }
    ).pipe(
      tap(() => this.workoutsCache = null),
      this.handleError('addExerciseToWorkout')
    );
  }

  /**
   * Add a set to an exercise
   */
  public addSetToExercise(workoutId: string, exerciseId: string, set: ExerciseSet): Observable<Workout> {
    const setPayload = {
      ...set,
      exerciseId
    };
    
    return this.http.post<Workout>(
      `${this.apiUrl}/${workoutId}/exercises/${exerciseId}/sets`,
      setPayload
    ).pipe(
      tap(() => this.workoutsCache = null),
      this.handleError('addSetToExercise')
    );
  }

  /**
   * Get all exercises for a workout with populated template names
   */
  public getExercisesForWorkout(workoutId: string): Observable<Exercise[]> {
    return this.http.get<Exercise[]>(`${this.apiUrl}/${workoutId}/exercises`).pipe(
      switchMap(exercises => {
        if (exercises.length === 0) {
          return of([]);
        }
        
        // Get all the template IDs from exercises
        const templateIds = exercises
          .filter(ex => ex.exerciseTemplateId)
          .map(ex => ex.exerciseTemplateId!);
        
        // If no templates to fetch, just return exercises
        if (templateIds.length === 0) {
          return of(exercises);
        }
        
        // Fetch templates for each exercise that has a template ID
        const templateRequests = exercises
          .filter(ex => ex.exerciseTemplateId)
          .map(ex => 
            this.exerciseTemplateService.getTemplateById(ex.exerciseTemplateId!)
              .pipe(
                map(template => ({
                  exerciseId: ex.exerciseId, 
                  templateName: template ? template.name : 'Unknown Exercise' 
                })),
                catchError(() => 
                  of({
                    exerciseId: ex.exerciseId, 
                    templateName: 'Unknown Exercise' 
                  })
                )
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
    return this.http.post<Workout>(`${this.apiUrl}`, workout).pipe(
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
        this.refreshWorkouts();
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
    return this.http.get<Exercise>(`${this.apiUrl}/${workoutId}/exercises/${exerciseId}`)
      .pipe(
        switchMap(exercise => {
          // Load sets for this exercise
          return this.http.get<ExerciseSet[]>(
            `${this.apiUrl}/${workoutId}/exercises/${exerciseId}/sets`
          ).pipe(
            map(sets => {
              // Sort sets by order position
              const sortedSets = sets.sort((a, b) => 
                (a.orderPosition || 0) - (b.orderPosition || 0));
            
              // Assign sets to the exercise
              return {
                ...exercise,
                sets: sortedSets
              };
            }),
            catchError(error => {
              console.error('Error loading sets:', error);
              // Return the exercise without sets if there's an error
              return of({
                ...exercise,
                sets: []
              });
            })
          );
        })
      );
  }

  /**
   * Force refresh workouts data
   */
  public refreshWorkouts(): Observable<void> {
    console.log('WorkoutService: Refreshing workouts data');
    this.workoutsCache = null; // Clear cache
    this.workoutsRefreshSubject.next(); // Notify subscribers
    return of(undefined); // Return observable
  }

  /**
   * Remove an exercise from a workout
   */
  public removeExerciseFromWorkout(workoutId: string, exerciseId: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${workoutId}/exercises/${exerciseId}`)
      .pipe(
        tap(() => {
          console.log(`Exercise ${exerciseId} removed from workout ${workoutId}`);
          // Clear any cached data
          if (this.workoutsCache) {
            this.workoutsCache = null;
          }
          this.workoutsRefreshSubject.next();
        }),
        catchError(error => {
          console.error('Error removing exercise from workout:', error);
          return throwError(() => new Error('Failed to remove exercise'));
        })
      );
  }

  /**
   * Remove a set from an exercise
   */
  removeSetFromExercise(
    workoutId: string, 
    exerciseId: string, 
    orderPosition: number
  ): Observable<any> {
    return this.http.delete<any>(
      `${this.apiUrl}/${workoutId}/exercises/${exerciseId}/sets/${orderPosition}`
    ).pipe(
      tap(() => {
        console.log(`Set ${orderPosition} removed from exercise ${exerciseId}`);
        // Clear any cached data
        if (this.workoutsCache) {
          this.workoutsCache = null;
        }
        this.workoutsRefreshSubject.next();
      }),
      catchError(error => {
        console.error('Error removing set from exercise:', error);
        return throwError(() => new Error('Failed to remove set'));
      })
    );
  }

  /**
   * Update exercise with its sets
   */
  private updateExerciseWithSets(workoutId: string, exercise: Exercise): Observable<any> {
    const { sets, ...exerciseData } = exercise;
    
    // If this is a new exercise (no exerciseId yet) or exerciseId is undefined
    if (!exercise.exerciseId) {
      return this.http.post<any>(`${this.apiUrl}/${workoutId}/exercises`, {
        ...exerciseData,
        workoutId,
        exerciseTemplateId: exercise.exerciseTemplateId
      }).pipe(
        switchMap(response => {
          const newExerciseId = response.exerciseId || response.id;
          if (!sets || sets.length === 0) return of(response);
          
          // Process sets for the new exercise
          return from(sets).pipe(
            concatMap(set => this.addSetToExercise(workoutId, newExerciseId, {
              ...set,
              exerciseId: newExerciseId
            })),
            toArray(),
            map(() => response)
          );
        })
      );
    }
    
    // At this point we're sure exerciseId is defined
    const exerciseId = exercise.exerciseId; // This helps TypeScript understand it's defined
    
    // For existing exercises, first update the exercise
    return this.http.patch<any>(`${this.apiUrl}/${workoutId}/exercises/${exerciseId}`, exerciseData).pipe(
      switchMap(response => {
        if (!sets || sets.length === 0) return of(response);
        
        // Get existing sets to compare
        return this.getExerciseSetsForExercise(workoutId, exerciseId).pipe(
          switchMap(existingSets => {
            // Create a Set of existing set IDs, properly filtering out undefined values
            const existingSetIds = new Set();
            existingSets.forEach(set => {
              if (set.exerciseSetId) {
                existingSetIds.add(set.exerciseSetId);
              }
            });
            
            const setOperations: Observable<any>[] = [];
            
            // Process each set from the exercise
            sets.forEach(set => {
              // If set has no ID, it's a new set to create
              if (!set.exerciseSetId) {
                setOperations.push(
                  this.addSetToExercise(workoutId, exerciseId, {
                    ...set,
                    exerciseId: exerciseId
                  })
                );
              } else {
                // It's an existing set to update
                setOperations.push(
                  this.http.patch<any>(
                    `${this.apiUrl}/${workoutId}/exercises/${exerciseId}/sets/${set.exerciseSetId}`,
                    {
                      reps: set.reps,
                      weight: set.weight,
                      type: set.type,
                      orderPosition: set.orderPosition,
                      restTimeSeconds: set.restTimeSeconds
                    }
                  )
                );
                // Remove from existingSetIds so we don't delete it
                existingSetIds.delete(set.exerciseSetId);
              }
            });
            
            // Delete sets that were removed
            existingSetIds.forEach(setId => {
              setOperations.push(
                this.http.delete<any>(`${this.apiUrl}/${workoutId}/exercises/${exerciseId}/sets/${setId}`)
              );
            });
            
            // Execute all set operations
            return setOperations.length > 0 
              ? forkJoin(setOperations) 
              : of([]);
          }),
          map(() => response)
        );
      })
    );
  }

  /**
   * Updates a workout template with the given exercises
   */
  updateWorkoutWithExercises(workout: Workout, exercises: Exercise[]): Observable<Workout> {
    if (!workout.workoutId) {
      return throwError(() => new Error('Workout ID is required'));
    }
    
    // First update the workout basic info
    return this.http.patch<Workout>(`${this.apiUrl}/${workout.workoutId}`, workout).pipe(
      switchMap(() => {
        // Then update each exercise
        if (!exercises.length) {
          return of(workout);
        }
        
        // Create an array of observables for each exercise update
        const exerciseUpdates = exercises.map(exercise => {
          if (exercise.exerciseId) {
            // Update existing exercise
            return this.http.put<Exercise>(
              `${this.apiUrl}/${workout.workoutId}/exercises/${exercise.exerciseId}`, 
              exercise
            );
          } else {
            // Create new exercise
            return this.http.post<Exercise>(
              `${this.apiUrl}/${workout.workoutId}/exercises`, 
              exercise
            );
          }
        });
        
        // Execute all exercise updates in parallel
        return forkJoin(exerciseUpdates).pipe(
          map(() => workout),
          catchError(error => {
            console.error('Error updating exercises:', error);
            return throwError(() => new Error('Failed to update exercises'));
          })
        );
      }),
      // Add tap to trigger refresh after successful update
      tap(() => {
        console.log(`Workout template ${workout.workoutId} updated, triggering refresh`);
        this.workoutsCache = null; // Clear the cache
        this.refreshWorkouts(); // Use the proper method instead of next()
      }),
      catchError(error => {
        console.error('Error updating workout template:', error);
        return throwError(() => new Error('Failed to update workout template'));
      })
    );
  }
}