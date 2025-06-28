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
                    
                    const exercisesWithRestTimes = exercisesWithSets.map(exercise => {
                      if (exercise.sets && exercise.sets.length > 0) {
                        const firstSetRestTime = exercise.sets[0].restTimeSeconds;
                        console.log(`Setting ${exercise.name} rest time to ${firstSetRestTime}s`);
                        return {
                          ...exercise,
                          restTimeSeconds: firstSetRestTime
                        };
                      }
                      return exercise;
                    });
                    
                    const session: WorkoutSession = {
                      workout: fetchedWorkout,
                      exercises: exercisesWithRestTimes,
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
        const exercisesWithRestTimes = [...session.exercises].map(exercise => {
        if (exercise.sets && exercise.sets.length > 0) {
          const firstSetRestTime = exercise.sets[0].restTimeSeconds;
          console.log(`Exercise ${exercise.name}: Using rest time ${firstSetRestTime}s from first set`);
          return {
            ...exercise,
            restTimeSeconds: firstSetRestTime
          };
        }
        return exercise;
      });
      
      const sortedExercises = exercisesWithRestTimes.sort(
        (a, b) => (a.orderPosition ?? 0) - (b.orderPosition ?? 0)
      );
      return of(sortedExercises);
    }
    
    console.log(`Fetching exercises for workout ${workoutId} from API`);
    return this.http.get<Exercise[]>(`${this.workoutApiUrl}/${workoutId}/exercises`).pipe(
      switchMap(exercises => {
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
        
        return forkJoin(exerciseRequests).pipe(
          map(exercisesWithSets => {
            return exercisesWithSets.map(exercise => {
              if (exercise.sets && exercise.sets.length > 0) {
                const firstSetRestTime = exercise.sets[0].restTimeSeconds;
                console.log(`Exercise ${exercise.name}: Setting rest time to ${firstSetRestTime}s from first set`);
                return {
                  ...exercise,
                  restTimeSeconds: firstSetRestTime
                };
              }
              return exercise;
            });
          })
        );
      }),
      catchError(error => {
        console.error(`Error getting exercises for workout ${workoutId}:`, error);
        
        const currentSession = this.currentSessionSubject.value;
        if (currentSession && currentSession.workout.workoutId === workoutId) {
          const exercisesWithRestTimes = [...currentSession.exercises].map(exercise => {
            if (exercise.sets && exercise.sets.length > 0) {
              return {
                ...exercise,
                restTimeSeconds: exercise.sets[0].restTimeSeconds
              };
            }
            return exercise;
          });
          
          const sortedExercises = exercisesWithRestTimes.sort(
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
    
    const tempId = `temp-exercise-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    const exerciseSets = exercise.sets || [];
    
    const newExercise: Exercise = {
      ...exercise,
      exerciseId: undefined,
      tempId: tempId,
      sets: exerciseSets.length > 0 ? exerciseSets.map((set, index) => ({
        ...set,
        tempId: `temp-set-${Date.now()}-${index}`,
        exerciseId: tempId,
        orderPosition: index
      })) : [{
        type: SetType.NORMAL,
        tempId: `temp-set-${Date.now()}-0`,
        exerciseId: tempId,
        orderPosition: 0,
        reps: 0,
        weight: 0,
        restTimeSeconds: 0,
        completed: false
      }]
    };
    
    console.log('Added temporary exercise to active workout:', newExercise);
    
    const updatedExercises = [...session.exercises, newExercise];
    
    this.currentSessionSubject.next({
      ...session,
      exercises: updatedExercises
    });
    
    this.saveCurrentSession();
    
    return of(updatedExercises);
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

  removeExerciseFromWorkout(workoutId: string, exerciseIdOrTempId: string): Observable<Exercise[]> {
    const currentSession = this.getCurrentSession();
    if (!currentSession) {
      return throwError(() => new Error('No active session'));
    }

    const exerciseIndex = currentSession.exercises.findIndex(ex => 
      ex.exerciseId === exerciseIdOrTempId || ex.tempId === exerciseIdOrTempId
    );

    if (exerciseIndex === -1) {
      return throwError(() => new Error(`Exercise not found: ${exerciseIdOrTempId}`));
    }

    const updatedExercises = [...currentSession.exercises];
    updatedExercises.splice(exerciseIndex, 1);

    updatedExercises.forEach((ex, idx) => {
      ex.orderPosition = idx;
    });

    this.currentSessionSubject.next({
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
    
    const exerciseIndex = currentSession.exercises.findIndex(ex => 
      ex.exerciseId === exerciseIdOrTempId || ex.tempId === exerciseIdOrTempId
    );

    if (exerciseIndex === -1) {
      return throwError(() => new Error(`Exercise not found: ${exerciseIdOrTempId}`));
    }

    const exercise = currentSession.exercises[exerciseIndex];
    if (!exercise.sets || setIndex >= exercise.sets.length) {
      return throwError(() => new Error(`Invalid set index: ${setIndex}`));
    }

    const updatedSets = [...exercise.sets];
    updatedSets.splice(setIndex, 1);

    updatedSets.forEach((s, idx) => {
      s.orderPosition = idx;
    });

    const updatedExercise = {
      ...exercise,
      sets: updatedSets
    };

    const updatedExercises = [...currentSession.exercises];
    updatedExercises[exerciseIndex] = updatedExercise;

    this.currentSessionSubject.next({
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
}
