import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { filter } from 'rxjs/operators';
import { ActiveWorkoutService } from '../../services/active-workout.service';
import { StorageService } from '../../services/storage.service';

@Component({
  selector: 'app-workout-banner',
  templateUrl: './workout-banner.component.html',
  styleUrls: ['./workout-banner.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class WorkoutBannerComponent implements OnInit, OnDestroy {
  hasActiveWorkout = false;
  workoutName = '';
  workoutId = '';
  isVisibleOnCurrentPage = true;
  private subscription: Subscription | null = null;
  private routerSubscription: Subscription | null = null;

  constructor(
    private activeWorkoutService: ActiveWorkoutService,
    private router: Router,
    private storage: StorageService
  ) {
    console.log('WorkoutBannerComponent constructor');
  }

  ngOnInit() {
    console.log('WorkoutBannerComponent initialized');
    
    // Check if we should show the banner on current route
    this.checkCurrentRoute(this.router.url);
    
    // Listen for route changes to hide/show banner accordingly
    this.routerSubscription = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.checkCurrentRoute(event.url);
    });
    
    // Debug check if there's an active session directly from ActiveWorkoutService
    const currentSession = this.activeWorkoutService.getCurrentSession();
    console.log('Current session from service on init:', currentSession);

    // Also check localStorage directly as a backup
    this.checkLocalStorage();
    
    // Subscribe to the current workout for real-time updates
    this.subscription = this.activeWorkoutService.currentWorkout$.subscribe(workout => {
      console.log('Workout banner received workout update:', workout);
      
      if (workout && workout.workoutId) {
        this.hasActiveWorkout = true;
        this.workoutName = workout.name || 'Workout';
        this.workoutId = workout.workoutId;
        console.log(`Active workout detected: ${this.workoutName} (${this.workoutId})`);
      } else {
        // Only set to false if we don't have a workout from localStorage
        if (!this.hasActiveWorkout) {
          console.log('No active workout detected from observable or localStorage');
        }
      }
    });
    
    // Subscribe to completion events
    this.subscription.add(
      this.activeWorkoutService.workoutCompleted$.subscribe(() => {
        console.log('Banner received workout completed notification');
        this.hasActiveWorkout = false;
        this.workoutId = '';
        this.workoutName = '';
      })
    );
  }
  
  // Check if we should show the banner on this route
  private checkCurrentRoute(url: string): void {
    // Hide the banner if we're on the active workout page
    this.isVisibleOnCurrentPage = !url.includes('/active-workout/');
    console.log(`Banner visibility on ${url}: ${this.isVisibleOnCurrentPage}`);
  }

  private async checkLocalStorage() {
    try {
      const savedSession = await this.storage.getItem('activeWorkoutSession');
      if (savedSession) {
        const session = JSON.parse(savedSession);
        if (session && session.workout && session.workout.workoutId) {
          this.hasActiveWorkout = true;
          this.workoutName = session.workout.name || 'Workout';
          this.workoutId = session.workout.workoutId;
          console.log(`Active workout found in localStorage: ${this.workoutName} (${this.workoutId})`);
        }
      } else {
        console.log('No active workout in localStorage');
      }
    } catch (error) {
      console.error('Error checking localStorage:', error);
    }
  }

  ngOnDestroy() {
    console.log('WorkoutBannerComponent being destroyed');
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }

  resumeWorkout() {
    if (this.workoutId) {
      console.log(`Resuming workout: ${this.workoutId}`);
      
      // First unpause the workout
      this.activeWorkoutService.resumeWorkout();
      
      // Then navigate to the workout page
      this.router.navigate(['/active-workout', this.workoutId]);
    }
  }

  discardWorkout() {
    if (this.workoutId) {
      console.log('Discarding workout');
      this.activeWorkoutService.clearSavedSession().then(() => {
        this.hasActiveWorkout = false;
        this.workoutId = '';
        this.workoutName = '';
        console.log('Workout discarded successfully');
      });
    }
  }
}
