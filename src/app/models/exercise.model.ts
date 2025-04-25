export interface Exercise {
  exerciseId?: string;
  workoutId?: string;
  exerciseTemplateId?: string;
  name: string;
  description?: string;
  notes?: string;
  exerciseSetIds?: string[];
  totalSets?: number;
  maxWeight?: number;
  totalReps?: number;
}