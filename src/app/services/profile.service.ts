import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, switchMap } from 'rxjs/operators';
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
   */
  getWorkoutStats(): Observable<WorkoutStats> {
    // Get the current user ID from the auth service
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (!user || !user.userId) {
          return throwError(() => new Error('User ID not available'));
        }
        
        // Call the correct endpoint with the userId parameter
        return this.http.get<WorkoutStats>(
          `${environment.apiUrl}/statistics/profile-page-stats?userId=${user.userId}`
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
