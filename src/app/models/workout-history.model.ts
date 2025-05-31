import { ExerciseHistory } from './exercise-history.model';

export interface WorkoutHistory {
    workoutHistoryId?: string;
    userId?: string;
    name?: string;
    date: string;
    duration: string;
    exerciseHistories?: ExerciseHistory[];
    createdAt?: string;
}