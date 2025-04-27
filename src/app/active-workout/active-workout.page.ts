import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { interval, Subscription, firstValueFrom } from 'rxjs';
import { ActiveWorkout } from '../models/active-workout.model';
import { Exercise } from '../models/exercise.model';
import { ExerciseSet } from '../models/exercise-set.model';
import { ActiveWorkoutService } from '../services/active-workout.service';
import { ExerciseTemplateService } from '../services/exercise-template.service';
import { WorkoutService } from '../services/workout.service';
import { SetType } from '../models/set-type.enum';
import { ExerciseSetComponent } from '../components/exercise-set/exercise-set.component';

@Component({
  selector: 'app-active-workout',
  templateUrl: './active-workout.page.html',
  styleUrls: ['./active-workout.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, ExerciseSetComponent]
})
export class ActiveWorkoutPage implements OnInit, OnDestroy {
  workout: ActiveWorkout | null = null;
  exercises: Exercise[] = [];
  workoutActive = false;
  elapsedTime = 0;
  timerSubscription: Subscription | null = null;
  workoutSubscription: Subscription | null = null;
  showCompletedSets = false;

  private setDetails: Map<string, ExerciseSet> = new Map();
  private normalSetCounts: Map<string, number> = new Map();

  constructor(
    private activeWorkoutService: ActiveWorkoutService,
    private workoutService: WorkoutService,
    private exerciseTemplateService: ExerciseTemplateService,
    private route: ActivatedRoute,
    private router: Router,
    private alertController: AlertController,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    this.loadWorkout();
    
    this.workoutSubscription = this.activeWorkoutService.currentWorkout$.subscribe(
      workout => {
        if (workout) {
          this.workout = workout;
          this.loadWorkoutExercises();
        }
      }
    );
  }

  ngOnDestroy() {
    this.stopWorkoutTimer();
    if (this.workoutSubscription) {
      this.workoutSubscription.unsubscribe();
    }
  }

  loadWorkout() {
    
    const workoutId = this.route.snapshot.paramMap.get('id');
    
    if (workoutId) {
      this.workoutService.getById(workoutId).subscribe({
        next: (workout) => {
          const activeWorkout: ActiveWorkout = {
            ...workout,
            startTime: new Date().toISOString()
          };
          
          this.startNewWorkout(activeWorkout);
        },
        error: (error: Error) => {
          this.showToast('Error loading workout: ' + error.message);
        }
      });
    } else {
      this.activeWorkoutService.loadCurrentWorkout();
    }
  }

  loadWorkoutExercises() {
    if (!this.workout?.workoutId) return;

    this.activeWorkoutService.getExercisesByWorkoutId(this.workout.workoutId).subscribe({
      next: (exercises: Exercise[]) => {
        this.exercises = exercises;
        
        // Fetch set details for each exercise
        exercises.forEach(exercise => {
          if (exercise.exerciseId && exercise.exerciseSetIds && exercise.exerciseSetIds.length > 0) {
            this.loadExerciseSets(exercise);
          }
        });
        
        if (!this.workoutActive && this.workout) {
          this.resumeWorkout();
        }
      },
      error: (error: Error) => {
        this.showToast('Error loading exercises');
      }
    });
  }

  loadExerciseSets(exercise: Exercise) {
    if (!exercise.exerciseId || !this.workout?.workoutId) return;
    
    this.activeWorkoutService.getExerciseSets(
      this.workout.workoutId, 
      exercise.exerciseId
    ).subscribe({
      next: (sets: ExerciseSet[]) => {
        // Store each set in the map by ID
        sets.forEach(set => {
          if (set.exerciseSetId) {
            this.setDetails.set(set.exerciseSetId, set);
          }
        });
        

        if (exercise.exerciseId) {
          this.updateNormalSetCounts(exercise.exerciseId, sets);
        }
      }
    });
  }

  updateNormalSetCounts(exerciseId: string, sets: ExerciseSet[]) {
    let normalSetCount = 0;
    sets.forEach((set) => {
      if (set.type === SetType.NORMAL) {
        normalSetCount++;
        if (set.exerciseSetId) {
          this.normalSetCounts.set(set.exerciseSetId, normalSetCount);
        }
      }
    });
  }

  getSetDetails(setId: string): ExerciseSet | undefined {
    return this.setDetails.get(setId);
  }

  getNormalSetCount(setId: string): number {
    return this.normalSetCounts.get(setId) || 0;
  }

  startNewWorkout(activeWorkout: ActiveWorkout) {
    this.activeWorkoutService.startWorkout(activeWorkout).subscribe({
      next: (startedWorkout) => {
        this.workout = startedWorkout;
        this.workoutActive = true;
        this.resumeWorkout();
        this.loadWorkoutExercises();
      },
      error: (error: Error) => {
        this.showToast('Error starting workout: ' + error.message);
      }
    });
  }

  pauseWorkout() {
    this.workoutActive = false;
    this.stopWorkoutTimer();
  }

  resumeWorkout() {
    this.workoutActive = true;
    this.timerSubscription = interval(1000).subscribe(() => {
      this.elapsedTime++;
    });
  }

  stopWorkoutTimer() {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = null;
    }
  }

  formatTime(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  async addExercise() {
    if (!this.workout?.workoutId) {
      console.error('Cannot add exercise: No workout ID');
      return;
    }

    try {
      const templates = await firstValueFrom(this.exerciseTemplateService.getAllTemplates());
      
      if (!templates || templates.length === 0) {
        this.showToast('No exercise templates available');
        return;
      }
      
      const inputs = templates.map(template => ({
        type: 'radio' as const,
        label: template.name,
        value: template.exerciseTemplateId
      }));

      const alert = await this.alertController.create({
        header: 'Select Exercise',
        inputs,
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel'
          },
          {
            text: 'Add',
            handler: async (templateId) => {
              if (!templateId) return;
              
              const selectedTemplate = templates.find(t => t.exerciseTemplateId === templateId);
              if (!selectedTemplate) return;
              
              try {
                if (!this.workout?.workoutId) {
                  this.showToast('Cannot add exercise: No workout ID');
                  return;
                }

                // Create exercise object from template
                const exercise: Exercise = {
                  workoutId: this.workout.workoutId,
                  exerciseTemplateId: templateId,
                  name: selectedTemplate.name,
                  description: selectedTemplate.description
                };

                // Add exercise to active workout using the new endpoint
                await firstValueFrom(
                  this.activeWorkoutService.addExerciseToWorkout(
                    this.workout.workoutId,
                    exercise
                  )
                );
                
                this.loadWorkoutExercises();
                this.showToast(`${selectedTemplate.name} added to workout`);
              } catch (error) {
                this.showToast('Failed to add exercise');
                console.error('Error adding exercise:', error);
              }
            }
          }
        ]
      });

      await alert.present();
    } catch (error) {
      this.showToast('Error loading exercise templates');
      console.error('Error in addExercise:', error);
    }
  }

  async addSet(exercise: Exercise) {
    if (!exercise.exerciseId || !this.workout?.workoutId) {
      this.showToast('Cannot add set: Invalid exercise');
      return;
    }

    const alert = await this.alertController.create({
      header: 'Add Set',
      inputs: [
        {
          name: 'weight',
          type: 'number',
          placeholder: 'Weight (kg)'
        },
        {
          name: 'reps',
          type: 'number',
          placeholder: 'Number of reps'
        },
        {
          name: 'restTime',
          type: 'number',
          placeholder: 'Rest time (seconds)'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Add',
          handler: (data) => {
            const newSet: ExerciseSet = {
              exerciseId: exercise.exerciseId!,
              orderPosition: (exercise.exerciseSetIds?.length || 0) + 1,
              reps: parseInt(data.reps) || 0,
              weight: parseFloat(data.weight) || 0,
              restTimeSeconds: parseInt(data.restTime) || 60,
              type: SetType.NORMAL,
              completed: false
            };
            
            // Use activeWorkoutService to add set to exercise in active workout
            this.activeWorkoutService.addSetToExercise(
              this.workout!.workoutId!,
              exercise.exerciseId!,
              newSet
            ).subscribe({
              next: () => {
                this.loadWorkoutExercises();
                this.showToast('Set added');
              },
              error: (error) => {
                this.showToast('Failed to add set');
                console.error('Error adding set:', error);
              }
            });
          }
        }
      ]
    });

    await alert.present();
  }

  toggleSetComplete(exercise: Exercise, setId: string) {
    if (!exercise.exerciseId || !this.workout?.workoutId) {
      this.showToast('Cannot update set: Invalid exercise');
      return;
    }

    this.activeWorkoutService.completeSet(
      this.workout.workoutId,
      exercise.exerciseId,
      setId
    ).subscribe({
      next: () => {
        this.loadWorkoutExercises();
      },
      error: () => {
        this.showToast('Failed to update set');
      }
    });
  }

  async deleteExercise(exercise: Exercise) {
    if (!this.workout?.workoutId) return;

    const alert = await this.alertController.create({
      header: 'Confirm Delete',
      message: `Are you sure you want to remove ${exercise.name}?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            if (exercise.exerciseId) {
              this.activeWorkoutService.removeExerciseFromWorkout(
                this.workout!.workoutId!,
                exercise.exerciseId
              ).subscribe({
                next: () => {
                  this.loadWorkoutExercises();
                  this.showToast('Exercise removed');
                },
                error: (error) => {
                  this.showToast('Failed to delete exercise');
                }
              });
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async finishWorkout() {
    if (!this.workout?.workoutId) return;

    const alert = await this.alertController.create({
      header: 'Finish Workout',
      message: 'Are you sure you want to finish this workout?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Finish',
          handler: () => {
            this.activeWorkoutService.finishWorkout(this.workout!.workoutId!).subscribe({
              next: () => {
                this.stopWorkoutTimer();
                this.router.navigate(['/workout-history']);
                this.showToast('Workout completed!');
              },
              error: (error) => {
                this.showToast('Error finishing workout');
              }
            });
          }
        }
      ]
    });

    await alert.present();
  }

  private async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'bottom'
    });
    toast.present();
  }
}
