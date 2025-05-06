import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError, interval, of, forkJoin, Subscription } from 'rxjs';
import { tap, catchError, map, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { ActiveWorkout } from '../models/active-workout.model';
import { Exercise } from '../models/exercise.model';
import { ExerciseSet } from '../models/exercise-set.model';
import { Workout } from '../models/workout.model';

interface WorkoutSession {
  workout: Workout;
  exercises: Exercise[];
  startTime: string;
  elapsedTimeSeconds: number;
  isPaused: boolean;
  completedSets: Map<string, boolean>;
  modifiedSets: Map<string, ExerciseSet>;
}

@Injectable({
  providedIn: 'root'
})
export class ActiveWorkoutService {
  // Use standard workout endpoints instead of active-workout endpoints
  private workoutApiUrl = `${environment.apiUrl}/workouts`;
  
  // State management
  private currentSessionSubject = new BehaviorSubject<WorkoutSession | null>(null);
  private timerSubscription: Subscription | null = null;
  
  constructor(private http: HttpClient) {}

  get currentWorkout$(): Observable<ActiveWorkout | null> {
    return this.currentSessionSubject.pipe(
      map(session => {
        if (!session) return null;
        
        // Convert WorkoutSession to ActiveWorkout
        return {
          ...session.workout,
          startTime: session.startTime
        };
      })
    );
  }

  get workoutState$(): Observable<{elapsedTimeSeconds: number, isPaused: boolean}> {
    return this.currentSessionSubject.pipe(
      map(session => {
        if (!session) {
          return { elapsedTimeSeconds: 0, isPaused: true };
        }
        return {
          elapsedTimeSeconds: session.elapsedTimeSeconds,
          isPaused: session.isPaused
        };
      })
    );
  }

  get elapsedTime$(): Observable<number> {
    return this.workoutState$.pipe(map(state => state.elapsedTimeSeconds));
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
    // Initialize a new workout session
    return this.http.get<Workout>(`${this.workoutApiUrl}/${workout.workoutId}`).pipe(
      switchMap(fetchedWorkout => {
        // Get exercises for this workout
        return this.getExercisesForWorkout(fetchedWorkout.workoutId!).pipe(
          map(exercises => {
            // Create and store new session
            const session: WorkoutSession = {
              workout: fetchedWorkout,
              exercises: exercises,
              startTime: new Date().toISOString(),
              elapsedTimeSeconds: 0,
              isPaused: false,
              completedSets: new Map<string, boolean>(),
              modifiedSets: new Map<string, ExerciseSet>()
            };
            
            this.currentSessionSubject.next(session);
            this.startTimer();
            
            return {
              ...fetchedWorkout,
              startTime: session.startTime
            };
          })
        );
      })
    );
  }

  pauseWorkout(): void {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) return;

    // Stop the timer
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = null;
    }
    
    // Update the session state
    this.currentSessionSubject.next({
      ...currentSession,
      isPaused: true
    });
  }

  resumeWorkout(): void {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession || !currentSession.isPaused) return;
    
    // Update the session state
    this.currentSessionSubject.next({
      ...currentSession,
      isPaused: false
    });
    
    // Start the timer
    this.startTimer();
  }

  finishWorkout(id: string): Observable<ActiveWorkout> {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) {
      return throwError(() => new Error('No active workout'));
    }
    
    // Stop the timer
    this.stopTimer();
    
    // For frontend-only approach, just clean up the session
    const finishedWorkout: ActiveWorkout = {
      ...currentSession.workout,
      startTime: currentSession.startTime,
      endTime: new Date().toISOString()
    };
    
    this.currentSessionSubject.next(null);
    return of(finishedWorkout);
  }

  getExercisesByWorkoutId(workoutId: string): Observable<Exercise[]> {
    // First check if we have these exercises in memory
    const currentSession = this.currentSessionSubject.value;
    if (currentSession && currentSession.workout.workoutId === workoutId) {
      return of(this.applyLocalChangesToExercises(currentSession.exercises));
    }
    
    // Otherwise fetch from the standard workout API
    return this.getExercisesForWorkout(workoutId);
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
    
    // Store the updated set in our local changes
    currentSession.modifiedSets.set(setId, {...set});
    
    // Update the session
    this.currentSessionSubject.next({...currentSession});
    
    // Return success without hitting the API
    return of({ success: true });
  }

  // Toggle set completion status (frontend-only)
  toggleSetCompletion(setId: string, completed: boolean): void {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession) return;
    
    // Update completed sets map
    currentSession.completedSets.set(setId, completed);
    
    // Update the session
    this.currentSessionSubject.next({...currentSession});
  }

  // Sync all local changes to the backend
  syncAllChanges(workoutId: string): Observable<boolean> {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession || currentSession.workout.workoutId !== workoutId) {
      return of(false);
    }
    
    // If no changes to sync
    if (currentSession.modifiedSets.size === 0) {
      return of(true);
    }
    
    // In a real implementation, you would save modified sets back to the server
    // For now, we'll just pretend all changes were successfully synced
    return of(true);
  }

  // Private helper methods
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

  private applyLocalChangesToExercise(exercise: Exercise): Exercise {
    const currentSession = this.currentSessionSubject.value;
    if (!currentSession || !exercise.sets) return exercise;
    
    // Create a deep copy to avoid modifying the original
    const exerciseCopy: Exercise = {
      ...exercise,
      sets: exercise.sets.map(set => {
        const setCopy = {...set};
        
        // Apply completion status if we have it
        if (set.exerciseSetId && currentSession.completedSets.has(set.exerciseSetId)) {
          setCopy.completed = currentSession.completedSets.get(set.exerciseSetId);
        }
        
        // Apply modified set data if we have it
        if (set.exerciseSetId && currentSession.modifiedSets.has(set.exerciseSetId)) {
          return {
            ...setCopy,
            ...currentSession.modifiedSets.get(set.exerciseSetId)
          };
        }
        
        return setCopy;
      })
    };
    
    return exerciseCopy;
  }
}
