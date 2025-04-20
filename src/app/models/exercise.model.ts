export interface Exercise {
  exerciseId?: string;
  name: string;
  weight: number;
  sets: number;
  reps: number;
  workoutId?: string;
  highestVolume?: Record<number, number>;
}