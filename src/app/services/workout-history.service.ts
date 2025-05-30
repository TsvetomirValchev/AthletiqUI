import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError, of, Subject } from 'rxjs';
import { catchError, map, tap, switchMap, timeout } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { ActiveWorkout } from '../models/active-workout.model';
import { Exercise } from '../models/exercise.model';
import { WorkoutHistory } from '../models/workout-history.model';
import { AuthService } from '../services/auth.service';
import { ExerciseHistory } from '../models/exercise-history.model';
import { SetHistory } from '../models/set-history.model';

export interface WorkoutStatistics {
  totalWorkouts: number;
  totalTimeSpent: number; // in seconds
  mostTrainedMuscleGroup: string;
  strongestExercise: {
    name: string;
    maxWeight: number;
  };
  totalVolume: number;
  averageWorkoutDuration: number; // in seconds
}

@Injectable({
  providedIn: 'root'
})
export class WorkoutHistoryService {
  private apiUrl = `${environment.apiUrl}/workouts/history`;
  private workoutHistoryCache: WorkoutHistory[] | null = null;
  private historyRefreshSubject = new Subject<void>();
  public historyRefresh$ = this.historyRefreshSubject.asObservable();

  constructor(private http: HttpClient, private authService: AuthService) {}

  /**
   * Save a completed workout to history
   */
  public saveWorkoutToHistory(completedWorkout: ActiveWorkout, exercises: Exercise[]): Observable<WorkoutHistory> {
    // Ensure we have user ID
    const userId = completedWorkout.userId || localStorage.getItem('userId');
    if (!userId) {
      console.error('Cannot save workout history: missing userId');
      return throwError(() => new Error('Cannot save workout history: missing userId'));
    }
    
    console.log('Creating workout history for user:', userId);
    
    // Create the payload directly, matching backend DTO structure
    const payload = {
      userId: userId,
      name: completedWorkout.name || 'Workout',
      date: new Date().toISOString().split('T')[0],
      duration: completedWorkout.duration || `PT${this.calculateWorkoutDuration(completedWorkout)}S`,
      exerciseHistories: exercises.map((exercise, index) => ({
        exerciseName: exercise.name || 'Exercise',
        orderPosition: index,
        notes: exercise.notes || '',
        exerciseSetHistories: exercise.sets?.map((set) => ({
          orderPosition: set.orderPosition,
          reps: set.reps || 0,
          weight: set.weight || 0,
          completed: set.completed || false,
          type: set.type || 'NORMAL' // Add set type
        })) || []
      }))
    };
    
    console.log('Saving workout history payload:', JSON.stringify(payload, null, 2));
    
    // Make a direct HTTP POST call to the backend
    return this.http.post<WorkoutHistory>(`${this.apiUrl}`, payload).pipe(
      tap(response => {
        console.log('Workout history saved successfully. Response:', response);
      }),
      catchError(error => {
        console.error('Error saving workout history:', error);
        console.error('The payload that caused the error:', JSON.stringify(payload, null, 2));
        if (error.error) console.error('Error details:', error.error);
        return throwError(() => new Error(`Failed to save workout history: ${error.message || 'Unknown error'}`));
      })
    );
  }

