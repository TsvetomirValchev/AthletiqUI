import { Component, OnInit, OnDestroy } from '@angular/core';
import { WorkoutService } from '../../services/workout.service';
import { Workout } from '../../models/workout.model';
import { IonicModule, AlertController, ActionSheetController, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { Exercise } from '../../models/exercise.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-workout',
  templateUrl: './workout.page.html',
  styleUrls: ['./workout.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, RouterLink]
})
export class WorkoutPage implements OnInit, OnDestroy {
  workouts: Workout[] = [];
  workoutExercises: Map<string, Exercise[]> = new Map();
  isLoading = false;
  
  private exercisesCache = new Map<string, Exercise[]>();
  private subscription: Subscription = new Subscription();
  private justLoaded = false; // Add this property to WorkoutPage

  constructor(
    private workoutService: WorkoutService,
    private router: Router,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    this.loadWorkouts();
    
    // Subscribe to refresh events
    this.subscription.add(
      this.workoutService.workoutsRefresh$.subscribe(() => {
        console.log('Workouts refresh event received');
        this.loadWorkouts();
      })
    );
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  loadWorkouts() {
    this.isLoading = true;
    this.justLoaded = true; // Modify loadWorkouts
    
    // Set a timeout to reset the flag after 500ms
    setTimeout(() => this.justLoaded = false, 500);
    
    this.workoutService.getWorkoutsWithExercises().subscribe({
      next: (workoutsWithExercises) => {
        this.workouts = workoutsWithExercises.map(item => item.workout);
        
        this.workoutExercises.clear();
        workoutsWithExercises.forEach(item => {
          if (item.workout.workoutId) {
            this.workoutExercises.set(item.workout.workoutId, item.exercises || []);
          }
        });
        
        this.isLoading = false;
      },
      error: (error) => {
        this.showToast('Failed to load workouts');
        this.isLoading = false;
      }
    });
  }

  getWorkoutExercises(workoutId: string): Exercise[] {
    if (!this.exercisesCache.has(workoutId)) {
      const exercises = this.workoutExercises.get(workoutId) || [];
      this.exercisesCache.set(workoutId, exercises);
    }
    return this.exercisesCache.get(workoutId) || [];
  }

  getWorkoutExerciseNames(workoutId: string): string {
    const exercises = this.getWorkoutExercises(workoutId);
    return exercises.map(ex => ex.name).join(', ');
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
    
    this.router.navigate(['/create-routine'], { 
      queryParams: { workoutId: workout.workoutId }
    });
  }

  startWorkout(workout: Workout) {
    if (!workout.workoutId) return;
    this.isLoading = true;
    this.router.navigate(['/active-workout', workout.workoutId]);
    this.isLoading = false;
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
                error: (error) => {
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
    if (!this.justLoaded) { // Update ionViewWillEnter
      this.loadWorkouts();
    }
  }
}
