import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, forkJoin, of, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, finalize, map, switchMap, tap } from 'rxjs/operators';
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

  // Add exercise to an active workout (local only)
  addExerciseToWorkout(workoutId: string, exercise: Exercise): Observable<Exercise[]> {
    const session = this.currentSessionSubject.value;
    if (!session) return throwError(() => new Error('No active session'));
    
    // Create temporary ID for local tracking
    const tempExerciseId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Create version with temp ID for UI
    const tempExercise: Exercise = {
      ...exercise,
      exerciseId: tempExerciseId,
      orderPosition: session.exercises.length // Set orderPosition to last
    };
    
    console.log(`Adding exercise to workout ${workoutId} with temp ID: ${tempExerciseId}`);
    
    // Update local state for immediate UI feedback
    const updatedExercises = [...session.exercises, tempExercise];
    this.currentSessionSubject.next({
      ...session,
      exercises: updatedExercises
    });
    
    // Save session with temp exercise
    this.saveCurrentSession();
    
    // Return the updated exercises list
    return of(updatedExercises);
  }

  // Add set to exercise (local only)
  addSetToExercise(exerciseId: string): Observable<Exercise[]> {
    if (!exerciseId) {
      return throwError(() => new Error('No exercise ID provided'));
    }
    
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) {
      return throwError(() => new Error('No active workout session'));
    }
    
    // Find the exercise
    const exerciseIndex = currentSession.exercises.findIndex(ex => ex.exerciseId === exerciseId);
    if (exerciseIndex === -1) {
      return throwError(() => new Error(`Exercise not found: ${exerciseId}`));
    }
    
    const exercise = currentSession.exercises[exerciseIndex];
    
    // Create a unique ID for the new set
    const tempSetId = `temp-set-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Calculate the next order position using 0-based indexing
    const orderPosition = exercise.sets?.length || 0;
    
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
    
    // Add the set to the exercise (create a new exercise object for immutability)
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
        if (set.exerciseSetId === setId) {
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
        if (set.exerciseSetId === setId) {
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

  // Save to storage
  saveCurrentSession(): void {
    const session = this.currentSessionSubject.value;
    if (!session || !session.workout || !session.workout.workoutId) return;
    
    // Make sure all sets have their exerciseId set properly
    const exercisesWithProperSets = session.exercises.map(exercise => {
      if (!exercise.sets) return exercise;
      
      // Ensure each set has the correct exerciseId
      const updatedSets = exercise.sets.map(set => ({
        ...set,
        exerciseId: exercise.exerciseId // Always set the exerciseId
      }));
      
      return {
        ...exercise,
        sets: updatedSets
      };
    });
    
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
  removeSetFromExercise(exerciseId: string, setId: string): Observable<Exercise[]> {
    const currentSession = this.getCurrentSession();
    if (!currentSession) {
      return throwError(() => new Error('No active session'));
    }
    
    // Find the exercise to update
    const updatedExercises = currentSession.exercises.map(exercise => {
      if (exercise.exerciseId === exerciseId && exercise.sets) {
        // Remove the set with the given ID
        const updatedSets = exercise.sets.filter(set => set.exerciseSetId !== setId);
        
        // Update order positions using 0-based indexing
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


}
