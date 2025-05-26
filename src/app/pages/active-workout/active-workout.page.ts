import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonicModule, ToastController, LoadingController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, take, Observable, of } from 'rxjs';
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
  isPaused = false; // Add this property
  isCompleting = false;

  constructor(
    private activeWorkoutService: ActiveWorkoutService,
    private workoutService: WorkoutService,
    private workoutHistoryService: WorkoutHistoryService,
    private route: ActivatedRoute,
    private router: Router,
    private alertController: AlertController,
    private toastController: ToastController,
    private changeDetector: ChangeDetectorRef,
    private loadingController: LoadingController // Inject LoadingController
  ) {}

  ngOnInit() {
    const workoutId = this.route.snapshot.paramMap.get('id');
    
    if (!workoutId) {
      this.showToast('No workout ID provided');
      this.router.navigate(['/tabs/workouts']);
      return;
    }
    
    this.isLoading = true;
    
    // Try to load a saved session first
    this.activeWorkoutService.loadSavedSession().subscribe({
      next: hasSession => {
        // Check if the loaded session matches the requested workout
        this.activeWorkoutService.currentWorkout$.pipe(take(1)).subscribe({
          next: currentWorkout => {
            if (hasSession && currentWorkout && currentWorkout.workoutId === workoutId) {
              console.log('Found matching saved session, using it directly');
              // Successfully loaded a matching saved session
              this.workout = currentWorkout;
              
              // Get workout state to check if it's paused
              this.activeWorkoutService.workoutState$.pipe(take(1)).subscribe(state => {
                this.workoutActive = true;
                this.isPaused = state.isPaused;
                
                // Since we already loaded the session, get exercises directly from service
                const currentSession = this.activeWorkoutService.getCurrentSession();
                if (currentSession && currentSession.exercises) {
                  this.exercises = currentSession.exercises;
                  this.isLoading = false;
                  
                  // Initialize timer display
                  this.elapsedTime = currentSession.elapsedTimeSeconds || 0;
                  
                  // Start timer subscription - it will only update if not paused
                  this.startTimer();
                  
                  // Show a message if the workout was paused due to app close
                  if (state.isPaused) {
                    this.showToast('Workout is paused. Press resume to continue timer.');
                  }
                } else {
                  this.isLoading = false;
                  this.showToast('Error: Session loaded but no exercises found');
                }
              });
            } else {
              console.log('No matching saved session, loading from API');
              // No matching saved session, load a new one from API
              this.loadWorkoutById(workoutId);
            }
          },
          error: () => {
            this.isLoading = false;
            this.showToast('Error checking current workout');
          }
        });
      },
      error: () => {
        this.isLoading = false;
        this.showToast('Error loading saved session');
        this.loadWorkoutById(workoutId);
      }
    });
  }

  async promptWorkoutRecovery() {
    const alert = await this.alertController.create({
      header: 'Resume Workout',
      message: 'We found an unfinished workout. Would you like to resume it?',
      buttons: [
        {
          text: 'Discard',
          role: 'cancel',
          handler: () => {
            this.activeWorkoutService.clearSavedSession();
          }
        },
        {
          text: 'Resume',
          handler: () => {
            this.recoverSavedWorkout();
          }
        }
      ]
    });
    
    await alert.present();
  }

  recoverSavedWorkout() {
    this.activeWorkoutService.currentWorkout$.pipe(take(1)).subscribe((workout: ActiveWorkout | null) => {
      if (workout && workout.workoutId) {
        this.workout = workout;
        
        this.activeWorkoutService.getExercisesByWorkoutId(workout.workoutId).subscribe({
          next: (exercises) => {
            this.exercises = exercises;
            this.isLoading = false;
            
            // Get the workout state to set proper UI state
            this.activeWorkoutService.workoutState$.pipe(take(1)).subscribe(state => {
              this.workoutActive = !state.isPaused;
              this.elapsedTime = state.elapsedTimeSeconds;
              
              // Always start the timer subscription to track changes
              this.startTimer();
              
              // Show recovery message
              this.showToast('Workout recovered from your last session');
            });
          },
          error: () => {
            this.isLoading = false;
            this.showToast('Could not recover exercises');
          }
        });
      } else {
        this.showToast('Could not recover workout data');
        this.loadWorkout();
      }
    });
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

  loadWorkoutById(workoutId: string): void {
    this.workoutService.getById(workoutId).subscribe({
      next: (workout) => {
        const activeWorkout: ActiveWorkout = {
          ...workout,
          startTime: new Date().toISOString()
        };
        
        this.workout = activeWorkout;
        
        // Start the workout first to ensure it's saved in the service
        this.activeWorkoutService.startWorkout(activeWorkout).subscribe({
          next: () => {
            // Now load exercises
            this.activeWorkoutService.getExercisesByWorkoutId(workoutId).subscribe({
              next: (exercises) => {
                this.exercises = exercises;
                this.workoutActive = true;
                this.isLoading = false;
                this.startTimer();
              },
              error: (error) => {
                this.isLoading = false;
                this.showToast('Error loading exercises');
              }
            });
          },
          error: (error) => {
            this.isLoading = false;
            this.showToast('Error starting workout');
            this.router.navigate(['/tabs/workouts']);
          }
        });
      },
      error: (error) => {
        this.showToast('Error loading workout');
        this.isLoading = false;
        this.router.navigate(['/tabs/workouts']);
      }
    });
  }

  loadNewWorkout(workoutId: string) {
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

  // Add proper timer subscription method
  startTimer() {
    // Cancel any existing subscription first
    this.stopTimer();
    
    // Subscribe to timer updates
    this.workoutSubscription = this.activeWorkoutService.elapsedTime$.subscribe(time => {
      this.elapsedTime = time;
      this.changeDetector.detectChanges(); // Force UI update
    });
    
    console.log('Timer subscription started');
  }
  
  // Add method to stop timer
  stopTimer() {
    if (this.workoutSubscription) {
      this.workoutSubscription.unsubscribe();
      this.workoutSubscription = null;
    }
  }
  
  // Update pause/resume methods
  pauseWorkout() {
    console.log('Pausing workout');
    this.isPaused = true;
    this.activeWorkoutService.pauseWorkout();
    // We keep the timer subscription active to show updates when saved from other tabs
  }
  
  resumeWorkout() {
    console.log('Resuming workout');
    this.isPaused = false;
    this.activeWorkoutService.resumeWorkout();
    // Make sure we're subscribed to timer updates
    this.startTimer();
  }
  
  // Format time from seconds to MM:SS format
  formatTime(seconds: number): string {
    if (!seconds && seconds !== 0) return '00:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Update the methods to use our simplified approach
  toggleSetComplete(set: ExerciseSet) {
    if (!set.exerciseSetId) return;
    
    set.completed = !set.completed;
    console.log(`Toggling set ${set.exerciseSetId} to ${set.completed}`);
    
    // Update service and save
    this.activeWorkoutService.toggleSetCompletion(set.exerciseSetId, set.completed);
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

  // Update the addSet method in active-workout.page.ts
  addSet(exercise: Exercise): void {
    if (!exercise || !exercise.exerciseId) {
      console.error('Cannot add set: Exercise or exerciseId is missing');
      return;
    }
    
    // Calculate new order position
    if (!exercise.sets) {
      exercise.sets = [];
    }
    
    const newPosition = (exercise.sets.length > 0 ? 
      Math.max(...exercise.sets.map(s => s.orderPosition || 0)) + 1 : 1);
    
    console.log(`Adding new set to exercise ${exercise.name} at position ${newPosition}`);
    
    try {
      // Add the set through the service
      this.activeWorkoutService.addNewSet(exercise.exerciseId, newPosition);
      
      // Refresh exercise data from service to get the updated set
      const currentSession = this.activeWorkoutService.getCurrentSession();
      if (currentSession) {
        const updatedExercise = currentSession.exercises.find(ex => ex.exerciseId === exercise.exerciseId);
        if (updatedExercise && updatedExercise.sets) {
          // Update the local exercise with the new set
          const index = this.exercises.findIndex(ex => ex.exerciseId === exercise.exerciseId);
          if (index !== -1) {
            this.exercises[index] = updatedExercise;
            this.changeDetector.detectChanges(); // Force UI update
          }
        }
      }
    } catch (error) {
      console.error('Error adding set:', error);
      this.showToast('Failed to add set');
    }
  }

  async finishWorkout() {
    this.isCompleting = true;
    if (!this.workout?.workoutId) {
      this.showToast('No active workout to finish');
      return;
    }
    
    try {
      // Show loading
      const loading = await this.loadingController.create({
        message: 'Saving workout...',
        duration: 10000
      });
      await loading.present();
      
      // Get the current timer value directly from the component
      const timerValue = this.elapsedTime;
      
      console.log('Completing workout with timer value:', timerValue);
      
      // Get the current session
      const currentSession = this.activeWorkoutService.getCurrentSession();
      if (!currentSession) {
        this.showToast('No active session found');
        loading.dismiss();
        return;
      }
      
      // Make sure all changes are saved before completing
      this.activeWorkoutService.saveCurrentSession();
      
      // We already have all the exercises in the current session
      const updatedExercises = currentSession.exercises;
      
      // Prepare the workout with duration info using the DISPLAYED timer value
      const workout = this.workout!;
      
      // Convert to ISO 8601 duration format
      const hours = Math.floor(timerValue / 3600);
      const minutes = Math.floor((timerValue % 3600) / 60);
      const seconds = timerValue % 60;
      
      // Build ISO 8601 duration string
      let duration = 'PT';
      if (hours > 0) duration += `${hours}H`;
      if (minutes > 0) duration += `${minutes}M`;
      if (seconds > 0 || (hours === 0 && minutes === 0)) duration += `${seconds}S`;
      
      // Use the component's timer value for the duration
      const workoutWithDuration: ActiveWorkout = {
        ...workout,
        duration: duration,
        elapsedTimeSeconds: timerValue,
        endTime: new Date().toISOString()
      };
      
      console.log(`Using displayed timer value: ${timerValue}s (${duration})`);
      
      // Complete the workout - send to backend
      this.workoutHistoryService.completeWorkout(workoutWithDuration, updatedExercises).subscribe({
        next: async (response) => {
          try {
            // Stop timer first to prevent any further updates
            this.stopTimer();
            
            // IMPORTANT: Now clear the saved session and WAIT for it to complete
            await this.activeWorkoutService.clearSavedSession();
            
            // Force refresh the banner component's state
            this.activeWorkoutService.notifyWorkoutCompleted();
            
            loading.dismiss();
            this.showToast('Workout completed successfully');
            
            // Small delay to ensure state updates propagate
            setTimeout(() => {
              this.router.navigate(['/tabs/profile']);
            }, 100);
          } catch (error) {
            console.error('Error cleaning up after workout completion:', error);
            loading.dismiss();
            this.router.navigate(['/tabs/profile']);
          }
        },
        error: (error) => {
          loading.dismiss();
          this.showToast('Error completing workout');
          console.error('Error completing workout:', error);
        }
      });
    } catch (error) {
      console.error('Error in finishWorkout:', error);
      this.showToast('An unexpected error occurred');
    }
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
                  // Clear saved session when discarding
                  this.activeWorkoutService.clearSavedSession().then(() => {
                    this.showToast('Workout discarded');
                    this.router.navigate(['/tabs/workouts']);
                  });
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
    const set = sets[setIndex];
    
    if (!set.exerciseSetId) return;
    
    // Update the UI immediately
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
    
    // Save to service
    this.activeWorkoutService.updateSetType(set.exerciseSetId, set.type);
  }

  // Add these methods to handle input changes
  onWeightChange(set: ExerciseSet, newWeight: number | undefined): void {
    if (!set.exerciseSetId) return;
    const weight = newWeight ?? 0;
    
    // Update UI
    set.weight = weight;
    
    // Update service and save
    this.activeWorkoutService.updateSetWeight(set.exerciseSetId, weight);
  }

  onRepsChange(set: ExerciseSet, newReps: number | undefined): void {
    if (!set.exerciseSetId) return;
    const reps = newReps ?? 0;
    
    // Update UI
    set.reps = reps;
    
    // Update service and save  
    this.activeWorkoutService.updateSetReps(set.exerciseSetId, reps);
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

  // Add this method to check completion status
  isSetCompleted(setId: string | undefined): Observable<boolean> {
    if (!setId) return of(false);
    
    // Get the current state of all completed sets from the service
    return this.activeWorkoutService.getSetCompletionStatus(setId);
  }

  ngOnDestroy() {
    this.stopTimer();
    if (this.workoutActive && !this.isCompleting) {
    console.log('Component destroyed while workout active - pausing workout');
    this.activeWorkoutService.pauseWorkout();
  }
  }
}


