import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ExerciseImageService {
  private readonly defaultImages: Record<string, string> = {
    'Bench Press': 'assets/exercises/bench-press.png',
    'Squat': 'assets/exercises/squat.png',
    'Deadlift': 'assets/exercises/deadlift.png',
    'Dumbbell Flyes': 'assets/exercises/dumbbell-flyes.png',
    'Barbell Curl': 'assets/exercises/barbell-curl.png',
    'Pull Up': 'assets/exercises/pull-up.png',
    'Leg Press': 'assets/exercises/leg-press.png',
    'Tricep Extension': 'assets/exercises/tricep-extension.png',
    'Lat Pulldown': 'assets/exercises/lat-pulldown.png',
    'Shoulder Press': 'assets/exercises/shoulder-press.png'
  };
  
  private readonly defaultImage = 'assets/logo/athletiq-logo.jpeg';
  
  /**
   * Get the image URL for an exercise based on its name
   */
  getExerciseImageUrl(exerciseName: string): string {
    return this.defaultImages[exerciseName] || this.defaultImage;
  }
  
  /**
   * Handle image loading errors
   */
  handleImageError(event: any): void {
    event.target.src = this.defaultImage;
  }
}
