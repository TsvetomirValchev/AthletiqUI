import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IonicModule, AlertController, ToastController, ActionSheetController, ItemReorderEventDetail, LoadingController } from '@ionic/angular';
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
import { finalize } from 'rxjs/operators';
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
  isEditMode = false;
  workout: Workout = { name: '' };
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
    private exerciseImagePipe: ExerciseImagePipe,
    private loadingController: LoadingController
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
      this.isEditMode = true;
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

  addExerciseFromTemplate(template: ExerciseTemplate) {
    if (!template || !template.exerciseTemplateId) return;
    
    const orderPosition = this.exercises.length;
    
    const newExercise: Exercise = {
      exerciseTemplateId: template.exerciseTemplateId,
      name: template.name,
      notes: '',
      orderPosition: orderPosition,
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
    
    if (this.isEditMode && this.workout.workoutId) {
      this.isLoading = true;
      
      this.workoutService.addExerciseToWorkout(this.workout.workoutId, template.exerciseTemplateId).subscribe({
        next: (createdExercise: any) => {
          if (createdExercise && createdExercise.exerciseId) {
            newExercise.exerciseId = createdExercise.exerciseId;
            
            if (newExercise.sets && newExercise.sets.length > 0) {
              const setToAdd = {
                type: SetType.NORMAL,
                orderPosition: 0,
                reps: 0,
                weight: 0,
                restTimeSeconds: 0,
                exerciseId: createdExercise.exerciseId
              };
              
              this.workoutService.addSetToExercise(
                this.workout.workoutId!,
                createdExercise.exerciseId,
                setToAdd
              ).subscribe({
                next: (createdSet: ExerciseSet) => {
                  if (newExercise.sets) {
                    newExercise.sets[0] = createdSet;
                  }
                  this.exercises = [...this.exercises, newExercise];
                  this.isLoading = false;
                  this.showToast(`Added ${template.name}`);
                  if (window.innerWidth <= 768) {
                    this.showLibraryOnMobile = false;
                  }
                  this.changeDetector.detectChanges();
                },
                error: (error) => {
                  console.error('Error adding set to new exercise:', error);
                  this.exercises = [...this.exercises, newExercise];
                  this.isLoading = false;
                  this.showToast(`Added ${template.name} but failed to create set`);
                  if (window.innerWidth <= 768) {
                    this.showLibraryOnMobile = false;
                  }
                  this.changeDetector.detectChanges();
                }
              });
            } else {
              this.exercises = [...this.exercises, newExercise];
              this.isLoading = false;
              this.showToast(`Added ${template.name}`);
              if (window.innerWidth <= 768) {
                this.showLibraryOnMobile = false;
              }
              this.changeDetector.detectChanges();
            }
          } else {
            this.isLoading = false;
            this.showToast('Failed to add exercise: Invalid response from server');
          }
        },
        error: (error) => {
          console.error('Error adding exercise:', error);
          this.isLoading = false;
          this.showToast('Failed to add exercise');
        }
      });
    } else {
      this.exercises = [...this.exercises, newExercise];
      this.showToast(`Added ${template.name}`);
      if (window.innerWidth <= 768) {
        this.showLibraryOnMobile = false;
      }
      this.changeDetector.detectChanges();
    }
  }

  addSet(exerciseIndex: number) {
    if (exerciseIndex < 0 || exerciseIndex >= this.exercises.length) return;
    
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
    
    if (this.isEditMode && this.workout.workoutId && exercise.exerciseId) {
      this.isLoading = true;
      
      const setPayload = {
        ...newSet,
        exerciseId: exercise.exerciseId
      };
      
      this.workoutService.addSetToExercise(
        this.workout.workoutId,
        exercise.exerciseId,
        setPayload
      ).subscribe({
        next: (createdSet: ExerciseSet) => {
          if (!exercise.sets) {
            exercise.sets = [];
          }
          exercise.sets.push(createdSet);
          this.isLoading = false;
          this.showToast('Set added successfully');
        },
        error: (error) => {
          console.error('Error adding set:', error);
          this.isLoading = false;
          this.showToast('Failed to add set');
        }
      });
    } else {
      if (!exercise.sets) {
        exercise.sets = [];
      }
      exercise.sets.push(newSet);
      
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
    }
  }

  removeSet(exerciseIndex: number, setIndex: number) {
    if (exerciseIndex < 0 || exerciseIndex >= this.exercises.length) return;
    
    const exercise = this.exercises[exerciseIndex];
    if (!exercise.sets || setIndex < 0 || setIndex >= exercise.sets.length) return;
    
    if (exercise.sets.length <= 1) {
      this.showToast("Can't remove the last set");
      return;
    }
    
    const set = exercise.sets[setIndex];
    
    if (this.isEditMode && this.workout.workoutId && exercise.exerciseId) {
      this.isLoading = true;
      
      this.workoutService.removeSetFromExercise(
        this.workout.workoutId,
        exercise.exerciseId,
        set.orderPosition || setIndex
      ).subscribe({
        next: () => {
          exercise.sets!.splice(setIndex, 1);
          
          exercise.sets!.forEach((s, idx) => {
            s.orderPosition = idx;
          });
          
          this.isLoading = false;
          this.showToast('Set removed successfully');
          this.changeDetector.markForCheck();
        },
        error: (error) => {
          console.error('Error removing set:', error);
          this.isLoading = false;
          this.showToast('Failed to remove set');
        }
      });
    } else {
      exercise.sets.splice(setIndex, 1);
      
      exercise.sets.forEach((s, idx) => {
        s.orderPosition = idx;
      });
      
      this.changeDetector.markForCheck();
    }
  }

  async removeExercise(exerciseIndex: number) {
    if (exerciseIndex < 0 || exerciseIndex >= this.exercises.length) return;
    
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
            if (this.isEditMode && this.workout.workoutId && exercise.exerciseId) {
              this.isLoading = true;
              
              this.workoutService.removeExerciseFromWorkout(
                this.workout.workoutId,
                exercise.exerciseId
              ).subscribe({
                next: () => {
                  const newExercises = [...this.exercises];
                  newExercises.splice(exerciseIndex, 1);
                  
                  newExercises.forEach((ex, idx) => {
                    ex.orderPosition = idx;
                  });
                  
                  this.exercises = newExercises;
                  this.isLoading = false;
                  this.showToast(`${exercise.name} removed`);
                  this.changeDetector.detectChanges();
                },
                error: (error) => {
                  console.error('Error removing exercise:', error);
                  this.isLoading = false;
                  this.showToast('Failed to remove exercise');
                }
              });
            } else {
              const newExercises = [...this.exercises];
              newExercises.splice(exerciseIndex, 1);
              
              newExercises.forEach((ex, idx) => {
                ex.orderPosition = idx;
              });
              
              this.exercises = newExercises;
              this.changeDetector.detectChanges();
            }
          }
        }
      ]
    });
    
    await alert.present();
  }

  updateSetValue(exerciseIndex: number, setIndex: number, property: string, event: any) {
    if (exerciseIndex < 0 || exerciseIndex >= this.exercises.length) return;
    
    const exercise = this.exercises[exerciseIndex];
    if (!exercise.sets || setIndex < 0 || setIndex >= exercise.sets.length) return;
    
    const set = exercise.sets[setIndex];
    const value = event.detail.value;
    
    switch(property) {
      case 'reps':
        set.reps = Number(value);
        break;
      case 'weight':
        set.weight = Number(value);
        break;
      case 'restTimeSeconds':
        set.restTimeSeconds = Number(value);
        break;
      case 'type':
        set.type = value;
        break;
      default:
        console.error(`Unknown property: ${property}`);
        return;
    }
    
    if (this.isEditMode && this.workout.workoutId && exercise.exerciseId && set.exerciseSetId) {
      const setPayload = {
        type: set.type || 'NORMAL',
        reps: set.reps || 0,
        weight: set.weight || 0,
        restTimeSeconds: set.restTimeSeconds || 0,
        orderPosition: set.orderPosition || 0
      };
      
      this.workoutService.updateExerciseSet(
        this.workout.workoutId,
        exercise.exerciseId,
        set.exerciseSetId,
        setPayload
      ).subscribe({
        error: (error) => {
          console.error(`Error updating ${property} for set:`, error);
          }
      });
    }
  }

  updateWorkoutName(event: Event) {
    if (this.isEditMode && this.workout.workoutId) {
      const input = event.target as HTMLInputElement;
      const name = input.value.trim();
      
      if (name && name !== this.workout.name) {
        this.workout.name = name;
        
        this.workoutService.update(this.workout.workoutId, {
          name: name
        }).subscribe({
          error: (error) => {
            console.error('Error updating workout name:', error);
          }
        });
      }
    }
  }

  async saveWorkout() {
    if (this.routineForm.invalid) {
      this.showToast('Please enter a valid workout name');
      return;
    }
    
    if (this.exercises.length === 0) {
      this.showToast('Please add at least one exercise to the workout');
      return;
    }
    
    const loading = await this.loadingController.create({
      message: this.isEditMode ? 'Saving changes...' : 'Creating workout...'
    });
    await loading.present();
    
    try {
      const workoutName = this.routineForm.value.name;
      const workoutId = this.route.snapshot.queryParamMap.get('workoutId');
      
      const workoutData: Workout = {
        name: workoutName,
        workoutId: workoutId || undefined
      };
      
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
        return exerciseCopy;
      });
      
      const saveOperation = this.isEditMode && workoutId
        ? this.workoutService.updateWorkoutWithExercises(workoutData, exercisesToSave)
        : this.workoutService.createWorkoutWithExercises(workoutData, exercisesToSave);
      
      saveOperation.pipe(
        finalize(() => {
          loading.dismiss();
        })
      ).subscribe({
        next: () => {
          this.workoutService.refreshWorkouts();
          this.showToast(this.isEditMode ? 'Workout updated successfully' : 'Workout created successfully');
          this.router.navigate(['/tabs/workouts']);
        },
        error: (error) => {
          console.error('Error saving workout:', error);
          this.showToast(`Error ${this.isEditMode ? 'updating' : 'creating'} workout`);
        }
      });
    } catch (error) {
      loading.dismiss();
      console.error('Error preparing workout data:', error);
      this.showToast('An unexpected error occurred');
    }
  }

  loadWorkoutForEditing(workoutId: string) {
    this.isLoading = true;
    
    this.workoutService.getById(workoutId).subscribe({
      next: (workout) => {
        this.workout = workout;
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
        this.router.navigate(['/tabs/workouts']);
      }
    });
  }

  reorderExercises(event: CustomEvent<ItemReorderEventDetail>) {
    const itemMove = this.exercises.splice(event.detail.from, 1)[0];
    this.exercises.splice(event.detail.to, 0, itemMove);
    
    event.detail.complete();

    this.exercises.forEach((exercise, index) => {
      exercise.orderPosition = index;
    });
    
    if (this.isEditMode && this.workout.workoutId) {
      const exercisesToUpdate = this.exercises
        .filter(ex => ex.exerciseId)
        .map(ex => ({
          ...ex,
          orderPosition: ex.orderPosition || 0
        }));
      
      for (const exercise of exercisesToUpdate) {
        if (exercise.exerciseId) {
          this.workoutService.updateExercise(
            this.workout.workoutId,
            exercise.exerciseId,
            { orderPosition: exercise.orderPosition }
          ).subscribe({
            error: (error) => {
              console.error('Error updating exercise order:', error);
            }
          });
        }
      }
    }
    
    this.changeDetector.markForCheck();
  }

  toggleLibrary(show: boolean): void {
    this.showLibraryOnMobile = show;
  }

  discardCreation(): void {
    if (this.isEditMode) {
      this.router.navigate(['/tabs/workouts']);
      return;
    }
    
    this.routineForm.reset();
    this.exercises = [];
    this.tempExerciseSets.clear();
    this.tempNewExerciseSets.clear();
    this.showLibraryOnMobile = false;
    this.router.navigate(['/tabs/workouts']);
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

  trackByExercise(index: number, exercise: Exercise): any {
    return exercise.exerciseId || exercise.exerciseTemplateId || index;
  }

  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement) {
      imgElement.src = 'assets/logo/athletiq-logo.jpeg';
    }
  }

  async showExerciseOptions(exerciseIndex: number) {
    const exercise = this.exercises[exerciseIndex];
    
    const buttons = [
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
    ];
    
    const actionSheet = await this.actionSheetController.create({
      header: exercise.name,
      buttons: buttons
    });
    await actionSheet.present();
  }

  onSetTypeChange(sets: ExerciseSet[] | undefined, setIndex: number): void {
    if (!sets) return;
    
    for (let exerciseIndex = 0; exerciseIndex < this.exercises.length; exerciseIndex++) {
      const exercise = this.exercises[exerciseIndex];
      if (exercise.sets === sets) {
        const set = sets[setIndex];
        
        if (this.isEditMode && this.workout.workoutId && exercise.exerciseId && set.exerciseSetId) {
          this.workoutService.updateExerciseSet(
            this.workout.workoutId,
            exercise.exerciseId,
            set.exerciseSetId,
            {
              type: set.type,
              reps: set.reps || 0,
              weight: set.weight || 0,
              restTimeSeconds: set.restTimeSeconds || 0,
              orderPosition: set.orderPosition || setIndex
            }
          ).subscribe({
            error: (error) => {
              console.error('Error updating set type:', error);
            }
          });
        }
        
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
}
