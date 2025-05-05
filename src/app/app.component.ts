import { Component } from '@angular/core';
import { Platform } from '@ionic/angular';
import { AuthService } from './services/auth.service';
import { WorkoutService } from './services/workout.service';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Workout } from './models/workout.model';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false
})
export class AppComponent {
  constructor(
    private platform: Platform,
    private authService: AuthService,
    private workoutService: WorkoutService,
    private router: Router
  ) {
    this.initializeApp();
  }

  private _isActiveWorkoutInProgress = false;

  async initializeApp() {
    this.platform.ready().then(async () => {
      console.log('App initialized');
    });
  }
  
  get isLoggedIn(): boolean {
    return this.authService.isLoggedInSync();
  }
  
  
  
  get isActiveWorkoutInProgress(): boolean {
    this.workoutService.isActiveWorkoutInProgress().subscribe((isActive: boolean) => {
      this._isActiveWorkoutInProgress = isActive;
    });
    return this._isActiveWorkoutInProgress;
  }
  
  async startNewWorkout() {
    await this.router.navigateByUrl('/tabs/workouts');
    
    const newWorkout = {
      name: `Quick Workout ${new Date().toLocaleDateString()}`,
      exercises: []
    };
    
    this.workoutService.createWorkout(newWorkout).subscribe({
      next: (createdWorkout: Workout) => {
        this.workoutService.startWorkout(createdWorkout);
      },
      error: (error: Error) => {
        console.error('Error creating workout:', error);
      }
    });
  }
}
