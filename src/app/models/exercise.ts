export interface Exercise {
    exerciseId?: string;  // UUID is represented as string in TypeScript
    name: string;
    weight: number;      // double in Java = number in TypeScript
    sets: number;        // int in Java = number in TypeScript
    reps: number;
    workoutId?: string;  // UUID for the related workout
    highestVolume?: Record<number, number>;  // Map<Double, Integer> equivalent in TypeScript
  }