import { Component } from '@angular/core';
import { Platform } from '@ionic/angular';
import { AuthService } from './services/auth.service';
import { WorkoutService } from './services/workout.service';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

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

  async initializeApp() {
    this.platform.ready().then(async () => {
      console.log('App initialized');
    });
  }
  
  get isLoggedIn(): boolean {
    return this.authService.isLoggedInSync();
  }
  
  get isActiveWorkoutInProgress(): boolean {
    return this.workoutService.isActiveWorkoutInProgress();
  }
  
  async startNewWorkout() {
    // First navigate to workouts tab
    await this.router.navigateByUrl('/tabs/workouts');
    
    // Then create and start a new workout
    const newWorkout = {
      name: `Quick Workout ${new Date().toLocaleDateString()}`,
      exercises: []
    };
    
    this.workoutService.createWorkout(newWorkout).subscribe({
      next: async (createdWorkout) => {
        await this.workoutService.startWorkout(createdWorkout);
      },
      error: (error) => {
        console.error('Error creating workout:', error);
      }
    });
  }
}
