import { Component, OnInit } from '@angular/core';
import { WorkoutService } from '../services/workout.service';
import { Workout } from '../models/workout.model';
import { IonicModule, AlertController, ActionSheetController, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { Exercise } from '../models/exercise.model';
import { catchError, finalize } from 'rxjs/operators';
import { forkJoin, of } from 'rxjs';

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
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    this.loadWorkouts();
  }

  loadWorkouts() {
    this.isLoading = true;
    
    this.workoutService.getWorkoutsWithExercises().subscribe({
      next: (workoutsWithExercises) => {
        console.log('Loaded workouts with exercises:', workoutsWithExercises);
        
        // Extract workouts
        this.workouts = workoutsWithExercises.map(item => item.workout);
        
        // Create map of workout ID to exercises
        this.workoutExercises.clear();
        workoutsWithExercises.forEach(item => {
          if (item.workout.workoutId) {
            this.workoutExercises.set(item.workout.workoutId, item.exercises || []);
          }
        });
        
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading workouts with exercises:', error);
        this.showToast('Failed to load workouts');
        this.isLoading = false;
      }
    });
  }

  getWorkoutExercises(workoutId: string): Exercise[] {
    const exercises = this.workoutExercises.get(workoutId) || [];
    console.log(`Getting exercises for workout ${workoutId}:`, exercises);
    return exercises;
  }

  startEmptyWorkout() {
    const newWorkout: Workout = {
      name: `Workout ${new Date().toLocaleDateString()}`,
    };

    this.workoutService.createWorkout(newWorkout).subscribe({
      next: (createdWorkout: Workout) => {
        this.workoutService.startWorkout(createdWorkout).subscribe({
          next: (activeWorkout: any) => {
            this.router.navigate(['/active-workout', activeWorkout.workoutId]);
          },
          error: (error: Error) => {
            console.error('Error starting workout:', error);
            this.showToast('Failed to start workout');
          }
        });
      },
      error: (error: Error) => {
        console.error('Error creating workout:', error);
        this.showToast('Failed to create workout');
      }
    });
  }

  async presentOptions(workout: Workout) {
    const actionSheet = await this.actionSheetController.create({
      header: workout.name,
      buttons: [
        {
          text: 'Edit Routine',
          icon: 'create-outline',
          handler: () => {
            this.editWorkout(workout);
          }
        },
        {
          text: 'Delete',
          role: 'destructive',
          icon: 'trash-outline',
          handler: () => {
            this.deleteWorkout(workout);
          }
        },
        {
          text: 'Cancel',
          role: 'cancel',
          icon: 'close'
        }
      ]
    });
    
    await actionSheet.present();
  }

  editWorkout(workout: Workout) {
    if (!workout.workoutId) return;
    
    // Navigate to create-routine page with workout ID to load for editing
    this.router.navigate(['/create-routine'], { 
      queryParams: { workoutId: workout.workoutId }
    });
  }

  startWorkout(workout: Workout) {
    if (!workout.workoutId) return;

    // Make sure to load the complete workout with all details
    this.isLoading = true;
    
    this.workoutService.getById(workout.workoutId).subscribe({
      next: (completeWorkout: Workout) => {
        this.workoutService.startWorkout(completeWorkout).subscribe({
          next: (activeWorkout: any) => {
            this.isLoading = false;
            this.router.navigate(['/active-workout', activeWorkout.workoutId]);
          },
          error: (error: Error) => {
            this.isLoading = false;
            console.error('Error starting workout:', error);
            this.showToast('Failed to start workout');
          }
        });
      },
      error: (error: Error) => {
        this.isLoading = false;
        console.error('Error loading complete workout:', error);
        this.showToast('Failed to load workout details');
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
                  this.showToast('Workout deleted successfully');
                },
                error: (error: Error) => {
                  console.error('Error deleting workout:', error);
                  this.showToast('Failed to delete workout');
                }
              });
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'bottom'
    });
    await toast.present();
  }

  ionViewWillEnter() {
    this.loadWorkouts();
  }
}
