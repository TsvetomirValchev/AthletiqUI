import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IonicModule, AlertController, ToastController, ActionSheetController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WorkoutService } from '../services/workout.service';
import { Workout } from '../models/workout.model';
import { Exercise } from '../models/exercise.model';
import { ExerciseTemplate } from '../models/exercise-template.model';
import { SetType } from '../models/set-type.enum';

interface ExerciseSetConfig {
  type: SetType; 
  weight: number;
  reps: number;
}

interface ExerciseConfig {
  exerciseTemplateId: string;
  name: string;
  notes?: string;
  restTime: number;
  sets: ExerciseSetConfig[];
}

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
  exerciseConfigs: ExerciseConfig[] = [];
  SetType = SetType; // Make enum available to template

  constructor(
    private fb: FormBuilder,
    private workoutService: WorkoutService,
    private router: Router,
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
                const newExercise: ExerciseConfig = {
                  exerciseTemplateId: selectedTemplate.exerciseTemplateId!,
                  name: selectedTemplate.name,
                  notes: '',
                  restTime: 0,
                  sets: [
                    { type: SetType.NORMAL, weight: 0, reps: 0 }
                  ]
                };
                this.exerciseConfigs.push(newExercise);
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
    
    const newExercise: ExerciseConfig = {
      exerciseTemplateId: template.exerciseTemplateId,
      name: template.name,
      notes: '',
      restTime: 0,
      sets: [
        { type: SetType.NORMAL, weight: 0, reps: 0 }
      ]
    };
    
    this.exerciseConfigs.push(newExercise);
    this.showToast(`Added ${template.name}`);
  }

  addSet(exerciseIndex: number) {
    if (exerciseIndex >= 0 && exerciseIndex < this.exerciseConfigs.length) {
      const exercise = this.exerciseConfigs[exerciseIndex];
      
      exercise.sets.push({
        type: SetType.NORMAL,
        weight: 0,
        reps: 0
      });
      
      exercise.sets = [...exercise.sets];
      
      this.changeDetector.markForCheck();
      
      setTimeout(() => {
        this.changeDetector.detectChanges();
      });
    }
  }

  removeSet(exerciseIndex: number, setIndex: number) {
    if (exerciseIndex >= 0 && exerciseIndex < this.exerciseConfigs.length) {
      const exercise = this.exerciseConfigs[exerciseIndex];
      if (setIndex >= 0 && setIndex < exercise.sets.length) {
        exercise.sets.splice(setIndex, 1);
        
        exercise.sets = [...exercise.sets];
        
        this.changeDetector.markForCheck();
        
        setTimeout(() => {
          this.changeDetector.detectChanges();
        });
      }
    }
  }

  toggleSetType(exerciseIndex: number, setIndex: number) {
    if (exerciseIndex >= 0 && exerciseIndex < this.exerciseConfigs.length) {
      const exercise = this.exerciseConfigs[exerciseIndex];
      if (setIndex >= 0 && setIndex < exercise.sets.length) {
        const set = exercise.sets[setIndex];
        switch (set.type) {
          case SetType.NORMAL:
            set.type = SetType.WARMUP;
            break;
          case SetType.WARMUP:
            set.type = SetType.DROPSET;
            break;
          case SetType.DROPSET:
            set.type = SetType.FAILURE;
            break;
          case SetType.FAILURE:
          default:
            set.type = SetType.NORMAL;
            break;
        }
        
        exercise.sets = [...exercise.sets];
        
        setTimeout(() => {
          this.changeDetector.detectChanges();
        });
      }
    }
  }

  getSetLabel(set: ExerciseSetConfig, index: number): string {
    switch (set.type) {
      case SetType.WARMUP:
        return 'W';
      case SetType.DROPSET:
        return 'D';
      case SetType.FAILURE:
        return 'F';
      default:
        const sets = this.exerciseConfigs.find(e => 
          e.sets.includes(set))?.sets || [];
        return this.getNormalSetNumber(sets, index);
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
            this.viewExerciseDetails(this.exerciseConfigs[exerciseIndex].exerciseTemplateId);
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
    this.exerciseConfigs.splice(index, 1);
  }

  saveWorkout() {
    if (this.routineForm.valid) {
      if (this.exerciseConfigs.length === 0) {
        this.showToast('Please add at least one exercise to the workout');
        return;
      }
      
      const workoutName = this.routineForm.value.name;
      
      const workoutData: Workout = {
        name: workoutName,
      };
      
      const exercises: Exercise[] = this.exerciseConfigs.map(config => {
        const exerciseSets = config.sets.map((set, index) => ({
          exerciseId: '',
          type: set.type,
          orderPosition: index + 1,
          reps: set.reps,
          weight: set.weight,
          restTimeSeconds: config.restTime,
          completed: false
        }));
        
        return {
          exerciseTemplateId: config.exerciseTemplateId,
          name: config.name,
          notes: config.notes,
          sets: exerciseSets
        };
      });
      
      this.workoutService.createWorkoutWithExercises(workoutData, exercises).subscribe({
        next: () => {
          this.showToast('Workout saved successfully');
          this.router.navigate(['/tabs/workouts']);
        },
        error: (error) => {
          console.error('Error saving workout:', error);
          this.showToast('Failed to save workout');
        }
      });
    } else {
      this.showToast('Please enter a workout name (minimum 3 characters)');
    }
  }

  private async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'bottom'
    });
    toast.present();
  }

  getNormalSetNumber(sets: ExerciseSetConfig[], currentIndex: number): string {
  let normalCount = 0;
  
  for (let i = 0; i < sets.length; i++) {
    if (sets[i].type === SetType.NORMAL) {
      if (i <= currentIndex) {
        normalCount++;
      }
    }
  }
  
  return normalCount > 0 ? normalCount.toString() : '1';
}

enforceMinimumValue(set: ExerciseSetConfig, property: 'weight' | 'reps', minValue: number): void {
  if (set[property] < minValue) {
    set[property] = minValue;
  }
}

onSetTypeChange(sets: ExerciseSetConfig[], setIndex: number): void {
  // Find which exercise contains this set
  for (let exerciseIndex = 0; exerciseIndex < this.exerciseConfigs.length; exerciseIndex++) {
    const config = this.exerciseConfigs[exerciseIndex];
    if (config.sets === sets) {
      // Create a completely new copy of the exercise config
      this.exerciseConfigs[exerciseIndex] = {
        ...config,
        sets: [...config.sets]
      };
      
      // Force a complete refresh of the exerciseConfigs array
      this.exerciseConfigs = [...this.exerciseConfigs];
      
      // Run change detection immediately 
      this.changeDetector.detectChanges();
      
      // And also schedule another detection for the next cycle
      setTimeout(() => {
        this.changeDetector.detectChanges();
      });
      
      break;
    }
  }
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
}
