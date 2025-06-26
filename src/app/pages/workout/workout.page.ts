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
  private justLoaded = false;

  constructor(
    private workoutService: WorkoutService,
    private router: Router,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    console.log('WorkoutPage: Initializing');
    this.loadWorkouts();
    
    this.subscription.add(
      this.workoutService.workoutsRefresh$.subscribe(() => {
        console.log('WorkoutPage: Refresh event received, reloading workouts');
        this.resetCaches();
        this.loadWorkouts();
      })
    );
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  private resetCaches() {
    console.log('WorkoutPage: Resetting all caches');
    this.exercisesCache.clear();
    this.workoutExercises.clear();
    this.workoutService.clearCache();
  }

  loadWorkouts() {
    console.log('WorkoutPage: Loading workouts');
    this.isLoading = true;
    this.justLoaded = true;
    
    setTimeout(() => this.justLoaded = false, 500);
    
    this.workoutService.getWorkoutsWithExercises().subscribe({
      next: (workoutsWithExercises) => {
        console.log('WorkoutPage: Workouts loaded successfully', workoutsWithExercises.length);
        this.workouts = workoutsWithExercises.map(item => item.workout);
        
        this.resetCaches();
        workoutsWithExercises.forEach(item => {
          if (item.workout.workoutId) {
            this.workoutExercises.set(item.workout.workoutId, item.exercises || []);
          }
        });
        
        this.isLoading = false;
      },
      error: (error) => {
        console.error('WorkoutPage: Failed to load workouts', error);
        this.showToast('Failed to load workouts');
        this.isLoading = false;
      }
    });
  }

  getWorkoutExercises(workoutId: string): Exercise[] {
    if (!this.exercisesCache.has(workoutId)) {
      const exercises = this.workoutExercises.get(workoutId) || [];
      
      const sortedExercises = [...exercises].sort(
        (a, b) => (a.orderPosition ?? 0) - (b.orderPosition ?? 0)
      );
      console.log(`Sorted exercises for workout ${workoutId}:`, 
        sortedExercises.map(e => `${e.name} (order: ${e.orderPosition})`));
      this.exercisesCache.set(workoutId, sortedExercises);
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
              this.isLoading = true;
              this.workouts = this.workouts.filter(w => w.workoutId !== workout.workoutId);
              this.workoutService.deleteWorkout(workout.workoutId).subscribe({
                next: () => {
                  this.resetCaches();
                  this.loadWorkouts();
                  this.showToast('Workout deleted successfully');
                },
                error: (error) => {
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

  async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'bottom'
    });
    await toast.present();
  }

  ionViewWillEnter() {
    console.log('WorkoutPage: View entering, justLoaded =', this.justLoaded);
        if (this.workouts.length === 0 || !this.justLoaded) {
      console.log('WorkoutPage: Need to reload workouts on view enter');
      this.resetCaches();
      this.loadWorkouts();
    } else {
      console.log('WorkoutPage: Skipping reload since workouts were just loaded');
    }
  }
  
  doRefresh(event: any) {
    console.log('WorkoutPage: Manual refresh triggered');
    this.resetCaches();
    this.workoutService.refreshWorkouts().subscribe({
      next: () => {
        this.loadWorkouts();
        event.target.complete();
      },
      error: (error) => {
        console.error('Error refreshing workouts', error);
        event.target.complete();
        this.showToast('Failed to refresh workouts');
      }
    });
  }
}
