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
import { SetTypeDisplayPipe } from 'src/app/pipes/set-type-display.pipe'; 

@Component({
  selector: 'app-active-workout',
  templateUrl: './active-workout.page.html',
  styleUrls: ['./active-workout.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, SetTypeDisplayPipe],
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

  exerciseTemplates: ExerciseTemplate[] = [];
  showExerciseLibrary = false;
  filteredTemplates: ExerciseTemplate[] = [];
  searchTerm: string = '';
  selectedMuscleGroup: string = 'All Muscles';

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
    
    this.activeWorkoutService.loadSavedSession().subscribe({
      next: hasSession => {
        this.activeWorkoutService.currentWorkout$.pipe(take(1)).subscribe({
          next: currentWorkout => {
            if (hasSession && currentWorkout && currentWorkout.workoutId === workoutId) {
              console.log('Found matching saved session, using it directly');
              this.workout = currentWorkout;
              
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
        
        this.activeWorkoutService.startWorkout(activeWorkout).subscribe({
          next: () => {
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

  startTimer() {
    this.stopTimer();
    
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
  
  formatTime(seconds: number): string {
    if (!seconds && seconds !== 0) return '00:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

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

  isSetCompleted(set: ExerciseSet): boolean {
    return set?.completed || false;
  }

  updateSetWeight(exercise: Exercise, setIndex: number, event: any) {
    if (!exercise || (!exercise.exerciseId && !exercise.tempId) || !exercise.sets) return;
    if (setIndex < 0 || setIndex >= exercise.sets.length) return;
    
    const newWeight = Number(event.detail.value);
    if (isNaN(newWeight)) return;
    
    exercise.sets[setIndex].weight = newWeight;
    
    const exerciseId = exercise.exerciseId || exercise.tempId;
    
    if (!exerciseId) return;
    
    this.activeWorkoutService.updateSetPropertyByIndex(
      exerciseId,
      setIndex,
      'weight',
      newWeight
    );
  }

  updateSetReps(exercise: Exercise, setIndex: number, event: any) {
    if (!exercise || (!exercise.exerciseId && !exercise.tempId) || !exercise.sets) return;
    if (setIndex < 0 || setIndex >= exercise.sets.length) return;
    
    const newReps = Number(event.detail.value);
    if (isNaN(newReps)) return;
    
    exercise.sets[setIndex].reps = newReps;
    
    const exerciseId = exercise.exerciseId || exercise.tempId;
    
    if (!exerciseId) return;
    
    this.activeWorkoutService.updateSetPropertyByIndex(
      exerciseId,
      setIndex,
      'reps',
      newReps
    );
  }

  toggleSetComplete(exercise: Exercise, setIndex: number) {
    if (!exercise || (!exercise.exerciseId && !exercise.tempId) || !exercise.sets) return;
    if (setIndex < 0 || setIndex >= exercise.sets.length) return;
    
    const set = exercise.sets[setIndex];
    set.completed = !set.completed;
    
    const exerciseId = exercise.exerciseId || exercise.tempId;
    
    if (!exerciseId) return;
    
    this.activeWorkoutService.updateSetPropertyByIndex(
      exerciseId,
      setIndex,
      'completed',
      set.completed
    );
    
    this.changeDetector.markForCheck();
  }

  onSetTypeChange(exercise: Exercise, setIndex: number): void {
    if (!exercise || (!exercise.exerciseId && !exercise.tempId) || !exercise.sets) return;
    if (setIndex < 0 || setIndex >= exercise.sets.length) return;
    
    const set = exercise.sets[setIndex];
    
    const exerciseId = exercise.exerciseId || exercise.tempId;
    
    if (!exerciseId) return;
    
    console.log(`Set ${setIndex} type changing to ${set.type}`);
    
    this.activeWorkoutService.updateSetPropertyByIndex(
      exerciseId,
      setIndex,
      'type',
      set.type
    );
    
    this.exercises = this.exercises.map(ex => {
      if (ex === exercise) {
        return {
          ...ex,
          sets: [...ex.sets!]
        };
      }
      return ex;
    });
    
    this.changeDetector.detectChanges();
    
    console.log(`Set ${setIndex} type changed to ${set.type}`);
    console.log('Exercise sets after update:', exercise.sets.map(s => s.type));
  }

  async removeSet(exercise: Exercise, setIndex: number) {
    if (!exercise || (!exercise.exerciseId && !exercise.tempId) || !exercise.sets) return;
    if (setIndex < 0 || setIndex >= exercise.sets.length) return;
    
    if (exercise.sets.length <= 1) {
      this.showToast("Can't remove the last set");
      return;
    }
    
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

  async addExercise() {
    if (!this.workout?.workoutId) return;
    
    this.showExerciseLibrary = true;
    this.isLoading = true;
    
    this.searchTerm = '';
    this.selectedMuscleGroup = 'All Muscles';
    
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
  
  addExerciseFromTemplate(template: ExerciseTemplate) {
    if (!template || !template.exerciseTemplateId || !this.workout?.workoutId) return;
    
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
    
    this.activeWorkoutService.addExerciseToWorkout(this.workout.workoutId, newExercise).subscribe({
      next: (updatedExercises: Exercise[]) => {
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
  
  filterExercises() {
    if (!this.exerciseTemplates || this.exerciseTemplates.length === 0) {
      this.filteredTemplates = [];
      return;
    }
    
    let filtered = [...this.exerciseTemplates];
    
    if (this.searchTerm) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(t => 
        t.name.toLowerCase().includes(search) || 
        t.targetMuscleGroups?.some(m => m.toLowerCase().includes(search))
      );
    }
    
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

  async finishWorkout() {
    if (!this.workout) return;
    
    this.isCompleting = true;

    try {
      const loading = await this.loadingController.create({
        message: 'Completing workout...'
      });
      await loading.present();
      
      const currentSession = this.activeWorkoutService.getCurrentSession();
      if (!currentSession) {
        this.showToast('No active session found');
        loading.dismiss();
        return;
      }
      
      this.stopTimer();
      
      const hasTempExercises = currentSession.exercises.some(
        exercise => !exercise.exerciseId || exercise.exerciseId.toString().startsWith('temp-')
      );
      
      const timerValue = this.elapsedTime;
      const duration = this.formatDuration(timerValue);
      
      const workoutWithDuration: ActiveWorkout = {
        ...currentSession.workout,
        duration: duration,
        endTime: new Date().toISOString()
      };
      
      if (hasTempExercises) {
        this.activeWorkoutService.syncWorkoutWithBackend(this.workout.workoutId!)
          .pipe(
            switchMap(syncedExercises => {
              return this.activeWorkoutService.clearSavedSession().then(() => syncedExercises);
            }),
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

  ngOnDestroy() {
    this.stopTimer();
  }

  addSet(exercise: Exercise) {
    if (!exercise) {
      this.showToast('Cannot add set: Invalid exercise');
      return;
    }
    
    const exerciseId = exercise.exerciseId || exercise.tempId;
    
    if (!exerciseId) {
      this.showToast('Cannot add set: Missing exercise information');
      return;
    }
    
    this.activeWorkoutService.addSetToExercise(exerciseId).subscribe({
      next: (updatedExercises: Exercise[]) => {
        this.exercises = updatedExercises;
        this.changeDetector.markForCheck();
      },
      error: (error) => {
        console.error('Error adding set:', error);
        this.showToast('Failed to add set');
      }
    });
  }

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
      const isTempExercise = !exercise.exerciseId || exercise.exerciseId.toString().startsWith('temp-');
      const exerciseId = exercise.exerciseId || exercise.tempId;
      
      if (!exerciseId) {
        this.showToast('Cannot remove exercise: Missing exercise information');
        return;
      }
      
      if (!isTempExercise) {
        console.log(`Deleting real exercise with ID ${exerciseId} from backend`);
        
        const loading = await this.loadingController.create({
          message: 'Removing exercise...',
          duration: 2000
        });
        await loading.present();
        
        this.workoutService.removeExerciseFromWorkout(this.workout.workoutId, exerciseId)
          .subscribe({
            next: () => {
              console.log(`Backend deletion successful for exercise ${exerciseId}`);
              
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

  reorderExercises(event: CustomEvent<ItemReorderEventDetail>) {
    const itemMove = this.exercises.splice(event.detail.from, 1)[0];
    
    this.exercises.splice(event.detail.to, 0, itemMove);
    
    event.detail.complete();
    
    this.exercises.forEach((exercise, index) => {
      exercise.orderPosition = index;
    });
    
    this.exerciseOrderChanged = true;
    
    this.updateLocalExerciseOrder();
    
    this.changeDetector.markForCheck();
  }
  
  private updateLocalExerciseOrder() {
    if (!this.workout?.workoutId) return;
    
    const currentSession = this.activeWorkoutService.getCurrentSession();
    if (!currentSession) return;
    
    const updatedExercises = this.exercises.map((exercise, index) => ({
      ...exercise,
      orderPosition: index
    }));
    
    const updatedSession = {
      ...currentSession,
      exercises: updatedExercises
    };
    
    this.activeWorkoutService.updateSession(updatedSession);
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
              this.stopTimer();
              
              const loading = await this.loadingController.create({
                message: 'Discarding workout...',
                duration: 1000
              });
              await loading.present();
              
              await this.activeWorkoutService.clearSavedSession();
              
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
              const exercisesToUpdate = JSON.parse(JSON.stringify(exercises));
              
              const validExercises = exercisesToUpdate.filter((exercise: { exerciseId: { toString: () => string; }; }) => 
                exercise.exerciseId && !exercise.exerciseId.toString().startsWith('temp-')
              );
              
              console.log(`Preparing to update ${validExercises.length} exercises with their sets`);
              
              const preparedExercises = validExercises.map((exercise: Exercise, exerciseIndex: number) => {
                const cleanedExercise = {
                  ...exercise,
                  tempId: undefined,
                  orderPosition: exerciseIndex,
                  sets: exercise.sets ? exercise.sets.map((set, setIndex) => {
                    const shouldKeepSetId = set.exerciseSetId && 
                                           !set.exerciseSetId.toString().startsWith('temp-');
                    
                    const { tempId, completed, ...cleanSet } = set;
                    
                    return {
                      ...cleanSet,
                      exerciseSetId: shouldKeepSetId ? cleanSet.exerciseSetId : undefined,
                      exerciseId: exercise.exerciseId,
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

  async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'bottom'
    });
    await toast.present();
  }

  onWeightChange(exercise: Exercise, setIndex: number, weight: number): void {
    if (!exercise || !exercise.exerciseId) return;
    
    this.activeWorkoutService.updateSetPropertyByIndex(
      exercise.exerciseId,
      setIndex,
      'weight',
      weight
    );
  }

  onRepsChange(exercise: Exercise, setIndex: number, reps: number): void {
    if (!exercise || !exercise.exerciseId) return;
    
    this.activeWorkoutService.updateSetPropertyByIndex(
      exercise.exerciseId,
      setIndex,
      'reps',
      reps
    );
  }

  updateSetValue(exercise: Exercise, set: ExerciseSet, property: string, event: any) {
    if (!exercise) return;
    
    const value = event.detail.value;
    
    if (!this.workout?.workoutId || !exercise.exerciseId || !set.exerciseSetId) {
      this.activeWorkoutService.updateSetProperty(
        set.exerciseSetId || set.tempId!, 
        property, 
        value
      );
      
      if (property === 'type') {
        this.refreshExerciseUI(exercise);
      }
      
      return;
    }

    this.activeWorkoutService.updateSetPropertyWithSync(
      this.workout.workoutId,
      exercise.exerciseId,
      set.exerciseSetId,
      property,
      value
    ).subscribe({
      next: () => {
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

  private refreshExerciseUI(exercise: Exercise): void {
    if (!exercise || !exercise.sets) return;
    
    exercise.sets = [...exercise.sets];
    
    this.changeDetector.detectChanges();
  }
}