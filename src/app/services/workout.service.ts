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
import { SetType } from '../models/set-type.enum';

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
    // Use the workoutState$ observable which already has an isActive property
    return this.activeWorkoutService.workoutState$.pipe(
      map(state => state.isActive),
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
   * Create a workout with exercises and sets in a sequential manner
   * using separate endpoint calls for each component
   */
  public createWorkoutWithExercises(workout: Workout, exercises: Exercise[]): Observable<Workout> {
    console.log('Creating workout with exercises through separate endpoint calls:', {
      workoutName: workout.name,
      exerciseCount: exercises.length,
      exerciseDetails: exercises.map(e => ({
        name: e.name,
        templateId: e.exerciseTemplateId,
        setCount: e.sets?.length || 0
      }))
    });
    
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
        this.workoutsCache = null;
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
    
    console.log(`Creating exercise with template ID: ${exercisePayload.exerciseTemplateId}`);
    
    // First create the exercise
    return this.http.post<any>(
      `${this.apiUrl}/${workoutId}/exercises`, 
      exercisePayload
    ).pipe(
      tap(response => {
        console.log('Exercise creation response:', response);
      }),
      switchMap(response => {
        // Get the exercise ID from the response
        let exerciseId: string | undefined;
        
        if (response.exerciseId) {
          exerciseId = response.exerciseId;
        } else if (response.exerciseIds && response.exerciseIds.length > 0) {
          exerciseId = response.exerciseIds[response.exerciseIds.length - 1];
          console.log(`Extracted exerciseId ${exerciseId} from exerciseIds array`);
        } else {
          console.error('Exercise created but no ID found in response:', response);
          return throwError(() => new Error('Created exercise has no valid ID'));
        }
        
        // If no sets, we're done
        if (!exercise.sets || exercise.sets.length === 0) {
          return of({ ...response, exerciseId });
        }
        
        console.log(`Adding ${exercise.sets.length} sets to exercise ${exerciseId}`);
        
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
            const setPayload = {
              ...set,
              exerciseId: exerciseId,
              orderPosition: index
            };
            
            console.log(`Creating set #${index} for exercise ${exerciseId}`);
            
            return this.http.post<Workout>(
              `${this.apiUrl}/${workoutId}/exercises/${exerciseId}/sets`,
              setPayload
            ).pipe(
              catchError(error => {
                console.error(`Error creating set #${index}:`, error);
                return throwError(() => error);
              })
            );
          }),
          toArray(),
          map(() => ({ ...response, exerciseId }))
        );
      }),
      catchError(error => {
        console.error('Error creating exercise:', error);
        return throwError(() => error);
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
   * Updates a workout template with the given exercises
   */
  updateWorkoutWithExercises(workout: Workout, exercises: Exercise[]): Observable<Workout> {
    // First update the workout basic info
    return this.http.patch<Workout>(`${this.apiUrl}/${workout.workoutId}`, workout).pipe(
      switchMap(() => {
        if (!exercises.length) {
          return of(workout);
        }
        
        // Process each exercise sequentially
        return from(exercises).pipe(
          concatMap(exercise => {
            // Check if this is a real exercise ID or a temporary ID
            const isRealExerciseId = exercise.exerciseId && 
              !exercise.exerciseId.toString().startsWith('temp-') && 
              !exercise.tempId;
            
            if (isRealExerciseId) {
              // For existing exercises, update the exercise first
              console.log(`Updating existing exercise ${exercise.name} (${exercise.exerciseId})`);
              
              // Create a payload without sets for the exercise update
              const { sets, ...exerciseWithoutSets } = exercise;
              
              // Update the exercise first
              return this.http.put<Exercise>(
                `${this.apiUrl}/${workout.workoutId}/exercises/${exercise.exerciseId}`, 
                exerciseWithoutSets
              ).pipe(
                // Then handle sets separately using the appropriate endpoints
                switchMap(updatedExercise => {
                  console.log(`Updated exercise ${exercise.name} (ID: ${exercise.exerciseId})`);
                  if (!exercise.sets || exercise.sets.length === 0) {
                    return of(updatedExercise);
                  }
                  
                  // Process each set separately using the sets endpoint
                  console.log(`Processing ${exercise.sets.length} sets for existing exercise ${exercise.exerciseId}`);
                  
                  return from(exercise.sets).pipe(
                    concatMap((set, index) => {
                      // Make sure each set has correct orderPosition
                      const setWithOrderPosition = {
                        ...set,
                        exerciseId: exercise.exerciseId,
                        orderPosition: index
                      };
                      
                      // Remove properties that shouldn't be sent
                      const { tempId, completed, ...cleanSet } = setWithOrderPosition;
                      
                      // If the set has an ID, update it, otherwise create a new one
                      if (set.exerciseSetId && !set.exerciseSetId.toString().startsWith('temp-')) {
                        console.log(`Updating existing set ${set.exerciseSetId}`);
                        return this.http.put<ExerciseSet>(
                          `${this.apiUrl}/${workout.workoutId}/exercises/${exercise.exerciseId}/sets/${set.exerciseSetId}`, 
                          cleanSet
                        ).pipe(
                          catchError(error => {
                            console.error(`Error updating set ${set.exerciseSetId}:`, error);
                            return of(null); // Continue with other sets even if one fails
                          })
                        );
                      } else {
                        console.log(`Creating new set for existing exercise ${exercise.exerciseId}`);
                        return this.http.post<ExerciseSet>(
                          `${this.apiUrl}/${workout.workoutId}/exercises/${exercise.exerciseId}/sets`, 
                          cleanSet
                        ).pipe(
                          catchError(error => {
                            console.error('Error creating set:', error);
                            return of(null); // Continue with other sets even if one fails
                          })
                        );
                      }
                    }),
                    toArray(),
                    map(() => updatedExercise)
                  );
                }),
                catchError(error => {
                  console.error(`Error processing exercise ${exercise.name}:`, error);
                  return throwError(() => error);
                })
              );
            } else {
              // This is a new exercise (either no ID or temporary ID)
              console.log(`Creating new exercise ${exercise.name} (temp: ${exercise.tempId || 'none'})`);
              
              // Extract sets to handle separately
              const { sets, tempId, exerciseId, ...exerciseWithoutTempFields } = exercise;
              const exerciseSets = sets || [];
              
              // Create the exercise first without sets or temp fields
              return this.http.post<Exercise>(
                `${this.apiUrl}/${workout.workoutId}/exercises`, 
                exerciseWithoutTempFields
              ).pipe(
                switchMap(createdExercise => {
                  console.log(`Created new exercise with ID ${createdExercise.exerciseId}`);
                  if (exerciseSets.length === 0) {
                    return of(createdExercise);
                  }
                  
                  // Now create each set using the dedicated endpoint
                  console.log(`Creating ${exerciseSets.length} sets for new exercise ${createdExercise.exerciseId}`);
                  
                  return from(exerciseSets).pipe(
                    concatMap((set, index) => {
                      // Prepare set with the new exercise ID and correct order
                      const newSet = {
                        type: set.type || 'NORMAL',
                        reps: set.reps || 0,
                        weight: set.weight || 0,
                        restTimeSeconds: set.restTimeSeconds || 60,
                        exerciseId: createdExercise.exerciseId,
                        orderPosition: index
                      };
                      
                      console.log(`Creating set ${index} for new exercise ${createdExercise.exerciseId}:`, newSet);
                      
                      return this.http.post<ExerciseSet>(
                        `${this.apiUrl}/${workout.workoutId}/exercises/${createdExercise.exerciseId}/sets`, 
                        newSet
                      ).pipe(
                        tap(response => console.log(`Created set response:`, response)),
                        catchError(error => {
                          console.error('Error creating set for new exercise:', error);
                          return of(null); // Continue with other sets even if one fails
                        })
                      );
                    }),
                    toArray(),
                    map(() => createdExercise)
                  );
                }),
                catchError(error => {
                  console.error(`Error creating exercise ${exercise.name}:`, error);
                  return throwError(() => error);
                })
              );
            }
          }),
          toArray(),
          map(() => workout)
        );
      }),
      tap(() => {
        this.workoutsCache = null;
        this.refreshWorkouts();
      }),
      catchError(error => {
        console.error('Error updating workout template:', error);
        return throwError(() => new Error('Failed to update workout template'));
      })
    );
  }

  // Add this method to WorkoutService
  updateExercise(workoutId: string, exerciseId: string, exerciseDTO: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/workouts/${workoutId}/exercises/${exerciseId}`, exerciseDTO);
  }

  updateExerciseSet(
    workoutId: string, 
    exerciseId: string, 
    setId: string, 
    setData: any
  ): Observable<any> {
    return this.http.put<any>(
      `${this.apiUrl}/${workoutId}/exercises/${exerciseId}/sets/${setId}`,
      setData
    ).pipe(
      tap(() => console.log(`Set ${setId} updated successfully`)),
      catchError(error => {
        console.error(`Error updating set ${setId}:`, error);
        return throwError(() => new Error('Failed to update set'));
      })
    );
  }
}