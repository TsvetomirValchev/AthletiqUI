import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonicModule, ToastController, LoadingController, ActionSheetController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, take, Observable, of } from 'rxjs';
import { finalize, map } from 'rxjs/operators'; // Add this missing import
import { ActiveWorkoutService } from '../../services/active-workout.service';
import { WorkoutService } from '../../services/workout.service';
import { WorkoutHistoryService } from '../../services/workout-history.service';
import { ActiveWorkout } from '../../models/active-workout.model';
import { Exercise } from '../../models/exercise.model';
import { ExerciseSet } from '../../models/exercise-set.model';
import { SetType } from '../../models/set-type.enum';
import { ExerciseTemplate } from '../../models/exercise-template.model';
import { Workout } from '../../models/workout.model';
import { ItemReorderEventDetail } from '@ionic/angular';

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
  timerSubscription: Subscription | null = null;
  workoutSubscription: Subscription | null = null;
  isLoading = true;
  SetType = SetType;
  isPaused = false; // Add this property
  isCompleting = false;
  muscleFilter = '';
  searchQuery = '';

  // Add these new properties
  exerciseTemplates: ExerciseTemplate[] = [];
  showExerciseLibrary = false;
  filteredTemplates: ExerciseTemplate[] = [];
  searchTerm: string = '';
  selectedMuscleGroup: string = 'All Muscles';

  // Add this flag to track if exercise order has changed
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
    private actionSheetController: ActionSheetController // Inject ActionSheetController
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

  // Update the loadExercises method to ensure we load by orderPosition
  loadExercises(workoutId: string) {
    this.activeWorkoutService.getExercisesByWorkoutId(workoutId).subscribe({
      next: (exercises: Exercise[]) => {
        // Log the exercises before sorting
        console.log('Exercises before sorting:', 
          exercises.map(e => `${e.name} (pos: ${e.orderPosition})`));
        
        // Sort exercises by orderPosition before assigning
        this.exercises = [...exercises].sort((a, b) => 
          (a.orderPosition || 0) - (b.orderPosition || 0)
        );
        
        // Log the exercises after sorting
        console.log('Exercises after sorting:', 
          this.exercises.map(e => `${e.name} (pos: ${e.orderPosition})`));
        
        this.isLoading = false;
        this.changeDetector.markForCheck();
      },
      error: (error: Error) => {
        console.error('Error loading exercises:', error);
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

  // These methods are already properly implemented
  isSetCompleted(set: ExerciseSet): boolean {
    // Just return the completed property directly from the set
    return set?.completed || false;
  }

  // Update set weight
  updateSetWeight(set: ExerciseSet, event: any) {
    const newWeight = Number(event.detail.value);
    if (isNaN(newWeight)) return;
    
    // Update locally first for immediate UI feedback
    set.weight = newWeight;
    
    // Inform the service
    this.activeWorkoutService.updateSetWeight(set.exerciseSetId!, newWeight);
  }

  // Update set reps
  updateSetReps(set: ExerciseSet, event: any) {
    const newReps = Number(event.detail.value);
    if (isNaN(newReps)) return;
    
    // Update locally first for immediate UI feedback
    set.reps = newReps;
    
    // Inform the service
    this.activeWorkoutService.updateSetReps(set.exerciseSetId!, newReps);
  }

  // Toggle set completion
  toggleSetComplete(set: ExerciseSet) {
    if (!set || !set.exerciseSetId) return;
    
    // Toggle the state locally first
    set.completed = !set.completed;
    
    // Inform the service
    this.activeWorkoutService.toggleSetCompletion(set.exerciseSetId, set.completed);
    
    // Force change detection
    this.changeDetector.markForCheck();
  }

  // Update the addExercise method to show the library
  async addExercise() {
    if (!this.workout?.workoutId) return;
    
    // Show the library instead of the alert
    this.showExerciseLibrary = true;
    this.isLoading = true;
    
    // Reset filters when opening
    this.searchTerm = '';
    this.selectedMuscleGroup = 'All Muscles';
    
    // Load templates if needed
    if (this.exerciseTemplates.length === 0) {
      this.workoutService.getExerciseTemplates().subscribe({
        next: (templates) => {
          this.exerciseTemplates = templates;
          this.filteredTemplates = [...templates];
          this.isLoading = false;
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
  }
  
  // Add this method to add an exercise from template
  addExerciseFromTemplate(template: ExerciseTemplate) {
    if (!template || !template.exerciseTemplateId || !this.workout?.workoutId) return;
    
    // Create Exercise object with template information
    const newExercise: Exercise = {
      exerciseTemplateId: template.exerciseTemplateId!,
      name: template.name,
      notes: '',
      workoutId: this.workout!.workoutId,
      // Initialize with a single set
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
    
    // Add the exercise to the active workout through the service
    this.activeWorkoutService.addExerciseToWorkout(this.workout!.workoutId!, newExercise).subscribe({
      next: (updatedExercises: Exercise[]) => {
        // Update the local exercises array with the new data
        this.exercises = updatedExercises;
        
        // Log the exercise IDs to verify they're properly set
        console.log('Updated exercises with IDs:', 
          this.exercises.map(e => ({ name: e.name, id: e.exerciseId })));
        
        this.showToast(`Added ${template.name}`);
        
        // Close the library after selection
        this.showExerciseLibrary = false;
        
        // Check if exercises have valid IDs
        const hasInvalidIds = this.exercises.some(e => !e.exerciseId);
        if (hasInvalidIds) {
          console.warn('Some exercises are missing IDs after update');
        }
      },
      error: (error) => {
        console.error('Error adding exercise:', error);
        this.showToast('Failed to add exercise');
      }
    });
  }
  
  // Add search and filter methods
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
  }

  async finishWorkout() {
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
      
      // Get a copy of all data we need before clearing
      const workout = { ...currentSession.workout };
      const updatedExercises = [...currentSession.exercises];
      const timerValue = this.elapsedTime;
      
      // Format the duration string
      const hours = Math.floor(timerValue / 3600);
      const minutes = Math.floor((timerValue % 3600) / 60);
      const seconds = timerValue % 60;
      
      let duration = 'PT';
      if (hours > 0) duration += `${hours}H`;
      if (minutes > 0) duration += `${minutes}M`;
      if (seconds > 0 || (hours === 0 && minutes === 0)) duration += `${seconds}S`;
      
      const workoutWithDuration: ActiveWorkout = {
        ...workout,
        duration: duration,
        endTime: new Date().toISOString()
      };
      
      console.log(`Using displayed timer value: ${timerValue}s (${duration})`);
      
      // Stop the timer to prevent further updates
      this.stopTimer();
      
      // Complete the workout - send to backend
      this.workoutHistoryService.completeWorkout(workoutWithDuration, updatedExercises)
        .pipe(
          finalize(() => {
            // Clear the saved session regardless of outcome
            this.activeWorkoutService.clearSavedSession();
          })
        )
        .subscribe({
          next: async (response) => {
            // Force refresh the workout history cache
            this.workoutHistoryService.refreshHistory();
            
            loading.dismiss();
            this.showToast('Workout completed successfully');
            
            // Check if the workout template should be updated
            const hasChanges = this.detectTemplateChanges(workout, updatedExercises);
            
            // If there are changes, ask the user if they want to update the template
            if (hasChanges) {
              // Wait a moment before showing the next dialog
              setTimeout(() => {
                this.confirmUpdateTemplate(workout, updatedExercises);
              }, 300);
            } else {
              this.router.navigate(['/tabs/profile']);
            }
          },
          error: (error) => {
            loading.dismiss();
            this.showToast('Error completing workout');
            console.error('Error completing workout:', error);
            this.isCompleting = false;
          }
        });
    } catch (error) {
      console.error('Error in finishWorkout:', error);
      this.showToast('An unexpected error occurred');
      this.isCompleting = false;
    }
  }

  // Move the cleanExercises function to be a proper class method
  cleanExercises(exercises: Exercise[]): Exercise[] {
    console.log('Cleaning exercises for template update:', exercises.length);
    
    return exercises
      // Only filter temporary exercises, keep all valid ones
      .filter(ex => !ex.exerciseId?.startsWith('temp-'))
      .map(exercise => {
        // Create a proper copy to avoid reference issues
        return {
          ...exercise,
          // Ensure exerciseTemplateId is preserved
          exerciseTemplateId: exercise.exerciseTemplateId,
          // Don't filter temp sets - include them all
          sets: (exercise.sets || [])
            .map(set => ({
              ...set,
              // Clear exerciseSetId for temp sets so backend creates new ones
              exerciseSetId: set.exerciseSetId?.startsWith('temp-') ? undefined : set.exerciseSetId,
              // Ensure exercise ID reference is maintained
              exerciseId: exercise.exerciseId,
              // Reset the completion status for the template
              completed: false
            }))
        };
      });
  }

  private detectTemplateChanges(workout: Workout, exercises: Exercise[]): boolean {
    try {
      // If it's a temporary workout, don't suggest updating a template
      if (workout.workoutId?.startsWith('temp-')) {
        console.log('Temporary workout - no template to update');
        return false;
      }
      
      console.log('Checking for template changes...');
      
      // Look for any of the following changes:
      // 1. New exercises added
      // 2. Changes to sets (weight, reps, or new sets)
      
      // Check for new exercises
      const newExercises = exercises.filter(ex => 
        // Exercise ID doesn't start with temp- (it's been saved to backend)
        // AND it has an exerciseTemplateId (it's based on a template)
        !ex.exerciseId?.startsWith('temp-') && ex.exerciseTemplateId
      );
      
      if (newExercises.length > 0) {
        console.log('Found new exercises:', newExercises.length);
        return true;
      }
      
      // Check for changes to sets
      for (const exercise of exercises) {
        // Skip temporary exercises
        if (exercise.exerciseId?.startsWith('temp-')) continue;
        
        const sets = exercise.sets || [];
        
        // If we have sets with completed status, weights, or reps
        if (sets.some(set => {
          // Consider any populated field as a change
          const hasWeight = (set.weight ?? 0) > 0;
          const hasReps = (set.reps ?? 0) > 0;
          const isCustomType = set.type !== SetType.NORMAL;
          
          return hasWeight || hasReps || isCustomType;
        })) {
          console.log('Found set changes in exercise:', exercise.name);
          return true;
        }
      }
      
      console.log('No significant changes detected in workout');
      return false;
    } catch (error) {
      console.error('Error detecting template changes:', error);
      return false;
    }
  }

  async confirmUpdateTemplate(workout: Workout, exercises: Exercise[]): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Update Routine',
      message: 'Do you want to update your workout routine template with the changes you made during this session?',
      buttons: [
        {
          text: 'No',
          role: 'cancel',
          handler: () => {
            console.log('User declined to update template');
            this.router.navigate(['/tabs/profile']);
          }
        },
        {
          text: 'Yes, Update Routine',
          handler: async () => {
            console.log('User confirmed template update');
            
            const loading = await this.loadingController.create({
              message: 'Updating routine...'
            });
            await loading.present();
            
            // Prepare exercises for template update
            const templateExercises = this.prepareExercisesForTemplate(exercises);
            
            // Update the workout template with clean exercises
            this.workoutService.updateWorkoutWithExercises(workout, templateExercises)
              .subscribe({
                next: () => {
                  loading.dismiss();
                  this.showToast('Workout routine updated successfully');
                  
                  // Reset the exercise order changed flag
                  this.exerciseOrderChanged = false;
                  
                  // Navigate to profile page
                  this.router.navigate(['/tabs/profile']);
                },
                error: (error: any) => {
                  loading.dismiss();
                  console.error('Error updating workout template:', error);
                  this.showToast('Error updating workout routine');
                  this.router.navigate(['/tabs/profile']);
                }
              });
          }
        }
      ]
    });

    await alert.present();
  }

  // New method to prepare exercises for template update
  private prepareExercisesForTemplate(exercises: Exercise[]): Exercise[] {
    console.log('Preparing exercises for template update:', exercises.length);
    
    // First sort by orderPosition to ensure correct order
    const sortedExercises = [...exercises].sort((a, b) => 
      (a.orderPosition || 0) - (b.orderPosition || 0)
    );
    
    return sortedExercises
      // Remove temporary exercises that haven't been saved to backend
      .filter(ex => !ex.exerciseId?.startsWith('temp-'))
      .map((exercise, index) => {
        // Create a proper copy to avoid reference issues
        return {
          ...exercise,
          // Keep the exerciseTemplateId to maintain connection to exercise library
          exerciseTemplateId: exercise.exerciseTemplateId,
          // Ensure orderPosition is properly set based on current array position
          orderPosition: index, // Force the correct order position
          sets: (exercise.sets || [])
            // Sort sets by order position
            .sort((a, b) => (a.orderPosition || 0) - (b.orderPosition || 0))
            .map(set => ({
              ...set,
              // Clear exerciseSetId for temporary sets so backend creates new ones
              exerciseSetId: set.exerciseSetId?.startsWith('temp-') ? undefined : set.exerciseSetId,
              // Ensure exercise ID reference is maintained
              exerciseId: exercise.exerciseId,
              // Reset completion status as this is for the template
              completed: false
            }))
        };
      });
  }

  // Add missing method for showToast
  async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'bottom'
    });
    await toast.present();
  }

  // Add missing method for discardWorkout
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
              // Stop the timer
              this.stopTimer();
              
              // Clear the saved session
              await this.activeWorkoutService.clearSavedSession();
              
              // We should notify someone that workout is completed/discarded
              // Use a method that's actually available from the service
              // Instead of directly accessing the private subject
              this.showToast('Workout discarded');
              this.router.navigate(['/tabs/workouts']);
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

  // Update the addSet method 
  addSet(exercise: Exercise) {
    if (!exercise || !exercise.exerciseId) {
      console.error('Cannot add set: Exercise ID is missing');
      return;
    }
    
    console.log('Adding set to exercise:', exercise.name);
    
    // Call the service method directly
    this.activeWorkoutService.addSetToExercise(exercise.exerciseId).subscribe({
      next: (updatedExercises: Exercise[]) => {
        // Create a new array to ensure change detection works
        this.exercises = [...updatedExercises];
        
        // Log the number of sets for debugging
        const updatedExercise = updatedExercises.find(e => e.exerciseId === exercise.exerciseId);
        console.log('Updated exercise:', updatedExercise?.name, 
                    'Sets:', updatedExercise?.sets?.length);
        
        // Force change detection
        this.changeDetector.markForCheck();
        
        this.showToast('Set added');
      },
      error: (error: any) => {
        console.error('Error adding set:', error);
        this.showToast('Failed to add set');
      }
    });
  }

  // Add missing method for onWeightChange
  onWeightChange(set: ExerciseSet, weight: number) {
    if (!set.exerciseSetId) return;
    
    // Update in service
    this.activeWorkoutService.updateSetWeight(set.exerciseSetId, weight);
  }

  // Add missing method for onRepsChange
  onRepsChange(set: ExerciseSet, reps: number) {
    if (!set.exerciseSetId) return;
    
    // Update in service
    this.activeWorkoutService.updateSetReps(set.exerciseSetId, reps);
  }

  // Add missing method for onSetTypeChange
  onSetTypeChange(sets: ExerciseSet[] | undefined, setIndex: number): void {
    if (!sets || setIndex < 0 || setIndex >= sets.length) return;
    
    const set = sets[setIndex];
    if (!set || !set.exerciseSetId) return;
    
    // Update in service
    this.activeWorkoutService.updateSetType(set.exerciseSetId, set.type);
  }

  // Add missing method for getRestTimeDisplay
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

  // Add missing method for getNormalSetNumber
  getNormalSetNumber(sets: ExerciseSet[] | undefined, index: number): string {
    if (!sets) return "1";
    
    // Count how many normal sets came before this one
    let normalSetCount = 0;
    for (let i = 0; i <= index; i++) {
      if (i < sets.length && sets[i].type === SetType.NORMAL) {
        normalSetCount++;
      }
    }
    return normalSetCount.toString();
  }

  // Add missing method
  ngOnDestroy() {
    this.stopTimer();
    if (this.workoutSubscription) {
      this.workoutSubscription.unsubscribe();
    }
  }

  // Add the startEmptyWorkout method to match the HTML
  startEmptyWorkout(): void {
    if (!this.workout) {
      // Create a new empty workout
      const emptyWorkout: ActiveWorkout = {
        name: 'Empty Workout',
        startTime: new Date().toISOString(),
        workoutId: `temp-${Date.now()}`
      };
      
      this.workout = emptyWorkout;
      this.exercises = [];
      this.workoutActive = true;
      this.isPaused = false;
      
      // Start the workout in the service
      this.activeWorkoutService.startWorkout(emptyWorkout).subscribe({
        next: () => {
          this.startTimer();
          this.showToast('Empty workout started');
        },
        error: (error) => {
          console.error('Error starting empty workout:', error);
          this.showToast('Failed to start empty workout');
        }
      });
    }
  }

  // Add this method to handle the options menu click
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
            // Show a confirmation alert before deleting
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

  // Add this helper method for confirmation
  async confirmDeleteExercise(exercise: Exercise) {
    if (!exercise || !exercise.exerciseId) return;
    
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

  // Method to remove an exercise
  async removeExercise(exercise: Exercise) {
    if (!exercise || !exercise.exerciseId || !this.workout?.workoutId) return;
    
    try {
      // Show loading indicator
      const loading = await this.loadingController.create({
        message: 'Deleting exercise...',
        duration: 3000
      });
      await loading.present();
      
      // Check if the exercise has a temporary ID (not yet persisted to backend)
      if (exercise.exerciseId.startsWith('temp-')) {
        // Just remove it from the local array
        this.exercises = this.exercises.filter(ex => ex.exerciseId !== exercise.exerciseId);
        this.showToast(`Removed ${exercise.name}`);
        this.changeDetector.markForCheck();
        loading.dismiss();
        return;
      }
      
      // Otherwise call the service to delete the exercise
      this.activeWorkoutService.removeExerciseFromWorkout(
        this.workout.workoutId,
        exercise.exerciseId
      ).subscribe({
        next: (updatedExercises: Exercise[]) => {
          // Update exercises array
          this.exercises = updatedExercises;
          this.showToast(`Removed ${exercise.name}`);
          this.changeDetector.markForCheck();
          loading.dismiss();
        },
        error: (error) => {
          console.error('Error removing exercise:', error);
          this.showToast('Failed to remove exercise');
          loading.dismiss();
        }
      });
    } catch (error) {
      console.error('Error in removeExercise:', error);
      this.showToast('An unexpected error occurred');
    }
  }

  // Method to remove a set from an exercise
  async removeSet(exercise: Exercise, setIndex: number) {
    if (!exercise || !exercise.sets || setIndex < 0 || setIndex >= exercise.sets.length) return;
    
    const set = exercise.sets[setIndex];
    if (!set) return;
    
    // Don't allow removing the last set
    if (exercise.sets.length <= 1) {
      this.showToast('Cannot remove the last set');
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
            this.performSetDeletion(exercise, set, setIndex);
          }
        }
      ]
    });
    
    await alert.present();
  }

  // Helper method to perform the actual deletion
  private performSetDeletion(exercise: Exercise, set: ExerciseSet, setIndex: number) {
    // Handle temporary sets (not yet saved to backend)
    if (!set.exerciseSetId || set.exerciseSetId.startsWith('temp-')) {
      // Just remove from the local array
      exercise.sets?.splice(setIndex, 1);
      
      // Update order positions
      exercise.sets?.forEach((s, idx) => {
        s.orderPosition = idx + 1;
      });
      
      this.showToast('Set removed');
      this.changeDetector.markForCheck();
      return;
    }
    
    // For sets with real IDs, use the service
    if (!exercise.exerciseId || !set.exerciseSetId) return;
    
    this.activeWorkoutService.removeSetFromExercise(
      exercise.exerciseId, 
      set.exerciseSetId
    ).subscribe({
      next: (updatedExercises: Exercise[]) => {
        // Update the exercises array
        this.exercises = updatedExercises;
        this.showToast('Set removed');
        this.changeDetector.markForCheck();
      },
      error: (error) => {
        console.error('Error removing set:', error);
        this.showToast('Failed to remove set');
      }
    });
  }

  // Updated applyFilters method for exercise templates
  applyFilters() {
    if (!this.exerciseTemplates || this.exerciseTemplates.length === 0) {
      return;
    }
    
    this.filteredTemplates = this.exerciseTemplates.filter(template => {
      // Check if it matches muscle filter
      const matchesMuscle = !this.muscleFilter || 
        (template.targetMuscleGroups && 
         template.targetMuscleGroups.some(muscle => 
           muscle.toLowerCase() === this.muscleFilter.toLowerCase()));
      
      // Check if it matches search query
      const matchesSearch = !this.searchQuery || 
        template.name.toLowerCase().includes(this.searchQuery.toLowerCase());
      
      // Include only if it matches both criteria
      return matchesMuscle && matchesSearch;
    });
  }

  // Add method to handle exercise reordering
  reorderExercises(event: CustomEvent<ItemReorderEventDetail>) {
    // Keep a reference to the moved item
    const itemMove = this.exercises.splice(event.detail.from, 1)[0];
    
    // Insert the item at its new position
    this.exercises.splice(event.detail.to, 0, itemMove);
    
    // Complete the reorder operation
    event.detail.complete();

    console.log('Reordering exercises from', event.detail.from, 'to', event.detail.to);
    
    // Update orderPosition for all exercises based on their index in the array
    this.exercises.forEach((exercise, index) => {
      exercise.orderPosition = index;
      console.log(`Exercise ${exercise.name} new orderPosition: ${index}`);
    });
    
    // Mark that order has changed
    this.exerciseOrderChanged = true;
    
    // Update the local workout in IndexedDB with the correct order
    this.updateLocalExerciseOrder();
    
    // Force change detection
    this.changeDetector.markForCheck();
  }
  
  // Fix the updateLocalExerciseOrder method to properly update IndexedDB
  private updateLocalExerciseOrder() {
    if (!this.workout?.workoutId) {
      console.error('Cannot update exercise order: workoutId is missing');
      return;
    }
    
    // Get the current session from the service
    const currentSession = this.activeWorkoutService.getCurrentSession();
    if (!currentSession) {
      console.error('Cannot update exercise order: no active session found');
      return;
    }
    
    console.log('Updating exercise order in IndexedDB');
    
    // Create a fresh copy of the exercises array with updated orderPositions
    const updatedExercises = this.exercises.map((exercise, index) => ({
      ...exercise,
      orderPosition: index  // Ensure orderPosition matches its array index
    }));
    
    console.log('Updated exercises with new order:', 
      updatedExercises.map(e => `${e.name} (pos: ${e.orderPosition})`));
    
    // Update the session with the new exercises array
    const updatedSession = {
      ...currentSession,
      exercises: updatedExercises
    };
    
    // Update the workout session in the service AND IndexedDB
    this.activeWorkoutService.updateSession(updatedSession);
    
    // Log verification
    console.log('Session updated in service');
  }
}

