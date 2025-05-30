import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IonicModule, AlertController, ToastController, ActionSheetController, ItemReorderEventDetail } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { WorkoutService } from '../../services/workout.service';
import { Workout } from '../../models/workout.model';
import { Exercise } from '../../models/exercise.model';
import { ExerciseTemplate } from '../../models/exercise-template.model';
import { SetType } from '../../models/set-type.enum';
import { ExerciseSet } from '../../models/exercise-set.model';
import { catchError, forkJoin, of } from 'rxjs';

@Component({
  selector: 'app-create-routine',
  templateUrl: './create-routine.page.html',
  styleUrls: ['./create-routine.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, ReactiveFormsModule]
})
export class CreateRoutinePage implements OnInit {
  routineForm: FormGroup;
  exerciseTemplates: ExerciseTemplate[] = [];
  exercises: Exercise[] = []; // Replace exerciseConfigs with exercises
  SetType = SetType; // Make enum available to template
  isLoading = false;
  showLibraryOnMobile = false;
  private tempExerciseSets = new Map<string, ExerciseSet[]>();
  private tempNewExerciseSets = new Map<number, ExerciseSet[]>();
  filteredTemplates: ExerciseTemplate[] = [];
  muscleFilter = '';
  searchQuery = '';

  constructor(
    private fb: FormBuilder,
    private workoutService: WorkoutService,
    private router: Router,
    private route: ActivatedRoute,
    private alertController: AlertController,
    private toastController: ToastController,
    private actionSheetController: ActionSheetController,
    private changeDetector: ChangeDetectorRef
  ) {
    this.routineForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]]
    });
  }

  ngOnInit() {
    this.loadExerciseTemplates();
    
    // Check if we're editing an existing workout
    const workoutId = this.route.snapshot.queryParamMap.get('workoutId');
    if (workoutId) {
      this.isLoading = true;
      this.loadWorkoutForEditing(workoutId);
    }
  }

  loadExerciseTemplates() {
    this.workoutService.getExerciseTemplates().subscribe({
      next: (templates: ExerciseTemplate[]) => {
        this.exerciseTemplates = templates;
      },
      error: (error: Error) => {
        console.error('Error loading templates:', error);
        this.showToast('Error loading exercise templates');
      }
    });
  }

  async addExercise() {
    if (this.exerciseTemplates.length === 0) {
      this.showToast('No exercise templates available');
      return;
    }
    
    const alert = await this.alertController.create({
      header: 'Select Exercise',
      inputs: this.exerciseTemplates.map((template, index) => ({
        name: `exercise-${index}`,
        type: 'radio',
        label: template.name,
        value: template.exerciseTemplateId
      })),
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Add',
          handler: (templateId) => {
            if (templateId) {
              const selectedTemplate = this.exerciseTemplates.find(
                t => t.exerciseTemplateId === templateId
              );
              if (selectedTemplate) {
                // Create Exercise object directly instead of ExerciseConfig
                const newExercise: Exercise = {
                  exerciseTemplateId: selectedTemplate.exerciseTemplateId!,
                  name: selectedTemplate.name,
                  notes: '',
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
                this.exercises.push(newExercise);
                this.showToast(`Added ${selectedTemplate.name}`);
              }
            }
          }
        }
      ]
    });

    await alert.present();
  }

  addExerciseFromTemplate(template: ExerciseTemplate) {
    if (!template || !template.exerciseTemplateId) return;
    
    // Create Exercise object with orderPosition based on current array length
    const newExercise: Exercise = {
      exerciseTemplateId: template.exerciseTemplateId,
      name: template.name,
      notes: '',
      // Set the orderPosition to be the last position
      orderPosition: this.exercises.length,
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
    
    this.exercises.push(newExercise);
    this.showToast(`Added ${template.name}`);
  }

  addSet(exerciseIndex: number) {
    if (exerciseIndex >= 0 && exerciseIndex < this.exercises.length) {
      const exercise = this.exercises[exerciseIndex];
      
      // Ensure exercise.sets is initialized if it doesn't exist
      if (!exercise.sets) {
        exercise.sets = [];
      }
      
      // Create new set
      const newSet: ExerciseSet = {
        type: SetType.NORMAL,
        orderPosition: exercise.sets.length,
        reps: 0,
        weight: 0,
        restTimeSeconds: 0,
        completed: false
      };
      
      // Get the current workout ID from the route
      const workoutId = this.route.snapshot.queryParamMap.get('workoutId');
      
      // For existing exercises with IDs and existing workouts
      if (exercise.exerciseId && workoutId) {
        this.workoutService.addSetToExercise(workoutId, exercise.exerciseId, newSet)
          .subscribe({
            next: () => {
              // Success - add to local UI array too to avoid reloading
              if (!exercise.sets) {
                exercise.sets = [];
              }
              exercise.sets.push(newSet);
              this.showToast('Set added successfully');
            },
            error: (error) => {
              console.error('Error adding set:', error);
              this.showToast('Failed to add set');
            }
          });
      } else {
          // Add set to the UI array
        if (!exercise.sets) {
          exercise.sets = [];
        }
        // Safely push to exercise sets
        exercise.sets?.push(newSet) || (exercise.sets = [newSet]);
        
        // Also store in temporary storage for later saving
        if (exercise.exerciseId) {
          // For existing exercises with IDs
          if (!this.tempExerciseSets.has(exercise.exerciseId)) {
            this.tempExerciseSets.set(exercise.exerciseId, [newSet]);
          } else {
            const currentSets = this.tempExerciseSets.get(exercise.exerciseId) || [];
            this.tempExerciseSets.set(exercise.exerciseId, [...currentSets, newSet]);
          }
        } else {
          // For new exercises without IDs
          const index = this.exercises.indexOf(exercise);
          if (!this.tempNewExerciseSets.has(index)) {
            this.tempNewExerciseSets.set(index, [newSet]);
          } else {
            const currentSets = this.tempNewExerciseSets.get(index) || [];
            this.tempNewExerciseSets.set(index, [...currentSets, newSet]);
          }
        }
        
        // Ensure change detection runs
        this.changeDetector.markForCheck();
        this.changeDetector.detectChanges();
      }
    }
  }

  getNextSetOrderPosition(exercise: Exercise): number {
    if (exercise.exerciseId) {
      const sets = this.tempExerciseSets.get(exercise.exerciseId) || [];
      return sets.length + 1;
    } else {
      const index = this.exercises.indexOf(exercise);
      const sets = this.tempNewExerciseSets.get(index) || [];
      return sets.length + 1;
    }
  }

  removeSet(exerciseIndex: number, setIndex: number) {
    if (exerciseIndex >= 0 && exerciseIndex < this.exercises.length) {
      const exercise = this.exercises[exerciseIndex];
      if (exercise.sets && setIndex >= 0 && setIndex < exercise.sets.length) {
        exercise.sets.splice(setIndex, 1);
        
        // Update order positions after removal
        exercise.sets.forEach((set: ExerciseSet, idx: number) => {
          set.orderPosition = idx;
        });
        
        exercise.sets = [...exercise.sets];
        
        this.changeDetector.markForCheck();
        this.changeDetector.detectChanges();
        
      }
    }
  }

  enforceMinimumValue(set: ExerciseSet, property: 'weight' | 'reps', minValue: number): void {
    if (set[property] !== undefined && set[property] < minValue) {
      set[property] = minValue;
    }
  }

  saveWorkout() {
    console.log('Save button clicked.');
    if (this.routineForm.valid) {
      if (this.exercises.length === 0) {
        this.showToast('Please add at least one exercise to the workout');
        return;
      }
      
      this.isLoading = true;
      
      const workoutName = this.routineForm.value.name;
      const workoutId = this.route.snapshot.queryParamMap.get('workoutId');
      
      const workoutData: Workout = {
        name: workoutName,
        workoutId: workoutId || undefined
      };
      
      // Debug: Log all exercises with their template IDs before processing
      console.log('Raw exercises before mapping:', this.exercises.map(e => ({
        name: e.name,
        templateId: e.exerciseTemplateId
      })));
      
      // Make sure all exercises have their sets and orderPosition properly attached
      const exercisesToSave: Exercise[] = this.exercises.map((exercise, index) => {
        // Create a complete copy with all properties
        const exerciseCopy: Exercise = {
          ...exercise,
          orderPosition: index,
          // Force the template ID to be included
          exerciseTemplateId: exercise.exerciseTemplateId
        };
        
        // Handle sets
        let sets = [...(exercise.sets || [])];
        sets = sets.map((set, setIndex) => ({
          ...set,
          orderPosition: setIndex
        }));
        
        // Reassign sets to the copy
        exerciseCopy.sets = sets;
        
        console.log(`Preparing exercise ${exerciseCopy.name}:`, {
          templateId: exerciseCopy.exerciseTemplateId,
          sets: exerciseCopy.sets?.length || 0
        });
        
        return exerciseCopy;
      });
      
      // Debug: Verify template IDs are present in final payload
      console.log('Final exercises to save:', exercisesToSave.map(e => ({
        name: e.name,
        templateId: e.exerciseTemplateId,
        setCount: e.sets?.length || 0
      })));
      
      // Choose whether to create new or update existing
      const saveOperation = workoutId
        ? this.workoutService.updateWorkoutWithExercises(workoutData, exercisesToSave)
        : this.workoutService.createWorkoutWithExercises(workoutData, exercisesToSave);
      
      // Process the operation
      saveOperation.subscribe({
        next: () => {
          this.isLoading = false;
          this.workoutService.refreshWorkouts();
          
          const message = workoutId 
            ? 'Workout updated successfully' 
            : 'Workout created successfully';
          this.showToast(message);
          
          // Navigate after showing toast
          setTimeout(() => {
            window.location.href = '/tabs/workouts';
          }, 500);
        },
        error: (error) => {
          this.isLoading = false;
          console.error('Error saving workout:', error);
          this.showToast(`Error ${workoutId ? 'updating' : 'creating'} workout`);
        }
      });
    } else {
      // Form is invalid
      this.showToast('Please enter a valid workout name');
      
      Object.keys(this.routineForm.controls).forEach(key => {
        const control = this.routineForm.get(key);
        control?.markAsTouched();
      });
    }
  }

  loadWorkoutForEditing(workoutId: string) {
    this.isLoading = true;
    
    this.workoutService.getById(workoutId).subscribe({
      next: (workout) => {
        this.routineForm.patchValue({
          name: workout.name || ''
        });
        
        this.workoutService.getExercisesForWorkout(workoutId).subscribe({
          next: (exercises) => {
            // Load sets for each exercise
            const exerciseLoads = exercises.map(exercise => {
              if (exercise.exerciseId) {
                return this.workoutService.loadExerciseWithSets(workoutId, exercise.exerciseId);
              }
              return of(exercise);
            });
            
            forkJoin(exerciseLoads).subscribe({
              next: (exercisesWithSets) => {
                // Sort exercises by orderPosition before assigning to this.exercises
                this.exercises = exercisesWithSets.sort((a, b) => 
                  (a.orderPosition || 0) - (b.orderPosition || 0)
                );
                this.isLoading = false;
              },
              error: (error) => {
                console.error('Error loading exercise sets:', error);
                this.showToast('Error loading exercise details');
                this.isLoading = false;
              }
            });
          },
          error: (error) => {
            console.error('Error loading workout exercises:', error);
            this.showToast('Error loading workout exercises');
            this.isLoading = false;
          }
        });
      },
      error: (error) => {
        console.error('Error loading workout:', error);
        this.showToast('Error loading workout');
        this.isLoading = false;
      }
    });
  }

  getExerciseSets(exerciseId?: string): ExerciseSet[] {
    if (!exerciseId) {
      const index = this.exercises.findIndex(e => !e.exerciseId);
      return index >= 0 ? (this.tempNewExerciseSets.get(index) || []) : [];
    }
    return this.tempExerciseSets.get(exerciseId) || [];
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

  async showExerciseOptions(exerciseIndex: number) {
    const exercise = this.exercises[exerciseIndex];
    
    const buttons = [
      {
        text: 'View Details',
        icon: 'information-circle-outline',
        handler: () => {
          const templateId = exercise.exerciseTemplateId;
          if (templateId) {
            this.viewExerciseDetails(templateId);
          } else {
            this.showToast('Exercise template ID is missing');
          }
        }
      },
      {
        text: 'Delete Exercise',
        role: 'destructive',
        icon: 'trash',
        handler: () => {
          // Show a confirmation alert before deleting
          this.confirmDeleteExercise(exerciseIndex);
        }
      },
      {
        text: 'Cancel',
        role: 'cancel',
        icon: 'close'
      }
    ];
    
    const actionSheet = await this.actionSheetController.create({
      header: 'Exercise Options',
      buttons: buttons
    });
    await actionSheet.present();
  }

  // Add this helper method
  async confirmDeleteExercise(exerciseIndex: number) {
    const exercise = this.exercises[exerciseIndex];
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
            this.removeExercise(exerciseIndex);
          }
        }
      ]
    });
    
    await alert.present();
  }

  async viewExerciseDetails(templateId: string) {
    const template = this.exerciseTemplates.find(t => t.exerciseTemplateId === templateId);
    
    if (!template) {
      this.showToast('Exercise template not found');
      return;
    }
    
    const alert = await this.alertController.create({
      header: template.name,
      message: `
        <div>${template.description || 'No description available'}</div>
        <div class="ion-padding-top">
          <strong>Target muscles:</strong> ${template.targetMuscleGroups?.join(', ') || 'Not specified'}
        </div>
      `,
      buttons: ['Close']
    });

    await alert.present();
  }

