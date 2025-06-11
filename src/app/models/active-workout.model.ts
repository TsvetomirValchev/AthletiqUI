import { Workout } from './workout.model';

export interface ActiveWorkout extends Workout {
    workoutId?: string;
    description?: string;
    userId?: string;
    startTime?: string;
    endTime?: string;
    duration?: number;
    elapsedTimeSeconds?: number;
}
