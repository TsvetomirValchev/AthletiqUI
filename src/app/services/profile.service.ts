import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { WorkoutStats } from '../models/workout-stats.model';

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

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private apiUrl = `${environment.apiUrl}/statistics`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {
    console.log('Profile service initialized with API URL:', this.apiUrl);
  }
  /**
   * Get workout statistics for the current user
   */  getWorkoutStats(): Observable<WorkoutStats> {
    console.log('🔍 Fetching workout stats...');
    // Get the current user ID from the auth service
    return this.authService.currentUser$.pipe(
      // Take first emission to prevent hanging on continuous Observable
      switchMap(user => {
        if (!user || !user.userId) {
          console.warn('⚠️ User ID not available for workout stats');
          return of({
            totalWorkouts: 0,
            uniqueDays: 0,
            hoursActive: 0
          });
        }
          const url = `${this.apiUrl}/profile-page-stats?userId=${user.userId}`;
        console.log(`Requesting: GET ${url}`);
        
        // Call the correct endpoint with the userId parameter
        return this.http.get<WorkoutStats>(url).pipe(
          tap(response => console.log('Workout stats response received:', response)),
          catchError(error => {
            console.error('Error fetching workout stats:', error);
            return of({
              totalWorkouts: 0,
              uniqueDays: 0,
              hoursActive: 0
            });
          })
        );
      })
    );
  }
}
