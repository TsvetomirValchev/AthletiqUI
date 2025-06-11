import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, finalize, forkJoin, of, switchMap, take } from 'rxjs';
import { environment } from '../../../environments/environment';
import { WorkoutStreakData } from '../../models/workout-streak-data.model';
import { WorkoutStats } from '../../models/workout-stats.model';
import { CalendarDay } from '../../models/calendar-day.model';
import { AuthService } from '../../services/auth.service';
import { MuscleGroupChartComponent } from '../../components/muscle-group-chart/muscle-group-chart.component';

@Component({
  selector: 'app-statistics',
  templateUrl: './statistics.page.html',
  styleUrls: ['./statistics.page.scss'],
  standalone: true,
  imports: [
    IonicModule, 
    CommonModule, 
    RouterLink,
    FormsModule,
    MuscleGroupChartComponent
  ]
})
export class StatisticsPage implements OnInit {
  isLoading = true;
  error: string | null = null;

  currentMonth = new Date();
  workoutDates: Set<string> = new Set();
  selectedDate: string | null = null;
  
  calendarDays: {
    date: Date;
    isCurrentMonth: boolean;
    hasWorkout: boolean;
    isToday: boolean;
    isSelected: boolean;
  }[] = [];
  weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  
  workoutStats: WorkoutStats = { totalWorkouts: 0, uniqueDays: 0, hoursActive: 0 };
  workoutStreak: WorkoutStreakData = {
    currentStreak: 0,
    longestStreak: 0,
    lastWorkoutDate: '',
    workoutDates: []
  };
  daysSinceLastWorkout = 0;
  
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.loadStatistics();
  }

  ionViewDidEnter() {
    this.loadStatistics();
  }

  loadStatistics() {
    this.isLoading = true;
    this.error = null;

    this.authService.currentUser$.pipe(take(1)).subscribe(user => {
      if (!user || !user.userId) {
        this.authService.currentUser$.pipe(
          take(1),
          switchMap(user => {
            if (user && user.userId) {
              return of(true);
            } else {
              const token = this.authService.getToken();
              return of(!!token);
            }
          })
        ).subscribe(valid => {
          if (valid) {
            this.authService.currentUser$.pipe(take(1)).subscribe(validatedUser => {
              if (validatedUser && validatedUser.userId) {
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
        this.fetchStatisticsData(user.userId);
      }
    });
  }

  private fetchStatisticsData(userId: string) {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth() + 1;
    const monthStr = month.toString().padStart(2, '0');

    const requests = {
      stats: this.http.get<WorkoutStats>(`${this.apiUrl}/statistics/profile-page-stats?userId=${userId}`).pipe(
        catchError(this.handleError<WorkoutStats>('workout stats', { totalWorkouts: 0, uniqueDays: 0, hoursActive: 0 }))
      ),
      streaks: this.http.get<WorkoutStreakData>(`${this.apiUrl}/statistics/streaks?userId=${userId}`).pipe(
        catchError(this.handleError<WorkoutStreakData>('workout streaks', 
          { currentStreak: 0, longestStreak: 0, lastWorkoutDate: '', workoutDates: [] }))
      ),
      calendarData: this.http.get<CalendarDay[]>(
        `${this.apiUrl}/statistics/calendar/${year}/${monthStr}?userId=${userId}`
      ).pipe(
        catchError(this.handleError<CalendarDay[]>('calendar data', []))
      )
    };

    forkJoin(requests).pipe(
      finalize(() => {
        this.isLoading = false;
      })
    ).subscribe({
      next: (results) => {
        this.workoutStats = results.stats;
        
        this.workoutStreak = results.streaks;
        
        if (this.workoutStreak.lastWorkoutDate) {
          const lastDate = new Date(this.workoutStreak.lastWorkoutDate);
          const today = new Date();
          this.daysSinceLastWorkout = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        }
        
        if (results.calendarData && results.calendarData.length > 0) {
          this.processCalendarData(results.calendarData);
        }
        
        this.generateCalendarDays();
      },
      error: (err) => {
        this.error = 'Failed to load statistics. Please try again.';
      }
    });
  }

  private handleUserNotFound() {
    this.error = 'User ID not found. Please log in again.';
    this.isLoading = false;
  }

  processCalendarData(calendarData: CalendarDay[]) {
    this.workoutDates.clear();
    
    calendarData.forEach(day => {
      if (day.hasWorkout) {
        const dateStr = typeof day.date === 'string' 
          ? day.date 
          : new Date(day.date).toISOString().split('T')[0];
          
        this.workoutDates.add(dateStr);
      }
    });
  }

  generateCalendarDays() {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    
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
    
    while (currentDate <= lastDayOfCalendar) {
      const dateStr = this.formatDateToYYYYMMDD(currentDate);
      const hasWorkout = this.workoutDates.has(dateStr);
      
      this.calendarDays.push({
        date: new Date(currentDate),
        isCurrentMonth: currentDate.getMonth() === month,
        hasWorkout: hasWorkout,
        isToday: currentDate.getTime() === today.getTime(),
        isSelected: this.selectedDate === dateStr
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }
  
  formatDateToYYYYMMDD(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  previousMonth() {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() - 1,
      1
    );
    this.loadStatistics();
  }

  nextMonth() {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() + 1,
      1
    );
    this.loadStatistics();
  }
  
  selectDate(day: any) {
    if (day.isCurrentMonth) {
      const dateStr = this.formatDateToYYYYMMDD(day.date);
      this.selectedDate = dateStr;
      
      this.calendarDays = this.calendarDays.map(d => ({
        ...d,
        isSelected: this.formatDateToYYYYMMDD(d.date) === dateStr
      }));
    }
  }
  
  private handleError<T>(operation = 'operation', result?: T) {
    return (error: HttpErrorResponse) => {
      return of(result as T);
    };
  }
}