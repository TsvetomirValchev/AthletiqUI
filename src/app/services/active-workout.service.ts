import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, forkJoin, from, of, throwError } from 'rxjs';
import { catchError, concatMap, distinctUntilChanged, finalize, map, switchMap, tap, toArray } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Workout } from '../models/workout.model';
import { Exercise } from '../models/exercise.model';
import { ExerciseSet } from '../models/exercise-set.model';
import { ActiveWorkout } from '../models/active-workout.model';
import { IndexedDBService } from './indexed-db.service';
import { Subscription, interval } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { SetType } from '../models/set-type.enum';
import { WorkoutSession } from '../models/workout-session.model';



@Injectable({
  providedIn: 'root'
})
export class ActiveWorkoutService {
  private workoutApiUrl = `${environment.apiUrl}/workouts`;
  
  private currentSessionSubject = new BehaviorSubject<WorkoutSession | null>(null);
  private timerSubscription: Subscription | null = null;
  private autoSaveInterval: any = null;
  
  private workoutCompletedSubject = new Subject<void>();
  public workoutCompleted$ = this.workoutCompletedSubject.asObservable();
  private workoutModifiedSubject = new Subject<string>();
  public workoutModified$ = this.workoutModifiedSubject.asObservable();

  constructor(
    private http: HttpClient,
    private indexedDBService: IndexedDBService
  ) {
    this.setupAutoSave();
  }

  get currentWorkout$(): Observable<Workout | null> {
    return this.currentSessionSubject.pipe(
      map(session => session?.workout || null),
      distinctUntilChanged((prev, curr) => prev?.workoutId === curr?.workoutId)
    );
  }

  get workoutState$() {
    return this.currentSessionSubject.pipe(
      map(session => ({
        isActive: !!session,
        isPaused: !session || session.isPaused,
        elapsedTimeSeconds: session?.elapsedTimeSeconds || 0
      }))
    );
  }

  get elapsedTime$(): Observable<number> {
    return this.workoutState$.pipe(map(state => state.elapsedTimeSeconds));
  }

  get isPaused$(): Observable<boolean> {
    return this.workoutState$.pipe(map(state => state.isPaused));
  }

  startWorkout(workout: ActiveWorkout): Observable<ActiveWorkout> {
    console.log(`Starting workout: ${workout.workoutId}`);
    
    return this.loadSavedSession().pipe(
      switchMap(hasSession => {
        const existingSession = this.currentSessionSubject.value;
        
        if (hasSession && existingSession && existingSession.workout.workoutId === workout.workoutId) {
          console.log('Reusing existing workout session');
          return of({
            ...existingSession.workout,
            startTime: existingSession.startTime
          });
        }
        
        console.log('Creating new workout session');
        return this.http.get<Workout>(`${this.workoutApiUrl}/${workout.workoutId}`).pipe(
          switchMap(fetchedWorkout => {
            return this.http.get<Exercise[]>(`${this.workoutApiUrl}/${workout.workoutId}/exercises`).pipe(
              switchMap(exercises => {
                const sortedExercises = [...exercises].sort(
                  (a, b) => (a.orderPosition ?? 0) - (b.orderPosition ?? 0)
                );
                
                const exerciseRequests = sortedExercises.map(exercise => {
                  if (!exercise.exerciseId) {
                    console.warn(`Exercise without ID found in workout ${workout.workoutId}`);
                    return of({
                      ...exercise,
                      sets: []
                    });
                  }
                  
                  console.log(`Fetching sets for exercise ${exercise.exerciseId}`);
                  return this.http.get<ExerciseSet[]>(
                    `${this.workoutApiUrl}/${workout.workoutId}/exercises/${exercise.exerciseId}/sets`
                  ).pipe(
                    map(sets => {
                      const sortedSets = sets.sort((a, b) => 
                        (a.orderPosition ?? 0) - (b.orderPosition ?? 0));
                      
                      const setsWithCompleted = sortedSets.map(set => ({
                        ...set,
                        completed: false
                      }));

                      return {
                        ...exercise,
                        sets: setsWithCompleted
                      };
                    }),
                    catchError(error => {
                      console.error(`Error loading sets for exercise ${exercise.exerciseId}:`, error);
                      return of({
                        ...exercise,
                        sets: []
                      });
                    })
                  );
                });
                
                return forkJoin(exerciseRequests).pipe(
                  map(exercisesWithSets => {
                    console.log('Loaded all exercises with their sets:', 
                      exercisesWithSets.map(e => `${e.name} (${e.sets?.length || 0} sets)`));
                    
                    const session: WorkoutSession = {
                      workout: fetchedWorkout,
                      exercises: exercisesWithSets,
                      startTime: workout.startTime || new Date().toISOString(),
                      elapsedTimeSeconds: 0,
                      isPaused: false,
                      totalPausedSeconds: 0
                    };
                    
                    this.currentSessionSubject.next(session);
                    this.startTimer();
                    this.saveCurrentSession();
                    
                    return {
                      ...fetchedWorkout,
                      startTime: session.startTime
                    };
                  })
                );
              })
            );
          }),
          catchError(error => {
            console.error(`Error fetching workout ${workout.workoutId}:`, error);
            return throwError(() => new Error(`Workout not found: ${workout.workoutId}`));
          })
        );
      })
    );
  }

