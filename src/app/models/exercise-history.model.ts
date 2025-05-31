import { SetHistory } from './set-history.model';

export interface ExerciseHistory {
    exerciseHistoryId?: string;
    exerciseName: string;
    orderPosition: number;
    notes?: string;
    exerciseSetHistories?: SetHistory[];
}