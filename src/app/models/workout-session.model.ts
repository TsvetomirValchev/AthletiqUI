import { Exercise } from "./exercise.model";
import { Workout } from "./workout.model";

export interface WorkoutSession {
  workout: Workout;
  exercises: Exercise[];
  startTime: string;
  elapsedTimeSeconds: number;
  isPaused: boolean;
  lastPausedAt?: number;
  totalPausedSeconds: number;
}