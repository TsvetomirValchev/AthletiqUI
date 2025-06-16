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
  
  private handleError(operation: string, fallbackValue: any = null) {
    return catchError(error => {
      console.error(`Error in ${operation}:`, error);
      return fallbackValue !== null ? of(fallbackValue) : throwError(() => error);
    });
  }

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

  public getById(id: string): Observable<Workout> {
    return this.http.get<Workout>(`${this.apiUrl}/${id}`)
      .pipe(this.handleError('getById'));
  }

  public createWorkout(workout: Workout): Observable<Workout> {
    return this.http.post<Workout>(this.apiUrl, workout)
      .pipe(this.handleError('createWorkout'));
  }

  public update(id: string, workout: Workout): Observable<Workout> {
    return this.http.patch<Workout>(`${this.apiUrl}/${id}`, workout)
      .pipe(this.handleError('update'));
  }

  public deleteWorkout(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`)
      .pipe(this.handleError('deleteWorkout'));
  }

  public getExerciseSetsForExercise(workoutId: string, exerciseId: string): Observable<ExerciseSet[]> {
    return this.http.get<ExerciseSet[]>(`${this.apiUrl}/${workoutId}/exercises/${exerciseId}/sets`)
      .pipe(this.handleError('getExerciseSetsForExercise', []));
  }

  public getWorkoutExerciseById(workoutId: string, exerciseId: string): Observable<Exercise> {
    return this.http.get<Exercise>(`${this.apiUrl}/${workoutId}/exercises/${exerciseId}`)
      .pipe(this.handleError('getWorkoutExerciseById'));
  }

  public addExerciseToWorkout(workoutId: string, exerciseTemplateId: string): Observable<Workout> {
    return this.http.post<Workout>(
      `${this.apiUrl}/${workoutId}/exercises`, 
      { exerciseTemplateId }
    ).pipe(
      tap(() => this.workoutsCache = null),
      this.handleError('addExerciseToWorkout')
    );
  }

  public addSetToExercise(workoutId: string, exerciseId: string, set: ExerciseSet): Observable<ExerciseSet> {
    const setPayload = {
      ...set,
      exerciseId
    };
    
    return this.http.post<ExerciseSet>(
      `${this.apiUrl}/${workoutId}/exercises/${exerciseId}/sets`,
      setPayload
    ).pipe(
      tap(() => this.workoutsCache = null),
      catchError(error => {
        console.error('Error adding set to exercise:', error);
        return throwError(() => new Error('Failed to add set to exercise'));
      })
    );
  }

  public getExercisesForWorkout(workoutId: string): Observable<Exercise[]> {
    return this.http.get<Exercise[]>(`${this.apiUrl}/${workoutId}/exercises`).pipe(
      switchMap(exercises => {
        if (exercises.length === 0) {
          return of([]);
        }
        
        const templateIds = exercises
          .filter(ex => ex.exerciseTemplateId)
          .map(ex => ex.exerciseTemplateId!);
        
        if (templateIds.length === 0) {
          return of(exercises);
        }
        
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

        return forkJoin(templateRequests).pipe(
          map(templates => {
            const nameMap = new Map(templates.map(t => [t.exerciseId, t.templateName]));
            
            return exercises.map(ex => {
              if (ex.exerciseId && nameMap.has(ex.exerciseId) && !ex.name) {
                return {
                  ...ex,
                  name: nameMap.get(ex.exerciseId)
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

  public isActiveWorkoutInProgress(): Observable<boolean> {
    return this.activeWorkoutService.workoutState$.pipe(
      map(state => state.isActive),
      this.handleError('isActiveWorkoutInProgress', false)
    );
  }

  public startWorkout(workout: Workout): Observable<any> {
    const activeWorkout = {
      ...workout,
      startTime: new Date().toISOString()
    };
    return this.activeWorkoutService.startWorkout(activeWorkout)
      .pipe(this.handleError('startWorkout'));
  }

  public getExerciseTemplates(): Observable<ExerciseTemplate[]> {
    return this.exerciseTemplateService.getAllTemplates()
      .pipe(this.handleError('getExerciseTemplates', []));
  }

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
    
    return this.http.post<Workout>(`${this.apiUrl}`, workout).pipe(
      switchMap(createdWorkout => {
        if (!exercises.length) {
          return of(createdWorkout);
        }
        
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

  private createExerciseWithSets(
    workoutId: string, 
    exercise: Exercise, 
    processedSets: Map<string, boolean>
  ): Observable<any> {
    const exercisePayload = {
      ...exercise,
      workoutId: workoutId,
      exerciseTemplateId: exercise.exerciseTemplateId,
      sets: undefined
    };
    
    console.log(`Creating exercise with template ID: ${exercisePayload.exerciseTemplateId}`);
    
    return this.http.post<any>(
      `${this.apiUrl}/${workoutId}/exercises`, 
      exercisePayload
    ).pipe(
      tap(response => {
        console.log('Exercise creation response:', response);
      }),
      switchMap(response => {
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
        
        if (!exercise.sets || exercise.sets.length === 0) {
          return of({ ...response, exerciseId });
        }
        
        console.log(`Adding ${exercise.sets.length} sets to exercise ${exerciseId}`);
        
        const uniqueSets = exercise.sets.filter(set => {
          const setKey = `${exerciseId}-${set.weight}-${set.reps}-${set.type}-${set.orderPosition}`;
          if (processedSets.has(setKey)) {
            return false;
          }
          processedSets.set(setKey, true);
          return true;
        });
        
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

  public loadExerciseWithSets(workoutId: string, exerciseId: string): Observable<Exercise> {
    return this.http.get<Exercise>(`${this.apiUrl}/${workoutId}/exercises/${exerciseId}`)
      .pipe(
        switchMap(exercise => {
          return this.http.get<ExerciseSet[]>(
            `${this.apiUrl}/${workoutId}/exercises/${exerciseId}/sets`
          ).pipe(
            map(sets => {
              const sortedSets = sets.sort((a, b) => 
                (a.orderPosition || 0) - (b.orderPosition || 0));
            
              return {
                ...exercise,
                sets: sortedSets
              };
            }),
            catchError(error => {
              console.error('Error loading sets:', error);
              return of({
                ...exercise,
                sets: []
              });
            })
          );
        })
      );
  }

  public refreshWorkouts(): Observable<void> {
    console.log('WorkoutService: Refreshing workouts data');
    this.workoutsCache = null;
    this.workoutsRefreshSubject.next();
    return of(undefined);
  }

  public removeExerciseFromWorkout(workoutId: string, exerciseId: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${workoutId}/exercises/${exerciseId}`)
      .pipe(
        tap(() => {
          console.log(`Exercise ${exerciseId} removed from workout ${workoutId}`);
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

  updateWorkoutWithExercises(workout: Workout, exercises: Exercise[]): Observable<Workout> {
    return this.http.patch<Workout>(`${this.apiUrl}/${workout.workoutId}`, workout).pipe(
      switchMap(() => {
        if (!exercises.length) {
          return of(workout);
        }
        
        return from(exercises).pipe(
          concatMap(exercise => {
            const isRealExerciseId = exercise.exerciseId && 
              !exercise.exerciseId.toString().startsWith('temp-') && 
              !exercise.tempId;
            
            if (isRealExerciseId) {
              console.log(`Updating existing exercise ${exercise.name} (${exercise.exerciseId})`);
              
              const { sets, ...exerciseWithoutSets } = exercise;
              
              return this.http.patch<Exercise>(
                `${this.apiUrl}/${workout.workoutId}/exercises/${exercise.exerciseId}`, 
                exerciseWithoutSets
              ).pipe(
                switchMap(updatedExercise => {
                  console.log(`Updated exercise ${exercise.name} (ID: ${exercise.exerciseId})`);
                  if (!exercise.sets || exercise.sets.length === 0) {
                    return of(updatedExercise);
                  }
                  
                  console.log(`Processing ${exercise.sets.length} sets for existing exercise ${exercise.exerciseId}`);
                  
                  return from(exercise.sets).pipe(
                    concatMap((set, index) => {
                      const setWithOrderPosition = {
                        ...set,
                        exerciseId: exercise.exerciseId,
                        orderPosition: index
                      };
                      
                      const { tempId, completed, ...cleanSet } = setWithOrderPosition;
                      
                      if (set.exerciseSetId && !set.exerciseSetId.toString().startsWith('temp-')) {
                        console.log(`Updating existing set ${set.exerciseSetId}`);
                        return this.http.patch<ExerciseSet>(
                          `${this.apiUrl}/${workout.workoutId}/exercises/${exercise.exerciseId}/sets/${set.exerciseSetId}`, 
                          cleanSet
                        ).pipe(
                          catchError(error => {
                            console.error(`Error updating set ${set.exerciseSetId}:`, error);
                            return of(null);
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
                            return of(null);
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
              console.log(`Creating new exercise ${exercise.name} (temp: ${exercise.tempId || 'none'})`);
              
              const { sets, tempId, exerciseId, ...exerciseWithoutTempFields } = exercise;
              const exerciseSets = sets || [];
              
              return this.http.post<Exercise>(
                `${this.apiUrl}/${workout.workoutId}/exercises`, 
                exerciseWithoutTempFields
              ).pipe(
                switchMap(createdExercise => {
                  console.log(`Created new exercise with ID ${createdExercise.exerciseId}`);
                  if (exerciseSets.length === 0) {
                    return of(createdExercise);
                  }
                  
                  console.log(`Creating ${exerciseSets.length} sets for new exercise ${createdExercise.exerciseId}`);
                  
                  return from(exerciseSets).pipe(
                    concatMap((set, index) => {
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
                          return of(null);
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

  updateExercise(workoutId: string, exerciseId: string, exerciseDTO: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/workouts/${workoutId}/exercises/${exerciseId}`, exerciseDTO);
  }

  updateExerciseSet(
    workoutId: string, 
    exerciseId: string, 
    setId: string, 
    setData: any
  ): Observable<any> {
    return this.http.patch<any>(
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