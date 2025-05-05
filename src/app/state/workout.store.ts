import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { Observable, EMPTY } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { Workout } from '../models/workout.model';
import { Exercise } from '../models/exercise.model';
import { WorkoutService } from '../services/workout.service';

interface WorkoutState {
  workouts: Workout[];
  workoutExercises: Map<string, Exercise[]>;
  isLoading: boolean;
  error: string | null;
}

const initialState: WorkoutState = {
  workouts: [],
  workoutExercises: new Map(),
  isLoading: false,
  error: null
};

@Injectable()
export class WorkoutStore extends ComponentStore<WorkoutState> {
  constructor(private workoutService: WorkoutService) {
    super(initialState);
  }

  // Selectors
  readonly workouts$ = this.select(state => state.workouts);
  readonly isLoading$ = this.select(state => state.isLoading);
  readonly error$ = this.select(state => state.error);
  
  readonly getExercisesForWorkout = (workoutId: string) => 
    this.select(state => state.workoutExercises.get(workoutId) || []);

  // Effects
  readonly loadWorkouts = this.effect((trigger$: Observable<void>) => {
    return trigger$.pipe(
      tap(() => this.setLoading(true)),
      switchMap(() => this.workoutService.getWorkoutsWithExercises().pipe(
        tap(workoutsWithExercises => {
          const workouts = workoutsWithExercises.map(item => item.workout);
          const workoutExercises = new Map<string, Exercise[]>();
          
          workoutsWithExercises.forEach(item => {
            if (item.workout.workoutId) {
              workoutExercises.set(item.workout.workoutId, item.exercises || []);
            }
          });
          
          this.updateWorkoutData({ workouts, workoutExercises });
          this.setLoading(false);
        }),
        catchError(error => {
          console.error('Error loading workouts:', error);
          this.patchState({ error: 'Failed to load workouts', isLoading: false });
          return EMPTY;
        })
      ))
    );
  });

  // Updaters
  readonly setLoading = this.updater((state, isLoading: boolean) => ({
    ...state,
    isLoading
  }));

  readonly updateWorkoutData = this.updater((state, { workouts, workoutExercises }: 
    { workouts: Workout[], workoutExercises: Map<string, Exercise[]> }) => ({
    ...state,
    workouts,
    workoutExercises
  }));
}