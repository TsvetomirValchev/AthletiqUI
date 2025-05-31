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

// Define the WorkoutSession interface
interface WorkoutSession {
  workout: Workout;
  exercises: Exercise[];
  startTime: string;
  elapsedTimeSeconds: number;
  isPaused: boolean;
  lastPausedAt?: number;
  totalPausedSeconds: number;
}

@Injectable({
  providedIn: 'root'
})
export class ActiveWorkoutService {
  // API endpoint
  private workoutApiUrl = `${environment.apiUrl}/workouts`;
  
  // State management
  private currentSessionSubject = new BehaviorSubject<WorkoutSession | null>(null);
  private timerSubscription: Subscription | null = null;
  private autoSaveInterval: any = null;
  
  // Events
  private workoutCompletedSubject = new Subject<void>();
  public workoutCompleted$ = this.workoutCompletedSubject.asObservable();
  private workoutModifiedSubject = new Subject<string>();
  public workoutModified$ = this.workoutModifiedSubject.asObservable();

  constructor(
    private http: HttpClient,
    private indexedDBService: IndexedDBService
  ) {
    // Setup auto-save
    this.setupAutoSave();
  }

  // Observable getters
  get currentWorkout$(): Observable<Workout | null> {
    return this.currentSessionSubject.pipe(
      map(session => session?.workout || null),
      distinctUntilChanged((prev, curr) => prev?.workoutId === curr?.workoutId)
    );
  }

  // Workout state observable
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

