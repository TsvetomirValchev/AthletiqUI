import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, switchMap } from 'rxjs/operators';
import { Observable, of, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface UserProfile {
  userId: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  totalWorkouts?: number;
  hoursActive?: number;
  daysActive?: number;
}

export interface WorkoutStats {
  totalWorkouts: number;
  uniqueDays: number;
  hoursActive: number;
}

@Injectable({
  providedIn: 'root'
})
export class ProfileService {

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  /**
   * Get workout statistics for the current user
   */  getWorkoutStats(): Observable<WorkoutStats> {
    console.log('Fetching workout stats...');
    // Get the current user ID from the auth service
    return this.authService.currentUser$.pipe(
      // Take first emission to prevent hanging on continuous Observable
      switchMap(user => {
        if (!user || !user.userId) {
          console.warn('User ID not available for workout stats');
          return of({
            totalWorkouts: 0,
            uniqueDays: 0,
            hoursActive: 0
          });
        }
        
        const url = `${environment.apiUrl}/statistics/profile-page-stats?userId=${user.userId}`;
        console.log(`Fetching workout stats from: ${url}`);
        
        // Call the correct endpoint with the userId parameter
        return this.http.get<WorkoutStats>(url).pipe(
          map(response => {
            console.log('Workout stats response received:', response);
            return response;
          }),
          catchError((error) => {
            console.error('Error fetching workout stats:', error);
            console.error('Error details:', error?.message, error?.status);
            return of({
              totalWorkouts: 0,
              uniqueDays: 0,
              hoursActive: 0
            });
          })
        );
      }),
      catchError(this.handleError<WorkoutStats>('getWorkoutStats', {
        totalWorkouts: 0,
        uniqueDays: 0,
        hoursActive: 0
      }))
    );
  }

  private handleError<T>(operation = 'operation', result?: T) {
    return (error: any): Observable<T> => {
      console.error(`${operation} failed: ${error.message}`);
      return of(result as T);
    };
  }
}
