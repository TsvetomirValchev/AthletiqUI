import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, AlertController, ToastController, LoadingController, ActionSheetController, ItemReorderEventDetail } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { finalize, take } from 'rxjs/operators';

import { ActiveWorkoutService } from '../../services/active-workout.service';
import { WorkoutService } from '../../services/workout.service';
import { WorkoutHistoryService } from '../../services/workout-history.service';
import { ActiveWorkout } from '../../models/active-workout.model';
import { Exercise } from '../../models/exercise.model';
import { ExerciseSet} from '../../models/exercise-set.model';
import { ExerciseTemplate } from '../../models/exercise-template.model';
import { Workout } from '../../models/workout.model';
import { SetType } from '../../models/set-type.enum';

@Component({
  selector: 'app-active-workout',
  templateUrl: './active-workout.page.html',
  styleUrls: ['./active-workout.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ActiveWorkoutPage implements OnInit, OnDestroy {
  workout: ActiveWorkout | null = null;
  exercises: Exercise[] = [];
  workoutActive = false;
  elapsedTime = 0;
  workoutSubscription: Subscription | null = null;
  isLoading = true;
  SetType = SetType;
  isPaused = false;
  isCompleting = false;

  // Exercise library properties
  exerciseTemplates: ExerciseTemplate[] = [];
  showExerciseLibrary = false;
  filteredTemplates: ExerciseTemplate[] = [];
  searchTerm: string = '';
  selectedMuscleGroup: string = 'All Muscles';

  // Track if exercise order has changed
  private exerciseOrderChanged = false;

  constructor(
    private activeWorkoutService: ActiveWorkoutService,
    private workoutService: WorkoutService,
    private workoutHistoryService: WorkoutHistoryService,
    private route: ActivatedRoute,
    private router: Router,
    private alertController: AlertController,
    private toastController: ToastController,
    private changeDetector: ChangeDetectorRef,
    private loadingController: LoadingController,
    private actionSheetController: ActionSheetController
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
              this.workout = currentWorkout;
              
              // Get workout state to check if it's paused
              this.activeWorkoutService.workoutState$.pipe(take(1)).subscribe(state => {
                this.isPaused = state.isPaused;
                this.elapsedTime = state.elapsedTimeSeconds;
                this.loadExercises(workoutId);
              });
            } else {
              console.log('No matching saved session, loading from API');
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

  loadWorkoutById(workoutId: string): void {
    this.workoutService.getById(workoutId).subscribe({
      next: (workout) => {
        const activeWorkout: ActiveWorkout = {
          ...workout,
          startTime: new Date().toISOString()
        };
        
        this.workout = activeWorkout;
        
        // Start the workout and load exercises with sets in one step
        this.activeWorkoutService.startWorkout(activeWorkout).subscribe({
          next: () => {
            // Get the exercises from the session after starting
            const session = this.activeWorkoutService.getCurrentSession();
            if (session) {
              this.exercises = [...session.exercises].sort(
                (a, b) => (a.orderPosition ?? 0) - (b.orderPosition ?? 0)
              );
              
              console.log('Loaded exercises with sets:', 
                this.exercises.map(e => `${e.name} (${e.sets?.length || 0} sets)`));
              
              this.workoutActive = true;
              this.isLoading = false;
              this.startTimer();
              this.changeDetector.markForCheck();
            } else {
              this.isLoading = false;
              this.showToast('Error loading workout session');
              this.router.navigate(['/tabs/workouts']);
            }
          },
          error: (error) => {
            console.error('Error starting workout:', error);
            this.isLoading = false;
            this.showToast('Error starting workout');
            this.router.navigate(['/tabs/workouts']);
          }
        });
      },
      error: (error) => {
        console.error('Error loading workout:', error);
        this.showToast('Error loading workout');
        this.isLoading = false;
        this.router.navigate(['/tabs/workouts']);
      }
    });
  }

  loadExercises(workoutId: string) {
    this.activeWorkoutService.getExercisesByWorkoutId(workoutId).subscribe({
      next: (exercises: Exercise[]) => {
        // Sort exercises by orderPosition
        this.exercises = [...exercises].sort((a, b) => 
          (a.orderPosition ?? 0) - (b.orderPosition ?? 0)
        );
        
        this.isLoading = false;
        this.startTimer();
        this.changeDetector.markForCheck();
      },
      error: (error: Error) => {
        console.error('Error loading exercises:', error);
        this.showToast('Error loading exercises');
        this.isLoading = false;
      }
    });
  }

  // Timer subscription
  startTimer() {
    // Cancel any existing subscription
    this.stopTimer();
    
    // Subscribe to timer updates
    this.workoutSubscription = this.activeWorkoutService.elapsedTime$.subscribe(time => {
      this.elapsedTime = time;
      this.changeDetector.detectChanges();
    });
  }
  
  stopTimer() {
    if (this.workoutSubscription) {
      this.workoutSubscription.unsubscribe();
      this.workoutSubscription = null;
    }
  }
  
  // Workout control methods
  pauseWorkout() {
    this.isPaused = true;
    this.activeWorkoutService.pauseWorkout();
    this.changeDetector.markForCheck();
  }
  
  resumeWorkout() {
    this.isPaused = false;
    this.activeWorkoutService.resumeWorkout();
    this.startTimer();
    this.changeDetector.markForCheck();
  }
  
  // Format time display
  formatTime(seconds: number): string {
    if (!seconds && seconds !== 0) return '00:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Format duration as ISO8601 string
  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    let duration = 'PT';
    if (hours > 0) duration += `${hours}H`;
    if (minutes > 0) duration += `${minutes}M`;
    if (secs > 0 || (hours === 0 && minutes === 0)) duration += `${secs}S`;
    
    return duration;
  }

  // Set state methods
  isSetCompleted(set: ExerciseSet): boolean {
    return set?.completed || false;
  }

  // Update set weight
  updateSetWeight(set: ExerciseSet, event: any) {
    const newWeight = Number(event.detail.value);
    if (isNaN(newWeight)) return;
    
    // Update locally first for immediate UI feedback
    set.weight = newWeight;
    
    // Update in service (local only)
    if (set.exerciseSetId) {
      this.activeWorkoutService.updateSetWeight(set.exerciseSetId, newWeight);
    }
  }

  // Update set reps
  updateSetReps(set: ExerciseSet, event: any) {
    const newReps = Number(event.detail.value);
    if (isNaN(newReps)) return;
    
    // Update locally first for immediate UI feedback
    set.reps = newReps;
    
    // Update in service (local only)
    if (set.exerciseSetId) {
      this.activeWorkoutService.updateSetReps(set.exerciseSetId, newReps);
    }
  }

  // Toggle set completion
  toggleSetComplete(set: ExerciseSet) {
    if (!set || !set.exerciseSetId) return;
    
    // Toggle the state locally first
    set.completed = !set.completed;
    
    // Update in service (local only)
    this.activeWorkoutService.toggleSetCompletion(set.exerciseSetId, set.completed);
    
    this.changeDetector.markForCheck();
  }

  // Exercise library methods
  async addExercise() {
    if (!this.workout?.workoutId) return;
    
    this.showExerciseLibrary = true;
    this.isLoading = true;
    
    this.searchTerm = '';
    this.selectedMuscleGroup = 'All Muscles';
    
    // Load templates if needed
    if (this.exerciseTemplates.length === 0) {
      this.workoutService.getExerciseTemplates().subscribe({
        next: (templates) => {
          this.exerciseTemplates = templates;
          this.filteredTemplates = [...templates];
          this.isLoading = false;
          this.changeDetector.markForCheck();
        },
        error: (error) => {
          console.error('Error loading exercise templates:', error);
          this.showToast('Error loading exercise templates');
          this.isLoading = false;
          this.showExerciseLibrary = false;
        }
      });
    } else {
      this.filteredTemplates = [...this.exerciseTemplates];
      this.isLoading = false;
    }
    
    this.changeDetector.markForCheck();
  }
  
  // Add exercise from template
  addExerciseFromTemplate(template: ExerciseTemplate) {
    if (!template || !template.exerciseTemplateId || !this.workout?.workoutId) return;
    
    // Create Exercise object with template information
    const newExercise: Exercise = {
      exerciseTemplateId: template.exerciseTemplateId,
      name: template.name,
      notes: '',
      workoutId: this.workout.workoutId,
      // Initialize with a single set
      sets: [
        {
          type: SetType.NORMAL,
          orderPosition: 0,
          reps: 0,
          weight: 0,
          restTimeSeconds: 0,
          completed: false
        }
      ]
    };
    
    // Add exercise to the local session
    this.activeWorkoutService.addExerciseToWorkout(this.workout.workoutId, newExercise).subscribe({
      next: (updatedExercises: Exercise[]) => {
        // Update the local exercises array
        this.exercises = updatedExercises;
        
        this.showToast(`Added ${template.name}`);
        this.showExerciseLibrary = false;
        this.changeDetector.markForCheck();
      },
      error: (error) => {
        console.error('Error adding exercise:', error);
        this.showToast('Failed to add exercise');
      }
    });
  }
  
  // Filter methods
  filterExercises() {
    if (!this.exerciseTemplates || this.exerciseTemplates.length === 0) {
      this.filteredTemplates = [];
      return;
    }
    
    let filtered = [...this.exerciseTemplates];
    
    // Apply search term filter
    if (this.searchTerm) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(t => 
        t.name.toLowerCase().includes(search) || 
        t.targetMuscleGroups?.some(m => m.toLowerCase().includes(search))
      );
    }
    
    // Apply muscle group filter
    if (this.selectedMuscleGroup && this.selectedMuscleGroup !== 'All Muscles') {
      filtered = filtered.filter(t => 
        t.targetMuscleGroups?.some(muscle => 
          muscle.toLowerCase() === this.selectedMuscleGroup.toLowerCase())
      );
    }
    
    this.filteredTemplates = filtered;
    this.changeDetector.markForCheck();
  }
  
  onSearch(event: any) {
    this.searchTerm = event.detail.value;
    this.filterExercises();
  }
  
  closeLibrary() {
    this.showExerciseLibrary = false;
    this.changeDetector.markForCheck();
  }

  // Complete workout
  async finishWorkout() {
    if (!this.workout) return;
    
    this.isCompleting = true;

    try {
      const loading = await this.loadingController.create({
        message: 'Completing workout...'
      });
      await loading.present();
      
      // Get current session from the service
      const currentSession = this.activeWorkoutService.getCurrentSession();
      if (!currentSession) {
        this.showToast('No active session found');
        loading.dismiss();
        return;
      }
      
      // Get data we need before clearing
      const workout = { ...currentSession.workout };
      const updatedExercises = [...currentSession.exercises];
      const timerValue = this.elapsedTime;
      
      // Format the duration
      const duration = this.formatDuration(timerValue);
      
      const workoutWithDuration: ActiveWorkout = {
        ...workout,
        duration: duration,
        endTime: new Date().toISOString()
      };
      
      // IMPORTANT: First, stop the timer to prevent further updates
      this.stopTimer();
      
      // Clear the session BEFORE sending to backend
      await this.activeWorkoutService.clearSavedSession();
      
      // Complete the workout - send to backend
      this.workoutHistoryService.completeWorkout(workoutWithDuration, updatedExercises)
        .pipe(
          finalize(() => {
            loading.dismiss();
            this.isCompleting = false;
          })
        )
        .subscribe({
          next: async () => {
            this.confirmUpdateTemplate(workout, updatedExercises);
          },
          error: (error) => {
            console.error('Error completing workout:', error);
            this.showToast('Failed to save workout');
          }
        });
    } catch (error) {
      console.error('Error in finishWorkout:', error);
      this.isCompleting = false;
      this.showToast('An unexpected error occurred');
    }
  }

  // Reset state when leaving
  ngOnDestroy() {
    this.stopTimer();
  }

  // Add a set to an exercise
  addSet(exercise: Exercise) {
    if (!exercise || !exercise.exerciseId) {
      this.showToast('Cannot add set: Invalid exercise');
      return;
    }
    
    this.activeWorkoutService.addSetToExercise(exercise.exerciseId).subscribe({
      next: (updatedExercises: Exercise[]) => {
        // Update the exercises list
        this.exercises = updatedExercises;
        this.changeDetector.markForCheck();
      },
      error: (error) => {
        console.error('Error adding set:', error);
        this.showToast('Failed to add set');
      }
    });
  }

  // Exercise option methods
  async showExerciseOptions(exercise: Exercise) {
    if (!exercise) return;
    
    const actionSheet = await this.actionSheetController.create({
      header: exercise.name,
      buttons: [
        {
          text: 'Delete Exercise',
          role: 'destructive',
          icon: 'trash',
          handler: () => {
            this.confirmDeleteExercise(exercise);
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

  async confirmDeleteExercise(exercise: Exercise) {
    if (!exercise || !exercise.exerciseId || !this.workout?.workoutId) return;
    
    const alert = await this.alertController.create({
      header: 'Delete Exercise',
      message: `Are you sure you want to remove ${exercise.name} from this workout?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.removeExercise(exercise);
          }
        }
      ]
    });
    
    await alert.present();
  }

  async removeExercise(exercise: Exercise) {
    if (!exercise || !exercise.exerciseId || !this.workout?.workoutId) return;
    
    try {
      this.activeWorkoutService.removeExerciseFromWorkout(
        this.workout.workoutId, 
        exercise.exerciseId
      ).subscribe({
        next: (updatedExercises: Exercise[]) => {
          this.exercises = updatedExercises;
          this.showToast(`Removed ${exercise.name}`);
          this.changeDetector.markForCheck();
        },
        error: (error) => {
          console.error('Error removing exercise:', error);
          this.showToast('Failed to remove exercise');
        }
      });
    } catch (error) {
      console.error('Error in removeExercise:', error);
      this.showToast('An unexpected error occurred');
    }
  }

  // Set type change handler
  onSetTypeChange(sets: ExerciseSet[] | undefined, setIndex: number): void {
    if (!sets || setIndex < 0 || setIndex >= sets.length) return;
    
    const set = sets[setIndex];
    if (!set || !set.exerciseSetId) return;
    
    // Update in service (local only)
    this.activeWorkoutService.updateSetType(set.exerciseSetId, set.type);
    this.changeDetector.markForCheck();
  }

  // Remove set handler
  async removeSet(exercise: Exercise, setIndex: number) {
    if (!exercise || !exercise.sets || setIndex < 0 || setIndex >= exercise.sets.length) return;
    
    const set = exercise.sets[setIndex];
    if (!set) return;
    
    // Don't allow removing the last set
    if (exercise.sets.length <= 1) {
      this.showToast("Can't remove the last set");
      return;
    }
    
    // Show confirmation
    const alert = await this.alertController.create({
      header: 'Delete Set',
      message: 'Are you sure you want to delete this set?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            if (exercise.exerciseId && set.exerciseSetId) {
              this.activeWorkoutService.removeSetFromExercise(
                exercise.exerciseId,
                set.exerciseSetId
              ).subscribe({
                next: (updatedExercises) => {
                  this.exercises = updatedExercises;
                  this.changeDetector.markForCheck();
                },
                error: (error) => {
                  console.error('Error removing set:', error);
                  this.showToast('Failed to remove set');
                }
              });
            }
          }
        }
      ]
    });
    
    await alert.present();
  }

  // Reorder exercises
  reorderExercises(event: CustomEvent<ItemReorderEventDetail>) {
    // Keep a reference to the moved item
    const itemMove = this.exercises.splice(event.detail.from, 1)[0];
    
    // Insert the item at its new position
    this.exercises.splice(event.detail.to, 0, itemMove);
    
    // Complete the reorder operation
    event.detail.complete();
    
    // Update orderPosition for all exercises based on their index in the array
    this.exercises.forEach((exercise, index) => {
      exercise.orderPosition = index;
    });
    
    // Mark that order has changed
    this.exerciseOrderChanged = true;
    
    // Update the local workout in the service
    this.updateLocalExerciseOrder();
    
    this.changeDetector.markForCheck();
  }
  
  // Update exercise order in the service
  private updateLocalExerciseOrder() {
    if (!this.workout?.workoutId) return;
    
    const currentSession = this.activeWorkoutService.getCurrentSession();
    if (!currentSession) return;
    
    // Create a fresh copy of the exercises array with updated orderPositions
    const updatedExercises = this.exercises.map((exercise, index) => ({
      ...exercise,
      orderPosition: index
    }));
    
    // Update the session with the new exercises array
    const updatedSession = {
      ...currentSession,
      exercises: updatedExercises
    };
    
    // Update the workout session in the service
    this.activeWorkoutService.updateSession(updatedSession);
  }

  // Get set display number
  getNormalSetNumber(sets: ExerciseSet[] | undefined, index: number): string {
    if (!sets) return '1';
    
    // Count how many normal sets came before this one
    let normalSetCount = 0;
    for (let i = 0; i <= index; i++) {
      if (!sets[i].type || sets[i].type === SetType.NORMAL) {
        normalSetCount++;
      }
    }
    return normalSetCount.toString();
  }

  // Rest time display formatter
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

  // Discard workout confirmation
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
          handler: async () => {
            try {
              // First stop the timer to prevent further updates
              this.stopTimer();
              
              // Show loading to prevent navigation before clearing is done
              const loading = await this.loadingController.create({
                message: 'Discarding workout...',
                duration: 1000
              });
              await loading.present();
              
              // Clear the saved session and wait for it to complete
              await this.activeWorkoutService.clearSavedSession();
              
              // Give a slight delay to ensure everything is processed
              setTimeout(() => {
                this.router.navigate(['/tabs/workouts']);
              }, 300);
            } catch (error) {
              console.error('Error discarding workout:', error);
              this.showToast('Error discarding workout');
            }
          }
        }
      ]
    });
    
    await alert.present();
  }

  // Update template confirmation
  async confirmUpdateTemplate(workout: Workout, exercises: Exercise[]): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Update Routine',
      message: 'Do you want to update your workout routine template with the changes you made during this session?',
      buttons: [
        {
          text: 'No',
          role: 'cancel',
          handler: () => {
            this.router.navigate(['/tabs/profile']);
          }
        },
        {
          text: 'Yes, Update Routine',
          handler: async () => {
            const loading = await this.loadingController.create({
              message: 'Updating routine...'
            });
            await loading.present();
            
            // Create a deep copy to avoid modifying original objects
            const exercisesToUpdate = JSON.parse(JSON.stringify(exercises));
            
            console.log('Preparing exercises for template update:', 
              exercisesToUpdate.map((e: { name: any; exerciseId: any; sets: any[]; }) => ({
                name: e.name,
                exerciseId: e.exerciseId,
                setCount: e.sets?.length || 0,
                sets: e.sets?.map(s => ({
                  orderPosition: s.orderPosition,
                  reps: s.reps,
                  weight: s.weight,
                  type: s.type
                }))
              }))
            );
            
            // Make sure all exercises have proper orderPosition based on their sequence
            const preparedExercises = exercisesToUpdate.map((exercise: { sets: any[]; exerciseId: any; }, exerciseIndex: any) => {
              // Ensure exercises have 0-based index
              const cleanedExercise = {
                ...exercise,
                orderPosition: exerciseIndex,
                sets: exercise.sets ? exercise.sets.map((set, setIndex) => {
                  // Ensure sets have 0-based index and all required properties
                  return {
                    ...set,
                    exerciseId: exercise.exerciseId, // Make sure exerciseId is set
                    orderPosition: setIndex,
                    type: set.type || 'NORMAL',
                    reps: set.reps || 0,
                    weight: set.weight || 0,
                    restTimeSeconds: set.restTimeSeconds || 0
                  };
                }) : []
              };
              
              return cleanedExercise;
            });
            
            this.workoutService.updateWorkoutWithExercises(workout, preparedExercises)
              .pipe(
                finalize(() => {
                  loading.dismiss();
                })
              )
              .subscribe({
                next: () => {
                  this.showToast('Routine updated successfully');
                  this.router.navigate(['/tabs/profile']);
                },
                error: (error) => {
                  console.error('Error updating routine:', error);
                  this.showToast('Failed to update routine');
                  this.router.navigate(['/tabs/profile']);
                }
              });
          }
        }
      ]
    });

    await alert.present();
  }

  // Utility methods
  async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'bottom'
    });
    await toast.present();
  }

  // Add this method to the ActiveWorkoutPage class
  onWeightChange(set: ExerciseSet, weight: number): void {
    if (!set.exerciseSetId) return;
    
    // Update set weight in the service
    this.activeWorkoutService.updateSetWeight(set.exerciseSetId, weight);
  }

  // Add this method to the ActiveWorkoutPage class
  onRepsChange(set: ExerciseSet, reps: number): void {
    if (!set.exerciseSetId) return;
    
    // Update set reps in the service
    this.activeWorkoutService.updateSetReps(set.exerciseSetId, reps);
  }
}

