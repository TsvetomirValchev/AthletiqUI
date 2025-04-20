import { Workout } from './workout.model';

export interface ActiveWorkout extends Workout {
    startTime: string;
    endTime?: string;
}
