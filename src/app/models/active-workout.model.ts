import { Workout } from './workout.model';

export interface ActiveWorkout extends Workout {
    workoutId?: string;
    description?: string;
    userId?: string;
    createdAt?: string;
    updatedAt?: string;
    startTime?: string;
    endTime?: string;
    duration?: string;
    // Add this property
    elapsedTimeSeconds?: number;
}