  /**
   * Complete a workout and save it to history
   */
  public completeWorkout(workout: ActiveWorkout, exercises: Exercise[]): Observable<any> {    
    // Format current date as YYYY-MM-DD
    const currentDate = new Date().toISOString().split('T')[0];
    
    // Clean up exercises and map to the format expected by the backend
    // Important: Don't filter out temp exercises/sets since they're valid data
    // Just ensure they have proper format for the backend
    const cleanedExercises = exercises
      // Don't filter by exerciseId - include all exercises
      .map((exercise) => ({
        exerciseName: exercise.name || 'Exercise',
        orderPosition: exercise.orderPosition, 
        notes: exercise.notes || '',
        exerciseSetHistories: (exercise.sets || [])
          // Don't filter by exerciseSetId - include all sets 
          .map((set, setIndex) => ({
            orderPosition: setIndex,
            reps: set.reps || 0,
            weight: set.weight || 0,
            completed: set.completed || false, // Make sure to preserve the completed state
            type: set.type || 'NORMAL'
          }))
      }));
    
    // Create payload for the API
    const payload = {
      userId: workout.userId || localStorage.getItem('userId'),
      name: workout.name || 'Workout',
      date: currentDate,
      duration: workout.duration,
      exerciseHistories: cleanedExercises
    };
    
    console.log('Sending workout history payload:', JSON.stringify(payload, null, 2));
    
    // Update the sequence of operations in the ActiveWorkoutPage's finishWorkout method
    // First clear the session, then send to backend
    return this.http.post<any>(`${this.apiUrl}`, payload).pipe(
      tap(response => {
        console.log('Workout completed and saved to history successfully:', response);
        
        // Store the created history ID for reference
        if (response && response.workoutHistoryId) {
          localStorage.setItem('lastCompletedWorkoutId', response.workoutHistoryId);
        }
        
        // Force refresh the history data after saving
        this.refreshHistory();
      }),
      catchError(error => {
        console.error('Error completing workout:', error);
        console.error('The payload that caused the error:', JSON.stringify(payload, null, 2));
        if (error.error) console.error('Error details:', error.error);
        return throwError(() => new Error(`Failed to save workout history: ${error.message || 'Unknown error'}`));
      })
    );
  }
  /**
   * Force refresh workout history data
   */
  public refreshHistory(): void {
    console.log('Forcing refresh of workout history');
    // Clear any cached data
    this.workoutHistoryCache = null;
    
    // Emit the event to notify subscribers
    this.historyRefreshSubject.next();
  }

