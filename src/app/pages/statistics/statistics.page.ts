import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProfileService } from '../../services/profile.service';
import { WorkoutHistoryService } from '../../services/workout-history.service';
import { WorkoutHistory } from '../../models/workout-history.model';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { FormatDurationPipe } from '../../pipes/format-duration.pipe';
import { FormsModule } from '@angular/forms';
import { StatisticsService } from '../../services/statistics.service';
import { 
  MuscleGroupStats, 
  CalendarDayData,
  WorkoutStreakData,
  WorkoutStats
} from '../../models/statistics.model';
import { environment } from '../../../environments/environment';

Chart.register(...registerables);

/**
 * Interface for muscle group data to display in stats
 */
interface MuscleGroupData {
  name: string;       // Muscle group name (e.g., 'Chest')
  volume: number;     // Volume (weight × reps) or count
  color: string;      // Color for chart display
}

/**
 * Interface for calendar day data
 */
interface CalendarDay {
  date: Date;                 // Full date object
  hasWorkout: boolean;        // Whether the day has workouts
  dayNumber: number;          // Day of month (1-31)
  workouts?: WorkoutHistory[]; // List of workouts on this day
}

/**
 * Interface for time-based chart data
 */
interface TimeChartData {
  labels: string[];   // X-axis labels (e.g., day names, months)
  data: number[];     // Y-axis data (e.g., hours)
}

// Using WorkoutStreakData from models/statistics.model.ts instead of local definition

@Component({
  selector: 'app-statistics',
  templateUrl: './statistics.page.html',
  styleUrls: ['./statistics.page.scss'],  standalone: true,
  imports: [IonicModule, CommonModule, RouterLink, FormsModule, FormatDurationPipe]
})
export class StatisticsPage implements OnInit {
  @ViewChild('consistencyChart') consistencyChartCanvas!: ElementRef;
  @ViewChild('muscleGroupChart') muscleGroupChartCanvas!: ElementRef;
  @ViewChild('timeChart') timeChartCanvas!: ElementRef;
  
  consistencyChart: any;
  muscleGroupChart: any;
  timeChart: any;
  isLoading = true;
  
  // Calendar data
  currentMonth: Date = new Date();
  calendarDays: CalendarDay[] = [];
  weekDays: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  // Stats data
  workoutStats: WorkoutStats = { totalWorkouts: 0, uniqueDays: 0, hoursActive: 0 };
  workoutHistory: WorkoutHistory[] = [];
  
  // Muscle group data
  muscleGroups: MuscleGroupData[] = [
    { name: 'Chest', volume: 0, color: 'rgba(255, 99, 132, 0.7)' },
    { name: 'Back', volume: 0, color: 'rgba(54, 162, 235, 0.7)' },
    { name: 'Legs', volume: 0, color: 'rgba(255, 206, 86, 0.7)' },
    { name: 'Shoulders', volume: 0, color: 'rgba(75, 192, 192, 0.7)' },
    { name: 'Arms', volume: 0, color: 'rgba(153, 102, 255, 0.7)' },
    { name: 'Core', volume: 0, color: 'rgba(255, 159, 64, 0.7)' }
  ];
  
  // Streak data
  workoutStreak: WorkoutStreakData = { 
    currentStreak: 0, 
    longestStreak: 0, 
    lastWorkoutDate: '', 
    workoutDates: [] 
  };
  
  daysSinceLastWorkout: number = 0;

  // Time period selection for the hours graph
  timePeriod: 'week' | 'month' | 'year' = 'month';
  
  // Selected day data
  selectedDay: CalendarDay | null = null;
    constructor(
    private profileService: ProfileService,
    private workoutHistoryService: WorkoutHistoryService,
    private statisticsService: StatisticsService
  ) { }
  ngOnInit() { }
  
  ionViewDidEnter() {
    // Fully synchronous processing - no worker needed
    this.loadStatistics();
  }
  
  ionViewDidLeave() {
    // Cleanup chart instances
    if (this.consistencyChart) {
      this.consistencyChart.destroy();
    }
    if (this.muscleGroupChart) {
      this.muscleGroupChart.destroy();
    }
    if (this.timeChart) {
      this.timeChart.destroy();
    }
  }
  
