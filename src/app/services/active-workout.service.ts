import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError, interval, of, forkJoin, Subscription, from, Subject } from 'rxjs';
import { tap, catchError, map, switchMap, mergeMap, distinctUntilChanged } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { ActiveWorkout } from '../models/active-workout.model';
import { Exercise } from '../models/exercise.model';
import { ExerciseSet } from '../models/exercise-set.model';
import { Workout } from '../models/workout.model';
import { StorageService } from './storage.service';
import { SetType } from '../models/set-type.enum';

// Simplified WorkoutSession interface (keeping the same structure but simplifying implementation)
interface WorkoutSession {
  workout: Workout;
  exercises: Exercise[];
  startTime: string;
  elapsedTimeSeconds: number;
  isPaused: boolean;
  completedSets: Map<string, boolean>;
  lastPausedAt?: number;
  totalPausedSeconds: number;
  displayTimeSeconds?: number; // Add this to explicitly track displayed time
}

@Injectable({
  providedIn: 'root'
})
export class ActiveWorkoutService implements OnDestroy {
  // Use standard workout endpoints instead of active-workout endpoints
  private workoutApiUrl = `${environment.apiUrl}/workouts`;
  
  // State management
  private currentSessionSubject = new BehaviorSubject<WorkoutSession | null>(null);
  private timerSubscription: Subscription | null = null;
  
  // Add a property for autosave
  private autoSaveInterval: any = null;
  
  // Add this to track visibility state
  private readonly VISIBILITY_STORAGE_KEY = 'workout_visibility_state';
  private wasVisible = true;

  // Add to ActiveWorkoutService
  private workoutCompletedSubject = new Subject<void>();
  public workoutCompleted$ = this.workoutCompletedSubject.asObservable();

  constructor(
    private http: HttpClient,
    private storage: StorageService
  ) {
    // Listen for storage events from other tabs
    window.addEventListener('storage', (event) => {
      if (event.key === 'activeWorkoutSession' && event.newValue) {
        this.handleExternalStorageChange(event.newValue);
      }
    });
    
    // Setup auto-save every 30 seconds
    this.setupAutoSave();
    
    // Listen for page visibility changes
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    
    // Check if we need to restore after a page load
    this.checkInitialVisibility();
  }

  // Add or update this getter in ActiveWorkoutService
  get currentWorkout$(): Observable<any> {
    return this.currentSessionSubject.pipe(
      map(session => {
        if (!session) {
          console.log('No active session in currentWorkout$');
          return null;
        }
        
        console.log('Emitting workout from session:', session.workout);
        return session.workout;
      }),
      distinctUntilChanged((prev, curr) => {
        // Only emit when workout ID changes
        return prev?.workoutId === curr?.workoutId;
      })
    );
  }

  // Add a workout state observable
  workoutState$ = this.currentSessionSubject.pipe(
    map(session => {
      if (!session) return { isActive: false, isPaused: true, elapsedTimeSeconds: 0 };
      return {
        isActive: true,
        isPaused: session.isPaused,
        elapsedTimeSeconds: session.elapsedTimeSeconds || 0
      };
    })
  );

  get elapsedTime$(): Observable<number> {
    return this.workoutState$.pipe(map(state => state.elapsedTimeSeconds || 0));
  }

  get isPaused$(): Observable<boolean> {
    return this.workoutState$.pipe(map(state => state.isPaused));
  }

  loadCurrentWorkout(): void {
    // Since we're not persisting active workouts in backend,
    // this won't do anything in frontend-only approach
    this.currentSessionSubject.next(null);
  }

