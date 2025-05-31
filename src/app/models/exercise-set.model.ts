import { SetType } from './set-type.enum';

export interface ExerciseSet {
    exerciseSetId?: string;
    exerciseId?: string;
    tempId?: string;
    orderPosition: number;
    reps?: number;
    weight?: number;
    restTimeSeconds?: number;
    type: SetType;
    completed?: boolean;
}