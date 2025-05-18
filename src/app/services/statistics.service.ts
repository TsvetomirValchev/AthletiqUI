import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { WorkoutHistory } from '../models/workout-history.model';

// Re-export the model interfaces from statistics.model.ts
import { MuscleGroupStats, CalendarDayData, WorkoutStreakData } from '../models/statistics.model';

export interface TimeStatistics {
  date: string; // ISO format date string
  duration: number; // In minutes
}

@Injectable({
  providedIn: 'root'
})
export class StatisticsService {
  private apiUrl = `${environment.apiUrl}/statistics`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }
  /**
   * Get muscle group distribution for a user
   */  getMuscleGroupDistribution(): Observable<MuscleGroupStats[]> {
    if (!environment.production) console.log('Fetching muscle group distribution...');
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (!user || !user.userId) {
          if (!environment.production) console.warn('User not authenticated for muscle group distribution');
          return of([]);
        }
        
        const url = `${this.apiUrl}/muscle-groups?userId=${user.userId}`;
        
        return this.http.get<MuscleGroupStats[]>(url).pipe(
          catchError(error => {
            if (!environment.production) {
              console.error('Error fetching muscle group data from API:', error);
            }
            return of([]);
          })
        );
      }),
      catchError(error => {
        if (!environment.production) {
          console.error('Error getting muscle group distribution:', error);
        }
        return of([]);
      })
    );
  }

  /**
   * Get workout streak information
   */  getWorkoutStreaks(): Observable<WorkoutStreakData> {
    if (!environment.production) console.log('Fetching workout streaks...');
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (!user || !user.userId) {
          if (!environment.production) console.warn('User not authenticated for workout streaks');
          return of({ currentStreak: 0, longestStreak: 0, lastWorkoutDate: '', workoutDates: [] });
        }
        
        const url = `${this.apiUrl}/streaks?userId=${user.userId}`;
        
        return this.http.get<WorkoutStreakData>(url).pipe(
          catchError(error => {
            if (!environment.production) {
              console.error('Error fetching workout streaks from API:', error);
            }
            return of({ currentStreak: 0, longestStreak: 0, lastWorkoutDate: '', workoutDates: [] });
          })
        );
      }),
      catchError(error => {
        if (!environment.production) {
          console.error('Error getting workout streaks:', error);
        }
        return of({ currentStreak: 0, longestStreak: 0, lastWorkoutDate: '', workoutDates: [] });
      })
    );
  }

  /**
   * Get calendar data for the specified month
   */  getCalendarData(year: number, month: number): Observable<CalendarDayData[]> {
    if (!environment.production) console.log(`Fetching calendar data for ${year}-${month}...`);
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (!user || !user.userId) {
          if (!environment.production) console.warn('User not authenticated for calendar data');
          return of([]);
        }
        
        const url = `${this.apiUrl}/calendar/${year}/${month}?userId=${user.userId}`;
        
        return this.http.get<CalendarDayData[]>(url).pipe(
          catchError(error => {
            if (!environment.production) {
              console.error(`Error fetching calendar data for ${year}-${month} from API:`, error);
            }
            return of([]);
          })
        );
      }),
      catchError(error => {
        if (!environment.production) {
          console.error('Error getting calendar data:', error);
        }
        return of([]);
      })
    );
  }

  /**
   * Get time statistics for a specific time period
   * @param period 'week' | 'month' | 'year'
   */  getTimeStatistics(period: 'week' | 'month' | 'year'): Observable<TimeStatistics[]> {
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (!user || !user.userId) {
          console.warn('User not authenticated for time statistics');
          return of([]);
        }
        
        // As this endpoint isn't implemented yet, we'll return an empty array
        // When backend implements this endpoint, uncomment the following line:
        // return this.http.get<TimeStatistics[]>(`${this.apiUrl}/time-stats?userId=${user.userId}&period=${period}`);
        
        // For now, just return empty array
        console.warn('Time statistics endpoint not yet implemented in backend');
        return of([]);
      }),
      catchError(error => {
        console.error('Error getting time statistics:', error);
        return of([]);
      })
    );
  }
    // Mock data generators have been removed to ensure real data is always used
  
  /**
   * Calculate workout duration in minutes from ISO duration string
   */
  calculateDurationInMinutes(isoDuration: string): number {
    // Parse PT1H30M format to minutes
    let minutes = 0;
    
    const hourMatch = isoDuration.match(/(\d+)H/);
    if (hourMatch) {
      minutes += parseInt(hourMatch[1]) * 60;
    }
    
    const minuteMatch = isoDuration.match(/(\d+)M/);
    if (minuteMatch) {
      minutes += parseInt(minuteMatch[1]);
    }
    
    const secondMatch = isoDuration.match(/(\d+)S/);
    if (secondMatch) {
      minutes += parseInt(secondMatch[1]) / 60;
    }
    
    return minutes;
  }
}
