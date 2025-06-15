import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, switchMap, retry } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { CalendarDay } from '../models/calendar-day.model';
import { WorkoutStreakData } from '../models/workout-streak-data.model';

@Injectable({
  providedIn: 'root'
})
export class StatisticsService {
  private apiUrl = `${environment.apiUrl}/statistics`;
  private maxRetries = 2;
  
  highlightedDates: {
    date: string;
    textColor: string;
    backgroundColor: string;
  }[] = [];

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {
    console.log('Statistics service initialized with API URL:', this.apiUrl);
  }

  getWorkoutStreaks(): Observable<WorkoutStreakData> {
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (!user || !user.userId) {
          console.error('Cannot fetch workout streaks: No user ID available');
          return of({ currentStreak: 0, longestStreak: 0, lastWorkoutDate: '', workoutDates: [] });
        }
        
        const params = new HttpParams().set('userId', user.userId);
        console.log(`Requesting streaks with userId: ${user.userId}`);
        
        return this.http.get<WorkoutStreakData>(`${this.apiUrl}/streaks`, { params }).pipe(
          retry(this.maxRetries),
          catchError(error => {
            console.error('Error fetching workout streaks:', error);
            return of({ currentStreak: 0, longestStreak: 0, lastWorkoutDate: '', workoutDates: [] });
          })
        );
      })
    );
  }

  getCalendarData(year: number, month: number): Observable<CalendarDay[]> {
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (!user || !user.userId) {
          console.error('Cannot fetch calendar data: No user ID available');
          return of([]);
        }
        
        const params = new HttpParams().set('userId', user.userId);
        console.log(`Requesting calendar data for ${year}/${month} with userId: ${user.userId}`);
        
        return this.http.get<CalendarDay[]>(`${this.apiUrl}/calendar/${year}/${month}`, { params }).pipe(
          retry(this.maxRetries),
          catchError(error => {
            console.error('Error fetching calendar data:', error);
            return of([]);
          })
        );
      })
    );
  }

  getMuscleGroupStats(): Observable<any[]> {
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (!user || !user.userId) {
          console.error('Cannot fetch muscle group stats: No user ID available');
          return of([]);
        }
        
        const params = new HttpParams().set('userId', user.userId);
        console.log(`Requesting muscle group stats with userId: ${user.userId}`);
        
        return this.http.get<any[]>(`${this.apiUrl}/muscle-groups`, { params }).pipe(
          retry(this.maxRetries),
          catchError(error => {
            console.error('Error fetching muscle group stats:', error);
            return of([]);
          })
        );
      })
    );
  }

  calculateDurationInMinutes(isoDuration: string): number {
    if (!isoDuration) return 0;
    
    const durationRegex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = isoDuration.match(durationRegex);
    
    if (!matches) return 0;
    
    const hours = parseInt(matches[1] || '0', 10);
    const minutes = parseInt(matches[2] || '0', 10);
    const seconds = parseInt(matches[3] || '0', 10);
    
    return hours * 60 + minutes + (seconds / 60);
  }
}
