import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError, interval, of, Subscription, from, Subject } from 'rxjs';
import { catchError, map, switchMap, concatMap, distinctUntilChanged, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { ActiveWorkout } from '../models/active-workout.model';
import { Exercise } from '../models/exercise.model';
import { ExerciseSet } from '../models/exercise-set.model';
import { Workout } from '../models/workout.model';
import { StorageService } from './storage.service';
import { SetType } from '../models/set-type.enum';
import { IndexedDBService } from './indexed-db.service';

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

// Define the structure for pending operations
interface PendingOperation {
  type: 'exercise' | 'set';
  exerciseId?: string;
  tempId: string;
  payload: any;
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
  
  // Visibility tracking
  private readonly VISIBILITY_STORAGE_KEY = 'workout_visibility_state';
  
  // Events
  private workoutCompletedSubject = new Subject<void>();
  public workoutCompleted$ = this.workoutCompletedSubject.asObservable();
  private workoutModifiedSubject = new Subject<string>();
  public workoutModified$ = this.workoutModifiedSubject.asObservable();

  // Pending operations queue
  private pendingOperations: PendingOperation[] = [];

  constructor(
    private http: HttpClient,
    private storage: StorageService,
    private indexedDBService: IndexedDBService // Add this
  ) {
    // Setup cross-tab synchronization
    window.addEventListener('storage', (event) => {
      if (event.key === 'activeWorkoutSession' && event.newValue) {
        this.handleExternalStorageChange(event.newValue);
      }
    });
    
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
  workoutState$ = this.currentSessionSubject.pipe(
    map(session => ({
      isActive: !!session,
      isPaused: !session || session.isPaused,
      elapsedTimeSeconds: session?.elapsedTimeSeconds || 0
    }))
  );

  get elapsedTime$(): Observable<number> {
    return this.workoutState$.pipe(map(state => state.elapsedTimeSeconds));
  }

  get isPaused$(): Observable<boolean> {
    return this.workoutState$.pipe(map(state => state.isPaused));
  }

  // Get active workouts
  getActiveWorkouts(): Observable<ActiveWorkout[]> {
    return this.currentSessionSubject.pipe(
      map(session => {
        if (!session) return [];
        return [{
          ...session.workout,
          startTime: session.startTime
        }];
      })
    );
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
            return this.http.get<Exercise[]>(`${this.workoutApiUrl}/${workout.workoutId}/exercises`).pipe(
              map(exercises => {
                // Sort exercises by orderPosition before creating the session
                const sortedExercises = [...exercises].sort(
                  (a, b) => (a.orderPosition ?? 0) - (b.orderPosition ?? 0)
                );
                
                console.log('Sorted exercises by orderPosition:', 
                  sortedExercises.map(e => `${e.name || e.name} (order: ${e.orderPosition})`));
                
                const session: WorkoutSession = {
                  workout: fetchedWorkout,
                  exercises: sortedExercises,
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

  // Finish the workout
  finishWorkout(id: string): Observable<ActiveWorkout> {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) {
      return throwError(() => new Error('No active workout'));
    }
    
    this.stopTimer();
    this.clearAutoSave();
    
    const elapsedTimeSeconds = currentSession.elapsedTimeSeconds;
    
    // Format duration in ISO8601
    const hours = Math.floor(elapsedTimeSeconds / 3600);
    const minutes = Math.floor((elapsedTimeSeconds % 3600) / 60);
    const seconds = elapsedTimeSeconds % 60;
    
    let duration = 'PT';
    if (hours > 0) duration += `${hours}H`;
    if (minutes > 0) duration += `${minutes}M`;
    if (seconds > 0 || (hours === 0 && minutes === 0)) duration += `${seconds}S`;
    
    const finishedWorkout: ActiveWorkout = {
      ...currentSession.workout,
      workoutId: currentSession.workout.workoutId,
      startTime: currentSession.startTime,
      endTime: new Date().toISOString(),
      duration: duration
    };
    
    // Process all pending operations before completing
    this.processPendingOperations(id);
    
    // Get exercises with current state
    const exercises = this.applyLocalChangesToExercises(currentSession.exercises);
    
    // Clear current session
    this.currentSessionSubject.next(null);
    this.clearSavedSession();
    
    // Notify completion
    this.workoutCompletedSubject.next();
    
    return of(finishedWorkout);
  }

  // Get exercises for a workout
  getExercisesByWorkoutId(workoutId: string): Observable<Exercise[]> {
    const session = this.currentSessionSubject.value;
    if (session && session.workout.workoutId === workoutId) {
      return of(this.applyLocalChangesToExercises(session.exercises));
    }
    
    return this.http.get<Exercise[]>(`${this.workoutApiUrl}/${workoutId}/exercises`).pipe(
      map(exercises => this.applyLocalChangesToExercises(exercises)),
      catchError(error => {
        console.error(`Error getting exercises for workout ${workoutId}:`, error);
        
        // Try to get from local session
        const currentSession = this.currentSessionSubject.value;
        if (currentSession && currentSession.workout.workoutId === workoutId) {
          return of(this.applyLocalChangesToExercises(currentSession.exercises));
        }
        
        return throwError(() => new Error(`Failed to get exercises for workout ${workoutId}`));
      })
    );
  }

  // Add exercise to an active workout
  addExerciseToWorkout(workoutId: string, exercise: Exercise): Observable<Exercise[]> {
    const session = this.currentSessionSubject.value;
    if (!session) return throwError(() => new Error('No active session'));
    
    // Create temporary ID for local tracking
    const tempExerciseId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Clean copy for API
    const exerciseForApi = {
      ...exercise,
      exerciseId: undefined,
      sets: [],
      // Make sure we have the correct workoutId
      workoutId: workoutId
    };
    
    // Version with temp ID for UI
    const tempExercise: Exercise = {
      ...exercise,
      exerciseId: tempExerciseId,
      sets: []
    };
    
    console.log(`Adding exercise to workout ${workoutId} with temp ID: ${tempExerciseId}`);
    
    // Update local state first for immediate UI feedback
    const updatedExercises = [...session.exercises, tempExercise];
    this.currentSessionSubject.next({
      ...session,
      exercises: updatedExercises
    });
    
    // Save session with temp exercise
    this.saveCurrentSession();
    
    // Immediately make the API call
    return this.http.post<Exercise>(`${this.workoutApiUrl}/${workoutId}/exercises`, exerciseForApi).pipe(
      map(backendExercise => {
        if (!backendExercise.exerciseId) {
          console.error('Backend returned exercise without ID', backendExercise);
          return updatedExercises;
        }
        
        // Replace temp ID with real ID
        const realIdExercises = session.exercises.map(ex => {
          if (ex.exerciseId === tempExerciseId) {
            return {
              ...ex,
              exerciseId: backendExercise.exerciseId
            };
          }
          return ex;
        });
        
        // Update session with real IDs
        this.currentSessionSubject.next({
          ...session,
          exercises: realIdExercises
        });
        
        // Save updated session
        this.saveCurrentSession();
        
        console.log(`Exercise added with real ID: ${backendExercise.exerciseId}`);
        
        // If there were sets added to this exercise while it was temporary,
        // process them now
        this.processPendingOperationsForExercise(tempExerciseId, backendExercise.exerciseId, workoutId);
        
        return realIdExercises;
      }),
      catchError(error => {
        console.error('Error adding exercise to workout:', error);
        // Keep temporary ID in case of error - will retry on save
        return of(updatedExercises);
      })
    );
  }

  // Add a set to an exercise
  addNewSet(exerciseId: string, orderPosition: number): Observable<ExerciseSet> {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) {
      return throwError(() => new Error('No active workout session'));
    }
    
    // Find the exercise
    const exerciseIndex = currentSession.exercises.findIndex(ex => ex.exerciseId === exerciseId);
    if (exerciseIndex === -1) {
      return throwError(() => new Error(`Exercise ${exerciseId} not found`));
    }
    
    const exercise = currentSession.exercises[exerciseIndex];
    const tempSetId = `temp-set-${exerciseId}-${Date.now()}`;
    
    // Create set for API
    const setForApi: ExerciseSet = {
      type: SetType.NORMAL,
      orderPosition: orderPosition,
      reps: 0,
      weight: 0,
      restTimeSeconds: 60,
      completed: false
    };
    
    // Create set with temp ID for local state
    const newSet: ExerciseSet = {
      ...setForApi,
      exerciseSetId: tempSetId,
      exerciseId: exerciseId
    };

    // Add locally first
    const updatedExercise = {
      ...exercise,
      sets: [...(exercise.sets || []), newSet]
    };
    
    const updatedExercises = [...currentSession.exercises];
    updatedExercises[exerciseIndex] = updatedExercise;
    
    // Update session with temp set
    this.currentSessionSubject.next({
      ...currentSession,
      exercises: updatedExercises
    });
    
    // Initialize completion status
    this.saveCurrentSession();
    
    // Check if the exercise has a temporary ID
    if (exerciseId.startsWith('temp-')) {
      console.log(`Exercise ${exerciseId} has a temp ID, queuing set for later`);
      
      // Queue the set creation for when the exercise gets a real ID
      this.pendingOperations.push({
        type: 'set',
        exerciseId: exerciseId,
        tempId: tempSetId,
        payload: setForApi
      });
      
      return of(newSet);
    }
    
    // For exercises with real IDs, create the set in the backend
    return this.http.post<ExerciseSet>(
      `${this.workoutApiUrl}/${currentSession.workout.workoutId}/exercises/${exerciseId}/sets`,
      setForApi
    ).pipe(
      map(backendSet => {
        // Update with real ID from backend
        const updatedExercises = currentSession.exercises.map(ex => {
          if (ex.exerciseId === exerciseId) {
            return {
              ...ex,
              sets: ex.sets?.map(set => {
                if (set.exerciseSetId === tempSetId) {                
                  return {
                    ...set,
                    exerciseSetId: backendSet.exerciseSetId
                  };
                }
                return set;
              })
            };
          }
          return ex;
        });
        
        // Update session with real set ID
        this.currentSessionSubject.next({
          ...currentSession,
          exercises: updatedExercises
        });
        
        this.saveCurrentSession();
        
        return {
          ...newSet,
          exerciseSetId: backendSet.exerciseSetId
        };
      }),
      catchError(error => {
        console.error(`Error adding set to exercise ${exerciseId}:`, error);
        // Return temp set on error - will retry on save
        return of(newSet);
      })
    );
  }

  // Toggle set completion - simplified version
  toggleSetCompletion(setId: string, completed: boolean): void {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) return;
    
    console.log(`Toggle set ${setId} completion to ${completed}`);
    
    let updated = false;
    const updatedExercises = currentSession.exercises.map(exercise => {
      if (!exercise.sets) return exercise;
      
      const updatedSets = exercise.sets.map(set => {
        if (set.exerciseSetId === setId) {
          updated = true;
          return { ...set, completed: completed };
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
      
      // Save to local storage right away
      this.saveCurrentSession();
    }
  }

  // Update set property
  updateSetProperty(setId: string, property: string, value: any): void {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) return;
    
    let updated = false;
    const updatedExercises = currentSession.exercises.map(exercise => {
      if (!exercise.sets) return exercise;
      
      const updatedSets = exercise.sets.map(set => {
        if (set.exerciseSetId === setId) {
          updated = true;
          return { ...set, [property]: value };
        }
        return set;
      });
      
      return { ...exercise, sets: updatedSets };
    });
    
    if (updated) {
      this.currentSessionSubject.next({
        ...currentSession,
        exercises: updatedExercises
      });
      this.saveCurrentSession();
    }
  }

  // Convenience methods
  updateSetWeight(setId: string, weight: number): void {
    this.updateSetProperty(setId, 'weight', weight);
  }

  updateSetReps(setId: string, reps: number): void {
    this.updateSetProperty(setId, 'reps', reps);
  }

  updateSetType(setId: string, type: SetType): void {
    this.updateSetProperty(setId, 'type', type);
  }

  // Get current session
  getCurrentSession(): WorkoutSession | null {
    return this.currentSessionSubject.value;
  }

  // Session persistence methods
  // Save to localStorage - simplified
  saveCurrentSession(): void {
    const session = this.currentSessionSubject.value;
    if (!session || !session.workout || !session.workout.workoutId) return;
    
    // Create a directly serializable session
    const serialized = {
      id: 'active_session',
      workout: session.workout,
      exercises: session.exercises,
      startTime: session.startTime,
      elapsedTimeSeconds: session.elapsedTimeSeconds,
      isPaused: session.isPaused,
      lastPausedAt: session.lastPausedAt,
      totalPausedSeconds: session.totalPausedSeconds,
      lastSaved: new Date().toISOString()
    };
    
    // Save to IndexedDB
    this.indexedDBService.saveActiveWorkout(serialized).subscribe({
      next: (success) => {
        if (success) {
          console.log('Workout saved to IndexedDB successfully');
        }
      },
      error: (error) => {
        console.error('Error saving to IndexedDB:', error);
        
        // Fallback to storage service
        this.storage.setItem('activeWorkoutSession', JSON.stringify(serialized))
          .catch(err => console.error('Error saving workout session:', err));
      }
    });
  }

  // Update loadSavedSession method
  loadSavedSession(): Observable<boolean> {
    // First try IndexedDB
    return this.indexedDBService.getActiveWorkout().pipe(
      switchMap(savedSession => {
        if (savedSession) {
          try {
            // Create a new session with the loaded data
            const session: WorkoutSession = {
              workout: savedSession.workout,
              exercises: savedSession.exercises || [],
              startTime: savedSession.startTime,
              elapsedTimeSeconds: savedSession.elapsedTimeSeconds || 0,
              isPaused: savedSession.isPaused !== false, 
              lastPausedAt: savedSession.lastPausedAt,
              totalPausedSeconds: savedSession.totalPausedSeconds || 0
            };
            
            // Set the current session
            this.currentSessionSubject.next(session);
            
            // Start timer if session is not paused
            if (!session.isPaused) {
              this.startTimer();
            }
            
            console.log('Session loaded from IndexedDB:', session);
            return of(true);
          } catch (error) {
            console.error('Error parsing IndexedDB session:', error);
          }
        }
        
        // If IndexedDB failed, try localStorage as fallback
        return from(this.storage.getItem('activeWorkoutSession')).pipe(
          map(localStorageSession => {
            if (!localStorageSession) {
              console.log('No saved session found in localStorage');
              return false;
            }
            
            try {
              // Parse the saved session
              const sessionData = JSON.parse(localStorageSession);
              
              // Create a new session with the loaded data
              const session: WorkoutSession = {
                workout: sessionData.workout,
                exercises: sessionData.exercises || [],
                startTime: sessionData.startTime,
                elapsedTimeSeconds: sessionData.elapsedTimeSeconds || 0,
                isPaused: sessionData.isPaused !== false, 
                lastPausedAt: sessionData.lastPausedAt,
                totalPausedSeconds: sessionData.totalPausedSeconds || 0
              };
              
              // Set the current session
              this.currentSessionSubject.next(session);
              
              // Start timer if session is not paused
              if (!session.isPaused) {
                this.startTimer();
              }
              
              console.log('Session loaded from localStorage:', session);
              return true;
            } catch (error) {
              console.error('Error parsing saved session:', error);
              return false;
            }
          }),
          catchError(() => of(false))
        );
      })
    );
  }

  clearSavedSession(): Promise<void> {
    // First clear the current session in memory
    this.currentSessionSubject.next(null);
    
    console.log('Clearing active workout from storage');
    
    // Clear from IndexedDB
    return this.indexedDBService.clearActiveWorkout()
      .pipe(
        switchMap(success => {
          if (success) {
            console.log('Active workout successfully cleared from IndexedDB');
          } else {
            console.warn('Failed to clear from IndexedDB, falling back to localStorage');
          }
          
          // Also clear from localStorage as fallback/redundancy
          return from(this.storage.removeItem('activeWorkoutSession'));
        }),
        tap(() => {
          // Also clear any related state
          localStorage.removeItem(this.VISIBILITY_STORAGE_KEY);
          console.log('Active workout successfully cleared from all storage');
          
          // Force notification that workout is completed
          this.notifyWorkoutCompleted();
        }),
        catchError(error => {
          console.error('Error clearing active workout from storage:', error);
          // Rethrow to allow caller to handle
          return throwError(() => error);
        })
      ).toPromise();
  }

  // Add this method to notify completion
  notifyWorkoutCompleted(): void {
    // Emit an event that can be listened to by components
    this.workoutCompletedSubject.next();
  }

  // Timer methods
  private startTimer(): void {
    this.stopTimer();
    
    this.timerSubscription = interval(1000).subscribe(() => {
      const currentSession = this.currentSessionSubject.value;
      if (!currentSession || currentSession.isPaused) return;
      
      this.currentSessionSubject.next({
        ...currentSession,
        elapsedTimeSeconds: currentSession.elapsedTimeSeconds + 1
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
      if (this.currentSessionSubject.value) {
        this.saveCurrentSession();
      }
    }, 30000);
  }

  private clearAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  // Helper methods for exercise state - simplified
  private applyLocalChangesToExercises(exercises: Exercise[]): Exercise[] {
    // No need to apply changes from completedSets, just return as is
    return exercises;
  }

  private applyLocalChangesToExercise(exercise: Exercise): Exercise {
    // No need to apply changes from completedSets, just return as is
    return exercise;
  }

  // Process pending operations
  private processPendingOperations(workoutId: string): void {
    const pendingOps = [...this.pendingOperations];
    this.pendingOperations = [];
    
    // Process pending exercise creations first
    const exerciseOps = pendingOps.filter(op => op.type === 'exercise');
    
    // Process pending set operations
    const setOps = pendingOps.filter(op => op.type === 'set');
    
    console.log(`Processing ${pendingOps.length} pending operations (${exerciseOps.length} exercises, ${setOps.length} sets)`);
  }

  // Process pending operations for a specific exercise
  private processPendingOperationsForExercise(tempId: string, realId: string, workoutId: string): void {
    // Find sets waiting to be created for this exercise
    const pendingSets = this.pendingOperations.filter(
      op => op.type === 'set' && op.exerciseId === tempId
    );
    
    if (!pendingSets.length) return;
    
    console.log(`Processing ${pendingSets.length} pending sets for exercise ${tempId} -> ${realId}`);
    
    // Update the exercises in the current session
    const currentSession = this.currentSessionSubject.value;
    if (currentSession) {
      // Update the exercise ID in all affected exercises
      const updatedExercises = currentSession.exercises.map(exercise => {
        if (exercise.exerciseId === tempId) {
          return {
            ...exercise,
            exerciseId: realId
          };
        }
        return exercise;
      });
      
      // Update the session
      this.currentSessionSubject.next({
        ...currentSession,
        exercises: updatedExercises
      });
      
      // Save changes
      this.saveCurrentSession();
    }
    
    // Process each set
    from(pendingSets).pipe(
      concatMap(pendingSet => {
        const setPayload = {
          ...pendingSet.payload,
          exerciseId: realId
        };
        
        return this.http.post<ExerciseSet>(
          `${this.workoutApiUrl}/${workoutId}/exercises/${realId}/sets`,
          setPayload
        ).pipe(
          map(backendSet => {
            const currentState = this.currentSessionSubject.value;
            if (!currentState) return null;
            
            // Update the set ID in the exercise sets
            const updatedExercises = currentState.exercises.map(exercise => {
              if (exercise.exerciseId === realId) {
                return {
                  ...exercise,
                  sets: exercise.sets?.map(set => {
                    if (set.exerciseSetId === pendingSet.tempId) {
                      // Keep the completed status directly on the set
                      return {
                        ...set,
                        exerciseSetId: backendSet.exerciseSetId,
                        exerciseId: realId
                      };
                    }
                    return set;
                  })
                };
              }
              return exercise;
            });
            
            // Update session with the real set ID
            this.currentSessionSubject.next({
              ...currentState,
              exercises: updatedExercises
            });
            
            this.saveCurrentSession();
            return backendSet;
          }),
          catchError(error => {
            console.error(`Error processing pending set operation:`, error);
            return of(null);
          })
        );
      })
    ).subscribe({
      complete: () => {
        // Remove these operations from the pending list
        this.pendingOperations = this.pendingOperations.filter(
          op => !(op.type === 'set' && op.exerciseId === tempId)
        );
      }
    });
  }

  // Handle external storage changes
  private handleExternalStorageChange(valueStr: string): void {
    try {
      const parsedSession = JSON.parse(valueStr);
      
      const session: WorkoutSession = {
        workout: parsedSession.workout,
        exercises: parsedSession.exercises || [],
        startTime: parsedSession.startTime,
        elapsedTimeSeconds: parsedSession.elapsedTimeSeconds || 0,
        isPaused: parsedSession.isPaused !== false,
        lastPausedAt: parsedSession.lastPausedAt,
        totalPausedSeconds: parsedSession.totalPausedSeconds || 0
      };
      
      if (!session.workout || !session.workout.workoutId) return;
      
      this.currentSessionSubject.next(session);
      
      if (session.isPaused) {
        this.stopTimer();
      } else {
        this.startTimer();
      }
    } catch (error) {
      console.error('Error handling external storage change:', error);
    }
  }

  // Add this public method for clarity
  addSetToExercise(exerciseId: string): Observable<Exercise[]> {
    if (!exerciseId) {
      return throwError(() => new Error('Exercise ID is required'));
    }
    
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) {
      return throwError(() => new Error('No active workout session'));
    }
    
    // Find the exercise
    const exerciseIndex = currentSession.exercises.findIndex(ex => ex.exerciseId === exerciseId);
    if (exerciseIndex === -1) {
      return throwError(() => new Error(`Exercise ${exerciseId} not found`));
    }
    
    const exercise = currentSession.exercises[exerciseIndex];
    
    // Calculate the next order position
    const orderPosition = (exercise.sets?.length || 0) + 1;
    
    // Create a unique ID for the new set
    const tempSetId = `temp-set-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create a new set
    const newSet: ExerciseSet = {
      exerciseSetId: tempSetId,
      exerciseId: exerciseId,
      type: SetType.NORMAL,
      orderPosition: orderPosition,
      reps: 0,
      weight: 0,
      restTimeSeconds: 0,
      completed: false
    };
    
    console.log(`Adding set to exercise ${exerciseId}, position ${orderPosition}`);
    
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
    console.log('Saving workout session with new set:', updatedSession);
    this.saveCurrentSession();

    // Now check how many sets we have and log for debugging
    const currentSets = updatedExercise.sets || [];
    console.log(`Exercise ${exerciseId} now has ${currentSets.length} sets`);
    
    // If the exercise has a real ID (not temporary), save to the backend
    if (!exerciseId.startsWith('temp-')) {
      // Create set for API - remove client-only fields
      const setForApi = {
        type: newSet.type,
        orderPosition: newSet.orderPosition,
        reps: newSet.reps,
        weight: newSet.weight,
        restTimeSeconds: newSet.restTimeSeconds,
      };
      
      this.http.post<ExerciseSet>(
        `${this.workoutApiUrl}/${currentSession.workout.workoutId}/exercises/${exerciseId}/sets`,
        setForApi
      ).pipe(
        map(backendSet => {
          // Get the latest state
          const latestSession = this.currentSessionSubject.value;
          if (!latestSession) return;
          
          // Update the set ID with the one from the backend
          const finalExercises = latestSession.exercises.map(ex => {
            if (ex.exerciseId === exerciseId) {
              return {
                ...ex,
                sets: ex.sets?.map(set => {
                  if (set.exerciseSetId === tempSetId) {
                    return {
                      ...set,
                      exerciseSetId: backendSet.exerciseSetId
                    };
                  }
                  return set;
                })
              };
            }
            return ex;
          });
          
          // Update the session
          this.currentSessionSubject.next({
            ...latestSession,
            exercises: finalExercises
          });
          
          // Save to storage again with the updated ID
          this.saveCurrentSession();
          console.log(`Set ID updated from ${tempSetId} to ${backendSet.exerciseSetId}`);
        }),
        catchError(error => {
          console.error(`Error sending set to backend:`, error);
          return of(null);
        })
      ).subscribe();
    } else {
      // Add to pending operations for later
      this.pendingOperations.push({
        type: 'set',
        exerciseId: exerciseId,
        tempId: tempSetId,
        payload: {
          type: newSet.type,
          orderPosition: newSet.orderPosition,
          reps: newSet.reps,
          weight: newSet.weight,
          restTimeSeconds: newSet.restTimeSeconds,
          completed: newSet.completed
        }
      });
      
      console.log(`Set added to pending operations for temp exercise ${exerciseId}`);
    }
    
    // Return the updated exercises immediately
    return of(updatedExercises);
  }

  // Remove an exercise from a workout
  removeExerciseFromWorkout(workoutId: string, exerciseId: string): Observable<Exercise[]> {
    const currentSession = this.getCurrentSession();
    if (!currentSession) {
      return throwError(() => new Error('No active workout session'));
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
    
    // If it's a temporary exercise (not yet saved to backend), just return the updated list
    if (exerciseId.startsWith('temp-')) {
      return of(updatedExercises);
    }
    
    // Otherwise make the API call to remove it from the backend
    return this.http.delete<void>(
      `${this.workoutApiUrl}/${workoutId}/exercises/${exerciseId}`
    ).pipe(
      tap(() => {
        console.log(`Exercise ${exerciseId} removed from workout ${workoutId}`);
      }),
      map(() => updatedExercises),
      catchError(error => {
        console.error('Error removing exercise:', error);
        return throwError(() => new Error('Failed to remove exercise'));
      })
    );
  }

  // Remove a set from an exercise
  removeSetFromExercise(exerciseId: string, setId: string): Observable<Exercise[]> {
    const currentSession = this.getCurrentSession();
    if (!currentSession) {
      return throwError(() => new Error('No active workout session'));
    }
    
    // Find the exercise to update
    const updatedExercises = currentSession.exercises.map(exercise => {
      if (exercise.exerciseId === exerciseId) {
        // Make sure there's at least one set remaining
        if (!exercise.sets || exercise.sets.length <= 1) {
          return exercise; // Don't remove the last set
        }
        
        // Filter out the set to remove
        const updatedSets = exercise.sets.filter(set => set.exerciseSetId !== setId);
        
        // Update order positions
        updatedSets.forEach((set, index) => {
          set.orderPosition = index + 1;
        });
        
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
    
    // If it's a temporary set (not saved to backend yet), just return the updated list
    if (setId.startsWith('temp-')) {
      return of(updatedExercises);
    }
    
    // Otherwise make the API call to remove it from the backend
    // Check if the service is using the correct endpoint
    return this.http.delete<void>(
      `${this.workoutApiUrl}/${currentSession.workout.workoutId}/exercises/${exerciseId}/sets/${setId}`
    ).pipe(
      tap(() => {
        console.log(`Set ${setId} removed from exercise ${exerciseId}`);
      }),
      map(() => updatedExercises),
      catchError(error => {
        console.error('Error removing set:', error);
        return throwError(() => new Error('Failed to remove set'));
      })
    );
  }

  // Helper method to update the session
  public updateSession(session: WorkoutSession): void {
    // Update the behavior subject
    this.currentSessionSubject.next(session);
    
    // Save the updated session to storage
    this.saveCurrentSession();
  }


}
