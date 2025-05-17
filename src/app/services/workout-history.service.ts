import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { catchError, map, tap, switchMap } from 'rxjs/operators';
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
        orderPosition: index + 1,
        notes: exercise.notes || '',
        exerciseSetHistories: exercise.sets?.map((set, setIndex) => ({
          orderPosition: set.orderPosition || setIndex + 1,
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
  public completeWorkout(workout: ActiveWorkout, exercises: Exercise[]): Observable<WorkoutHistory> {
    console.log('Completing workout with ID:', workout.workoutId);
    
    // Make sure we have a valid workout ID
    if (!workout.workoutId) {
      return throwError(() => new Error('Cannot complete workout: missing workoutId'));
    }
    
    // Create a new object with explicitly set workoutId to ensure it's not lost
    const safeWorkout = {
      ...workout,
      workoutId: workout.workoutId // Explicitly ensure workoutId is set
    };
    
    console.log('SafeWorkout workoutId before saveWorkoutToHistory:', safeWorkout.workoutId);
    
    // Use our saveWorkoutToHistory method with the safe workout object
    return this.saveWorkoutToHistory(safeWorkout, exercises);
  }

  /**
   * Get all workout history items for the current user
   */
  public getWorkoutHistory(): Observable<WorkoutHistory[]> {
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (!user || !user.userId) {
          console.error('No authenticated user found');
          return of([]);
        }
        
        console.log('Fetching workout history for user:', user.userId);
        
        return this.http.get<any[]>(`${this.apiUrl}/user/${user.userId}`).pipe(
          tap(response => {
            console.log('Raw workout history API response:', response);
            // Check the first item to see its structure
            if (response && response.length > 0) {
              console.log('First workout object keys:', Object.keys(response[0]));
            }
          }),
          map(history => {
            // Map each item ensuring ID is preserved
            return history.map(item => {
              console.log('Individual workout item:', item);
              return {
                ...item,
                workoutHistoryId: item.workoutHistoryId || item.id || null,
              };
            });
          }),
          map(history => this.sortWorkoutHistory(history)),
          catchError(error => {
            console.error('Error fetching workout history:', error);
            return of([]);
          })
        );
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
    
    console.log(`Fetching workout details with ID: ${historyId}`);
    
    // Direct HTTP get without transformations
    return this.http.get<WorkoutHistory>(`${this.apiUrl}/${historyId}`).pipe(
      tap(response => {
        console.log(`Fetched detailed history for ID ${historyId}:`, response);
        
        // Debug info to verify the response structure
        if (response.exerciseHistories && response.exerciseHistories.length > 0) {
          console.log('Exercise histories present:', response.exerciseHistories.length);
          
          response.exerciseHistories.forEach((ex, i) => {
            console.log(`Exercise ${i}: ${ex.exerciseName}, Sets:`, 
              ex.exerciseSetHistories ? ex.exerciseSetHistories.length : 'none');
          });
        } else {
          console.log('No exercise histories found in response');
        }
      }),
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
      tap(exercises => {
        console.log(`Fetched ${exercises.length} exercises for workout ${workoutHistoryId}`);
        exercises.forEach((ex, i) => {
          console.log(`Exercise ${i}: ${ex.exerciseName}, Sets: ${ex.exerciseSetHistories?.length || 0}`);
        });
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
      tap(sets => console.log(`Fetched ${sets.length} sets for exercise ${exerciseHistoryId}`)),
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
   * Sort workout history by date (newest first)
   */
  private sortWorkoutHistory(history: WorkoutHistory[]): WorkoutHistory[] {
    return [...history].sort((a, b) => {
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