async removeExercise(index: number) {
  // Get the exercise to remove
  const exerciseToRemove = this.exercises[index];
  
  // Get current workout ID
  const workoutId = this.route.snapshot.queryParamMap.get('workoutId');
  
  // If we have both a workout ID and the exercise has an ID, it's an existing exercise
  if (workoutId && exerciseToRemove.exerciseId) {
    try {
      // Show loading
      const loading = await this.toastController.create({
        message: 'Deleting exercise...',
        duration: 3000
      });
      await loading.present();
      
      // Call the API to delete the exercise
      this.workoutService.removeExerciseFromWorkout(workoutId, exerciseToRemove.exerciseId)
        .subscribe({
          next: () => {
            // Remove from local array
            this.exercises.splice(index, 1);
            
            // Update orderPosition for remaining exercises
            this.exercises.forEach((exercise, idx) => {
              exercise.orderPosition = idx;
            });
            
            this.showToast('Exercise removed successfully');
            
            // Clear any temporary sets for this exercise
            if (exerciseToRemove.exerciseId) {
              this.tempExerciseSets.delete(exerciseToRemove.exerciseId);
            }
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
  } else {
    // For new exercises that aren't saved to the backend yet
    this.exercises.splice(index, 1);
    
    this.exercises.forEach((exercise, idx) => {
      exercise.orderPosition = idx;
    });
    
    // Clear any temporary sets for this exercise
    if (this.tempNewExerciseSets.has(index)) {
      this.tempNewExerciseSets.delete(index);
    }
  }

  this.reindexTempExerciseSets();
  // Force change detection to update UI
  this.changeDetector.detectChanges();
}

// Add this helper method to reindex temporary exercise sets after deletion
private reindexTempExerciseSets() {
  // Create a new map to store the reindexed sets
  const updatedTempSets = new Map<number, ExerciseSet[]>();
  
  // Map each exercise to its current index
  this.exercises.forEach((exercise, index) => {
    if (!exercise.exerciseId) {
      // Use Array.from to convert entries to an array we can iterate
      const entries = Array.from(this.tempNewExerciseSets.entries());
      for (let i = 0; i < entries.length; i++) {
        const [oldIndex, sets] = entries[i];
        // Check if this is the same exercise at the new index
        if (index < this.exercises.length && this.exercises[oldIndex] === exercise) {
          // This is the same exercise, update its index
          updatedTempSets.set(index, sets);
          break;
        }
      }
    }
  });
  
  // Replace the old map with the reindexed one
  this.tempNewExerciseSets = updatedTempSets;
}

  async showToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,
      position: 'top', // Change position to top
      cssClass: 'toast-notification' // Add a class for additional styling if needed
    });
    await toast.present();
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

  reorderExercises(event: CustomEvent<ItemReorderEventDetail>) {
    // Move the item in the array
    const itemMove = this.exercises.splice(event.detail.from, 1)[0];
    this.exercises.splice(event.detail.to, 0, itemMove);
    
    // Complete the reorder operation
    event.detail.complete();

    // Update orderPosition for all exercises based on their index in the array
    this.exercises.forEach((exercise, index) => {
      exercise.orderPosition = index;
    });
    
    // Create a new array reference to ensure change detection
    this.exercises = [...this.exercises];
  }

  toggleLibrary(show: boolean): void {
    this.showLibraryOnMobile = show;
  }

  discardCreation(): void {
    this.routineForm.reset();
    
    this.exercises = [];
    
    this.tempExerciseSets.clear();
    this.tempNewExerciseSets.clear();
    
    this.showLibraryOnMobile = false;
    
    this.router.navigate(['/tabs/workouts']);
  }

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
}
