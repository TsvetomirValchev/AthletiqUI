import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, finalize, forkJoin, of, take } from 'rxjs';
import { environment } from '../../../environments/environment';
import { WorkoutStreakData } from '../../models/workout-streak-data.model';
import { WorkoutStats } from '../../models/workout-stats.model';
import { CalendarDayData } from '../../models/calendar-day-data.model';
import { FormatDurationPipe } from '../../pipes/format-duration.pipe';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-statistics',
  templateUrl: './statistics.page.html',
  styleUrls: ['./statistics.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, RouterLink, FormsModule, FormatDurationPipe]
})
export class StatisticsPage implements OnInit {
  // Loading state
  isLoading = true;
  error: string | null = null;

  // Calendar data
  currentMonth = new Date();
  workoutDates: Set<string> = new Set();
  selectedDate: string | null = null;
  
  // Custom calendar variables
  calendarDays: {
    date: Date;
    isCurrentMonth: boolean;
    hasWorkout: boolean;
    isToday: boolean;
    isSelected: boolean;
  }[] = [];
  weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  
  // Stats data
  workoutStats: WorkoutStats = { totalWorkouts: 0, uniqueDays: 0, hoursActive: 0 };
  workoutStreak: WorkoutStreakData = {
    currentStreak: 0,
    longestStreak: 0,
    lastWorkoutDate: '',
    workoutDates: []
  };
  daysSinceLastWorkout = 0;
  