  loadStatistics() {
    this.isLoading = true;
    
    // First, quickly load streak and high-level stats for instant feedback
    this.loadStreakAndBasicStats();
    
    // Then load full statistics data
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth() + 1; // API expects 1-12
    
    // Load workout stats, history, streak data, calendar data, and muscle group data in parallel
    forkJoin({
      stats: this.profileService.getWorkoutStats().pipe(
        catchError(err => {
          if (!environment.production) console.error('Error fetching workout stats:', err);
          return of({ totalWorkouts: 0, uniqueDays: 0, hoursActive: 0 });
        })
      ),
      history: this.workoutHistoryService.getWorkoutHistory().pipe(
        catchError(err => {
          if (!environment.production) console.error('Error fetching workout history:', err);
          return of([]);
        })
      ),
      muscleGroups: this.statisticsService.getMuscleGroupDistribution().pipe(
        catchError(err => {
          if (!environment.production) console.error('Error fetching muscle group data:', err);
          return of([]);
        })
      ),
      streaks: this.statisticsService.getWorkoutStreaks().pipe(
        catchError(err => {
          if (!environment.production) console.error('Error fetching workout streaks:', err);
          return of({ 
            currentStreak: 0, 
            longestStreak: 0, 
            lastWorkoutDate: '', 
            workoutDates: [] 
          });
        })
      ),
      calendarData: this.statisticsService.getCalendarData(year, month).pipe(
        catchError(err => {
          if (!environment.production) console.error('Error fetching calendar data:', err);
          return of([]);
        })
      )
    }).subscribe({
      next: (result: { 
        stats: WorkoutStats; 
        history: WorkoutHistory[]; 
        muscleGroups: MuscleGroupStats[];
        streaks: WorkoutStreakData;
        calendarData: CalendarDayData[];
      }) => {
        // Parse workout history and other data only once to avoid redundant parsing
        this.workoutStats = result.stats;
        this.workoutHistory = result.history || [];
        this.workoutStreak = result.streaks;
        
        // Calculate days since last workout
        if (this.workoutStreak.lastWorkoutDate) {
          const lastDate = new Date(this.workoutStreak.lastWorkoutDate);
          const today = new Date();
          this.daysSinceLastWorkout = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        }
        
        // Show streak data immediately
        this.isLoading = false;
        
        // Process muscle group data in parallel with chart creation
        if (result.muscleGroups && result.muscleGroups.length > 0) {
          this.updateMuscleGroupsFromStats(result.muscleGroups);
        } else {
          this.calculateMuscleGroupDistribution();
        }
          // Use calendar data from backend if available
        if (result.calendarData && result.calendarData.length > 0) {
          this.updateCalendarFromBackendData(result.calendarData);
        } else {
          this.generateCalendarDays();
        }
        
        // Create muscle group chart immediately since data is available
        requestAnimationFrame(() => {
          this.createMuscleGroupChart();
        });
          // Process chart data
        this.startChartDataProcessing();
      },      error: (err) => {
        if (!environment.production) {
          console.error('Error loading statistics data:', err);
        }
        
        // Even on error, show some data
        this.workoutStats = { totalWorkouts: 0, uniqueDays: 0, hoursActive: 0 };
        this.workoutHistory = [];
        this.generateCalendarDays();
        this.calculateMuscleGroupDistribution();
        this.isLoading = false;
      },
      complete: () => {
        if (!environment.production) {
          console.log('Statistics loading complete');
        }
      }
    });
  }
  
