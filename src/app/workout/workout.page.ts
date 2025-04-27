import { Component, OnInit } from '@angular/core';
import { WorkoutService } from '../services/workout.service';
import { Workout } from '../models/workout.model';
import { IonicModule, AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { Exercise } from '../models/exercise.model';
import { ExerciseTemplate } from '../models/exercise-template.model';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';

@Component({
  selector: 'app-workout',
  templateUrl: './workout.page.html',
  styleUrls: ['./workout.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, RouterLink]
})
export class WorkoutPage implements OnInit {
  workouts: Workout[] = [];
  workoutExercises: Map<string, Exercise[]> = new Map();
  isLoading = false;

  constructor(
    private workoutService: WorkoutService,
    private router: Router,
    private alertController: AlertController
  ) { }

  ngOnInit() {
    this.loadWorkouts();
  }

  loadWorkouts() {
    this.isLoading = true;
    this.workoutService.getUserWorkouts().subscribe({
      next: (workouts: Workout[]) => {
        this.workouts = workouts;
        // Load exercises for each workout
        this.loadAllExercises();
      },
      error: (error: Error) => {
        console.error('Error loading workouts:', error);
        this.isLoading = false;
      }
    });
  }

  loadAllExercises() {
    if (this.workouts.length === 0) {
      this.isLoading = false;
      return;
    }
    
    this.workouts
      .filter(workout => workout.workoutId)
      .forEach(workout => {
        if (!workout.workoutId) return;
        
        this.workoutService.getExercisesForWorkout(workout.workoutId)
          .pipe(
            catchError(err => {
              console.error(`Error fetching exercises for workout ${workout.workoutId}:`, err);
              return of([]);
            })
          )
          .subscribe({
            next: (exercises) => {
              this.workoutExercises.set(workout.workoutId!, exercises);
            },
            complete: () => {
              this.isLoading = false;
            }
          });
      });
  }

  getWorkoutExercises(workoutId: string): Exercise[] {
    return this.workoutExercises.get(workoutId) || [];
  }

  startEmptyWorkout() {
    const newWorkout: Workout = {
      name: `Workout ${new Date().toLocaleDateString()}`,
      exerciseIds: []
    };

    this.workoutService.createWorkout(newWorkout).subscribe({
      next: (createdWorkout: Workout) => {
        this.workoutService.startWorkout(createdWorkout).subscribe({
          next: (activeWorkout: any) => {
            this.router.navigate(['/active-workout'], { 
              queryParams: { workoutId: activeWorkout.workoutId }
            });
          },
          error: (error: Error) => {
            console.error('Error starting workout:', error);
          }
        });
      },
      error: (error: Error) => {
        console.error('Error creating workout:', error);
      }
    });
  }

  startWorkout(workout: Workout) {
    if (!workout.workoutId) return;

    this.workoutService.startWorkout(workout).subscribe({
      next: (activeWorkout: any) => {
        this.router.navigate(['/active-workout'], { 
          queryParams: { workoutId: activeWorkout.workoutId }
        });
      },
      error: (error: Error) => {
        console.error('Error starting workout:', error);
      }
    });
  }

  async deleteWorkout(workout: Workout) {
    const alert = await this.alertController.create({
      header: 'Delete Routine',
      message: 'Are you sure you want to delete this routine?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        }, {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            if (workout.workoutId) {
              this.workoutService.deleteWorkout(workout.workoutId).subscribe({
                next: () => {
                  this.workouts = this.workouts.filter(w => w.workoutId !== workout.workoutId);
                },
                error: (error: Error) => {
                  console.error('Error deleting workout:', error);
                }
              });
            }
          }
        }
      ]
    });

    await alert.present();
  }

  ionViewWillEnter() {
    this.loadWorkouts();
  }
}
