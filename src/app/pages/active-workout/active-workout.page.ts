import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, AlertController, ToastController, LoadingController, ActionSheetController, ItemReorderEventDetail } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { finalize, switchMap, take } from 'rxjs/operators';

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

  // Update set weight - convert to use indexes
  updateSetWeight(exercise: Exercise, setIndex: number, event: any) {
    if (!exercise || (!exercise.exerciseId && !exercise.tempId) || !exercise.sets) return;
    if (setIndex < 0 || setIndex >= exercise.sets.length) return;
    
    const newWeight = Number(event.detail.value);
    if (isNaN(newWeight)) return;
    
    // Update locally first for immediate UI feedback
    exercise.sets[setIndex].weight = newWeight;
    
    // Use either real ID or temp ID
    const exerciseId = exercise.exerciseId || exercise.tempId;
    
    if (!exerciseId) return;
    
    // Update in service using the index-based method
    this.activeWorkoutService.updateSetPropertyByIndex(
      exerciseId,
      setIndex,
      'weight',
      newWeight
    );
  }

  // Update set reps - convert to use indexes
  updateSetReps(exercise: Exercise, setIndex: number, event: any) {
    if (!exercise || (!exercise.exerciseId && !exercise.tempId) || !exercise.sets) return;
    if (setIndex < 0 || setIndex >= exercise.sets.length) return;
    
    const newReps = Number(event.detail.value);
    if (isNaN(newReps)) return;
    
    // Update locally first for immediate UI feedback
    exercise.sets[setIndex].reps = newReps;
    
    // Use either real ID or temp ID
    const exerciseId = exercise.exerciseId || exercise.tempId;
    
    if (!exerciseId) return;
    
    // Update in service using the index-based method
    this.activeWorkoutService.updateSetPropertyByIndex(
      exerciseId,
      setIndex,
      'reps',
      newReps
    );
  }

  // Toggle set completion - convert to use indexes
  toggleSetComplete(exercise: Exercise, setIndex: number) {
    if (!exercise || (!exercise.exerciseId && !exercise.tempId) || !exercise.sets) return;
    if (setIndex < 0 || setIndex >= exercise.sets.length) return;
    
    // Toggle the state locally first
    const set = exercise.sets[setIndex];
    set.completed = !set.completed;
    
    // Use either real ID or temp ID
    const exerciseId = exercise.exerciseId || exercise.tempId;
    
    if (!exerciseId) return;
    
    // Update in service using the index-based method
    this.activeWorkoutService.updateSetPropertyByIndex(
      exerciseId,
      setIndex,
      'completed',
      set.completed
    );
    
    this.changeDetector.markForCheck();
  }

  // Update the set type change handler
  onSetTypeChange(exercise: Exercise, setIndex: number): void {
    if (!exercise || (!exercise.exerciseId && !exercise.tempId) || !exercise.sets) return;
    if (setIndex < 0 || setIndex >= exercise.sets.length) return;
    
    const set = exercise.sets[setIndex];
    
    // Use either real ID or temp ID
    const exerciseId = exercise.exerciseId || exercise.tempId;
    
    if (!exerciseId) return;
    
    console.log(`Set ${setIndex} type changing to ${set.type}`);
    
    // Update in service
    this.activeWorkoutService.updateSetPropertyByIndex(
      exerciseId,
      setIndex,
      'type',
      set.type
    );
    
    // Create a completely new copy of all exercises to force full refresh
    this.exercises = this.exercises.map(ex => {
      if (ex === exercise) {
        // For the changed exercise, create a new reference with new sets array
        return {
          ...ex,
          sets: [...ex.sets!]
        };
      }
      return ex;
    });
    
    // Force immediate change detection
    this.changeDetector.detectChanges();
    
    // Log debug info
    console.log(`Set ${setIndex} type changed to ${set.type}`);
    console.log('Exercise sets after update:', exercise.sets.map(s => s.type));
  }

  // Remove set handler
  async removeSet(exercise: Exercise, setIndex: number) {
    if (!exercise || (!exercise.exerciseId && !exercise.tempId) || !exercise.sets) return;
    if (setIndex < 0 || setIndex >= exercise.sets.length) return;
    
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
            // Use either real ID or temp ID
            const exerciseId = exercise.exerciseId || exercise.tempId;
            
            if (!exerciseId) return;
            
            this.activeWorkoutService.removeSetFromExercise(
              exerciseId,
              setIndex
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
      ]
    });
    
    await alert.present();
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
      
      // Stop the timer to prevent further updates
      this.stopTimer();
      
      // Check if we have any temporary exercises that need to be synced
      const hasTempExercises = currentSession.exercises.some(
        exercise => !exercise.exerciseId || exercise.exerciseId.toString().startsWith('temp-')
      );
      
      // Format duration for history
      const timerValue = this.elapsedTime;
      const duration = this.formatDuration(timerValue);
      
      const workoutWithDuration: ActiveWorkout = {
        ...currentSession.workout,
        duration: duration,
        endTime: new Date().toISOString()
      };
      
      if (hasTempExercises) {
        // Sync temporary exercises first
        this.activeWorkoutService.syncWorkoutWithBackend(this.workout.workoutId!)
          .pipe(
            // Clear session after syncing
            switchMap(syncedExercises => {
              return this.activeWorkoutService.clearSavedSession().then(() => syncedExercises);
            }),
            // Complete the workout with synced exercises
            switchMap(syncedExercises => {
              return this.workoutHistoryService.completeWorkout(workoutWithDuration, syncedExercises);
            }),
            finalize(() => {
              loading.dismiss();
              this.isCompleting = false;
            })
          )
          .subscribe({
            next: async () => {
              this.confirmUpdateTemplate(currentSession.workout, currentSession.exercises);
            },
            error: (error: any) => {
              console.error('Error completing workout:', error);
              this.showToast('Failed to save workout');
            }
          });
      } else {
        // No temp exercises, proceed directly
        await this.activeWorkoutService.clearSavedSession();
        
        this.workoutHistoryService.completeWorkout(workoutWithDuration, currentSession.exercises)
          .pipe(
            finalize(() => {
              loading.dismiss();
              this.isCompleting = false;
            })
          )
          .subscribe({
            next: async () => {
              this.confirmUpdateTemplate(currentSession.workout, currentSession.exercises);
            },
            error: (error) => {
              console.error('Error completing workout:', error);
              this.showToast('Failed to save workout');
            }
          });
      }
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
    if (!exercise) {
      this.showToast('Cannot add set: Invalid exercise');
      return;
    }
    
    // Use either real ID or temp ID for the exercise
    const exerciseId = exercise.exerciseId || exercise.tempId;
    
    if (!exerciseId) {
      this.showToast('Cannot add set: Missing exercise information');
      return;
    }
    
    this.activeWorkoutService.addSetToExercise(exerciseId).subscribe({
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
    if (!exercise || !this.workout?.workoutId) return;
    
    try {
      // Check if this is a temporary exercise or a real one
      const isTempExercise = !exercise.exerciseId || exercise.exerciseId.toString().startsWith('temp-');
      const exerciseId = exercise.exerciseId || exercise.tempId;
      
      if (!exerciseId) {
        this.showToast('Cannot remove exercise: Missing exercise information');
        return;
      }
      
      // For real exercises (with non-temp IDs), call the backend API first
      if (!isTempExercise) {
        console.log(`Deleting real exercise with ID ${exerciseId} from backend`);
        
        // Show loading indicator
        const loading = await this.loadingController.create({
          message: 'Removing exercise...',
          duration: 2000
        });
        await loading.present();
        
        // Call the backend API to delete the exercise
        this.workoutService.removeExerciseFromWorkout(this.workout.workoutId, exerciseId)
          .subscribe({
            next: () => {
              console.log(`Backend deletion successful for exercise ${exerciseId}`);
              
              // Then update the local session
              this.activeWorkoutService.removeExerciseFromWorkout(
                this.workout!.workoutId!, 
                exerciseId
              ).subscribe({
                next: (updatedExercises: Exercise[]) => {
                  this.exercises = updatedExercises;
                  this.showToast(`Removed ${exercise.name}`);
                  this.changeDetector.markForCheck();
                },
                error: (error) => {
                  console.error('Error updating local session after exercise removal:', error);
                  // Even if there's an error updating local session, refresh from backend
                  this.loadExercises(this.workout!.workoutId!);
                }
              });
            },
            error: (error) => {
              console.error(`Error deleting exercise ${exerciseId} from backend:`, error);
              this.showToast('Failed to remove exercise from server');
              loading.dismiss();
            }
          });
      } else {
        // For temporary exercises, just update the local session
        console.log(`Removing temporary exercise with ID ${exerciseId} from local session`);
        
        this.activeWorkoutService.removeExerciseFromWorkout(
          this.workout.workoutId, 
          exerciseId
        ).subscribe({
          next: (updatedExercises: Exercise[]) => {
            this.exercises = updatedExercises;
            this.showToast(`Removed ${exercise.name}`);
            this.changeDetector.markForCheck();
          },
          error: (error) => {
            console.error('Error removing exercise from local session:', error);
            this.showToast('Failed to remove exercise');
          }
        });
      }
    } catch (error) {
      console.error('Error in removeExercise:', error);
      this.showToast('An unexpected error occurred');
    }
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
  getNormalSetNumber(sets: ExerciseSet[] | undefined, currentIndex: number): string {
    if (!sets) return '1';
    
    // Count how many normal sets came before this one (including this one if it's normal)
    let normalSetCount = 0;
    for (let i = 0; i <= currentIndex; i++) {
      if (!sets[i] || !sets[i].type || sets[i].type === SetType.NORMAL) {
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
            
            try {
              // Create a deep copy to avoid modifying original objects
              const exercisesToUpdate = JSON.parse(JSON.stringify(exercises));
              
              // Filter out any exercises without real IDs
              const validExercises = exercisesToUpdate.filter((exercise: { exerciseId: { toString: () => string; }; }) => 
                exercise.exerciseId && !exercise.exerciseId.toString().startsWith('temp-')
              );
              
              console.log(`Preparing to update ${validExercises.length} exercises with their sets`);
              
              // Make sure all exercises have proper orderPosition based on their sequence
              const preparedExercises = validExercises.map((exercise: Exercise, exerciseIndex: number) => {
                // Ensure exercises have 0-based index
                const cleanedExercise = {
                  ...exercise,
                  tempId: undefined, // Remove tempId property
                  orderPosition: exerciseIndex,
                  sets: exercise.sets ? exercise.sets.map((set, setIndex) => {
                    // Keep exerciseSetId if it exists and is not a temp ID
                    const shouldKeepSetId = set.exerciseSetId && 
                                           !set.exerciseSetId.toString().startsWith('temp-');
                    
                    // Remove properties that shouldn't be sent to backend
                    const { tempId, completed, ...cleanSet } = set;
                    
                    // Ensure sets have 0-based index and all required properties
                    return {
                      ...cleanSet,
                      exerciseSetId: shouldKeepSetId ? cleanSet.exerciseSetId : undefined,
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
              
              console.log('Sending prepared exercises to backend:', preparedExercises);
              
              this.workoutService.updateWorkoutWithExercises(workout, preparedExercises)
                .pipe(
                  finalize(() => {
                    loading.dismiss();
                  })
                )
                .subscribe({
                  next: (response) => {
                    console.log('Routine update response:', response);
                    this.showToast('Routine updated successfully');
                    this.router.navigate(['/tabs/profile']);
                  },
                  error: (error) => {
                    console.error('Error updating routine:', error);
                    this.showToast('Failed to update routine');
                    this.router.navigate(['/tabs/profile']);
                  }
                });
            } catch (error) {
              console.error('Error preparing exercises for update:', error);
              loading.dismiss();
              this.showToast('Failed to update routine');
              this.router.navigate(['/tabs/profile']);
            }
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
  onWeightChange(exercise: Exercise, setIndex: number, weight: number): void {
    if (!exercise || !exercise.exerciseId) return;
    
    // Update set weight in the service using the index-based method
    this.activeWorkoutService.updateSetPropertyByIndex(
      exercise.exerciseId,
      setIndex,
      'weight',
      weight
    );
  }

  // Add this method to the ActiveWorkoutPage class
  onRepsChange(exercise: Exercise, setIndex: number, reps: number): void {
    if (!exercise || !exercise.exerciseId) return;
    
    // Update set reps in the service using the index-based method
    this.activeWorkoutService.updateSetPropertyByIndex(
      exercise.exerciseId,
      setIndex,
      'reps',
      reps
    );
  }

  // Add/update this method in the active-workout.page.ts file
  updateSetValue(exercise: Exercise, set: ExerciseSet, property: string, event: any) {
    if (!exercise) return;
    
    const value = event.detail.value;
    
    // For temporary sets or exercises, just update locally
    if (!this.workout?.workoutId || !exercise.exerciseId || !set.exerciseSetId) {
      this.activeWorkoutService.updateSetProperty(
        set.exerciseSetId || set.tempId!, 
        property, 
        value
      );
      
      // Force UI refresh if changing the set type
      if (property === 'type') {
        this.refreshExerciseUI(exercise);
      }
      
      return;
    }

    // For sets with real IDs, update with backend sync
    this.activeWorkoutService.updateSetPropertyWithSync(
      this.workout.workoutId,
      exercise.exerciseId,
      set.exerciseSetId,
      property,
      value
    ).subscribe({
      next: () => {
        // Force UI refresh if changing the set type
        if (property === 'type') {
          this.refreshExerciseUI(exercise);
        }
      },
      error: (error) => {
        console.error(`Error updating ${property}:`, error);
        this.showToast(`Failed to update ${property}`);
      }
    });
  }

  // Helper method to force UI refresh
  private refreshExerciseUI(exercise: Exercise): void {
    if (!exercise || !exercise.sets) return;
    
    // Create a new reference to trigger change detection
    exercise.sets = [...exercise.sets];
    
    // Force immediate update
    this.changeDetector.detectChanges();
  }
}

