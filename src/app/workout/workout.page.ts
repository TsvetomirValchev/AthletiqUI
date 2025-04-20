import { Component, OnInit } from '@angular/core';
import { WorkoutService } from '../services/workout.service';
import { Workout } from '../models/workout.model';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-workout',
  templateUrl: './workout.page.html',
  styleUrls: ['./workout.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, RouterLink]
})
export class WorkoutPage implements OnInit {
  workouts: Workout[] = [];
  isLoading = false;

  constructor(
    private workoutService: WorkoutService
  ) { }

  ngOnInit() {
    this.loadWorkouts();
  }

  loadWorkouts() {
    this.isLoading = true;
    this.workoutService.getUserWorkouts().subscribe({
      next: (workouts) => {
        this.workouts = workouts;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading workouts:', error);
        this.isLoading = false;
      }
    });
  }

  async startEmptyWorkout() {
    const newWorkout: Workout = {
      name: `Workout ${new Date().toLocaleDateString()}`,
      exerciseIds: [] // Changed from exercises to exerciseIds to match your model
    };

    this.workoutService.createWorkout(newWorkout).subscribe({
      next: (createdWorkout) => {
        this.workoutService.startWorkout(createdWorkout).subscribe();
      },
      error: (error) => {
        console.error('Error creating workout:', error);
      }
    });
  }

  openWorkout(workout: Workout) {
    this.workoutService.startWorkout(workout).subscribe();
  }

  ionViewWillEnter() {
    this.loadWorkouts();
  }
}
