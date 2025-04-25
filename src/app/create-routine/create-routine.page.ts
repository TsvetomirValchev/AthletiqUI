import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WorkoutService } from '../services/workout.service';
import { Workout } from '../models/workout.model';
import { ExerciseTemplate } from '../models/exercise-template.model';

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
  isLoading = false;

  constructor(
    private fb: FormBuilder,
    private workoutService: WorkoutService,
    private router: Router,
    private alertController: AlertController,
    private toastController: ToastController
  ) {
    this.routineForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      exerciseIds: this.fb.array([])
    });
  }

  ngOnInit() {
    this.loadExerciseTemplates();
  }

  loadExerciseTemplates() {
    this.isLoading = true;
    this.workoutService.getExerciseTemplates().subscribe({
      next: (templates) => {
        this.exerciseTemplates = templates;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading exercise templates:', error);
        this.isLoading = false;
      }
    });
  }

  get exerciseIdsArray() {
    return this.routineForm.get('exerciseIds') as FormArray;
  }

  async addExercise() {
    const alert = await this.alertController.create({
      header: 'Add Exercise',
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
              this.exerciseIdsArray.push(this.fb.control(templateId));
            }
          }
        }
      ]
    });

    await alert.present();
  }

  removeExercise(index: number) {
    this.exerciseIdsArray.removeAt(index);
  }

  getTemplateName(templateId: string): string {
    const template = this.exerciseTemplates.find(t => t.exerciseTemplateId === templateId);
    return template ? template.name : 'Unknown Exercise';
  }

  saveRoutine() {
    if (this.routineForm.valid) {
      this.isLoading = true;
      const routineData: Workout = this.routineForm.value;

      this.workoutService.createWorkout(routineData).subscribe({
        next: async () => {
          const toast = await this.toastController.create({
            message: 'Routine saved successfully',
            duration: 2000,
            color: 'success'
          });
          await toast.present();

          this.isLoading = false;
          this.router.navigate(['/tabs/workouts']);
        },
        error: async (error) => {
          console.error('Error saving routine:', error);
          this.isLoading = false;

          const toast = await this.toastController.create({
            message: 'Failed to save routine. Please try again.',
            duration: 2000,
            color: 'danger'
          });
          await toast.present();
        }
      });
    }
  }
}