  /**
   * Load streak and basic stats first for a faster initial render
   */
  loadStreakAndBasicStats() {
    this.statisticsService.getWorkoutStreaks().pipe(
      catchError(() => of({ currentStreak: 0, longestStreak: 0, lastWorkoutDate: '', workoutDates: [] }))
    ).subscribe(streaks => {
      this.workoutStreak = streaks;
      
      // Calculate days since last workout
      if (this.workoutStreak.lastWorkoutDate) {
        const lastDate = new Date(this.workoutStreak.lastWorkoutDate);
        const today = new Date();
        this.daysSinceLastWorkout = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      }
    });
  }
  /**
   * Start chart data processing
   */
  startChartDataProcessing() {
    // Process all chart data
    this.createConsistencyChart();
    this.createTimeChart();
  }
    /**
   * Create chart with data
   */
  createChartWithData(chartType: 'consistency' | 'time' | 'muscleGroup', data: any) {
    switch(chartType) {
      case 'consistency':
        if (this.consistencyChart) {
          this.consistencyChart.destroy();
        }
        
        if (!this.consistencyChartCanvas?.nativeElement) return;
        
        const ctxConsistency = this.consistencyChartCanvas.nativeElement.getContext('2d');
        if (!ctxConsistency) return;
        
        this.consistencyChart = new Chart(ctxConsistency, {
          type: 'bar',
          data: {
            labels: data.labels,
            datasets: [{
              label: 'Workout Minutes',
              data: data.data,
              backgroundColor: 'rgba(75, 192, 192, 0.7)',
              borderColor: 'rgba(75, 192, 192, 1)',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            scales: {
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: 'Minutes'
                }
              }
            },
            plugins: {
              title: {
                display: true,
                text: 'Last 7 Days Workout Consistency'
              }
            }
          }
        });
        break;
      case 'time':
        if (this.timeChart) {
          this.timeChart.destroy();
        }
        
        if (!this.timeChartCanvas?.nativeElement) return;
        
        const ctxTime = this.timeChartCanvas.nativeElement.getContext('2d');
        if (!ctxTime) return;
        
        let chartTitle: string;
        switch(this.timePeriod) {
          case 'week':
            chartTitle = 'Hours Spent in Gym (Last 7 Days)';
            break;
          case 'year':
            chartTitle = 'Hours Spent in Gym (Last 12 Months)';
            break;
          default:
            chartTitle = 'Hours Spent in Gym (Last 30 Days)';
            break;
        }
        
        this.timeChart = new Chart(ctxTime, {
          type: 'line',
          data: {
            labels: data.labels,
            datasets: [{
              label: 'Hours',
              data: data.data,
              backgroundColor: 'rgba(54, 162, 235, 0.7)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 2,
              fill: {
                target: 'origin',
                above: 'rgba(54, 162, 235, 0.2)',
              },
              tension: 0.4
            }]
          },
          options: {
            responsive: true,
            scales: {
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: 'Hours'
                }
              }
            },
            plugins: {
              title: {
                display: true,
                text: chartTitle
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) {
                      label += ': ';
                    }
                    if (context.parsed.y !== null) {
                      label += context.parsed.y.toFixed(1) + ' hours';
                    }
                    return label;
                  }
                }
              }
            }
          }
        });
        break;
    }
  }
  /**
   * Update calendar using data from the backend
   */
  updateCalendarFromBackendData(calendarData: CalendarDayData[]) {
    this.calendarDays = [];
    
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    
    // First day of the month
    const firstDayOfMonth = new Date(year, month, 1);
    // Last day of the month
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    // Get the day of week the month starts on (0-6)
    const firstDayOfWeek = firstDayOfMonth.getDay();    // Create lookup map for backend calendar data
    const calendarLookup = new Map<string, boolean>();
    
    // Process all days in one batch for performance
    for (const day of calendarData) {
      try {
        // Handle date regardless of format (string, Date object, or ISO string)
        let dateStr: string;
        if (typeof day.date === 'string') {
          // If it's already a string, just extract YYYY-MM-DD
          dateStr = day.date.split('T')[0];
        } else if (day.date instanceof Date) {
          // If it's a Date object
          dateStr = day.date.toISOString().split('T')[0];
        } else {
          // Fallback
          dateStr = String(day.date);
        }
        
        calendarLookup.set(dateStr, day.hasWorkout);
      } catch (error) {
        // Minimize console logging in production
        if (!environment.production) {
          console.error('Error processing calendar date:', error);
        }
      }
    }
    
    // Add padding days from previous month
    for (let i = 0; i < firstDayOfWeek; i++) {
      const paddingDate = new Date(year, month, -firstDayOfWeek + i + 1);
      const dateStr = paddingDate.toISOString().split('T')[0];
      const hasWorkout = calendarLookup.has(dateStr) ? calendarLookup.get(dateStr) : false;
      
      this.calendarDays.push({
        date: paddingDate,
        hasWorkout: !!hasWorkout,
        dayNumber: paddingDate.getDate(),
        workouts: []  // We don't have detailed workout info from the backend
      });
    }
    
    // Add days for current month
    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
      const currentDate = new Date(year, month, day);
      const dateStr = currentDate.toISOString().split('T')[0];
      const hasWorkout = calendarLookup.has(dateStr) ? calendarLookup.get(dateStr) : false;
      
      this.calendarDays.push({
        date: currentDate,
        hasWorkout: !!hasWorkout,
        dayNumber: day,
        workouts: []  // We don't have detailed workout info from the backend
      });
    }
    
    // Add padding days for next month if needed to complete the grid
    const remainingDays = (7 - (this.calendarDays.length % 7)) % 7;
    for (let i = 1; i <= remainingDays; i++) {
      const paddingDate = new Date(year, month + 1, i);
      const dateStr = paddingDate.toISOString().split('T')[0];
      const hasWorkout = calendarLookup.has(dateStr) ? calendarLookup.get(dateStr) : false;
      
      this.calendarDays.push({
        date: paddingDate,
        hasWorkout: !!hasWorkout,
        dayNumber: paddingDate.getDate(),
        workouts: []  // We don't have detailed workout info from the backend
      });
    }
  }

  /**
   * Update muscle group data from backend stats
   */
  updateMuscleGroupsFromStats(stats: MuscleGroupStats[]) {
    // Reset all volumes
    this.muscleGroups.forEach(group => group.volume = 0);
    
    // Map the stats to our muscle groups
    stats.forEach(stat => {
      const muscleGroup = this.muscleGroups.find(group => 
        group.name.toLowerCase() === stat.muscleGroup.toLowerCase()
      );
      
      if (muscleGroup) {
        muscleGroup.volume = stat.workoutCount;
      }
    });
  }
  
  /**
   * Generate the calendar days for the current month
   */
  generateCalendarDays() {
    this.calendarDays = [];
    
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    
    // First day of the month
    const firstDayOfMonth = new Date(year, month, 1);
    // Last day of the month
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    // Get the day of week the month starts on (0-6)
    const firstDayOfWeek = firstDayOfMonth.getDay();
    
    // Add padding days from previous month
    for (let i = 0; i < firstDayOfWeek; i++) {
      const paddingDate = new Date(year, month, -firstDayOfWeek + i + 1);
      const workouts = this.getWorkoutsForDate(paddingDate);
      this.calendarDays.push({
        date: paddingDate,
        hasWorkout: workouts.length > 0,
        dayNumber: paddingDate.getDate(),
        workouts: workouts
      });
    }
    
    // Add days for current month
    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
      const currentDate = new Date(year, month, day);
      const workouts = this.getWorkoutsForDate(currentDate);
      this.calendarDays.push({
        date: currentDate,
        hasWorkout: workouts.length > 0,
        dayNumber: day,
        workouts: workouts
      });
    }
    
    // Add padding days for next month if needed to complete the grid
    const remainingDays = (7 - (this.calendarDays.length % 7)) % 7;
    for (let i = 1; i <= remainingDays; i++) {
      const paddingDate = new Date(year, month + 1, i);
      const workouts = this.getWorkoutsForDate(paddingDate);
      this.calendarDays.push({
        date: paddingDate,
        hasWorkout: workouts.length > 0,
        dayNumber: paddingDate.getDate(),
        workouts: workouts
      });
    }
  }
  
  /**
   * Get all workouts for a specific date
   */
  getWorkoutsForDate(date: Date): WorkoutHistory[] {
    const dateString = date.toISOString().split('T')[0]; // Get YYYY-MM-DD format
    return this.workoutHistory.filter(workout => workout.date === dateString);
  }
  
  /**
   * Check if there was a workout on a specific date
   */
  hasWorkoutOnDate(date: Date): boolean {
    const dateString = date.toISOString().split('T')[0]; // Get YYYY-MM-DD format
    return this.workoutHistory.some(workout => workout.date === dateString);
  }
    /**
   * Navigate to previous month in the calendar
   */
  previousMonth() {
    // Only modify month display text without setting isLoading to true
    // to avoid full page spinner when just changing months
    const calendarTitle = document.querySelector('.calendar-title') as HTMLElement;
    if (calendarTitle) {
      calendarTitle.classList.add('loading');
    }
    const calendarSpinner = document.querySelector('.calendar-spinner') as HTMLElement;
    if (calendarSpinner) {
      calendarSpinner.style.display = 'block';
    }
    
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() - 1,
      1
    );
    
    // Fetch calendar data for the new month
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth() + 1; // API expects 1-12
    
    this.statisticsService.getCalendarData(year, month).pipe(
      catchError(err => {
        if (!environment.production) {
          console.error('Error fetching calendar data for previous month:', err);
        }
        return of([]);
      })
    ).subscribe(calendarData => {
      // Hide calendar spinner
      if (calendarTitle) {
        calendarTitle.classList.remove('loading');
      }
      if (calendarSpinner) {
        calendarSpinner.style.display = 'none';
      }
        if (calendarData && calendarData.length > 0) {
        this.updateCalendarFromBackendData(calendarData);
      } else {
        this.generateCalendarDays();
      }
    });
  }
  
  /**
   * Navigate to next month in the calendar
   */
  nextMonth() {
    // Only modify month display text without setting isLoading to true
    const calendarTitle = document.querySelector('.calendar-title') as HTMLElement;
    if (calendarTitle) {
      calendarTitle.classList.add('loading');
    }
    
    // Show spinner for calendar section only
    const calendarSpinner = document.querySelector('.calendar-spinner') as HTMLElement;
    if (calendarSpinner) {
      calendarSpinner.style.display = 'block';
    }
    
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() + 1,
      1
    );
    
    // Fetch calendar data for the new month
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth() + 1; // API expects 1-12
    
    this.statisticsService.getCalendarData(year, month).pipe(
      catchError(err => {
        if (!environment.production) {
          console.error('Error fetching calendar data for next month:', err);
        }
        return of([]);
      })
    ).subscribe(calendarData => {
      // Hide calendar spinner
      if (calendarTitle) {
        calendarTitle.classList.remove('loading');
      }
      if (calendarSpinner) {
        calendarSpinner.style.display = 'none';
      }
        if (calendarData && calendarData.length > 0) {
        this.updateCalendarFromBackendData(calendarData);
      } else {
        this.generateCalendarDays();
      }
    });
  }/**
   * Calculate muscle group distribution from workout history
   * This is a simplified version - in a real app, you would need backend data
   */
  calculateMuscleGroupDistribution() {
    // Reset all volumes
    this.muscleGroups.forEach(group => group.volume = 0);
    
    // This is simplified - in a real app, you would need actual muscle group data from each exercise
    // For now, we'll use sample data
    const totalWorkouts = this.workoutHistory.length;
    if (totalWorkouts > 0) {
      // Distribute workouts based on workout names or a simple algorithm
      this.muscleGroups[0].volume = Math.floor(totalWorkouts * 0.25); // Chest
      this.muscleGroups[1].volume = Math.floor(totalWorkouts * 0.20); // Back
      this.muscleGroups[2].volume = Math.floor(totalWorkouts * 0.22); // Legs
      this.muscleGroups[3].volume = Math.floor(totalWorkouts * 0.12); // Shoulders
      this.muscleGroups[4].volume = Math.floor(totalWorkouts * 0.15); // Arms
      this.muscleGroups[5].volume = Math.floor(totalWorkouts * 0.06); // Core
    }
  }
  /**   * Create consistency chart (calendar view)
   */
  createConsistencyChart() {
    if (this.consistencyChart) {
      this.consistencyChart.destroy();
    }

    if (!this.consistencyChartCanvas?.nativeElement) {
      return;
    }

    const ctx = this.consistencyChartCanvas.nativeElement.getContext('2d');
    if (!ctx) {
      return;
    }
    
    // Prepare last 7 days data
    const lastWeekData = this.getLastNDaysData(7);
    
    // Create chart with the processed data
    this.createChartWithData('consistency', lastWeekData);
  }
  /**
   * Create muscle group distribution pie chart
   */
  createMuscleGroupChart() {
    if (this.muscleGroupChart) {
      this.muscleGroupChart.destroy();
    }

    if (!this.muscleGroupChartCanvas?.nativeElement) {
      console.warn('Muscle group chart canvas element not found');
      return;
    }

    const ctx = this.muscleGroupChartCanvas.nativeElement.getContext('2d');
    if (!ctx) {
      console.warn('Could not get 2D context for muscle group chart');
      return;
    }
    
    this.muscleGroupChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: this.muscleGroups.map(group => group.name),
        datasets: [{
          label: 'Volume by Muscle Group',
          data: this.muscleGroups.map(group => group.volume),
          backgroundColor: this.muscleGroups.map(group => group.color),
          borderColor: this.muscleGroups.map(group => group.color.replace('0.7', '1')),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Volume by Muscle Group'
          },
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }
  /**   * Create time chart showing hours spent working out
   */
  createTimeChart() {
    if (this.timeChart) {
      this.timeChart.destroy();
    }
    
    if (!this.timeChartCanvas) {
      return; // Canvas not yet available
    }

    // Get data based on selected time period
    let timeData: TimeChartData;
    
    switch(this.timePeriod) {
      case 'week':
        timeData = this.getLastNDaysData(7);
        break;
      case 'year':
        timeData = this.getLastNMonthsData(12);
        break;
      default:
        timeData = this.getLastNDaysData(30);
        break;
    }
    
    // Create chart with the processed data
    this.createChartWithData('time', timeData);
  }  /**
   * Update the time chart when time period changes
   */
  onTimePeriodChange() {
    // Always use synchronous processing
    this.createTimeChart();
  }
  
  /**
   * Get data for the last N days
   */
  private getLastNDaysData(days: number): TimeChartData {
    const labels: string[] = [];
    const data: number[] = [];
    
    const today = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const dayName = this.weekDays[date.getDay()];
      labels.push(dayName);
      
      // Find workouts for this day
      const dateString = date.toISOString().split('T')[0];
      const workoutsOnDay = this.workoutHistory.filter(w => w.date === dateString);
        // Calculate hours (simplified example)
      let totalHours = 0;
      workoutsOnDay.forEach(workout => {
        if (workout.duration) {
          // Convert ISO duration to hours
          const durationMatch = workout.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
          if (durationMatch) {
            const hoursVal = parseInt(durationMatch[1] || '0');
            const minutes = parseInt(durationMatch[2] || '0');
            const seconds = parseInt(durationMatch[3] || '0');
            
            // Calculate total hours
            totalHours += hoursVal + minutes / 60 + seconds / 3600;
          }
        }
      });
      
      data.push(Math.round(totalHours * 10) / 10); // Round to 1 decimal
    }
    
    return { labels, data };
  }
  
  /**
   * Get data for the last N months
   */
  private getLastNMonthsData(months: number): TimeChartData {
    const labels: string[] = [];
    const data: number[] = [];
    
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    for (let i = months - 1; i >= 0; i--) {
      let month = currentMonth - i;
      let year = currentYear;
      
      if (month < 0) {
        month += 12;
        year -= 1;
      }
      
      const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'short' });
      labels.push(monthName);
      
      // For each workout in this month, calculate hours
      let totalHours = 0;
      this.workoutHistory.forEach(workout => {
        const workoutDate = new Date(workout.date);
        if (workoutDate.getMonth() === month && workoutDate.getFullYear() === year) {
          if (workout.duration) {            // Convert ISO duration to hours
            const durationMatch = workout.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
            if (durationMatch) {
              const hoursVal = parseInt(durationMatch[1] || '0');
              const minutes = parseInt(durationMatch[2] || '0');
              const seconds = parseInt(durationMatch[3] || '0');
              
              // Calculate total hours
              totalHours += hoursVal + minutes / 60 + seconds / 3600;
            }
          }
        }
      });
      
      data.push(Math.round(totalHours * 10) / 10); // Round to 1 decimal
    }
    
    return { labels, data };
  }

  /**
   * Show details for a specific calendar day
   */
  showDayDetails(day: CalendarDay) {
    this.selectedDay = day;
  }
}
