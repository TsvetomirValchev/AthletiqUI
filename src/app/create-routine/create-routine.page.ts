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
      
      // Create a new set
      const newSet: ExerciseSet = {
        type: SetType.NORMAL,
        orderPosition: this.getNextSetOrderPosition(exercise),
        reps: 0,
        weight: 0,
        restTimeSeconds: 0,
        completed: false
      };
      
      if (!exercise.exerciseId) {
        // For new exercises without an ID yet, store the set temporarily
        if (!this.tempNewExerciseSets.has(exerciseIndex)) {
          this.tempNewExerciseSets.set(exerciseIndex, []);
        }
        this.tempNewExerciseSets.get(exerciseIndex)!.push(newSet);
      } else {
        // For existing exercises with an ID
        if (!this.tempExerciseSets.has(exercise.exerciseId)) {
          this.tempExerciseSets.set(exercise.exerciseId, []);
        }
        this.tempExerciseSets.get(exercise.exerciseId)!.push(newSet);
      }
      
      this.changeDetector.markForCheck();
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
      
      // Make sure to capture the exerciseTemplateId for each exercise
      const exercisesToSave: Exercise[] = this.exercises.map(exercise => {
        let exerciseCopy: Exercise = { ...exercise };
        
        if (exercise.exerciseId && this.tempExerciseSets.has(exercise.exerciseId)) {
          exerciseCopy.sets = this.tempExerciseSets.get(exercise.exerciseId);
        } else {
          const index = this.exercises.indexOf(exercise);
          if (this.tempNewExerciseSets.has(index)) {
            exerciseCopy.sets = this.tempNewExerciseSets.get(index);
          }
        }
        
        // Ensure exerciseTemplateId is preserved
        if (!exerciseCopy.exerciseTemplateId && exercise.exerciseTemplateId) {
          exerciseCopy.exerciseTemplateId = exercise.exerciseTemplateId;
        }
        
        return exerciseCopy;
      });
      
      // The rest of your code remains the same
      const workoutOperation = workoutId 
        ? this.workoutService.updateWorkoutWithExercises(workoutData, exercisesToSave)
        : this.workoutService.createWorkoutWithExercises(workoutData, exercisesToSave);

      workoutOperation.subscribe({
        next: () => {
          this.showToast(workoutId ? 'Workout updated successfully' : 'Workout created successfully');
          this.router.navigate(['/tabs/workouts']);
        },
        error: (error) => {
          console.error(workoutId ? 'Error updating workout:' : 'Error saving workout:', error);
          this.showToast(workoutId ? 'Failed to update workout' : 'Failed to save workout');
        }
      });
    } else {
      this.showToast('Please enter a workout name (minimum 3 characters)');
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
      position: 'bottom'
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
}
