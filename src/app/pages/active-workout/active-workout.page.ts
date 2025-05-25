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
  ) {}

  ngOnInit() {
    this.resetWorkoutState();
    const workoutId = this.route.snapshot.paramMap.get('id');
    this.loadWorkout();
  }

  resetWorkoutState() {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = null;
    }
    
    if (this.workoutSubscription) {
      this.workoutSubscription.unsubscribe();
      this.workoutSubscription = null;
    }
    
    this.elapsedTime = 0;
    this.workoutActive = false;
    this.workout = null;
    this.exercises = [];
  }

  loadWorkout() {
    const workoutId = this.route.snapshot.paramMap.get('id');
    
    if (!workoutId) {
      this.showToast('No workout ID provided');
      this.isLoading = false;
      return;
    }
    
    this.isLoading = true;
    
    this.workoutService.getById(workoutId).subscribe({
      next: (workout) => {
        const activeWorkout: ActiveWorkout = {
          ...workout,
          startTime: new Date().toISOString()
        };
        
        this.workout = activeWorkout;
        
        this.loadExercises(workoutId);
        
        this.activeWorkoutService.startWorkout(activeWorkout).subscribe({
          next: () => {
            this.workoutActive = true;
            this.startTimer();
          },
          error: (error) => {
            this.isLoading = false;
          }
        });
      },
      error: (error) => {
        this.showToast('Error loading workout: ' + error.message);
        this.isLoading = false;
      }
    });
  }

  loadExercises(workoutId: string) {
    this.workoutService.getExercisesForWorkout(workoutId).subscribe({
      next: (exercises: Exercise[]) => {
        this.exercises = exercises;
        this.isLoading = false;
      },
      error: (error: Error) => {
        this.showToast('Error loading exercises');
        this.isLoading = false;
      }
    });
  }

  startTimer() {
    this.timerSubscription = this.activeWorkoutService.elapsedTime$.subscribe(time => {
      this.elapsedTime = time;
    });
  }

  pauseWorkout() {
    this.workoutActive = false;
    this.activeWorkoutService.pauseWorkout();
  }

  resumeWorkout() {
    this.workoutActive = true;
    this.activeWorkoutService.resumeWorkout();
  }

  formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  toggleSetComplete(set: ExerciseSet) {
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
    
    const newSet: ExerciseSet = {
      type: SetType.NORMAL,
      orderPosition: exercise.sets.length + 1,
      reps: 0,
      weight: 0,
      restTimeSeconds: 0,
      completed: false
    };
    
    exercise.sets.push(newSet);
    
    this.showToast(`Set added to ${exercise.name}`);
  }

  async finishWorkout() {
    if (!this.workout?.workoutId) {
      this.showToast('No active workout to finish');
      return;
    }
    
    const workoutWithDuration = {
      ...this.workout,
      duration: this.getCurrentWorkoutDuration(),
      endTime: new Date().toISOString()
    };
    
    this.workoutHistoryService.completeWorkout(workoutWithDuration, this.exercises).subscribe({
      next: (response) => {
        this.showToast('Workout completed successfully');
        this.router.navigate(['/tabs/profile']);
      },
      error: (error) => {
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
            if (this.timerSubscription) {
              this.timerSubscription.unsubscribe();
              this.timerSubscription = null;
            }
            
            if (this.workout?.workoutId) {
              this.activeWorkoutService.finishWorkout(this.workout.workoutId).subscribe({
                next: () => {
                  this.showToast('Workout discarded');
                  this.router.navigate(['/tabs/workouts']);
                },
                error: (error) => {
                  this.showToast('Error discarding workout');
                  this.router.navigate(['/tabs/workouts']);
                }
              });
            } else {
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
    
    for (let exerciseIndex = 0; exerciseIndex < this.exercises.length; exerciseIndex++) {
      const exercise = this.exercises[exerciseIndex];
      if (exercise.sets === sets) {
        this.exercises[exerciseIndex] = {
          ...exercise,
          sets: [...(exercise.sets || [])]
        };
        
        this.exercises = [...this.exercises];
        
        this.changeDetector.detectChanges();
        break;
      }
    }
  }

  getNormalSetNumber(sets: ExerciseSet[] | undefined, currentIndex: number): number {
    if (!sets) return 1;
    
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
    const seconds = this.elapsedTime;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    return `PT${hours}H${minutes}M${remainingSeconds}S`;
  }

  ngOnDestroy() {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
    if (this.workoutSubscription) {
      this.workoutSubscription.unsubscribe();
    }
    
    if (this.workout?.workoutId && this.workoutActive) {
      this.activeWorkoutService.finishWorkout(this.workout.workoutId).subscribe();
    }
  }
}


