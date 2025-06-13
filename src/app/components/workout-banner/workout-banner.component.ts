import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
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
    
    this.checkCurrentRoute(this.router.url);
    
    this.routerSubscription = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.checkCurrentRoute(event.url);
    });
    
    this.subscription = this.activeWorkoutService.currentWorkout$.subscribe(workout => {
      console.log('Workout banner received workout update:', workout);
      
      if (workout && workout.workoutId) {
        this.hasActiveWorkout = true;
        this.workoutName = workout.name || 'Workout';
        this.workoutId = workout.workoutId;
        console.log(`Active workout detected: ${this.workoutName} (${this.workoutId})`);
      } else {
        this.hasActiveWorkout = false;
        this.workoutId = '';
        this.workoutName = '';
        console.log('No active workout detected from service');
      }
    });
    
    this.subscription.add(
      this.activeWorkoutService.workoutCompleted$.subscribe(() => {
        console.log('Banner received workout completed notification');
        this.hasActiveWorkout = false;
        this.workoutId = '';
        this.workoutName = '';
      })
    );
    
    this.checkActiveWorkoutStorage();
  }
  
  private checkCurrentRoute(url: string): void {
    this.isVisibleOnCurrentPage = !url.includes('/active-workout/');
    console.log(`Banner visibility on ${url}: ${this.isVisibleOnCurrentPage}`);
  }

  private async checkActiveWorkoutStorage() {
    try {
      const savedSession = await firstValueFrom(this.activeWorkoutService.loadSavedSession());
      if (!savedSession) {
        console.log('No active workout in storage');
        this.hasActiveWorkout = false;
        this.workoutId = '';
        this.workoutName = '';
      }
    } catch (error) {
      console.error('Error checking workout storage:', error);
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
      
      this.activeWorkoutService.resumeWorkout();
      
      this.router.navigate(['/active-workout', this.workoutId]);
    }
  }

  discardWorkout() {
    if (this.workoutId) {
      console.log('Discarding workout from banner');
      
      const loadingElement = document.createElement('ion-loading');
      loadingElement.message = 'Discarding workout...';
      loadingElement.duration = 1000;
      document.body.appendChild(loadingElement);
      loadingElement.present();
      
      this.activeWorkoutService.clearSavedSession().then(() => {
        this.hasActiveWorkout = false;
        this.workoutId = '';
        this.workoutName = '';
        console.log('Workout discarded successfully from banner');
      }).catch(error => {
        console.error('Error discarding workout from banner:', error);
      });
    }
  }
}