  // API URL
  private apiUrl = environment.apiUrl || 'http://localhost:6969';

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.loadStatistics();
  }

  ionViewDidEnter() {
    // Refresh data when page is entered
    this.loadStatistics();
  }

  /**
   * Main data loading method
   */
  loadStatistics() {
    this.isLoading = true;
    this.error = null;

    // Get the user from AuthService current user observable
    this.authService.currentUser$.pipe(take(1)).subscribe(user => {
      if (!user || !user.userId) {
        console.log('User not found in currentUser$, attempting to validate token...');
        
        // Try to validate token if user is not in currentUser$
        this.authService.validateToken().pipe(take(1)).subscribe(valid => {
          if (valid) {
            // Token valid, try to get user again
            this.authService.currentUser$.pipe(take(1)).subscribe(validatedUser => {
              if (validatedUser && validatedUser.userId) {
                console.log('User found after token validation:', validatedUser);
                this.fetchStatisticsData(validatedUser.userId);
              } else {
                this.handleUserNotFound();
              }
            });
          } else {
            this.handleUserNotFound();
          }
        });
      } else {
        console.log('User found in currentUser$:', user);
        this.fetchStatisticsData(user.userId);
      }
    });
  }

  /**
   * Fetch statistics data with userId
   */
  private fetchStatisticsData(userId: string) {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth() + 1;
    const monthStr = month.toString().padStart(2, '0');

    console.log(`Loading statistics for userId: ${userId}, year: ${year}, month: ${monthStr}`);

    // Create object to hold all API requests with userId parameter
    const requests = {
      stats: this.http.get<WorkoutStats>(`${this.apiUrl}/statistics/profile-page-stats?userId=${userId}`).pipe(
        catchError(this.handleError<WorkoutStats>('workout stats', { totalWorkouts: 0, uniqueDays: 0, hoursActive: 0 }))
      ),
      streaks: this.http.get<WorkoutStreakData>(`${this.apiUrl}/statistics/streaks?userId=${userId}`).pipe(
        catchError(this.handleError<WorkoutStreakData>('workout streaks', 
          { currentStreak: 0, longestStreak: 0, lastWorkoutDate: '', workoutDates: [] }))
      ),
      calendarData: this.http.get<CalendarDayData[]>(
        `${this.apiUrl}/statistics/calendar/${year}/${monthStr}?userId=${userId}`
      ).pipe(
        catchError(this.handleError<CalendarDayData[]>('calendar data', []))
      )
    };

    // Execute all requests in parallel
    forkJoin(requests).pipe(
      finalize(() => {
        this.isLoading = false;
      })
    ).subscribe({
      next: (results) => {
        console.log('API requests succeeded:', results);
        
        // Process stats data
        this.workoutStats = results.stats;
        
        // Process streak data
        this.workoutStreak = results.streaks;
        
        // Calculate days since last workout
        if (this.workoutStreak.lastWorkoutDate) {
          const lastDate = new Date(this.workoutStreak.lastWorkoutDate);
          const today = new Date();
          this.daysSinceLastWorkout = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        }
        
        // Process calendar data
        if (results.calendarData && results.calendarData.length > 0) {
          this.processCalendarData(results.calendarData);
        }
        
        // Generate the calendar display
        this.generateCalendarDays();
      },
      error: (err) => {
        console.error('Error loading statistics:', err);
        this.error = 'Failed to load statistics. Please try again.';
      }
    });
  }

  /**
   * Handle when user is not found
   */
  private handleUserNotFound() {
    console.error('User ID not found. Please log in again.');
    this.error = 'User ID not found. Please log in again.';
    this.isLoading = false;
  }

  /**
   * Process calendar data from API response
   */
  processCalendarData(calendarData: CalendarDayData[]) {
    this.workoutDates.clear();
    
    console.log('Processing calendar data:', calendarData);
    
    // Extract dates that have workouts
    calendarData.forEach(day => {
      if (day.hasWorkout) {
        // Get the date string in YYYY-MM-DD format
        const dateStr = typeof day.date === 'string' 
          ? day.date 
          : new Date(day.date).toISOString().split('T')[0];
          
        this.workoutDates.add(dateStr);
      }
    });
    
    console.log('Workout dates:', Array.from(this.workoutDates));
  }

  /**
   * Generate custom calendar days for the current month
   */
  generateCalendarDays() {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    
    console.log(`Generating calendar for ${year}-${month+1}`);
    console.log('Workout dates to highlight:', Array.from(this.workoutDates));
    
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    const firstDayOfCalendar = new Date(firstDayOfMonth);
    firstDayOfCalendar.setDate(1 - firstDayOfMonth.getDay());
    
    const lastDayOfCalendar = new Date(lastDayOfMonth);
    lastDayOfCalendar.setDate(lastDayOfMonth.getDate() + (6 - lastDayOfMonth.getDay()));
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    this.calendarDays = [];
    let currentDate = new Date(firstDayOfCalendar);
    
    // Generate all days for the calendar grid
    while (currentDate <= lastDayOfCalendar) {
      const dateStr = this.formatDateToYYYYMMDD(currentDate);
      const hasWorkout = this.workoutDates.has(dateStr);
      
      if (hasWorkout) {
        console.log(`Day ${dateStr} has workout, will be highlighted`);
      }
      
      this.calendarDays.push({
        date: new Date(currentDate),
        isCurrentMonth: currentDate.getMonth() === month,
        hasWorkout: hasWorkout,
        isToday: currentDate.getTime() === today.getTime(),
        isSelected: this.selectedDate === dateStr
      });
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }
  
  /**
   * Format date to YYYY-MM-DD format
   */
  formatDateToYYYYMMDD(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Navigate to previous month
   */
  previousMonth() {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() - 1,
      1
    );
    this.loadStatistics();
  }

  /**
   * Navigate to next month
   */
  nextMonth() {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() + 1,
      1
    );
    this.loadStatistics();
  }
  
  /**
   * Select a date from the calendar
   */
  selectDate(day: any) {
    if (day.isCurrentMonth) {
      const dateStr = this.formatDateToYYYYMMDD(day.date);
      this.selectedDate = dateStr;
      
      // Update selected state in calendar days
      this.calendarDays = this.calendarDays.map(d => ({
        ...d,
        isSelected: this.formatDateToYYYYMMDD(d.date) === dateStr
      }));
      
      console.log('Selected date:', dateStr);
    }
  }
  
  /**
   * Generic error handler for HTTP requests
   */
  private handleError<T>(operation = 'operation', result?: T) {
    return (error: HttpErrorResponse) => {
      console.error(`${operation} failed: ${error.message}`);
      
      // Let the app keep running by returning an empty result
      return of(result as T);
    };
  }
}
