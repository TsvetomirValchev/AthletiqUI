/**
 * Models for the statistics API integration
 */

export interface MuscleGroupStats {
  muscleGroup: string;
  workoutCount: number;
}

export interface CalendarDayData {
  date: string | Date;
  hasWorkout: boolean;
}

export interface WorkoutStreakData {
  currentStreak: number;
  longestStreak: number;
  lastWorkoutDate: string;
  workoutDates: string[];
}

export interface WorkoutStats {
  totalWorkouts: number;
  uniqueDays: number;
  hoursActive: number;
}
