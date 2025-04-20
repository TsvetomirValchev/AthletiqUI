import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { IonicModule, ModalController, AlertController, ActionSheetController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Subscription, interval } from 'rxjs';
import { Workout } from '../models/workout.model';
import { ActiveWorkout } from '../models/active-workout.model';
import { Exercise } from '../models/exercise.model';
import { WorkoutService } from '../services/workout.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-active-workout',
  templateUrl: './active-workout.page.html',
  styleUrls: ['./active-workout.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class ActiveWorkoutPage implements OnInit, OnDestroy {
  @Input() workoutId!: string;
  workout: Workout | null = null;
  
  exercises: Exercise[] = [];
  isLoading = false;
  workoutActive = false;
  elapsedTime = 0;
  timerSubscription: Subscription | undefined;
  restTimerActive = false;
  restTimeRemaining = 0;
  restTimerSubscription: Subscription | undefined;
  
  constructor(
    private workoutService: WorkoutService,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private router: Router
  ) { }

  ngOnInit() {
    // Load workout if workoutId is provided
    if (this.workoutId) {
      this.loadWorkout(this.workoutId);
    } else {
      // Check if there's an active workout
      this.workoutService.getCurrentActiveWorkout().subscribe({
        next: (activeWorkout) => {
          if (activeWorkout) {
            this.workout = activeWorkout;
            
            // Calculate elapsed time if startTime exists
            if (activeWorkout.startTime) {
              const startTime = new Date(activeWorkout.startTime).getTime();
              const now = new Date().getTime();
              this.elapsedTime = Math.floor((now - startTime) / 1000);
            }
            
            this.loadExercises(activeWorkout.workoutId!);
            this.startWorkout();
          }
        },
        error: (error) => {
          console.error('Error loading active workout:', error);
        }
      });
    }
  }

  ngOnDestroy() {
    this.stopWorkoutTimer();
    this.stopRestTimer();
  }

  loadWorkout(workoutId: string) {
    this.isLoading = true;
    this.workoutService.getWorkout(workoutId).subscribe({
      next: (workout) => {
        this.workout = workout;
        this.loadExercises(workoutId);
        this.startWorkout();
      },
      error: (error) => {
        console.error('Error loading workout:', error);
        this.isLoading = false;
      }
    });
  }

  loadExercises(workoutId: string) {
    this.workoutService.getExercisesForWorkout(workoutId).subscribe({
      next: (exercises) => {
        this.exercises = exercises;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading exercises:', error);
        this.isLoading = false;
      }
    });
  }

  startWorkout() {
    if (!this.workout) return;
    
    this.workoutActive = true;
    
    if (this.workout.workoutId) {
      if (!this.isActiveWorkout(this.workout)) {
        this.workoutService.startWorkout(this.workout).subscribe({
          next: (activeWorkout) => {
            this.workout = activeWorkout;
          },
          error: (error) => {
            console.error('Error starting workout:', error);
          }
        });
      }
    }
    
    this.timerSubscription = interval(1000).subscribe(() => {
      this.elapsedTime++;
    });
  }

  pauseWorkout() {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
    this.workoutActive = false;
  }

  resumeWorkout() {
    this.workoutActive = true;
    this.timerSubscription = interval(1000).subscribe(() => {
      this.elapsedTime++;
    });
  }

  stopWorkoutTimer() {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
  }

  formatTime(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  async addExercise() {
    if (!this.workout?.workoutId) {
      console.error('Cannot add exercise: No workout ID');
      return;
    }

    const alert = await this.alertController.create({
      header: 'Add Exercise',
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: 'Exercise Name'
        },
        {
          name: 'weight',
          type: 'number',
          placeholder: 'Weight (kg)'
        },
        {
          name: 'sets',
          type: 'number',
          placeholder: 'Sets'
        },
        {
          name: 'reps',
          type: 'number',
          placeholder: 'Reps'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Add',
          handler: (data) => {
            const newExercise: Exercise = {
              name: data.name,
              weight: parseFloat(data.weight) || 0,
              sets: parseInt(data.sets) || 0,
              reps: parseInt(data.reps) || 0,
              workoutId: this.workout!.workoutId
            };

            this.workoutService.addExerciseToWorkout(this.workout!.workoutId!, newExercise).subscribe({
              next: (exercise) => {
                this.exercises.push(exercise);
              },
              error: (error) => {
                console.error('Error adding exercise:', error);
              }
            });
          }
        }
      ]
    });

    await alert.present();
  }

  startRestTimer(seconds = 60) {
    this.restTimerActive = true;
    this.restTimeRemaining = seconds;
    this.restTimerSubscription = interval(1000).subscribe(() => {
      this.restTimeRemaining--;
      if (this.restTimeRemaining <= 0) {
        this.stopRestTimer();
      }
    });
  }

  stopRestTimer() {
    if (this.restTimerSubscription) {
      this.restTimerSubscription.unsubscribe();
    }
    this.restTimerActive = false;
  }

  completeSet(exercise: Exercise) {
    console.log('Completed set:', exercise);
    this.startRestTimer();
  }
  
  async presentExerciseOptions(exercise: Exercise, index: number) {
    const actionSheet = await this.actionSheetController.create({
      header: exercise.name,
      buttons: [
        {
          text: 'Mark as Warmup',
          icon: 'flame-outline',
          handler: () => {
            // Logic to mark as warmup
          }
        },
        {
          text: 'Mark as Drop Set',
          icon: 'arrow-down-outline',
          handler: () => {
            // Logic to mark as drop set
          }
        },
        {
          text: 'Delete',
          icon: 'trash-outline',
          role: 'destructive',
          handler: () => {
            if (exercise.exerciseId) {
              this.workoutService.deleteExercise(exercise.exerciseId).subscribe({
                next: () => {
                  this.exercises.splice(index, 1);
                },
                error: (error) => {
                  console.error('Error deleting exercise:', error);
                }
              });
            }
          }
        },
        {
          text: 'Cancel',
          icon: 'close',
          role: 'cancel'
        }
      ]
    });
    await actionSheet.present();
  }
  
  async finishWorkout() {
    if (!this.workout?.workoutId) return;
    
    const alert = await this.alertController.create({
      header: 'Finish Workout',
      message: 'Are you sure you want to end this workout?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'End Workout',
          handler: () => {
            this.workoutService.endWorkout(this.workout!.workoutId!).subscribe({
              next: () => {
                this.router.navigate(['/tabs/workouts']);
              },
              error: (error) => {
                console.error('Error ending workout:', error);
              }
            });
          }
        }
      ]
    });

    await alert.present();
  }
  
  private isActiveWorkout(workout: Workout): workout is ActiveWorkout {
    return 'startTime' in workout;
  }
}
