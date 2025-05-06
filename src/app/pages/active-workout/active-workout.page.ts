import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ActiveWorkoutService } from '../../services/active-workout.service';
import { WorkoutService } from '../../services/workout.service';
import { ExerciseTemplateService } from '../../services/exercise-template.service';
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
    private exerciseTemplateService: ExerciseTemplateService,
    private route: ActivatedRoute,
    private router: Router,
    private alertController: AlertController,
    private toastController: ToastController
  ) {
    console.log('ActiveWorkoutPage constructor called');
  }

  ngOnInit() {
    console.log('ActiveWorkoutPage ngOnInit called');
    const workoutId = this.route.snapshot.paramMap.get('id');
    console.log('Workout ID from route:', workoutId);
    
    setTimeout(() => {
      console.log('isLoading after timeout:', this.isLoading);
      console.log('Current exercises:', this.exercises);
      console.log('Current workout:', this.workout);
    }, 2000);
    
    this.loadWorkout();
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

  toggleSetComplete(exercise: Exercise, set: ExerciseSet) {
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
    const alert = await this.alertController.create({
      header: 'Finish Workout',
      message: 'Do you want to save changes to the template?',
      buttons: [
        {
          text: 'Discard',
          handler: () => {
            this.router.navigate(['/tabs/workouts']);
          }
        },
        {
          text: 'Save as Template',
          handler: () => {
            // Here you'd implement the logic to save changes back to the template
            this.activeWorkoutService.syncAllChanges(this.workout?.workoutId || '').subscribe({
              next: () => {
                this.showToast('Template updated successfully');
                this.router.navigate(['/tabs/workouts']);
              },
              error: (error) => {
                console.error('Error saving template:', error);
                this.showToast('Error saving template');
                this.router.navigate(['/tabs/workouts']);
              }
            });
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

  ngOnDestroy() {
    console.log('ngOnDestroy called');
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
    if (this.workoutSubscription) {
      this.workoutSubscription.unsubscribe();
    }
  }
}


