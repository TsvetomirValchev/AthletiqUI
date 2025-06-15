import { Pipe, PipeTransform, ElementRef } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Pipe({
  name: 'exerciseImage',
  standalone: true
})
export class ExerciseImagePipe implements PipeTransform {
  private readonly imageMapping: Record<string, string> = {
    // Chest exercises
    'Bench Press': 'assets/exercise-icons/bench-press.png',
    'Incline Bench Press': 'assets/exercise-icons/incline-barbell-bench-press.png',
    'Decline Barbell Bench Press': 'assets/exercise-icons/decline-barbell-bench-press.png',
    'Dumbbell Bench Press': 'assets/exercise-icons/dumbell-bench-press.png',
    'Dumbbell Fly': 'assets/exercise-icons/dumbbell-fly.png',
    'Incline Dumbbell Bench Press': 'assets/exercise-icons/incline-dumbbell-bench-press.png',
    'Cable Fly': 'assets/exercise-icons/cable-fly.png',
    'Push-ups': 'assets/exercise-icons/push-up.png',
    'Decline Dumbbell Bench Press': 'assets/exercise-icons/decline-dumbbell-bench-press.png',

    
    // Back exercises
    'Deadlift': 'assets/exercise-icons/deadlift.png',
    'Pull-ups': 'assets/exercise-icons/pull-up.png',
    'Lat Pulldown': 'assets/exercise-icons/lat-pulldown.png',
    'Bent Over Row': 'assets/exercise-icons/bent-over-row.png',
    'T-Bar Row': 'assets/exercise-icons/t-bar-row.png',
    'Seated Cable Row': 'assets/exercise-icons/seated-row.png',
    
    // Legs exercises
    'Squat': 'assets/exercise-icons/squat.png',
    'Leg Press': 'assets/exercise-icons/leg-press.png',
    'Romanian Deadlift': 'assets/exercise-icons/romanian-deadlift.png',
    'Lunges': 'assets/exercise-icons/lunge.png',
    'Leg Extensions': 'assets/exercise-icons/leg-extension.png',
    'Leg Curls': 'assets/exercise-icons/leg-curl.png',
    'Calf Raises': 'assets/exercise-icons/calf-raise.png',
    
    // Shoulder exercises
    'Overhead Press': 'assets/exercise-icons/overhead-press.png',
    'Lateral Raises': 'assets/exercise-icons/lateral-raise.png',
    'Front Raises': 'assets/exercise-icons/front-raise.png',
    'Face Pulls': 'assets/exercise-icons/face-pull.png',
    'Upright Rows': 'assets/exercise-icons/upright-row.png',
    
    // Arms exercises
    'Bicep Curls': 'assets/exercise-icons/bicep-curl.png',
    'Hammer Curls': 'assets/exercise-icons/hammer-curl.png',
    'Triceps Pushdowns': 'assets/exercise-icons/tricep-pushdown.png',
    'Triceps Extensions': 'assets/exercise-icons/tricep-extension.png',
    'Skull Crushers': 'assets/exercise-icons/skull-crusher.png',
    
    // Abs exercises
    'Crunches': 'assets/exercise-icons/crunch.png',
    'Leg Raises': 'assets/exercise-icons/leg-raise.png',
    'Planks': 'assets/exercise-icons/plank.png',
    'Russian Twists': 'assets/exercise-icons/russian-twist.png',
    'Ab Rollouts': 'assets/exercise-icons/ab-rollout.png',
  };
  
  private readonly fallbackImage = 'assets/logo/athletiq-logo.jpeg';
  
  constructor(private sanitizer: DomSanitizer) {}

  transform(exerciseName: string | undefined | null, useSanitizer = false): string | SafeUrl {
    if (!exerciseName) return this.fallbackImage;
    
    const imagePath = this.imageMapping[exerciseName];
    
    return useSanitizer ? 
      this.sanitizer.bypassSecurityTrustUrl(imagePath) : 
      imagePath;
  }
  
  static handleError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement) {
      imgElement.src = 'assets/logo/athletiq-logo.jpeg';
    }
  }
}
