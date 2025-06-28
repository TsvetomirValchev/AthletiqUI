import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, AlertController, ToastController, LoadingController, ActionSheetController, ItemReorderEventDetail } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { finalize, switchMap, take, tap, catchError } from 'rxjs/operators';
import { ActiveWorkoutService } from '../../services/active-workout.service';
import { WorkoutService } from '../../services/workout.service';
import { WorkoutHistoryService } from '../../services/workout-history.service';
import { ActiveWorkout } from '../../models/active-workout.model';
import { Exercise } from '../../models/exercise.model';
import { ExerciseSet} from '../../models/exercise-set.model';
import { ExerciseTemplate } from '../../models/exercise-template.model';
import { Workout } from '../../models/workout.model';
import { SetType } from '../../models/set-type.enum';
import { SetTypeDisplayPipe } from '../../pipes/set-type-display.pipe'; 
import { TimePipe } from '../../pipes/time.pipe';
import { ExerciseFilterPipe } from '../../pipes/exercise-filter.pipe';
import { SortPipe } from '../../pipes/sort.pipe';
import { ExerciseImagePipe } from '../../pipes/exercise-image.pipe';
import { lastValueFrom, forkJoin, of } from 'rxjs';

@Component({
  selector: 'app-active-workout',
  templateUrl: './active-workout.page.html',
  styleUrls: ['./active-workout.page.scss'],
  standalone: true,
  imports: [
    IonicModule, 
    CommonModule, 
    FormsModule, 
    SetTypeDisplayPipe, 
    TimePipe, 
    ExerciseFilterPipe,
    SortPipe,
    ExerciseImagePipe
  ],
  providers: [TimePipe, ExerciseImagePipe],
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

  exerciseOrderChanged = false;

  exerciseTemplates: ExerciseTemplate[] = [];
  showExerciseLibrary = false;
  searchTerm: string = '';
  selectedMuscleGroup: string = 'All Muscles';

  showRestTimer = false;
  restTimeLeft = 0;
  restTimerExercise: Exercise | null = null;
  restTimerSubscription: Subscription | null = null;
  restTimerInterval: any = null;

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
    private actionSheetController: ActionSheetController,
    private timePipe: TimePipe,
     private exerciseImagePipe: ExerciseImagePipe
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
        ).map(exercise => {
          console.log('Exercise sets:', exercise.name, exercise.sets?.map(s => ({
            restTime: s.restTimeSeconds,
            completed: s.completed
          })));
          if (exercise.sets && exercise.sets.length > 0) {
            const firstSetRestTime = exercise.sets[0].restTimeSeconds;
            console.log(`Setting exercise ${exercise.name} rest time to:`, firstSetRestTime);
            return {
              ...exercise,
              restTimeSeconds: firstSetRestTime || 0
            };
          }
          return exercise;
        });
        
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
    const wasCompleted = set.completed;
    set.completed = !set.completed;
    
    const exerciseId = exercise.exerciseId || exercise.tempId;
    
    if (!exerciseId) return;
    
    this.activeWorkoutService.updateSetPropertyByIndex(
      exerciseId,
      setIndex,
      'completed',
      set.completed
    );
    
    // Start rest timer if set was just marked as completed and rest timer is enabled
    if (set.completed && !wasCompleted && exercise.restTimeSeconds && exercise.restTimeSeconds > 0) {
      this.startRestTimer(exercise);
    }
    
    this.changeDetector.markForCheck();
  }

  // Add new methods for rest timer
  startRestTimer(exercise: Exercise) {
    // Cancel any existing timer
    this.stopRestTimer();
    
    // Set up new timer
    this.restTimerExercise = exercise;
    this.restTimeLeft = exercise.restTimeSeconds || 0;
    this.showRestTimer = true;
    
    // Update the timer every second
    this.restTimerInterval = setInterval(() => {
      this.restTimeLeft--;
      this.changeDetector.detectChanges();
      
      if (this.restTimeLeft <= 0) {
        this.stopRestTimer();
      }
    }, 1000);
    
    this.changeDetector.detectChanges();
  }

  stopRestTimer() {
    if (this.restTimerInterval) {
      clearInterval(this.restTimerInterval);
      this.restTimerInterval = null;
    }
    
    this.showRestTimer = false;
    this.restTimerExercise = null;
    this.changeDetector.detectChanges();
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
      this.isLoading = false;
    }
    
    this.changeDetector.markForCheck();
  }
  
  addExerciseFromTemplate(template: ExerciseTemplate) {
    if (!template || !template.exerciseTemplateId || !this.workout?.workoutId) return;
    
    const maxOrderPosition = this.exercises.reduce(
      (max, exercise) => Math.max(max, exercise.orderPosition || 0), 
      -1
    );
    
    const newExercise: Exercise = {
      exerciseTemplateId: template.exerciseTemplateId,
      name: template.name,
      notes: '',
      workoutId: this.workout.workoutId,
      orderPosition: maxOrderPosition + 1,
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
    
    console.log('Adding exercise with order position:', newExercise.orderPosition);
    
    this.activeWorkoutService.addExerciseToWorkout(this.workout.workoutId, newExercise).subscribe({
      next: (updatedExercises: Exercise[]) => {
        this.exercises = updatedExercises.map((ex, i) => ({
          ...ex,
          orderPosition: ex.orderPosition !== undefined ? ex.orderPosition : i
        }));
        
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
  
  onSearch(event: any) {
    this.searchTerm = event.detail.value;
    this.changeDetector.markForCheck();
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
      this.isCompleting = false;
      return;
    }
    
    this.stopTimer();
    
    const workoutWithDuration: ActiveWorkout = {
      ...currentSession.workout,
      duration: this.elapsedTime,
      endTime: new Date().toISOString()
    };
    
    this.workoutHistoryService.completeWorkout(workoutWithDuration, currentSession.exercises)
      .pipe(
        finalize(() => {
          loading.dismiss();
          this.isCompleting = false;
        })
      )
      .subscribe({
        next: async () => {
          await this.activeWorkoutService.clearSavedSession();
          this.showToast('Workout completed successfully');
          this.router.navigate(['/tabs/profile']);
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

  ngOnDestroy() {
    this.stopTimer();
    this.stopRestTimer();
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
    const exerciseId = exercise.exerciseId || exercise.tempId;
    
    if (!exerciseId) {
      this.showToast('Cannot remove exercise: Missing exercise information');
      return;
    }
    
    const alert = await this.alertController.create({
      header: 'Remove Exercise',
      message: `Are you sure you want to remove ${exercise.name}?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Remove',
          role: 'destructive',
          handler: () => {
            const loading = this.loadingController.create({
              message: 'Removing exercise...',
              duration: 1000
            });
            loading.then(l => l.present());
            
            // Only modify the local session, no backend calls
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
                console.error('Error removing exercise from local session:', error);
                this.showToast('Failed to remove exercise');
              }
            });
          }
        }
      ]
    });
    
    await alert.present();
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
    
    this.activeWorkoutService.updateSetProperty(
      set.exerciseSetId || set.tempId!, 
      property, 
      value
    );
    
    if (property === 'type') {
      this.refreshExerciseUI(exercise);
    }
  }

  private refreshExerciseUI(exercise: Exercise): void {
    if (!exercise || !exercise.sets) return;
    
    exercise.sets = [...exercise.sets];
    
    this.changeDetector.detectChanges();
  }
  
  handleImageError(event: Event): void {
  const imgElement = event.target as HTMLImageElement;
  if (imgElement) {
    imgElement.src = 'assets/logo/athletiq-logo.jpeg';
  }
}

}