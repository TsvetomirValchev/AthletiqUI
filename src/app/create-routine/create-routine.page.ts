import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IonicModule, AlertController, ToastController, ActionSheetController, ItemReorderEventDetail } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { WorkoutService } from '../services/workout.service';
import { Workout } from '../models/workout.model';
import { Exercise } from '../models/exercise.model';
import { ExerciseTemplate } from '../models/exercise-template.model';
import { SetType } from '../models/set-type.enum';
import { ExerciseSet } from '../models/exercise-set.model';
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
                      orderPosition: 1,
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
    
    console.log('Adding exercise from template with ID:', template.exerciseTemplateId);
    
    // Create Exercise object directly
    const newExercise: Exercise = {
      exerciseTemplateId: template.exerciseTemplateId,
      name: template.name,
      notes: '',
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
    
    console.log('Created new exercise with template ID:', newExercise.exerciseTemplateId);
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
        orderPosition: exercise.sets.length + 1,
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
          set.orderPosition = idx + 1;
        });
        
        exercise.sets = [...exercise.sets];
        
        this.changeDetector.markForCheck();
        
        setTimeout(() => {
          this.changeDetector.detectChanges();
        });
      }
    }
  }

  enforceMinimumValue(set: ExerciseSet, property: 'weight' | 'reps', minValue: number): void {
    if (set[property] !== undefined && set[property] < minValue) {
      set[property] = minValue;
    }
  }

  saveWorkout() {
    if (this.routineForm.valid) {
      if (this.exercises.length === 0) {
        this.showToast('Please add at least one exercise to the workout');
        return;
      }
      
      const workoutName = this.routineForm.value.name;
      const workoutId = this.route.snapshot.queryParamMap.get('workoutId');
      
      const workoutData: Workout = {
        name: workoutName,
        workoutId: workoutId || undefined
      };
      
      // Make sure all exercises have their sets properly attached
      const exercisesToSave: Exercise[] = this.exercises.map((exercise, index) => {
        let exerciseCopy: Exercise = { ...exercise };
        
        // First, try to get sets from the exercise object itself
        let sets = [...(exercise.sets || [])];
        
        // If the exercise has an ID, check the tempExerciseSets map
        if (exercise.exerciseId && this.tempExerciseSets.has(exercise.exerciseId)) {
          // Merge with any sets from tempExerciseSets
          const tempSets = this.tempExerciseSets.get(exercise.exerciseId) || [];
          sets = [...sets, ...tempSets];
        } else {
          // For new exercises without IDs, check tempNewExerciseSets using the index
          const tempSets = this.tempNewExerciseSets.get(index) || [];
          sets = [...sets, ...tempSets];
        }
        
        // Ensure exerciseTemplateId is preserved
        if (!exerciseCopy.exerciseTemplateId && exercise.exerciseTemplateId) {
          exerciseCopy.exerciseTemplateId = exercise.exerciseTemplateId;
        }
        
        // Assign the merged sets
        exerciseCopy.sets = sets;
        
        return exerciseCopy;
      });
      
      // If we're editing an existing workout
      if (workoutId) {
        this.workoutService.updateWorkoutWithExercises(workoutData, exercisesToSave)
          .subscribe({
            next: () => {
              this.router.navigate(['/tabs/workouts']);
              this.showToast('Workout updated successfully');
            },
            error: (error) => {
              console.error('Error updating workout:', error);
              this.showToast('Error updating workout');
            }
          });
      } else {
        // If we're creating a new workout
        this.workoutService.createWorkoutWithExercises(workoutData, exercisesToSave)
          .subscribe({
            next: () => {
              // Force a refresh of the workout list before navigating
              this.workoutService.refreshWorkouts().subscribe({
                next: () => {
                  this.router.navigate(['/tabs/workouts']);
                  this.showToast('Workout created successfully');
                },
                error: (error) => console.error('Error refreshing workouts:', error)
              });
            },
            error: (error) => {
              console.error('Error creating workout:', error);
              this.showToast('Error creating workout');
            }
          });
      }
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
                this.exercises = exercisesWithSets;
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
    const actionSheet = await this.actionSheetController.create({
      header: 'Exercise Options',
      buttons: [
        {
          text: 'View Details',
          icon: 'information-circle-outline',
          handler: () => {
            const templateId = this.exercises[exerciseIndex].exerciseTemplateId;
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
            this.removeExercise(exerciseIndex);
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

  removeExercise(index: number) {
    this.exercises.splice(index, 1);
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
    const itemMove = this.exercises.splice(event.detail.from, 1)[0];
    this.exercises.splice(event.detail.to, 0, itemMove);
    
    event.detail.complete();
  
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
}
