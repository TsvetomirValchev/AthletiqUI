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
import { forkJoin, of } from 'rxjs';
import { SetTypeDisplayPipe } from '../../pipes/set-type-display.pipe';
import { ExerciseFilterPipe } from '../../pipes/exercise-filter.pipe';
import { SortPipe } from '../../pipes/sort.pipe';
import { TimePipe } from '../../pipes/time.pipe';
import { ExerciseImagePipe } from '../../pipes/exercise-image.pipe';

@Component({
  selector: 'app-create-routine',
  templateUrl: './create-routine.page.html',
  styleUrls: ['./create-routine.page.scss'],
  standalone: true,
  imports: [
    IonicModule, 
    CommonModule, 
    FormsModule,
    ReactiveFormsModule, 
    SetTypeDisplayPipe,
    TimePipe,
    ExerciseFilterPipe,
    SortPipe,
    ExerciseImagePipe
  ],
  providers: [ExerciseImagePipe]
})
export class CreateRoutinePage implements OnInit {
  routineForm: FormGroup;
  exerciseTemplates: ExerciseTemplate[] = [];
  exercises: Exercise[] = [];
  SetType = SetType;
  isLoading = false;
  showLibraryOnMobile = false;
  private tempExerciseSets = new Map<string, ExerciseSet[]>();
  private tempNewExerciseSets = new Map<number, ExerciseSet[]>();
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
    private changeDetector: ChangeDetectorRef,
    private exerciseImagePipe: ExerciseImagePipe
  ) {
    this.routineForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]]
    });
  }
  ngOnInit() {
    this.loadExerciseTemplates();
    
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
                const newExercise: Exercise = {
                  exerciseTemplateId: selectedTemplate.exerciseTemplateId!,
                  name: selectedTemplate.name,
                  notes: '',
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
    
    const newExercise: Exercise = {
      exerciseTemplateId: template.exerciseTemplateId,
      name: template.name,
      notes: '',
      orderPosition: this.exercises.length,
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
    
    this.exercises = [...this.exercises];
    
    if (window.innerWidth <= 768) {
      this.showLibraryOnMobile = false;
    }
    
    this.showToast(`Added ${template.name}`);
    
    this.changeDetector.markForCheck();
    this.changeDetector.detectChanges();
  }

  addSet(exerciseIndex: number) {
    if (exerciseIndex >= 0 && exerciseIndex < this.exercises.length) {
      const exercise = this.exercises[exerciseIndex];
      
      if (!exercise.sets) {
        exercise.sets = [];
      }
      
      const newSet: ExerciseSet = {
        type: SetType.NORMAL,
        orderPosition: exercise.sets.length,
        reps: 0,
        weight: 0,
        restTimeSeconds: 0,
        completed: false
      };
      
      const workoutId = this.route.snapshot.queryParamMap.get('workoutId');
        if (exercise.exerciseId && workoutId) {
        this.workoutService.addSetToExercise(workoutId, exercise.exerciseId, newSet)
          .subscribe({
            next: () => {
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
          if (!exercise.sets) {
            exercise.sets = [];
          }
          exercise.sets?.push(newSet) || (exercise.sets = [newSet]);          
          if (exercise.exerciseId) {
            if (!this.tempExerciseSets.has(exercise.exerciseId)) {
              this.tempExerciseSets.set(exercise.exerciseId, [newSet]);
            } else {
              const currentSets = this.tempExerciseSets.get(exercise.exerciseId) || [];
              this.tempExerciseSets.set(exercise.exerciseId, [...currentSets, newSet]);
            }
          } else {
            const index = this.exercises.indexOf(exercise);
            if (!this.tempNewExerciseSets.has(index)) {
              this.tempNewExerciseSets.set(index, [newSet]);
            } else {
              const currentSets = this.tempNewExerciseSets.get(index) || [];
              this.tempNewExerciseSets.set(index, [...currentSets, newSet]);
            }
        }
      
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
      
      console.log('Raw exercises before mapping:', this.exercises.map(e => ({
        name: e.name,
        templateId: e.exerciseTemplateId
      })));
      
      const exercisesToSave: Exercise[] = this.exercises.map((exercise, index) => {
        const exerciseCopy: Exercise = {
          ...exercise,
          orderPosition: index,
          exerciseTemplateId: exercise.exerciseTemplateId
        };
          let sets = [...(exercise.sets || [])];
        sets = sets.map((set, setIndex) => ({
          ...set,
          orderPosition: setIndex
        }));
        
        exerciseCopy.sets = sets;
        
        console.log(`Preparing exercise ${exerciseCopy.name}:`, {
          templateId: exerciseCopy.exerciseTemplateId,
          sets: exerciseCopy.sets?.length || 0
        });
        
        return exerciseCopy;
      });
      
      console.log('Final exercises to save:', exercisesToSave.map(e => ({
        name: e.name,
        templateId: e.exerciseTemplateId,
        setCount: e.sets?.length || 0
      })));
      
      const saveOperation = workoutId
        ? this.workoutService.updateWorkoutWithExercises(workoutData, exercisesToSave)
        : this.workoutService.createWorkoutWithExercises(workoutData, exercisesToSave);
      
      saveOperation.subscribe({
        next: () => {
          this.isLoading = false;
          this.workoutService.refreshWorkouts();
          
          const message = workoutId 
            ? 'Workout updated successfully' 
            : 'Workout created successfully';
          this.showToast(message);
          
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
    } 
    else {
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
            const exerciseLoads = exercises.map(exercise => {
              if (exercise.exerciseId) {
                return this.workoutService.loadExerciseWithSets(workoutId, exercise.exerciseId);
              }
              return of(exercise);
            });
            
            forkJoin(exerciseLoads).subscribe({
              next: (exercisesWithSets) => {
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
    
    const imageSrc = this.exerciseImagePipe.transform(template.name);
    
    const alert = await this.alertController.create({
      header: template.name,
      message: `
        <div style="text-align: center; margin-bottom: 16px;">
          <img src="${imageSrc}" style="max-width: 100px; max-height: 100px;" alt="${template.name}">
        </div>
        <div>${template.description || 'No description available'}</div>
        <div class="ion-padding-top">
          <strong>Target muscles:</strong> ${template.targetMuscleGroups?.join(', ') || 'Not specified'}
        </div>
      `,
      buttons: ['Close'],
      cssClass: 'exercise-detail-alert'
    });

    await alert.present();
  }

  async removeExercise(index: number) {
    const exerciseToRemove = this.exercises[index];
    
    const workoutId = this.route.snapshot.queryParamMap.get('workoutId');
    
    if (workoutId && exerciseToRemove.exerciseId) {
      try {
        const loading = await this.toastController.create({
          message: 'Deleting exercise...',
          duration: 3000
        });
        await loading.present();
        
        this.workoutService.removeExerciseFromWorkout(workoutId, exerciseToRemove.exerciseId)
          .subscribe({
            next: () => {
              this.exercises.splice(index, 1);
              
              this.exercises.forEach((exercise, idx) => {
                exercise.orderPosition = idx;
              });
              
              this.showToast('Exercise removed successfully');
              
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
      this.exercises.splice(index, 1);
      
      this.exercises.forEach((exercise, idx) => {
        exercise.orderPosition = idx;
      });
      
      if (this.tempNewExerciseSets.has(index)) {
        this.tempNewExerciseSets.delete(index);
      }
    }

    this.reindexTempExerciseSets();
    this.changeDetector.detectChanges();
  }

  private reindexTempExerciseSets() {
    const updatedTempSets = new Map<number, ExerciseSet[]>();
    
    this.exercises.forEach((exercise, index) => {
      if (!exercise.exerciseId) {
        const entries = Array.from(this.tempNewExerciseSets.entries());
        for (let i = 0; i < entries.length; i++) {
          const [oldIndex, sets] = entries[i];
          if (index < this.exercises.length && this.exercises[oldIndex] === exercise) {
            updatedTempSets.set(index, sets);
            break;
          }
        }
      }
    });
    
    this.tempNewExerciseSets = updatedTempSets;
  }

  async showToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,
      position: 'top',
      cssClass: 'toast-notification'
    });
    await toast.present();
  }

  reorderExercises(event: CustomEvent<ItemReorderEventDetail>) {
    const itemMove = this.exercises.splice(event.detail.from, 1)[0];
    this.exercises.splice(event.detail.to, 0, itemMove);
    
    event.detail.complete();

    this.exercises.forEach((exercise, index) => {
      exercise.orderPosition = index;
    });
    
    this.exercises = [...this.exercises];
    this.changeDetector.markForCheck();
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

  updateSetValue(exerciseIndex: number, setIndex: number, property: string, event: any) {
    if (exerciseIndex < 0 || exerciseIndex >= this.exercises.length) return;
    
    const exercise = this.exercises[exerciseIndex];
    if (!exercise.sets || setIndex < 0 || setIndex >= exercise.sets.length) return;
    
    const set = exercise.sets[setIndex];
    const value = Number(event.detail.value);
    
    switch(property) {
      case 'reps':
        set.reps = value;
        break;
      case 'weight':
        set.weight = value;
        break;
      case 'restTimeSeconds':
        set.restTimeSeconds = value;
        break;
      case 'type':
        set.type = event.detail.value;
        break;
      default:
        console.warn(`Unknown property: ${property}`);
        return;
    }
      const workoutId = this.route.snapshot.queryParamMap.get('workoutId');
    
    if (!workoutId || !exercise.exerciseId || !set.exerciseSetId) {
      console.log(`Skipping backend update for ${property}=${value} (local only)`);
      return;
    }
    
    const setPayload = {
      exerciseSetId: set.exerciseSetId,
      exerciseId: exercise.exerciseId,
      type: set.type || 'NORMAL',
      reps: set.reps || 0,
      weight: set.weight || 0,
      restTimeSeconds: set.restTimeSeconds || 0,
      orderPosition: set.orderPosition || 0
    };
    
    console.log(`Updating ${property} for set ${set.exerciseSetId} to ${value}`);
    
    this.workoutService.updateExerciseSet(
      workoutId,
      exercise.exerciseId,
      set.exerciseSetId,
      setPayload
    ).subscribe({
      next: () => {
        console.log(`Successfully updated ${property} for set ${set.exerciseSetId}`);
      },
      error: (error) => {
        console.error(`Error updating ${property} for set:`, error);
        this.showToast(`Failed to update ${property}`);
      }
    });
  }

  trackByExercise(index: number, exercise: Exercise): any {
    return exercise.exerciseTemplateId || index;
  }

  handleImageError(event: Event): void {
  const imgElement = event.target as HTMLImageElement;
    if (imgElement) {
      imgElement.src = 'assets/logo/athletiq-logo.jpeg';
    }
  }

}
