import { Component, OnInit } from '@angular/core';
import { WorkoutService } from '../services/workout.service';
import { Workout } from '../models/workout.model';
import { IonicModule, AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { ExerciseTemplate } from '../models/exercise-template.model';

@Component({
  selector: 'app-workout',
  templateUrl: './workout.page.html',
  styleUrls: ['./workout.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, RouterLink]
})
export class WorkoutPage implements OnInit {
  workouts: Workout[] = [];
  isLoading = false;
  exerciseTemplates: Map<string, ExerciseTemplate> = new Map();
  constructor(
    private workoutService: WorkoutService,
    private router: Router,
    private alertController: AlertController
  ) { }

  ngOnInit() {
    this.loadWorkouts();
    this.loadExerciseTemplates();
  }

  loadWorkouts() {
    this.isLoading = true;
    this.workoutService.getUserWorkouts().subscribe({
      next: (workouts) => {
        this.workouts = workouts;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading workouts:', error);
        this.isLoading = false;
      }
    });
  }

  loadExerciseTemplates() {
    this.workoutService.getExerciseTemplates().subscribe({
      next: (templates) => {
        templates.forEach(template => {
          if (template.exerciseTemplateId) {
            this.exerciseTemplates.set(template.exerciseTemplateId, template);
          }
        });
      },
      error: (error) => {
        console.error('Error loading exercise templates:', error);
      }
    });
  }

  getExerciseName(exerciseId: string): string {
    const template = this.exerciseTemplates.get(exerciseId);
    return template ? template.name : 'Unknown Exercise';
  }

  getExerciseCount(workout: Workout): number {
    return workout.exerciseIds?.length || 0;
  }

  startEmptyWorkout() {
    const newWorkout: Workout = {
      name: `Workout ${new Date().toLocaleDateString()}`,
      exerciseIds: []
    };

    this.workoutService.createWorkout(newWorkout).subscribe({
      next: (createdWorkout) => {
        this.workoutService.startWorkout(createdWorkout).subscribe({
          next: (activeWorkout) => {
            this.router.navigate(['/active-workout'], { 
              queryParams: { workoutId: activeWorkout.workoutId }
            });
          },
          error: (error) => {
            console.error('Error starting workout:', error);
          }
        });
      },
      error: (error) => {
        console.error('Error creating workout:', error);
      }
    });
  }

  startWorkout(workout: Workout) {
    if (!workout.workoutId) return;

    this.workoutService.startWorkout(workout).subscribe({
      next: (activeWorkout) => {
        this.router.navigate(['/active-workout'], { 
          queryParams: { workoutId: activeWorkout.workoutId }
        });
      },
      error: (error) => {
        console.error('Error starting workout:', error);
      }
    });
  }

  async deleteWorkout(workout: Workout) {
    const alert = await this.alertController.create({
      header: 'Delete Routine',
      message: 'Are you sure you want to delete this routine?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        }, {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            if (workout.workoutId) {
              this.workoutService.deleteWorkout(workout.workoutId).subscribe({
                next: () => {
                  this.workouts = this.workouts.filter(w => w.workoutId !== workout.workoutId);
                },
                error: (error) => {
                  console.error('Error deleting workout:', error);
                }
              });
            }
          }
        }
      ]
    });

    await alert.present();
  }

  ionViewWillEnter() {
    this.loadWorkouts();
  }
}