  /**
   * Get all workout history items for the current user
   */
  public getWorkoutHistory(): Observable<WorkoutHistory[]> {
    // If we have a cached result and no refresh is requested, return it
    if (this.workoutHistoryCache) {
      console.log('Returning cached workout history');
      return of(this.workoutHistoryCache);
    }
    
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (!user || !user.userId) {
          console.warn('No authenticated user found for workout history');
          return of([]);
        }
                
        return this.http.get<any[]>(`${this.apiUrl}/user/${user.userId}`).pipe(
          timeout(8000), // Add timeout to prevent hanging
          tap(response => {
            console.log('Raw workout history API response:', response);
          }),
          map(history => {
            if (!history || !Array.isArray(history)) {
              console.warn('History is not an array or is null, returning empty array');
              return [];
            }
            
            // Map each item ensuring ID and createdAt are preserved
            const mappedHistory = history.map(item => {
              if (!item) return null;
              
              return {
                ...item,
                workoutHistoryId: item.workoutHistoryId || item.id || null,
                createdAt: item.createdAt || null, // Ensure createdAt is preserved
              };
            }).filter(item => item !== null) as WorkoutHistory[];

            // Cache the result and sort by createdAt timestamp
            this.workoutHistoryCache = this.sortWorkoutHistory(mappedHistory);
            return this.workoutHistoryCache;
          }),
          catchError(error => {
            console.error('Error fetching workout history:', error);
            return of([]);
          })
        );
      }),
      catchError(() => {
        console.error('Error in workout history stream');
        return of([]);
      })
    );
  }

  /**
   * Get detailed workout history by ID including exercises and sets
   */
  public getWorkoutHistoryDetail(historyId: string): Observable<WorkoutHistory> {
    if (!historyId) {
      console.error('Cannot fetch workout details: missing or invalid ID');
      return throwError(() => new Error('Missing or invalid workout history ID'));
    }
        
    // Direct HTTP get without transformations
    return this.http.get<WorkoutHistory>(`${this.apiUrl}/${historyId}`).pipe(
      catchError(error => {
        console.error(`Error fetching workout history detail for ID ${historyId}:`, error);
        return this.getFallbackWorkoutDetails(historyId);
      })
    );
  }

  /**
   * Fallback method to construct workout details when direct fetch fails
   * This fetches the basic workout info and then adds exercises separately
   */
  private getFallbackWorkoutDetails(historyId: string): Observable<WorkoutHistory> {
    // First get basic workout info from the history list
    return this.getWorkoutHistory().pipe(
      switchMap(histories => {
        const basicWorkout = histories.find(w => w.workoutHistoryId === historyId);
        
        if (!basicWorkout) {
          return throwError(() => new Error('Workout not found in history'));
        }
        
        console.log('Using basic workout info as fallback:', basicWorkout);
        
        // Then fetch exercise histories separately
        return this.getExerciseHistoriesByWorkoutId(historyId).pipe(
          map(exercises => ({
            ...basicWorkout,
            exerciseHistories: exercises
          })),
          catchError(error => {
            console.error('Error fetching exercise histories in fallback:', error);
            // If even exercise histories fail, return just the basic workout
            return of({
              ...basicWorkout,
              exerciseHistories: []
            });
          })
        );
      }),
      catchError(error => {
        console.error('Fallback method failed:', error);
        return throwError(() => new Error(`Failed to load workout details: ${error.message}`));
      })
    );
  }

  /**
   * Get exercise histories for a workout - using dedicated endpoint
   */
  public getExerciseHistoriesByWorkoutId(workoutHistoryId: string): Observable<ExerciseHistory[]> {
    if (!workoutHistoryId) {
      return throwError(() => new Error('Missing workout history ID'));
    }
    
    return this.http.get<any[]>(`${this.apiUrl}/${workoutHistoryId}/exercises`).pipe(
      map(exercises => {
        // Transform each exercise to map setHistories to exerciseSetHistories
        return exercises.map(exercise => ({
          ...exercise,
          exerciseHistoryId: exercise.exerciseHistoryId || exercise.id,
          exerciseSetHistories: exercise.setHistories || [] // Map from API field name to model field name
        }));
      }),
      catchError(error => {
        console.error(`Error fetching exercises for workout ${workoutHistoryId}:`, error);
        return throwError(() => new Error('Failed to load exercise data'));
      })
    );
  }

  /**
   * Get set histories for an exercise
   */
  public getSetHistoriesByExerciseId(exerciseHistoryId: string): Observable<SetHistory[]> {
    return this.http.get<SetHistory[]>(`${environment.apiUrl}/set-histories/exercise/${exerciseHistoryId}`).pipe(
      catchError(error => {
        console.error(`Error fetching sets for exercise ${exerciseHistoryId}:`, error);
        return throwError(() => new Error('Failed to load set data'));
      })
    );
  }

  /**
   * Calculate workout duration in seconds
   */
  public calculateWorkoutDuration(workout: ActiveWorkout): number {
    if (!workout.startTime) {
      return 0;
    }
    
    const startTime = new Date(workout.startTime).getTime();
    const endTime = workout.endTime 
      ? new Date(workout.endTime).getTime() 
      : new Date().getTime();
    
    return Math.round((endTime - startTime) / 1000);
  }

  /**
   * Parse ISO-8601 duration string to seconds
   */
  public parseDuration(duration: string): number {
    if (!duration) return 0;
    
    const durationRegex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = duration.match(durationRegex);
    
    if (!matches) return 0;
    
    const hours = parseInt(matches[1] || '0', 10);
    const minutes = parseInt(matches[2] || '0', 10);
    const seconds = parseInt(matches[3] || '0', 10);
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Format duration for display (e.g., "30m" or "1h 30m")
   */
  public formatDuration(duration: string): string {
    const seconds = this.parseDuration(duration);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes < 60) {
      return `${minutes}m`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h${remainingMinutes ? ' ' + remainingMinutes + 'm' : ''}`;
    }
  }

  /**
   * Calculate performance metrics for exercises
   */
  private calculatePerformanceMetrics(exercises: Exercise[]): {
    totalVolume: number;
    totalSets: number;
    totalReps: number;
    maxWeight: number;
  } {
    let totalSets = 0;
    let totalReps = 0;
    let maxWeight = 0;
    let totalVolume = 0;
    
    exercises.forEach(exercise => {
      if (exercise.sets) {
        totalSets += exercise.sets.length;
        
        exercise.sets.forEach(set => {
          if (set.completed) {
            const reps = set.reps || 0;
            const weight = set.weight || 0;
            
            totalReps += reps;
            maxWeight = Math.max(maxWeight, weight);
            totalVolume += reps * weight;
          }
        });
      }
    });
    
    return { totalVolume, totalSets, totalReps, maxWeight };
  }

  /**
   * Sort workout history by creation timestamp (newest first)
   */
  private sortWorkoutHistory(history: WorkoutHistory[]): WorkoutHistory[] {
    return [...history].sort((a, b) => {
      // First try to use createdAt timestamp
      if (a.createdAt && b.createdAt) {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime(); // Descending order (newest first)
      }
      
      // Fall back to date field if createdAt is not available
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });
  }

  /**
   * Calculate total sets from a workout
   */
  calculateTotalSets(workout: WorkoutHistory): number {
    if (!workout.exerciseHistories) return 0;
    
    return workout.exerciseHistories.reduce((total, exercise) => {
      const setCount = exercise.exerciseSetHistories?.length || 0;
      return total + setCount;
    }, 0);
  }
}
