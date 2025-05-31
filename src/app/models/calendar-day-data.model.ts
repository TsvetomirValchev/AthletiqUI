import { WorkoutHistory } from "./workout-history.model";

/**
 * Represents calendar data for a specific day
 */
export interface CalendarDayData {
  date: string | Date;
  hasWorkout: boolean;
}
