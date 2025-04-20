import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { ModalController } from '@ionic/angular';
import { Workout } from '../models/workout.model';
import { Exercise } from '../models/exercise.model';
import { ActiveWorkout } from '../models/active-workout.model';

@Injectable({
  providedIn: 'root'
})
export class WorkoutService {
  private apiUrl = 'http://localhost:6969/api';
  activeWorkout: Workout | null = null;

  constructor(
    private http: HttpClient,
    private modalController: ModalController
  ) { }

  // Workout operations
  getUserWorkouts(): Observable<Workout[]> {
    return this.http.get<Workout[]>(`${this.apiUrl}/workouts`);
  }

  getWorkout(id: string): Observable<Workout> {
    return this.http.get<Workout>(`${this.apiUrl}/workouts/${id}`);
  }

  createWorkout(workout: Workout): Observable<Workout> {
    return this.http.post<Workout>(`${this.apiUrl}/workouts`, workout);
  }

  updateWorkout(id: string, workout: Workout): Observable<Workout> {
    return this.http.put<Workout>(`${this.apiUrl}/workouts/${id}`, workout);
  }

  deleteWorkout(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/workouts/${id}`);
  }

  getExercisesForWorkout(workoutId: string): Observable<Exercise[]> {
    return this.http.get<Exercise[]>(`${this.apiUrl}/workouts/${workoutId}/exercises`);
  }

  addExerciseToWorkout(workoutId: string, exercise: Exercise): Observable<Exercise> {
    return this.http.post<Exercise>(`${this.apiUrl}/workouts/${workoutId}/exercises`, exercise);
  }

  updateExercise(exerciseId: string, exercise: Exercise): Observable<Exercise> {
    return this.http.put<Exercise>(`${this.apiUrl}/exercises/${exerciseId}`, exercise);
  }

  deleteExercise(exerciseId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/exercises/${exerciseId}`);
  }

  getCurrentActiveWorkout(): Observable<ActiveWorkout | null> {
    return this.http.get<ActiveWorkout | null>(`${this.apiUrl}/workouts/active/current`);
  }

  startWorkout(workout: Workout): Observable<ActiveWorkout> {
    const activeWorkout = {
      ...workout,
      startTime: new Date().toISOString()
    };
    
    return this.http.post<ActiveWorkout>(`${this.apiUrl}/workouts/active`, activeWorkout);
  }

  endWorkout(workoutId: string): Observable<ActiveWorkout> {
    const endTime = new Date().toISOString();
    return this.http.put<ActiveWorkout>(`${this.apiUrl}/workouts/${workoutId}/end`, { endTime });
  }

  async startWorkoutModal(workout: Workout): Promise<void> {
    this.activeWorkout = workout;

    const modal = await this.modalController.create({
      component: 'app-active-workout',
      componentProps: {
        workout: workout
      },
      cssClass: 'fullscreen-modal'
    });

    modal.onDidDismiss().then((result) => {
      if (result?.data?.completed) {
        // Handle completed workout data
        console.log('Workout completed', result.data);
      }
      this.activeWorkout = null;
    });

    return await modal.present();
  }

  isActiveWorkoutInProgress(): boolean {
    return this.activeWorkout !== null;
  }
}