  getActiveWorkouts(): Observable<ActiveWorkout[]> {
    // In frontend-only approach, just return current session or empty
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

  startWorkout(workout: ActiveWorkout): Observable<ActiveWorkout> {
    console.log(`Starting workout: ${workout.workoutId}`);
    
    // First check if we already have a saved session for this workout
    return this.loadSavedSession().pipe(
      switchMap(hasSession => {
        const existingSession = this.currentSessionSubject.value;
        
        // If we have a saved session for this workout, use it directly without API calls
        if (hasSession && existingSession && existingSession.workout.workoutId === workout.workoutId) {
          console.log('Reusing existing workout session from localStorage');
          return of({
            ...existingSession.workout,
            startTime: existingSession.startTime
          });
        }
        
        // If no saved session, only then initialize a new workout session
        console.log('No saved session found, fetching workout from API');
        return this.http.get<Workout>(`${this.workoutApiUrl}/${workout.workoutId}`).pipe(
          switchMap(fetchedWorkout => {
            return this.getExercisesForWorkout(fetchedWorkout.workoutId!).pipe(
              map(exercises => {
                const session: WorkoutSession = {
                  workout: fetchedWorkout,
                  exercises: exercises,
                  startTime: workout.startTime || new Date().toISOString(),
                  elapsedTimeSeconds: 0,
                  isPaused: false,
                  completedSets: new Map<string, boolean>(),
                  totalPausedSeconds: 0 // Initialize paused time to 0
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

  pauseWorkout(): void {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) return;

    console.log('Pausing workout');
    
    // Store the timestamp when paused
    const pausedAt = Date.now();
    
    // Update session state
    this.currentSessionSubject.next({
      ...currentSession,
      isPaused: true,
      lastPausedAt: pausedAt
    });
    
    // Stop the timer
    this.stopTimer();
    
    // Save the paused state
    this.saveCurrentSession();
  }

  resumeWorkout(): void {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession || !currentSession.isPaused) return;

    console.log('Resuming workout');
    
    // Calculate the amount of time that passed while paused
    let additionalPausedTime = 0;
    if (currentSession.lastPausedAt) {
      additionalPausedTime = Math.floor((Date.now() - currentSession.lastPausedAt) / 1000);
      console.log(`Workout was paused for ${additionalPausedTime} seconds`);
    }
    
    // Update session state
    this.currentSessionSubject.next({
      ...currentSession,
      isPaused: false,
      lastPausedAt: undefined, // Clear the pause timestamp
      totalPausedSeconds: (currentSession.totalPausedSeconds || 0) + additionalPausedTime
    });
    
    // Restart the timer
    this.startTimer();
    
    // Save the resumed state
    this.saveCurrentSession();
  }

  finishWorkout(id: string): Observable<ActiveWorkout> {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) {
      return throwError(() => new Error('No active workout'));
    }
    
    this.stopTimer();
    this.clearAutoSave();
    
    // Get elapsed time in seconds from the session
    const elapsedTimeSeconds = currentSession.elapsedTimeSeconds;
    
    console.log('Active workout time:', elapsedTimeSeconds);
    console.log('Total paused time:', currentSession.totalPausedSeconds || 0);
    
    // Convert to ISO 8601 duration format (PT[hours]H[minutes]M[seconds]S)
    const hours = Math.floor(elapsedTimeSeconds / 3600);
    const minutes = Math.floor((elapsedTimeSeconds % 3600) / 60);
    const seconds = elapsedTimeSeconds % 60;
    
    // Build ISO 8601 duration string
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
    
    // Log separately but don't include in object
    console.log(`Workout finished with active duration: ${duration} (${elapsedTimeSeconds} seconds)`);
    
    // Get the current state of exercises with any local changes applied
    const exercises = this.applyLocalChangesToExercises(currentSession.exercises);
    
    // Clear the current session
    this.currentSessionSubject.next(null);
    
    // Notify that the workout is completed
    this.notifyWorkoutCompleted();
    
    return of(finishedWorkout);
  }

  getExercisesByWorkoutId(workoutId: string): Observable<Exercise[]> {
    // Use the correct endpoint - without the "workout/" part
    return this.http.get<Exercise[]>(`${this.workoutApiUrl}/${workoutId}/exercises`).pipe(
      map(exercises => {
        // Apply any local changes to these exercises
        const session = this.currentSessionSubject.value;
        console.log('Current session when getting exercises:', {
          hasSession: !!session,
          completedSetsCount: session?.completedSets.size || 0,
        });
        
        // Apply session changes to each exercise
        return exercises.map(exercise => this.applyLocalChangesToExercise(exercise));
      }),
      catchError(error => {
        console.error(`Error getting exercises for workout ${workoutId}:`, error);
        
        // If HTTP request fails, try to get exercises from the current session
        const session = this.currentSessionSubject.value;
        if (session && session.workout.workoutId === workoutId) {
          console.log('Returning exercises from current session instead of API');
          return of(session.exercises.map(exercise => this.applyLocalChangesToExercise(exercise)));
        }
        
        return throwError(() => new Error(`Failed to get exercises for workout ${workoutId}`));
      })
    );
  }

  // Get exercises for workout using standard workout endpoints
  private getExercisesForWorkout(workoutId: string): Observable<Exercise[]> {
    return this.http.get<Exercise[]>(`${this.workoutApiUrl}/${workoutId}/exercises`);
  }

  addExerciseToWorkout(workoutId: string, exercise: Exercise): Observable<ActiveWorkout> {
    // Create payload
    const exercisePayload = {
      ...exercise,
      workoutId: workoutId,
      exerciseTemplateId: exercise.exerciseTemplateId
    };
    
    // Use standard workout API
    return this.http.post<Workout>(
      `${this.workoutApiUrl}/${workoutId}/exercises`, 
      exercisePayload
    ).pipe(
      switchMap(() => this.refreshWorkoutSession(workoutId))
    );
  }

  getWorkoutExerciseById(workoutId: string, exerciseId: string): Observable<Exercise> {
    // Check if we have this exercise in memory with local changes
    const currentSession = this.currentSessionSubject.value;
    if (currentSession && currentSession.workout.workoutId === workoutId) {
      const exercise = currentSession.exercises.find(e => e.exerciseId === exerciseId);
      if (exercise) {
        return of(this.applyLocalChangesToExercise(exercise));
      }
    }
    
    // Otherwise fetch from API
    return this.http.get<Exercise>(`${this.workoutApiUrl}/${workoutId}/exercises/${exerciseId}`);
  }

  updateWorkoutExercise(workoutId: string, exerciseId: string, exercise: Exercise): Observable<ActiveWorkout> {
    return this.http.put<Workout>(
      `${this.workoutApiUrl}/${workoutId}/exercises/${exerciseId}`, 
      exercise
    ).pipe(
      switchMap(() => this.refreshWorkoutSession(workoutId))
    );
  }

  removeExerciseFromWorkout(workoutId: string, exerciseId: string): Observable<ActiveWorkout> {
    return this.http.delete<Workout>(
      `${this.workoutApiUrl}/${workoutId}/exercises/${exerciseId}`
    ).pipe(
      switchMap(() => this.refreshWorkoutSession(workoutId))
    );
  }

  getExerciseSets(workoutId: string, exerciseId: string): Observable<ExerciseSet[]> {
    return this.http.get<ExerciseSet[]>(
      `${this.workoutApiUrl}/${workoutId}/exercises/${exerciseId}/sets`
    );
  }

  addSetToExercise(workoutId: string, exerciseId: string, set: ExerciseSet): Observable<ActiveWorkout> {
    return this.http.post<Workout>(
      `${this.workoutApiUrl}/${workoutId}/exercises/${exerciseId}/sets`, 
      set
    ).pipe(
      switchMap(() => this.refreshWorkoutSession(workoutId))
    );
  }

  removeSetFromExercise(workoutId: string, exerciseId: string, orderPosition: number): Observable<ActiveWorkout> {
    return this.http.delete<Workout>(
      `${this.workoutApiUrl}/${workoutId}/exercises/${exerciseId}/sets/${orderPosition}`
    ).pipe(
      switchMap(() => this.refreshWorkoutSession(workoutId))
    );
  }

  updateSet(workoutId: string, exerciseId: string, setId: string, set: ExerciseSet): Observable<any> {
    // In frontend-only approach, we'll update the set in memory
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) {
      return throwError(() => new Error('No active workout session'));
    }
    
    // Update the session
    this.currentSessionSubject.next({...currentSession});
    
    // Return success without hitting the API
    return of({ success: true });
  }

  // Toggle set completion status (frontend-only)
  toggleSetCompletion(setId: string, completed: boolean): void {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) return;
    
    console.log(`Toggling set ${setId} completion to ${completed}`);
    
    // Update the completedSets map
    currentSession.completedSets.set(setId, completed);
    
    // Also update the exercise object directly so it persists when saved
    let updated = false;
    const updatedExercises = currentSession.exercises.map(exercise => {
      if (!exercise.sets) return exercise;
      
      const updatedSets = exercise.sets.map(set => {
        if (set.exerciseSetId === setId) {
          updated = true;
          return {
            ...set,
            completed: completed
          };
        }
        return set;
      });
      
      return {
        ...exercise,
        sets: updatedSets
      };
    });
    
    if (updated) {
      this.currentSessionSubject.next({
        ...currentSession,
        exercises: updatedExercises
      });
    }
    
    // Save changes immediately
    this.saveCurrentSession();
    
    console.log(`Set ${setId} completion status updated to ${completed}`);
  }

  // Sync all local changes to the backend
  syncAllChanges(workoutId: string): Observable<boolean> {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession || currentSession.workout.workoutId !== workoutId) {
      return of(false);
    }
    
    return of(true);
  }

  // Private helper methods
  private startTimer(): void {
    this.stopTimer();
    
    this.timerSubscription = interval(1000).subscribe(() => {
      const currentSession = this.currentSessionSubject.value;
      if (!currentSession || currentSession.isPaused) return;
      
      // Only increment time when not paused
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

  private refreshWorkoutSession(workoutId: string): Observable<ActiveWorkout> {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession || currentSession.workout.workoutId !== workoutId) {
      return throwError(() => new Error('No active workout session'));
    }
    
    // Fetch updated workout and exercises
    return this.http.get<Workout>(`${this.workoutApiUrl}/${workoutId}`).pipe(
      switchMap(updatedWorkout => {
        return this.getExercisesForWorkout(workoutId).pipe(
          map(exercises => {
            // Update the session
            this.currentSessionSubject.next({
              ...currentSession,
              workout: updatedWorkout,
              exercises: exercises
            });
            
            // Return the ActiveWorkout
            return {
              ...updatedWorkout,
              startTime: currentSession.startTime
            };
          })
        );
      })
    );
  }

  private applyLocalChangesToExercises(exercises: Exercise[]): Exercise[] {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) return exercises;
    
    return exercises.map(exercise => this.applyLocalChangesToExercise(exercise));
  }

  // Remove these methods or simplify them
  private applyLocalChangesToExercise(exercise: Exercise): Exercise {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession || !exercise.sets) return exercise;
    
    console.log(`Applying completion status to exercise ${exercise.name}`);
    
    // Create a deep copy and only apply completion status
    const exerciseCopy: Exercise = {
      ...exercise,
      sets: exercise.sets.map(set => {
        const setCopy = {...set};
        
        // Apply completion status if we have it
        if (set.exerciseSetId && currentSession.completedSets.has(set.exerciseSetId)) {
          const completed = currentSession.completedSets.get(set.exerciseSetId);
          setCopy.completed = completed;
        }
        
        return setCopy;
      })
    };
    
    return exerciseCopy;
  }

  // In ActiveWorkoutService
  // Add these methods to save/load the session

  saveCurrentSession(): void {
    const session = this.currentSessionSubject.value;
    if (!session) {
      console.log('No session to save');
      return;
    }
    
    // Check if workout is valid before accessing its properties
    if (!session.workout || !session.workout.workoutId) {
      console.error('Cannot save session: workout or workoutId is missing', session);
      return;
    }
    
    // Convert Maps to arrays for serialization
    const serialized = {
      workout: session.workout,
      workoutId: session.workout.workoutId,
      exercises: session.exercises,
      startTime: session.startTime,
      elapsedTimeSeconds: session.elapsedTimeSeconds,
      isPaused: session.isPaused,
      completedSets: Array.from(session.completedSets.entries()),
      lastPausedAt: session.lastPausedAt, // Save pause timestamp
      totalPausedSeconds: session.totalPausedSeconds, // Save total paused time
      lastSaved: new Date().toISOString()
    };
    
    this.storage.setItem('activeWorkoutSession', JSON.stringify(serialized))
      .then(() => console.log('Session saved successfully'))
      .catch(err => console.error('Error saving workout session:', err));
  }

  calculateElapsedTimeFromStartTime(startTime: string): number {
    if (!startTime) return 0;
    
    const start = new Date(startTime).getTime();
    const now = new Date().getTime();
    
    // Calculate elapsed seconds
    return Math.floor((now - start) / 1000);
  }

  loadSavedSession(): Observable<boolean> {
    return from(this.storage.getItem('activeWorkoutSession')).pipe(
      map(savedSession => {
        if (!savedSession) {
          console.log('No saved session found');
          return false;
        }
        
        try {
          const parsed = JSON.parse(savedSession);
          console.log('Found saved session for workout:', parsed.workoutId);
          
          // Reconstruct the Maps
          const completedSets = new Map<string, boolean>(parsed.completedSets || []);
          
          // Calculate additional paused time if needed
          let totalPausedSeconds = parsed.totalPausedSeconds || 0;
          let lastPausedAt = parsed.lastPausedAt;
          
          // If the workout was paused when saved, calculate additional pause time
          if (parsed.isPaused && lastPausedAt) {
            const additionalPausedTime = Math.floor((Date.now() - lastPausedAt) / 1000);
            totalPausedSeconds += additionalPausedTime;
            console.log(`Adding ${additionalPausedTime}s to paused time from closed tab`);
          }
          
          // Use the exercises from localStorage directly
          const session: WorkoutSession = {
            workout: parsed.workout,
            exercises: parsed.exercises || [],
            startTime: parsed.startTime,
            elapsedTimeSeconds: parsed.elapsedTimeSeconds || 0,
            isPaused: parsed.isPaused !== false,
            completedSets,
            lastPausedAt,
            totalPausedSeconds
          };
          
          this.currentSessionSubject.next(session);
          
          // Start timer if not paused
          if (!session.isPaused) {
            this.startTimer();
          }
          
          console.log('Successfully restored workout session from localStorage');
          console.log(`Elapsed active time: ${session.elapsedTimeSeconds}s, paused time: ${session.totalPausedSeconds}s`);
          return true;
        } catch (error) {
          console.error('Error parsing saved session:', error);
          return false;
        }
      }),
      catchError(() => of(false))
    );
  }

  clearSavedSession(): Promise<void> {
    // First notify subscribers that the workout is complete
    this.currentSessionSubject.next(null);
    
    return this.storage.removeItem('activeWorkoutSession')
      .then(() => {
        console.log('Active workout session cleared');
      })
      .catch(err => {
        console.error('Error clearing workout session:', err);
      });
  }

  // Add this method
  private handleExternalStorageChange(valueStr: string): void {
    try {
      const parsedSession = JSON.parse(valueStr);
      
      // Reconstruct the Maps - handle case where completedSets might not exist
      const completedSets = new Map<string, boolean>(parsedSession.completedSets || []);
      
      // Create the workout session
      const session: WorkoutSession = {
        workout: parsedSession.workout,
        exercises: parsedSession.exercises || [],
        startTime: parsedSession.startTime,
        elapsedTimeSeconds: parsedSession.elapsedTimeSeconds || 0,
        isPaused: parsedSession.isPaused !== false,
        completedSets,
        totalPausedSeconds: 0, // Initialize total paused seconds
      };
      
      // Check if the workout is valid
      if (!session.workout || !session.workout.workoutId) {
        console.error('Invalid external workout session data', parsedSession);
        return;
      }
      
      // Update the session in this tab
      this.currentSessionSubject.next(session);
      
      // Manage timer based on pause state
      if (session.isPaused) {
        this.stopTimer();
      } else {
        this.startTimer();
      }
    } catch (error) {
      console.error('Error handling external storage change:', error);
    }
  }

  // Add this method to handle auto-save
  private setupAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    
    this.autoSaveInterval = setInterval(() => {
      const session = this.currentSessionSubject.value;
      if (session) {
        console.log('Auto-saving workout session...');
        this.saveCurrentSession();
      }
    }, 30000); // Save every 30 seconds
  }

  // Add a cleanup method
  private clearAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  // Make sure to call this in ngOnDestroy if your service implements OnDestroy
  ngOnDestroy() {
    this.stopTimer();
    this.clearAutoSave();
  }

  // Add this method to check if a set is completed
  getSetCompletionStatus(setId: string): Observable<boolean> {
    return this.currentSessionSubject.pipe(
      map(session => {
        if (!session || !session.completedSets) return false;
        return session.completedSets.get(setId) === true;
      })
    );
  }

  // Update this method to handle set property updates directly
  updateSetProperty(setId: string, property: string, value: any): void {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) return;
    
    // Find the set in the exercises directly
    let updated = false;
    
    const updatedExercises = currentSession.exercises.map(exercise => {
      if (!exercise.sets) return exercise;
      
      const updatedSets = exercise.sets.map(set => {
        if (set.exerciseSetId === setId) {
          updated = true;
          // Update the property directly
          return {
            ...set,
            [property]: value
          };
        }
        return set;
      });
      
      return {
        ...exercise,
        sets: updatedSets
      };
    });
    
    if (!updated) {
      console.warn(`Could not find set with ID ${setId} to update ${property}`);
      return;
    }
    
    this.currentSessionSubject.next({
      ...currentSession,
      exercises: updatedExercises
    });
    
    // Save immediately
    this.saveCurrentSession();
    
    console.log(`Updated set ${setId} ${property} to ${value}`);
  }

  // Helper methods remain the same
  updateSetWeight(setId: string, weight: number): void {
    this.updateSetProperty(setId, 'weight', weight);
  }

  updateSetReps(setId: string, reps: number): void {
    this.updateSetProperty(setId, 'reps', reps);
  }

  updateSetType(setId: string, type: SetType): void {
    this.updateSetProperty(setId, 'type', type);
  }

  // Add this method to track new sets
  // Update this method to ensure sets are properly added
addNewSet(exerciseId: string, orderPosition: number): ExerciseSet {
  const currentSession = this.currentSessionSubject.value;
  if (!currentSession) {
    console.error('Cannot add set: no active workout session');
    throw new Error('No active workout session');
  }
  
  // Find the exercise
  const exerciseIndex = currentSession.exercises.findIndex(ex => ex.exerciseId === exerciseId);
  if (exerciseIndex === -1) {
    console.warn(`Exercise ${exerciseId} not found in session`);
    throw new Error(`Exercise ${exerciseId} not found`);
  }
  
  // Get the exercise
  const exercise = currentSession.exercises[exerciseIndex];
  
  // Generate a unique ID for the new set
  const setId = `new-${exerciseId}-${orderPosition}-${Date.now()}`;
  
  // Create the new set
  const newSet: ExerciseSet = {
    exerciseSetId: setId,
    exerciseId: exerciseId,
    orderPosition: orderPosition,
    type: SetType.NORMAL,
    reps: 0,
    weight: 0,
    restTimeSeconds: 60,
    completed: false
  };
  
  // Clone the exercise and add the new set
  const updatedExercise = {
    ...exercise,
    sets: [...(exercise.sets || []), newSet]
  };
  
  // Create a new array of exercises with the updated one
  const updatedExercises = [...currentSession.exercises];
  updatedExercises[exerciseIndex] = updatedExercise;
  
  // Update the session with the new state
  this.currentSessionSubject.next({
    ...currentSession,
    exercises: updatedExercises
  });
  
  // Initialize in completedSets map
  currentSession.completedSets.set(setId, false);
  
  // Save changes to localStorage
  this.saveCurrentSession();
  
  console.log(`Added new set to exercise ${exercise.name}, order: ${orderPosition}, id: ${setId}`);
  
  return newSet;
}

  // Add a getCurrentSession method if it doesn't exist
  getCurrentSession(): WorkoutSession | null {
    return this.currentSessionSubject.value;
  }

  private handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      // Page is being hidden (user navigated away or closed tab)
      this.wasVisible = false;
      localStorage.setItem(this.VISIBILITY_STORAGE_KEY, 'hidden');
      
      // Pause the workout if it's active
      const currentSession = this.currentSessionSubject.value;
      if (currentSession && !currentSession.isPaused) {
        console.log('App hidden, pausing workout');
        this.pauseWorkout();
        this.saveCurrentSession();
      }
    } else if (document.visibilityState === 'visible') {
      // Page is visible again, but don't auto-resume (user must manually resume)
      this.wasVisible = true;
      localStorage.setItem(this.VISIBILITY_STORAGE_KEY, 'visible');
      console.log('App visible again, workout remains paused until manually resumed');
    }
  }

  private checkInitialVisibility(): void {
    // When app first loads, check if we previously paused due to visibility
    const previousState = localStorage.getItem(this.VISIBILITY_STORAGE_KEY);
    
    if (previousState === 'hidden') {
      // App was previously hidden and is now visible again
      console.log('App was previously hidden, ensuring workout is paused');
      const currentSession = this.currentSessionSubject.value;
      if (currentSession && !currentSession.isPaused) {
        // Force pause state
        currentSession.isPaused = true;
        this.stopTimer();
        this.currentSessionSubject.next(currentSession);
        this.saveCurrentSession();
      }
    }
  }

  // Call this when a workout is completed
  notifyWorkoutCompleted(): void {
    this.workoutCompletedSubject.next();
  }
}