  // Pause the workout
  pauseWorkout(): void {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) return;

    console.log('Pausing workout');
    
    const pausedAt = Date.now();
    this.currentSessionSubject.next({
      ...currentSession,
      isPaused: true,
      lastPausedAt: pausedAt
    });
    
    this.stopTimer();
    this.saveCurrentSession();
  }

  // Resume the workout
  resumeWorkout(): void {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession || !currentSession.isPaused) return;

    console.log('Resuming workout');
    
    let additionalPausedTime = 0;
    if (currentSession.lastPausedAt) {
      additionalPausedTime = Math.floor((Date.now() - currentSession.lastPausedAt) / 1000);
      console.log(`Workout was paused for ${additionalPausedTime} seconds`);
    }
    
    this.currentSessionSubject.next({
      ...currentSession,
      isPaused: false,
      lastPausedAt: undefined,
      totalPausedSeconds: (currentSession.totalPausedSeconds || 0) + additionalPausedTime
    });
    
    this.startTimer();
    this.saveCurrentSession();
  }

  getExercisesByWorkoutId(workoutId: string): Observable<Exercise[]> {
    const session = this.currentSessionSubject.value;
    if (session && session.workout.workoutId === workoutId) {
      console.log(`Using cached exercises for workout ${workoutId} with sets:`,
        session.exercises.map(e => `${e.name} (${e.sets?.length || 0} sets)`));
      
      const sortedExercises = [...session.exercises].sort(
        (a, b) => (a.orderPosition ?? 0) - (b.orderPosition ?? 0)
      );
      return of(sortedExercises);
    }
    
    console.log(`Fetching exercises for workout ${workoutId} from API`);
    return this.http.get<Exercise[]>(`${this.workoutApiUrl}/${workoutId}/exercises`).pipe(
      switchMap(exercises => {
        // Sort exercises by orderPosition
        const sortedExercises = [...exercises].sort(
          (a, b) => (a.orderPosition ?? 0) - (b.orderPosition ?? 0)
        );
        
        if (sortedExercises.length === 0) {
          return of([]);
        }
        
        const exerciseRequests = sortedExercises.map(exercise => {
          if (!exercise.exerciseId) {
            return of({
              ...exercise,
              sets: []
            });
          }
          
          return this.http.get<ExerciseSet[]>(
            `${this.workoutApiUrl}/${workoutId}/exercises/${exercise.exerciseId}/sets`
          ).pipe(
            map(sets => {
              const sortedSets = sets.sort((a, b) => 
                (a.orderPosition ?? 0) - (b.orderPosition ?? 0));
            
              return {
                ...exercise,
                sets: sortedSets
              };
            }),
            catchError(() => of({
              ...exercise,
              sets: []
            }))
          );
        });
        
        return forkJoin(exerciseRequests);
      }),
      catchError(error => {
        console.error(`Error getting exercises for workout ${workoutId}:`, error);
        
        const currentSession = this.currentSessionSubject.value;
        if (currentSession && currentSession.workout.workoutId === workoutId) {
          const sortedExercises = [...currentSession.exercises].sort(
            (a, b) => (a.orderPosition ?? 0) - (b.orderPosition ?? 0)
          );
          return of(sortedExercises);
        }
        
        return throwError(() => new Error(`Failed to get exercises for workout ${workoutId}`));
      })
    );
  }

  addExerciseToWorkout(workoutId: string, exercise: Exercise): Observable<Exercise[]> {
    const session = this.currentSessionSubject.value;
    if (!session) return throwError(() => new Error('No active session'));
    
    const exerciseSets = exercise.sets || [];
    
    const { sets, ...exerciseWithoutSets } = exercise;
    
    return this.http.post<Exercise>(`${this.workoutApiUrl}/${workoutId}/exercises`, exerciseWithoutSets).pipe(
      switchMap(createdExercise => {
        console.log(`Created exercise with ID: ${createdExercise.exerciseId}`);
        
        const setsToCreate = exerciseSets.length > 0 ? exerciseSets : [{
          type: SetType.NORMAL,
          orderPosition: 0,
          reps: 0,
          weight: 0,
          restTimeSeconds: 0,
          completed: false
        }];
        
        return from(setsToCreate).pipe(
          concatMap((set, index) => {
            const setPayload = {
              exerciseId: createdExercise.exerciseId,
              type: set.type || SetType.NORMAL,
              orderPosition: index,
              reps: set.reps || 0,
              weight: set.weight || 0,
              restTimeSeconds: set.restTimeSeconds || 0
            };
            
            console.log(`Creating set for exercise ${createdExercise.exerciseId}:`, setPayload);
            
            return this.http.post<ExerciseSet>(
              `${this.workoutApiUrl}/${workoutId}/exercises/${createdExercise.exerciseId}/sets`,
              setPayload
            ).pipe(
              catchError(error => {
                console.error(`Error creating set for exercise ${createdExercise.exerciseId}:`, error);
                return of({
                  ...setPayload, 
                  tempId: `temp-set-${Date.now()}-${index}`
                });
              })
            );
          }),
          toArray(),
          map(createdSets => {
            const exerciseWithSets = {
              ...createdExercise,
              sets: createdSets
            };
            
            const updatedExercises = [...session.exercises, exerciseWithSets];
            
            this.currentSessionSubject.next({
              ...session,
              exercises: updatedExercises
            });
            
            this.saveCurrentSession();
            
            return updatedExercises;
          })
        );
      }),
      catchError(error => {
        console.error('Error adding exercise to workout:', error);
        return throwError(() => new Error('Failed to add exercise'));
      })
    );
  }

  addSetToExercise(exerciseIdOrTempId: string): Observable<Exercise[]> {
    if (!exerciseIdOrTempId) {
      return throwError(() => new Error('No exercise ID provided'));
    }
    
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) {
      return throwError(() => new Error('No active workout session'));
    }
    
    const exerciseIndex = currentSession.exercises.findIndex(ex => 
      ex.exerciseId === exerciseIdOrTempId || ex.tempId === exerciseIdOrTempId
    );
    
    if (exerciseIndex === -1) {
      return throwError(() => new Error(`Exercise not found: ${exerciseIdOrTempId}`));
    }
    
    const exercise = currentSession.exercises[exerciseIndex];
    
    const tempId = `temp-set-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    const orderPosition = exercise.sets?.length || 0;
    
    const exerciseReference = exercise.exerciseId || exercise.tempId;
    
    if (!exerciseReference) {
      return throwError(() => new Error('Exercise has no ID or tempId'));
    }
    
    console.log(`Adding set to exercise ${exercise.name} with reference ID: ${exerciseReference}`);
    
    const newSet: ExerciseSet = {
      exerciseId: exerciseReference,
      tempId: tempId,
      type: SetType.NORMAL,
      orderPosition: orderPosition,
      reps: 0,
      weight: 0,
      restTimeSeconds: 0,
      completed: false
    };
    
    console.log('Created new set:', newSet);
    
    const updatedExercise = {
      ...exercise,
      sets: [...(exercise.sets || []), newSet]
    };
    
    const updatedExercises = [...currentSession.exercises];
    updatedExercises[exerciseIndex] = updatedExercise;
    
    const updatedSession = {
      ...currentSession,
      exercises: updatedExercises
    };
    
    this.currentSessionSubject.next(updatedSession);
    
    this.saveCurrentSession();

    return of(updatedExercises);
  }

  toggleSetCompletion(setId: string, completed: boolean): void {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) return;
    
    console.log(`Toggle set ${setId} completion to ${completed}`);
    
    let updated = false;
    const updatedExercises = currentSession.exercises.map(exercise => {
      if (!exercise.sets) return exercise;
      
      const updatedSets = exercise.sets.map(set => {
        if ((set.exerciseSetId && set.exerciseSetId === setId) || 
            (set.tempId && set.tempId === setId)) {
          updated = true;
          return { ...set, completed };
        }
        return set;
      });
      
      if (updated) {
        return { ...exercise, sets: updatedSets };
      }
      return exercise;
    });
    
    if (updated) {
      this.currentSessionSubject.next({
        ...currentSession,
        exercises: updatedExercises
      });
      this.saveCurrentSession();
    }
  }

  updateSetProperty(setId: string, property: string, value: any): void {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) return;
    
    let updated = false;
    const updatedExercises = currentSession.exercises.map(exercise => {
      if (!exercise.sets) return exercise;
      
      const updatedSets = exercise.sets.map(set => {
        if ((set.exerciseSetId && set.exerciseSetId === setId) || 
            (set.tempId && set.tempId === setId)) {
          updated = true;
          return { ...set, [property]: value };
        }
        return set;
      });
      
      if (updated) {
        return { ...exercise, sets: updatedSets };
      }
      return exercise;
    });
    
    if (updated) {
      this.currentSessionSubject.next({
        ...currentSession,
        exercises: updatedExercises
      });
      this.saveCurrentSession();
    }
  }

  updateSetPropertyByIndex(exerciseIdOrTempId: string, setIndex: number, property: string, value: any): void {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) return;
    
    let updated = false;
    const updatedExercises = currentSession.exercises.map(exercise => {
      if ((exercise.exerciseId === exerciseIdOrTempId || exercise.tempId === exerciseIdOrTempId) && exercise.sets) {
        if (setIndex >= 0 && setIndex < exercise.sets.length) {
          const updatedSets = [...exercise.sets];
          updatedSets[setIndex] = {
            ...updatedSets[setIndex],
            [property]: value
          };
          
          updated = true;
          return { ...exercise, sets: updatedSets };
        }
      }
      return exercise;
    });
    
    if (updated) {
      this.currentSessionSubject.next({
        ...currentSession,
        exercises: updatedExercises
      });
      this.saveCurrentSession();
    }
  }

  syncSetWithBackend(workoutId: string, exerciseId: string, set: ExerciseSet): Observable<ExerciseSet> {
    if (set.exerciseSetId && !set.exerciseSetId.toString().startsWith('temp-')) {
      return of(set);
    }
    
    console.log(`Preparing to sync set with exerciseId ${exerciseId}`);
    
    const setToSync = {
      ...set,
      exerciseId
    };
    
    const { tempId, completed, exerciseSetId, ...cleanSet } = setToSync;
    
    const setPayload = {
      type: cleanSet.type || 'NORMAL',
      reps: cleanSet.reps || 0,
      weight: cleanSet.weight || 0,
      restTimeSeconds: cleanSet.restTimeSeconds || 0,
      orderPosition: cleanSet.orderPosition || 0,
      exerciseId: exerciseId
    };
    
    console.log(`Syncing set to backend for exercise ${exerciseId}, payload:`, setPayload);
    
    return this.http.post<any>(
      `${this.workoutApiUrl}/${workoutId}/exercises/${exerciseId}/sets`,
      setPayload
    ).pipe(
      tap(response => console.log('Set sync response:', response)),
      map(response => {
        const backendId = response.exerciseSetId || response.id;
        
        if (!backendId) {
          console.error('No set ID returned from backend, response:', response);
        }
        
        return {
          ...set,
          exerciseId,
          exerciseSetId: backendId,
          tempId: undefined
        };
      }),
      catchError(error => {
        console.error(`Error syncing set for exercise ${exerciseId}:`, error);
        console.error('Failed set payload:', setPayload);
        return of(set);
      })
    );
  }

  prepareSetsForBackend(sets: ExerciseSet[] | undefined): any[] {
    if (!sets || sets.length === 0) return [];
    
    return sets.map((set, index) => {
      const { tempId, completed, ...cleanSet } = set;
      
      return {
        ...cleanSet,
        orderPosition: index
      };
    });
  }

  getCurrentSession(): WorkoutSession | null {
    return this.currentSessionSubject.value;
  }

  saveCurrentSession(): void {
    const session = this.currentSessionSubject.value;
    if (!session || !session.workout || !session.workout.workoutId) return;
    
    const exercisesWithProperSets = this.ensureSetExerciseIds(session.exercises);
    
    const serialized = {
      id: 'active_session',
      workout: session.workout,
      exercises: exercisesWithProperSets,
      startTime: session.startTime,
      elapsedTimeSeconds: session.elapsedTimeSeconds,
      isPaused: session.isPaused,
      lastPausedAt: session.lastPausedAt,
      totalPausedSeconds: session.totalPausedSeconds,
      lastSaved: new Date().toISOString()
    };
    
    this.indexedDBService.saveActiveWorkout(serialized).subscribe({
      next: () => console.log('Workout session saved to IndexedDB with fixed exerciseIds'),
      error: (error) => console.error('Error saving workout to IndexedDB:', error)
    });
  }

  loadSavedSession(): Observable<boolean> {
    return this.indexedDBService.getActiveWorkout().pipe(
      switchMap(savedSession => {
        if (savedSession) {
          console.log('Found saved workout session in IndexedDB');
          
          const session: WorkoutSession = {
            workout: savedSession.workout,
            exercises: savedSession.exercises || [],
            startTime: savedSession.startTime,
            elapsedTimeSeconds: savedSession.elapsedTimeSeconds || 0,
            isPaused: savedSession.isPaused || false,
            lastPausedAt: savedSession.lastPausedAt,
            totalPausedSeconds: savedSession.totalPausedSeconds || 0
          };
          
          this.currentSessionSubject.next(session);
          
          if (!session.isPaused) {
            this.startTimer();
          }
          
          return of(true);
        }
        
        return of(false);
      }),
      catchError(error => {
        console.error('Error loading workout from IndexedDB:', error);
        return of(false);
      })
    );
  }

  async clearSavedSession(): Promise<void> {
    this.currentSessionSubject.next(null);
    
    console.log('Clearing active workout from storage');
    
    try {
      await firstValueFrom(
        this.indexedDBService.clearActiveWorkout().pipe(
          tap(() => console.log('Active workout cleared from IndexedDB')),
          catchError(error => {
            console.error('Error clearing active workout from IndexedDB:', error);
            return of(undefined);
          })
        )
      );
    } catch (error) {
      console.error('Error in clearSavedSession:', error);
    }
  }

  removeExerciseFromWorkout(workoutId: string, exerciseId: string): Observable<Exercise[]> {
    const currentSession = this.getCurrentSession();
    if (!currentSession) {
      return throwError(() => new Error('No active session'));
    }
    
    const updatedExercises = currentSession.exercises.filter(
      ex => ex.exerciseId !== exerciseId
    );
    
    this.updateSession({
      ...currentSession,
      exercises: updatedExercises
    });
    
    this.saveCurrentSession();
    
    return of(updatedExercises);
  }

  removeSetFromExercise(exerciseIdOrTempId: string, setIndex: number): Observable<Exercise[]> {
    const currentSession = this.getCurrentSession();
    if (!currentSession) {
      return throwError(() => new Error('No active session'));
    }
    
    const updatedExercises = currentSession.exercises.map(exercise => {
      if ((exercise.exerciseId === exerciseIdOrTempId || exercise.tempId === exerciseIdOrTempId) && exercise.sets) {
        if (setIndex < 0 || setIndex >= exercise.sets.length) {
          return exercise;
        }
        
        const updatedSets = [
          ...exercise.sets.slice(0, setIndex),
          ...exercise.sets.slice(setIndex + 1)
        ];
        
        updatedSets.forEach((set, index) => {
          set.orderPosition = index;
        });
        
        return {
          ...exercise,
          sets: updatedSets
        };
      }
      return exercise;
    });
    
    this.updateSession({
      ...currentSession,
      exercises: updatedExercises
    });
    
    this.saveCurrentSession();
    
    return of(updatedExercises);
  }

  updateSession(session: WorkoutSession): void {
    this.currentSessionSubject.next(session);
    
    this.saveCurrentSession();
  }

  notifyWorkoutCompleted(): void {
    this.workoutCompletedSubject.next();
  }

  private startTimer(): void {
    this.stopTimer();
    
    this.timerSubscription = interval(1000).subscribe(() => {
      const session = this.currentSessionSubject.value;
      if (!session || session.isPaused) return;
      
      this.currentSessionSubject.next({
        ...session,
        elapsedTimeSeconds: session.elapsedTimeSeconds + 1
      });
    });
  }

  private stopTimer(): void {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = null;
    }
  }

  private setupAutoSave(): void {
    if (this.autoSaveInterval) clearInterval(this.autoSaveInterval);
    
    this.autoSaveInterval = setInterval(() => {
      const session = this.currentSessionSubject.value;
      if (session && !session.isPaused) {
        this.saveCurrentSession();
      }
    }, 30000);
  }

  syncWorkoutWithBackend(workoutId: string): Observable<Exercise[]> {
    const session = this.getCurrentSession();
    if (!session) {
      return throwError(() => new Error('No active session'));
    }
    
    const tempExercises = session.exercises.filter(e => e.tempId && !e.exerciseId);
    
    if (tempExercises.length === 0) {
      return this.syncSetsForExistingExercises(workoutId, session.exercises);
    }
    
    return from(tempExercises).pipe(
      concatMap(exercise => this.syncExerciseWithBackend(workoutId, exercise)),
      toArray(),
      switchMap(syncedExercises => {
        const idMap = new Map<string, string>();
        syncedExercises.forEach(ex => {
          if (ex.tempId && ex.exerciseId) {
            idMap.set(ex.tempId, ex.exerciseId);
          }
        });
        
        const updatedExercises = session.exercises.map(exercise => {
          const updatedEx = { ...exercise };
          
          if (exercise.tempId && idMap.has(exercise.tempId)) {
            updatedEx.exerciseId = idMap.get(exercise.tempId);
            updatedEx.tempId = undefined;
            
            if (updatedEx.sets) {
              updatedEx.sets = updatedEx.sets.map(set => {
                if (set.exerciseId === exercise.tempId) {
                  return { ...set, exerciseId: updatedEx.exerciseId };
                }
                return set;
              });
            }
          }
          
          return updatedEx;
        });
        
        this.updateSession({
          ...session,
          exercises: updatedExercises
        });
        
        return this.syncSetsForExistingExercises(workoutId, updatedExercises);
      })
    );
  }

  syncSetsForExistingExercises(workoutId: string, exercises: Exercise[]): Observable<Exercise[]> {
    if (!exercises || exercises.length === 0) {
      console.log('No exercises to sync sets for');
      return of(exercises || []); 
    }
    
    let hasSetsWithoutExerciseId = false;
    exercises.forEach(exercise => {
      if (!exercise.sets) return;
    });
    
    if (hasSetsWithoutExerciseId) {
      console.error('Some sets have missing exerciseId! This will cause sync failures.');
    }
    
    const setOperations: Array<{
      exerciseId: string;
      exerciseName: string;
      setIndex: number;
      operation: Observable<ExerciseSet>;
    }> = [];
    
    exercises.forEach(exercise => {
      if (!exercise.exerciseId || !exercise.sets) return;
      
      if (exercise.exerciseId.toString().startsWith('temp-')) {
        console.warn(`Skipping sets for exercise with temp ID: ${exercise.exerciseId}`);
        return;
      }
      
      exercise.sets.forEach((set, index) => {
        if (!set.exerciseSetId || set.exerciseSetId.toString().startsWith('temp-')) {
          setOperations.push({
            exerciseId: exercise.exerciseId!,
            exerciseName: exercise.name || 'Unknown',
            setIndex: index,
            operation: this.syncSetWithBackend(workoutId, exercise.exerciseId!, set)
          });
        }
      });
    });
    
    if (setOperations.length === 0) {
      console.log('No sets to sync with backend');
      return of(exercises);
    }    
    const setObservables = setOperations.map(op => op.operation);
    
    return forkJoin(setObservables).pipe(
      map((syncedSets, index) => {
        
        const updatedExercises = [...exercises];
        
        syncedSets.forEach((syncedSet, i) => {
          const { exerciseId, setIndex } = setOperations[i];
          
          const exerciseIndex = updatedExercises.findIndex(ex => 
            ex.exerciseId === exerciseId
          );
          
          if (exerciseIndex !== -1 && updatedExercises[exerciseIndex].sets && 
              updatedExercises[exerciseIndex].sets!.length > setIndex) {
            updatedExercises[exerciseIndex].sets![setIndex] = {
              ...syncedSet,
              tempId: undefined
            };
            
            console.log(`Updated set at index ${setIndex} for exercise ${exerciseId} with ID ${syncedSet.exerciseSetId}`);
          }
        });
        
        return updatedExercises;
      }),
      tap(updatedExercises => {
        const currentSession = this.getCurrentSession();
        if (currentSession) {
          this.updateSession({
            ...currentSession,
            exercises: updatedExercises
          });
        }
      }),
      catchError(error => {
        console.error('Error syncing sets with backend:', error);
        return of(exercises);
      })
    );
  }

  syncExerciseWithBackend(workoutId: string, exercise: Exercise): Observable<Exercise> {
    if (exercise.exerciseId && !exercise.exerciseId.toString().startsWith('temp-')) {
      return of(exercise);
    }
    
    const originalTempId = exercise.tempId;
    
    const exercisePayload = {
      exerciseTemplateId: exercise.exerciseTemplateId,
      name: exercise.name,
      notes: exercise.notes || '',
      workoutId,
      orderPosition: exercise.orderPosition || 0
    };
    
    console.log(`Syncing exercise to backend: ${exercise.name}`, exercisePayload);
    
    return this.http.post<any>(
      `${this.workoutApiUrl}/${workoutId}/exercises`,
      exercisePayload
    ).pipe(
      tap(response => console.log('Exercise sync response:', response)),
      map(response => {
        const realExerciseId = response.exerciseId;
        
        if (!realExerciseId) {
          console.error('No exerciseId returned from backend, response:', response);
          return exercise;
        }
        
        console.log(`Received real exerciseId: ${realExerciseId} for exercise "${exercise.name}"`);
        
        const updatedExercise = {
          ...exercise,
          exerciseId: realExerciseId,
          tempId: undefined
        };
        

        if (originalTempId && updatedExercise.sets) {
          console.log(`Updating ${updatedExercise.sets.length} sets to reference real exerciseId ${realExerciseId}`);
          
          updatedExercise.sets = updatedExercise.sets.map(set => {
            if (set.exerciseId === originalTempId) {
              console.log(`Updating set reference from tempId ${originalTempId} to real ID ${realExerciseId}`);
              return {
                ...set,
                exerciseId: realExerciseId
              };
            }
            return set;
          });
          
          console.log('Updated sets:', updatedExercise.sets);
        }
        
        return updatedExercise;
      },
      catchError(error => {
        console.error(`Error syncing exercise ${exercise.name}:`, error);
        return of(exercise);
      })
    ));
  }

  private ensureSetExerciseIds(exercises: Exercise[]): Exercise[] {
    return exercises.map(exercise => {
      const exerciseRef = exercise.exerciseId || exercise.tempId;
      
      if (!exerciseRef || !exercise.sets) return exercise;
      
      let needsUpdate = false;
      const updatedSets = exercise.sets.map(set => {
        if (!set.exerciseId) {
          needsUpdate = true;
          return { ...set, exerciseId: exerciseRef };
        }
        return set;
      });
      
      if (needsUpdate) {
        return { ...exercise, sets: updatedSets };
      }
      
      return exercise;
    });
  }

  updateSetPropertyWithSync(
    workoutId: string,
    exerciseId: string,
    setId: string,
    property: string,
    value: any
  ): Observable<ExerciseSet> {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) {
      return throwError(() => new Error('No active session'));
    }
    
    let setToUpdate: ExerciseSet | undefined;
    let exerciseWithSet: Exercise | undefined;
    
    currentSession.exercises.forEach(exercise => {
      if (exercise.sets) {
        const foundSet = exercise.sets.find(s => 
          s.exerciseSetId === setId || s.tempId === setId
        );
        if (foundSet) {
          setToUpdate = foundSet;
          exerciseWithSet = exercise;
        }
      }
    });
    
    if (!setToUpdate || !exerciseWithSet) {
      return throwError(() => new Error(`Set not found: ${setId}`));
    }
    
    if (!setToUpdate.exerciseSetId || setToUpdate.exerciseSetId.toString().startsWith('temp-')) {
      this.updateSetProperty(setId, property, value);
      return of({...setToUpdate, [property]: value});
    }
    
    console.log(`Updating set ${setId}, ${property}=${value}`);
    
    const payload = {
      exerciseSetId: setToUpdate.exerciseSetId,
      exerciseId: exerciseWithSet.exerciseId,
      type: setToUpdate.type || 'NORMAL',
      reps: property === 'reps' ? value : setToUpdate.reps || 0,
      weight: property === 'weight' ? value : setToUpdate.weight || 0,
      restTimeSeconds: property === 'restTimeSeconds' ? value : setToUpdate.restTimeSeconds || 0,
      orderPosition: setToUpdate.orderPosition || 0
    };
    
    console.log('Sending set update to backend:', payload);
    
    return this.http.put<ExerciseSet>(
      `${this.workoutApiUrl}/${workoutId}/exercises/${exerciseWithSet.exerciseId}/sets/${setToUpdate.exerciseSetId}`,
      payload
    ).pipe(
      tap(response => {
        console.log('Backend update successful:', response);
        this.updateSetProperty(setId, property, value);
      }),
      catchError(error => {
        console.error('Error updating set:', error);
        this.updateSetProperty(setId, property, value);
        return throwError(() => new Error('Failed to update set on server'));
      })
    );
  }
}