  // Start a workout
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
            // First, get all exercises for this workout
            return this.http.get<Exercise[]>(`${this.workoutApiUrl}/${workout.workoutId}/exercises`).pipe(
              switchMap(exercises => {
                // Sort exercises by orderPosition
                const sortedExercises = [...exercises].sort(
                  (a, b) => (a.orderPosition ?? 0) - (b.orderPosition ?? 0)
                );
                
                // Create an array of observables to fetch sets for each exercise
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
                      // Sort sets by order position
                      const sortedSets = sets.sort((a, b) => 
                        (a.orderPosition ?? 0) - (b.orderPosition ?? 0));
                      
                      // Add completed property to each set
                      const setsWithCompleted = sortedSets.map(set => ({
                        ...set,
                        completed: false // Initialize completed to false
                      }));
  
                      // Return exercise with its sets
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
                
                // Wait for all exercise requests to complete
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

  // Get exercises for a workout
  getExercisesByWorkoutId(workoutId: string): Observable<Exercise[]> {
    const session = this.currentSessionSubject.value;
    if (session && session.workout.workoutId === workoutId) {
      // We already have the exercises with sets from the session
      console.log(`Using cached exercises for workout ${workoutId} with sets:`,
        session.exercises.map(e => `${e.name} (${e.sets?.length || 0} sets)`));
      
      // Sort exercises by orderPosition
      const sortedExercises = [...session.exercises].sort(
        (a, b) => (a.orderPosition ?? 0) - (b.orderPosition ?? 0)
      );
      return of(sortedExercises);
    }
    
    // If we don't have a session, we need to fetch exercises and their sets
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
        
        // Create an array of observables to fetch sets for each exercise
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
              // Sort sets by order position
              const sortedSets = sets.sort((a, b) => 
                (a.orderPosition ?? 0) - (b.orderPosition ?? 0));
            
              // Return exercise with its sets
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
        
        // Wait for all exercise requests to complete
        return forkJoin(exerciseRequests);
      }),
      catchError(error => {
        console.error(`Error getting exercises for workout ${workoutId}:`, error);
        
        // Try to get from local session
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

  // Add exercise to an active workout with proper set creation
  addExerciseToWorkout(workoutId: string, exercise: Exercise): Observable<Exercise[]> {
    const session = this.currentSessionSubject.value;
    if (!session) return throwError(() => new Error('No active session'));
    
    // Extract the sets from the exercise to use after exercise creation
    const exerciseSets = exercise.sets || [];
    
    // Create a payload without sets for the exercise
    const { sets, ...exerciseWithoutSets } = exercise;
    
    // First create the exercise on the backend
    return this.http.post<Exercise>(`${this.workoutApiUrl}/${workoutId}/exercises`, exerciseWithoutSets).pipe(
      switchMap(createdExercise => {
        console.log(`Created exercise with ID: ${createdExercise.exerciseId}`);
        
        // If no sets were provided, create at least one default set
        const setsToCreate = exerciseSets.length > 0 ? exerciseSets : [{
          type: SetType.NORMAL,
          orderPosition: 0,
          reps: 0,
          weight: 0,
          restTimeSeconds: 0,
          completed: false
        }];
        
        // Now create sets for this new exercise using the real exerciseId
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
            
            // Call the set creation endpoint
            return this.http.post<ExerciseSet>(
              `${this.workoutApiUrl}/${workoutId}/exercises/${createdExercise.exerciseId}/sets`,
              setPayload
            ).pipe(
              catchError(error => {
                console.error(`Error creating set for exercise ${createdExercise.exerciseId}:`, error);
                // Return a temporary set on error
                return of({
                  ...setPayload, 
                  tempId: `temp-set-${Date.now()}-${index}`
                });
              })
            );
          }),
          // Collect all created sets
          toArray(),
          // Return the exercise with its sets
          map(createdSets => {
            const exerciseWithSets = {
              ...createdExercise,
              sets: createdSets
            };
            
            // Add the new exercise to our session
            const updatedExercises = [...session.exercises, exerciseWithSets];
            
            // Update current session
            this.currentSessionSubject.next({
              ...session,
              exercises: updatedExercises
            });
            
            // Save the session
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

  // Add set to exercise (local only)
  addSetToExercise(exerciseIdOrTempId: string): Observable<Exercise[]> {
    if (!exerciseIdOrTempId) {
      return throwError(() => new Error('No exercise ID provided'));
    }
    
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) {
      return throwError(() => new Error('No active workout session'));
    }
    
    // Find the exercise by either real ID or temp ID
    const exerciseIndex = currentSession.exercises.findIndex(ex => 
      ex.exerciseId === exerciseIdOrTempId || ex.tempId === exerciseIdOrTempId
    );
    
    if (exerciseIndex === -1) {
      return throwError(() => new Error(`Exercise not found: ${exerciseIdOrTempId}`));
    }
    
    const exercise = currentSession.exercises[exerciseIndex];
    
    // Create a unique temporary ID for the new set
    const tempId = `temp-set-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Calculate the next order position using 0-based indexing
    const orderPosition = exercise.sets?.length || 0;
    
    // IMPORTANT: Use the exercise's ID or tempId for the set's exerciseId reference
    const exerciseReference = exercise.exerciseId || exercise.tempId;
    
    if (!exerciseReference) {
      return throwError(() => new Error('Exercise has no ID or tempId'));
    }
    
    console.log(`Adding set to exercise ${exercise.name} with reference ID: ${exerciseReference}`);
    
    // Create a new set with proper referencing
    const newSet: ExerciseSet = {
      exerciseId: exerciseReference, // Always set exerciseId of set to parent's ID
      tempId: tempId,
      type: SetType.NORMAL,
      orderPosition: orderPosition,
      reps: 0,
      weight: 0,
      restTimeSeconds: 0,
      completed: false
    };
    
    console.log('Created new set:', newSet);
    
    // Add the set to the exercise
    const updatedExercise = {
      ...exercise,
      sets: [...(exercise.sets || []), newSet]
    };
    
    // Update the exercises array
    const updatedExercises = [...currentSession.exercises];
    updatedExercises[exerciseIndex] = updatedExercise;
    
    // Update the current session
    const updatedSession = {
      ...currentSession,
      exercises: updatedExercises
    };
    
    // Update the behavior subject
    this.currentSessionSubject.next(updatedSession);
    
    // Save to storage immediately
    this.saveCurrentSession();

    // Return the updated exercises array
    return of(updatedExercises);
  }

  // Toggle set completion (local only)
  toggleSetCompletion(setId: string, completed: boolean): void {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) return;
    
    console.log(`Toggle set ${setId} completion to ${completed}`);
    
    let updated = false;
    const updatedExercises = currentSession.exercises.map(exercise => {
      if (!exercise.sets) return exercise;
      
      const updatedSets = exercise.sets.map(set => {
        // Check both exerciseSetId and tempId
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

  // Update set property (local only)
  updateSetProperty(setId: string, property: string, value: any): void {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) return;
    
    let updated = false;
    const updatedExercises = currentSession.exercises.map(exercise => {
      if (!exercise.sets) return exercise;
      
      const updatedSets = exercise.sets.map(set => {
        // Check both exerciseSetId and tempId
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

  // Add this new method to handle index-based operations
  updateSetPropertyByIndex(exerciseIdOrTempId: string, setIndex: number, property: string, value: any): void {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) return;
    
    let updated = false;
    const updatedExercises = currentSession.exercises.map(exercise => {
      // Match by either real ID or temp ID
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

  // Add methods to support set syncing with backend
  syncSetWithBackend(workoutId: string, exerciseId: string, set: ExerciseSet): Observable<ExerciseSet> {
    // If the set already has a real ID, don't sync it again
    if (set.exerciseSetId && !set.exerciseSetId.toString().startsWith('temp-')) {
      return of(set);
    }
    
    console.log(`Preparing to sync set with exerciseId ${exerciseId}`);
    
    // Make sure the set has the correct exerciseId
    const setToSync = {
      ...set,
      exerciseId // Ensure this is set correctly
    };
    
    // Remove properties that shouldn't be sent to backend
    const { tempId, completed, exerciseSetId, ...cleanSet } = setToSync;
    
    // Create the properly formatted payload for the backend
    const setPayload = {
      type: cleanSet.type || 'NORMAL',
      reps: cleanSet.reps || 0,
      weight: cleanSet.weight || 0,
      restTimeSeconds: cleanSet.restTimeSeconds || 0,
      orderPosition: cleanSet.orderPosition || 0,
      exerciseId: exerciseId // Important: ensure this is included
    };
    
    console.log(`Syncing set to backend for exercise ${exerciseId}, payload:`, setPayload);
    
    // Send to backend
    return this.http.post<any>(
      `${this.workoutApiUrl}/${workoutId}/exercises/${exerciseId}/sets`,
      setPayload
    ).pipe(
      tap(response => console.log('Set sync response:', response)),
      map(response => {
        // Get the ID from the response
        const backendId = response.exerciseSetId || response.id;
        
        if (!backendId) {
          console.error('No set ID returned from backend, response:', response);
        }
        
        // Return updated set with the backend ID
        return {
          ...set,
          exerciseId, // Make sure exerciseId is preserved
          exerciseSetId: backendId,
          tempId: undefined // Clear tempId as we now have a real ID
        };
      }),
      catchError(error => {
        console.error(`Error syncing set for exercise ${exerciseId}:`, error);
        console.error('Failed set payload:', setPayload);
        return of(set); // Return original set on error
      })
    );
  }

  // Add this method to prepare sets for sending to backend
  prepareSetsForBackend(sets: ExerciseSet[] | undefined): any[] {
    if (!sets || sets.length === 0) return [];
    
    return sets.map((set, index) => {
      // Remove properties that shouldn't be sent
      const { tempId, completed, ...cleanSet } = set;
      
      return {
        ...cleanSet,
        orderPosition: index // Ensure correct ordering
      };
    });
  }

  // Get current session
  getCurrentSession(): WorkoutSession | null {
    return this.currentSessionSubject.value;
  }

  // Save to storage
  saveCurrentSession(): void {
    const session = this.currentSessionSubject.value;
    if (!session || !session.workout || !session.workout.workoutId) return;
    
    // Fix any sets that might be missing exerciseId
    const exercisesWithProperSets = this.ensureSetExerciseIds(session.exercises);
    
    // Create a directly serializable session with fixed sets
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
    
    // Save to IndexedDB
    this.indexedDBService.saveActiveWorkout(serialized).subscribe({
      next: () => console.log('Workout session saved to IndexedDB with fixed exerciseIds'),
      error: (error) => console.error('Error saving workout to IndexedDB:', error)
    });
  }

  // Load saved session
  loadSavedSession(): Observable<boolean> {
    // First try IndexedDB
    return this.indexedDBService.getActiveWorkout().pipe(
      switchMap(savedSession => {
        if (savedSession) {
          console.log('Found saved workout session in IndexedDB');
          
          // Create a proper session object from the saved data
          const session: WorkoutSession = {
            workout: savedSession.workout,
            exercises: savedSession.exercises || [],
            startTime: savedSession.startTime,
            elapsedTimeSeconds: savedSession.elapsedTimeSeconds || 0,
            isPaused: savedSession.isPaused || false,
            lastPausedAt: savedSession.lastPausedAt,
            totalPausedSeconds: savedSession.totalPausedSeconds || 0
          };
          
          // Update the session in memory
          this.currentSessionSubject.next(session);
          
          // If not paused, start the timer
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

  // Clear saved session
  async clearSavedSession(): Promise<void> {
    // First clear the current session in memory
    this.currentSessionSubject.next(null);
    
    console.log('Clearing active workout from storage');
    
    // Use firstValueFrom instead of toPromise()
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

  // Remove an exercise from a workout (local only)
  removeExerciseFromWorkout(workoutId: string, exerciseId: string): Observable<Exercise[]> {
    const currentSession = this.getCurrentSession();
    if (!currentSession) {
      return throwError(() => new Error('No active session'));
    }
    
    // Update local state first for immediate UI feedback
    const updatedExercises = currentSession.exercises.filter(
      ex => ex.exerciseId !== exerciseId
    );
    
    // Update the session with the new exercises
    this.updateSession({
      ...currentSession,
      exercises: updatedExercises
    });
    
    // Save session to persist changes
    this.saveCurrentSession();
    
    // Return the updated list
    return of(updatedExercises);
  }

  // Remove a set from an exercise (local only)
  removeSetFromExercise(exerciseIdOrTempId: string, setIndex: number): Observable<Exercise[]> {
    const currentSession = this.getCurrentSession();
    if (!currentSession) {
      return throwError(() => new Error('No active session'));
    }
    
    // Find the exercise to update
    const updatedExercises = currentSession.exercises.map(exercise => {
      if ((exercise.exerciseId === exerciseIdOrTempId || exercise.tempId === exerciseIdOrTempId) && exercise.sets) {
        // Make sure the index is valid
        if (setIndex < 0 || setIndex >= exercise.sets.length) {
          return exercise;
        }
        
        // Create a new array without the set at the specified index
        const updatedSets = [
          ...exercise.sets.slice(0, setIndex),
          ...exercise.sets.slice(setIndex + 1)
        ];
        
        // Update order positions
        updatedSets.forEach((set, index) => {
          set.orderPosition = index;
        });
        
        // Return the updated exercise
        return {
          ...exercise,
          sets: updatedSets
        };
      }
      return exercise;
    });
    
    // Update the session with the new exercises
    this.updateSession({
      ...currentSession,
      exercises: updatedExercises
    });
    
    // Save session to persist changes
    this.saveCurrentSession();
    
    // Return the updated list
    return of(updatedExercises);
  }

  // Helper method to update the session
  updateSession(session: WorkoutSession): void {
    // Update the behavior subject
    this.currentSessionSubject.next(session);
    
    // Save the updated session to storage
    this.saveCurrentSession();
  }

  // Notify workout completed
  notifyWorkoutCompleted(): void {
    this.workoutCompletedSubject.next();
  }

  // Timer methods
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

  // Auto-save methods
  private setupAutoSave(): void {
    if (this.autoSaveInterval) clearInterval(this.autoSaveInterval);
    
    this.autoSaveInterval = setInterval(() => {
      const session = this.currentSessionSubject.value;
      if (session && !session.isPaused) {
        this.saveCurrentSession();
      }
    }, 30000); // Save every 30 seconds
  }

  // Simplified sync method
  syncWorkoutWithBackend(workoutId: string): Observable<Exercise[]> {
    const session = this.getCurrentSession();
    if (!session) {
      return throwError(() => new Error('No active session'));
    }
    
    // First sync any exercises with temp IDs
    const tempExercises = session.exercises.filter(e => e.tempId && !e.exerciseId);
    
    if (tempExercises.length === 0) {
      // If no temp exercises, simply sync the sets
      return this.syncSetsForExistingExercises(workoutId, session.exercises);
    }
    
    // Process temp exercises sequentially
    return from(tempExercises).pipe(
      concatMap(exercise => this.syncExerciseWithBackend(workoutId, exercise)),
      toArray(),
      switchMap(syncedExercises => {
        // Create a map of temp to real IDs
        const idMap = new Map<string, string>();
        syncedExercises.forEach(ex => {
          if (ex.tempId && ex.exerciseId) {
            idMap.set(ex.tempId, ex.exerciseId);
          }
        });
        
        // Update all exercises with real IDs
        const updatedExercises = session.exercises.map(exercise => {
          const updatedEx = { ...exercise };
          
          // Replace temp IDs with real ones
          if (exercise.tempId && idMap.has(exercise.tempId)) {
            updatedEx.exerciseId = idMap.get(exercise.tempId);
            updatedEx.tempId = undefined;
            
            // Also update any sets referring to the temp ID
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
        
        // Update session storage
        this.updateSession({
          ...session,
          exercises: updatedExercises
        });
        
        // Sync the sets
        return this.syncSetsForExistingExercises(workoutId, updatedExercises);
      })
    );
  }

  // Add helper method to sync sets for exercises
  syncSetsForExistingExercises(workoutId: string, exercises: Exercise[]): Observable<Exercise[]> {
    // Check for empty exercises array early
    if (!exercises || exercises.length === 0) {
      console.log('No exercises to sync sets for');
      return of(exercises || []); 
    }
    
    // DEBUG: Check for sets with missing exerciseId
    let hasSetsWithoutExerciseId = false;
    exercises.forEach(exercise => {
      if (!exercise.sets) return;
      
      exercise.sets.forEach((set, idx) => {
        if (!set.exerciseId) {
          hasSetsWithoutExerciseId = true;
          console.error(`Found set at index ${idx} in exercise ${exercise.name} without exerciseId!`, set);
        } else if (set.exerciseId.toString().startsWith('temp-')) {
          console.warn(`Set has temp exerciseId: ${set.exerciseId} - may need updating to real ID`);
        }
      });
    });
    
    if (hasSetsWithoutExerciseId) {
      console.error('Some sets have missing exerciseId! This will cause sync failures.');
    }
    
    // Create operations for each set that needs to be synced
    const setOperations: Array<{
      exerciseId: string;
      exerciseName: string;
      setIndex: number;
      operation: Observable<ExerciseSet>;
    }> = [];
    
    exercises.forEach(exercise => {
      if (!exercise.exerciseId || !exercise.sets) return;
      
      // Skip exercises with temp IDs at this stage
      if (exercise.exerciseId.toString().startsWith('temp-')) {
        console.warn(`Skipping sets for exercise with temp ID: ${exercise.exerciseId}`);
        return;
      }
      
      exercise.sets.forEach((set, index) => {
        // Only sync sets that don't have a real ID yet
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
      return of(exercises); // Return original exercises array, never null
    }
    
    console.log(`Syncing ${setOperations.length} sets with backend`);
    
    // Create array of just the observables for forkJoin
    const setObservables = setOperations.map(op => op.operation);
    
    // Wait for all set operations to complete
    return forkJoin(setObservables).pipe(
      map((syncedSets, index) => {
        console.log('All sets synced successfully');
        
        // Update all exercises with the synced sets
        const updatedExercises = [...exercises];
        
        // Map each synced set back to its original position
        syncedSets.forEach((syncedSet, i) => {
          const { exerciseId, setIndex } = setOperations[i];
          
          // Find the exercise to update
          const exerciseIndex = updatedExercises.findIndex(ex => 
            ex.exerciseId === exerciseId
          );
          
          if (exerciseIndex !== -1 && updatedExercises[exerciseIndex].sets && 
              updatedExercises[exerciseIndex].sets!.length > setIndex) {
            // Update the set with its real ID
            updatedExercises[exerciseIndex].sets![setIndex] = {
              ...syncedSet,
              tempId: undefined // Clear tempId
            };
            
            console.log(`Updated set at index ${setIndex} for exercise ${exerciseId} with ID ${syncedSet.exerciseSetId}`);
          }
        });
        
        return updatedExercises; // Always return the updated exercises array
      }),
      tap(updatedExercises => {
        // Update the session with all synced sets
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
        return of(exercises); // Return original exercises on error, never null
      })
    );
  }

  // Updated syncExerciseWithBackend method to work with the refactored API
  syncExerciseWithBackend(workoutId: string, exercise: Exercise): Observable<Exercise> {
    // If the exercise already has a real ID, don't sync it again
    if (exercise.exerciseId && !exercise.exerciseId.toString().startsWith('temp-')) {
      return of(exercise);
    }
    
    // Store the original tempId for reference
    const originalTempId = exercise.tempId;
    
    console.log(`Preparing to sync exercise "${exercise.name}" with tempId ${originalTempId}`);
    console.log('Exercise sets before sync:', exercise.sets);
    
    // Create payload for backend - send only necessary fields
    const exercisePayload = {
      exerciseTemplateId: exercise.exerciseTemplateId,
      name: exercise.name,
      notes: exercise.notes || '',
      workoutId,
      orderPosition: exercise.orderPosition || 0
    };
    
    console.log(`Syncing exercise to backend: ${exercise.name}`, exercisePayload);
    
    // Send to backend
    return this.http.post<any>(
      `${this.workoutApiUrl}/${workoutId}/exercises`,
      exercisePayload
    ).pipe(
      tap(response => console.log('Exercise sync response:', response)),
      map(response => {
        // Get the real exercise ID from the response
        const realExerciseId = response.exerciseId;
        
        if (!realExerciseId) {
          console.error('No exerciseId returned from backend, response:', response);
          return exercise;
        }
        
        console.log(`Received real exerciseId: ${realExerciseId} for exercise "${exercise.name}"`);
        
        // Create updated exercise with real ID but keep original sets
        const updatedExercise = {
          ...exercise,
          exerciseId: realExerciseId,
          tempId: undefined // Clear tempId now that we have a real ID
        };
        
        // Update all sets that were associated with this exercise via tempId
        if (originalTempId && updatedExercise.sets) {
          console.log(`Updating ${updatedExercise.sets.length} sets to reference real exerciseId ${realExerciseId}`);
          
          updatedExercise.sets = updatedExercise.sets.map(set => {
            // If this set was referencing the exercise's tempId, update it to use the real ID
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
        return of(exercise); // Return the original exercise on error
      })
    ));
  }

  // Add this helper method
  private ensureSetExerciseIds(exercises: Exercise[]): Exercise[] {
    return exercises.map(exercise => {
      const exerciseRef = exercise.exerciseId || exercise.tempId;
      
      if (!exerciseRef || !exercise.sets) return exercise;
      
      // Check if any sets are missing exerciseId
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

  // Update set properties with backend sync
  updateSetPropertyWithSync(
    workoutId: string,
    exerciseId: string,
    setId: string,
    property: string,
    value: any
  ): Observable<ExerciseSet> {
    // First update locally for immediate UI feedback
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) {
      return throwError(() => new Error('No active session'));
    }
    
    // Find the set to update
    let setToUpdate: ExerciseSet | undefined;
    let exerciseWithSet: Exercise | undefined;
    
    // First find the set in our local state
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
    
    // Skip backend sync for sets with temp IDs
    if (!setToUpdate.exerciseSetId || setToUpdate.exerciseSetId.toString().startsWith('temp-')) {
      // Just update locally
      this.updateSetProperty(setId, property, value);
      return of({...setToUpdate, [property]: value});
    }
    
    // For real sets, send to backend
    console.log(`Updating set ${setId}, ${property}=${value}`);
    
    // Create the full payload with all current properties
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
    
    // Use the new endpoint
    return this.http.put<ExerciseSet>(
      `${this.workoutApiUrl}/${workoutId}/exercises/${exerciseWithSet.exerciseId}/sets/${setToUpdate.exerciseSetId}`,
      payload
    ).pipe(
      tap(response => {
        console.log('Backend update successful:', response);
        
        // Also update locally
        this.updateSetProperty(setId, property, value);
      }),
      catchError(error => {
        console.error('Error updating set:', error);
        // Still update locally even if backend fails
        this.updateSetProperty(setId, property, value);
        return throwError(() => new Error('Failed to update set on server'));
      })
    );
  }
}
