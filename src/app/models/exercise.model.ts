import { ExerciseSet } from './exercise-set.model';

export interface Exercise {
  exerciseId?: string;
  workoutId?: string;
  exerciseTemplateId?: string;
  tempId?: string;
  name: string;
  notes?: string;
  exerciseSetIds?: string[];
  orderPosition?: number;
  sets?: ExerciseSet[];
  totalSets?: number;
  maxWeight?: number;
  totalReps?: number;
  restTimeSeconds?: number; 
}