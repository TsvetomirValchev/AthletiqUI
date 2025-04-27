export interface ExerciseConfig {
  exerciseTemplateId: string;
  name: string;
  sets: number;
  reps: number;
  weight: number;
  notes?: string;
}