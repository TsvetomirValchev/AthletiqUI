import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonicModule, ToastController, LoadingController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ActiveWorkoutService } from '../../services/active-workout.service';
import { WorkoutService } from '../../services/workout.service';
import { WorkoutHistoryService } from '../../services/workout-history.service';
import { ActiveWorkout } from '../../models/active-workout.model';
import { Exercise } from '../../models/exercise.model';
import { ExerciseSet } from '../../models/exercise-set.model';
import { SetType } from '../../models/set-type.enum';

@Component({
  selector: 'app-active-workout',
  templateUrl: './active-workout.page.html',
  styleUrls: ['./active-workout.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class ActiveWorkoutPage implements OnInit, OnDestroy {
  workout: ActiveWorkout | null = null;
  exercises: Exercise[] = [];
  workoutActive = false;
  elapsedTime = 0;
  timerSubscription: Subscription | null = null;
  workoutSubscription: Subscription | null = null;
  isLoading = true;
  SetType = SetType;

  constructor(
    private activeWorkoutService: ActiveWorkoutService,
    private workoutService: WorkoutService,
    private workoutHistoryService: WorkoutHistoryService,
    private route: ActivatedRoute,
    private router: Router,
    private alertController: AlertController,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private changeDetector: ChangeDetectorRef
  ) {
    console.log('ActiveWorkoutPage constructor called');
  }

  ngOnInit() {
    console.log('ActiveWorkoutPage ngOnInit called');
    // Reset timer and state when component initializes
    this.resetWorkoutState();
    
    const workoutId = this.route.snapshot.paramMap.get('id');
    console.log('Workout ID from route:', workoutId);
    
    setTimeout(() => {
      console.log('isLoading after timeout:', this.isLoading);
      console.log('Current exercises:', this.exercises);
      console.log('Current workout:', this.workout);
    }, 2000);
    
    this.loadWorkout();
  }

  resetWorkoutState() {
    // Cleanup any existing subscriptions
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = null;
    }
    
    if (this.workoutSubscription) {
      this.workoutSubscription.unsubscribe();
      this.workoutSubscription = null;
    }
    
    // Reset component state
    this.elapsedTime = 0;
    this.workoutActive = false;
    this.workout = null;
    this.exercises = [];
  }

  loadWorkout() {
    console.log('loadWorkout called');
    const workoutId = this.route.snapshot.paramMap.get('id');
    
    if (!workoutId) {
      console.error('No workout ID provided');
      this.showToast('No workout ID provided');
      this.isLoading = false;
      return;
    }
    
    console.log('Loading workout with ID:', workoutId);
    this.isLoading = true;
    
    this.workoutService.getById(workoutId).subscribe({
      next: (workout) => {
        console.log('Workout loaded:', workout);
        const activeWorkout: ActiveWorkout = {
          ...workout,
          startTime: new Date().toISOString()
        };
        
        this.workout = activeWorkout;
        console.log('Workout set in component:', this.workout);
        
        // Now load exercises
        this.loadExercises(workoutId);
        
        // Set up timer tracking
        this.activeWorkoutService.startWorkout(activeWorkout).subscribe({
          next: () => {
            console.log('Workout started successfully');
            this.workoutActive = true;
            this.startTimer();
          },
          error: (error) => {
            console.error('Error starting workout:', error);
            this.isLoading = false;
          }
        });
      },
      error: (error) => {
        console.error('Error loading workout:', error);
        this.showToast('Error loading workout: ' + error.message);
        this.isLoading = false;
      }
    });
  }

  loadExercises(workoutId: string) {
    console.log('loadExercises called for workout:', workoutId);
    this.workoutService.getExercisesForWorkout(workoutId).subscribe({
      next: (exercises: Exercise[]) => {
        console.log('Exercises loaded:', exercises);
        this.exercises = exercises;
        this.isLoading = false;
        console.log('isLoading set to false');
      },
      error: (error: Error) => {
        console.error('Error loading exercises:', error);
        this.showToast('Error loading exercises');
        this.isLoading = false;
      }
    });
  }

  startTimer() {
    console.log('Starting timer');
    this.timerSubscription = this.activeWorkoutService.elapsedTime$.subscribe(time => {
      this.elapsedTime = time;
    });
  }

  pauseWorkout() {
    console.log('Pausing workout');
    this.workoutActive = false;
    this.activeWorkoutService.pauseWorkout();
  }

  resumeWorkout() {
    console.log('Resuming workout');
    this.workoutActive = true;
    this.activeWorkoutService.resumeWorkout();
  }

  formatTime(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  toggleSetComplete(set: ExerciseSet) {
    console.log('Toggling set complete:', set);
    if (!set.exerciseSetId) return;
    
    set.completed = !set.completed;
    if (set.exerciseSetId) {
      this.activeWorkoutService.toggleSetCompletion(set.exerciseSetId, set.completed);
    }
  }

  async addExercise() {
    if (!this.workout?.workoutId) return;
    
    const alert = await this.alertController.create({
      header: 'Add Exercise',
      message: 'Select an exercise to add',
      inputs: [
        {
          name: 'exerciseName',
          type: 'text',
          placeholder: 'Exercise name'
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
            if (data.exerciseName) {
              // Create a new exercise
              const newExercise: Exercise = {
                name: data.exerciseName,
                notes: '',
                sets: [
                  {
                    type: SetType.NORMAL,
                    orderPosition: 1,
                    reps: 0,
                    weight: 0,
                    restTimeSeconds: 0,
                    completed: false
                  }
                ]
              };
              
              this.exercises.push(newExercise);
              this.showToast(`Added ${data.exerciseName}`);
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async addSet(exercise: Exercise) {
    if (!exercise.sets) {
      exercise.sets = [];
    }
    
    // Create a new set
    const newSet: ExerciseSet = {
      type: SetType.NORMAL,
      orderPosition: exercise.sets.length + 1,
      reps: 0,
      weight: 0,
      restTimeSeconds: 0,
      completed: false
    };
    
    // Add the set to the exercise
    exercise.sets.push(newSet);
    
    this.showToast(`Set added to ${exercise.name}`);
  }

  async finishWorkout() {
    console.log('Finish workout clicked');
    
    if (!this.workout?.workoutId) {
      this.showToast('No active workout to finish');
      return;
    }
    
    console.log('Current workout before completion:', this.workout);
    console.log('Workout ID:', this.workout.workoutId);
    
    // Add current duration to the workout object
    const workoutWithDuration = {
      ...this.workout,
      duration: this.getCurrentWorkoutDuration(),
      endTime: new Date().toISOString()
    };
    
    console.log('Workout with duration:', workoutWithDuration);
    console.log('Exercises to save:', this.exercises);
    
    // Use the WorkoutHistoryService directly to handle completing the workout
    this.workoutHistoryService.completeWorkout(workoutWithDuration, this.exercises).subscribe({
      next: (response) => {
        console.log('Workout completion successful, response:', response);
        this.showToast('Workout completed successfully');
        // Navigate to profile page to show workout history
        this.router.navigate(['/tabs/profile']);
      },
      error: (error) => {
        console.error('Error completing workout:', error);
        if (error.error && typeof error.error === 'object') {
          console.log('Backend validation error:', error.error);
        }
        this.showToast(`Error saving workout: ${error.message || 'Unknown error'}`);
      }
    });
  }

  async discardWorkout() {
    const alert = await this.alertController.create({
      header: 'Discard Workout',
      message: 'Are you sure you want to discard this workout? All progress will be lost.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Discard',
          role: 'destructive',
          handler: () => {
            // Stop tracking time
            if (this.timerSubscription) {
              this.timerSubscription.unsubscribe();
              this.timerSubscription = null;
            }
            
            // If we have a workout ID, use the service to properly end it
            if (this.workout?.workoutId) {
              this.activeWorkoutService.finishWorkout(this.workout.workoutId).subscribe({
                next: () => {
                  this.showToast('Workout discarded');
                  this.router.navigate(['/tabs/workouts']);
                },
                error: (error) => {
                  console.error('Error discarding workout:', error);
                  this.showToast('Error discarding workout');
                  // Still navigate away even if there's an error
                  this.router.navigate(['/tabs/workouts']);
                }
              });
            } else {
              // If no workout ID, just navigate away
              this.router.navigate(['/tabs/workouts']);
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

  getPreviousSet(exercise: Exercise, currentIndex: number): ExerciseSet | null {
    if (currentIndex > 0 && exercise.sets && exercise.sets.length > currentIndex - 1) {
      return exercise.sets[currentIndex - 1];
    }
    return null;
  }

  getSetTypeClass(setType?: SetType): string {
    if (!setType) return 'normal-type';
    
    switch (setType) {
      case SetType.WARMUP:
        return 'warmup-type';
      case SetType.DROPSET:
        return 'dropset-type';
      case SetType.FAILURE:
        return 'failure-type';
      default:
        return 'normal-type';
    }
  }

  getSetDisplay(set: ExerciseSet, sets: ExerciseSet[], index: number): string {
    if (!set.type || set.type === SetType.NORMAL) {
      // Count how many normal sets came before this one
      let normalCount = 0;
      for (let i = 0; i <= index; i++) {
        if (!sets[i].type || sets[i].type === SetType.NORMAL) {
          normalCount++;
        }
      }
      return normalCount.toString();
    }
    
    switch (set.type) {
      case SetType.WARMUP:
        return 'W';
      case SetType.DROPSET:
        return 'D';
      case SetType.FAILURE:
        return 'F';
      default:
        return '';
    }
  }

  getPreviousSetDisplay(exercise: Exercise, currentIndex: number): string {
    const prevSet = this.getPreviousSet(exercise, currentIndex);
    if (prevSet) {
      return `${prevSet.weight}kg x ${prevSet.reps}`;
    }
    return '-';
  }

  getRestTimeDisplay(seconds: number): string {
    if (seconds === 0) {
      return 'Off';
    } else if (seconds < 60) {
      return `${seconds}s`;
    } else {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0 
        ? `${minutes}m ${remainingSeconds}s` 
        : `${minutes}m`;
    }
  }

  onSetTypeChange(sets: ExerciseSet[] | undefined, setIndex: number): void {
    if (!sets) return;
    
    // Find which exercise contains this set
    for (let exerciseIndex = 0; exerciseIndex < this.exercises.length; exerciseIndex++) {
      const exercise = this.exercises[exerciseIndex];
      if (exercise.sets === sets) {
        // Create a completely new copy of the exercise
        this.exercises[exerciseIndex] = {
          ...exercise,
          sets: [...(exercise.sets || [])]
        };
        
        // Force a complete refresh of the exercises array
        this.exercises = [...this.exercises];
        
        // Run change detection immediately 
        this.changeDetector.detectChanges();
        break;
      }
    }
  }

  getNormalSetNumber(sets: ExerciseSet[] | undefined, currentIndex: number): number {
    if (!sets) return 1;
    
    // Count how many normal sets occur before this one
    let normalSetCount = 0;
    for (let i = 0; i <= currentIndex; i++) {
      if (sets[i].type === SetType.NORMAL) {
        normalSetCount++;
      }
    }
    return normalSetCount;
  }

  startEmptyWorkout() {
    this.router.navigate(['/active-workout/empty']);
  }

  getCurrentWorkoutDuration(): string {
    const totalSeconds = this.elapsedTime;
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    // Build ISO 8601 duration format
    let duration = 'PT';
    if (hours > 0) duration += `${hours}H`;
    if (minutes > 0) duration += `${minutes}M`;
    if (seconds > 0 || (hours === 0 && minutes === 0)) duration += `${seconds}S`;
    
    return duration;
  }

  ngOnDestroy() {
    console.log('ngOnDestroy called');
    // Clean up subscriptions
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
    if (this.workoutSubscription) {
      this.workoutSubscription.unsubscribe();
    }
    
    // If we're leaving the page with an active workout, properly finish it
    if (this.workout?.workoutId && this.workoutActive) {
      this.activeWorkoutService.finishWorkout(this.workout.workoutId).subscribe();
    }
  }
}


