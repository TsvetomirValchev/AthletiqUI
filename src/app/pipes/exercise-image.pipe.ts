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
    'Incline Bench Press': 'assets/exercise-icons/incline-press.png',
    'Decline Bench Press': 'assets/exercise-icons/decline-press.png',
    'Dumbbell Bench Press': 'assets/exercise-icons/dumbbell-press.png',
    'Incline Dumbbell Press': 'assets/exercise-icons/incline-dumbbell.png',
    'Dumbbell Flyes': 'assets/exercise-icons/dumbbell-flyes.png',
    'Cable Flyes': 'assets/exercise-icons/cable-flyes.png',
    'Push-ups': 'assets/exercise-icons/push-up.png',
    
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
    'Tricep Pushdowns': 'assets/exercise-icons/tricep-pushdown.png',
    'Tricep Extensions': 'assets/exercise-icons/tricep-extension.png',
    'Skull Crushers': 'assets/exercise-icons/skull-crusher.png',
    
    // Abs exercises
    'Crunches': 'assets/exercise-icons/crunch.png',
    'Leg Raises': 'assets/exercise-icons/leg-raise.png',
    'Planks': 'assets/exercise-icons/plank.png',
    'Russian Twists': 'assets/exercise-icons/russian-twist.png',
    'Ab Rollouts': 'assets/exercise-icons/ab-rollout.png',
  };
  
  // Set fallback to athletiq logo
  private readonly fallbackImage = 'assets/logo/athletiq-logo.jpeg';
  
  constructor(private sanitizer: DomSanitizer) {}

  transform(exerciseName: string | undefined | null, useSanitizer = false): string | SafeUrl {
    if (!exerciseName) return this.fallbackImage;
    
    const imagePath = this.imageMapping[exerciseName] || 
                     'assets/exercise-icons/barbell.png';
    
    return useSanitizer ? 
      this.sanitizer.bypassSecurityTrustUrl(imagePath) : 
      imagePath;
  }
  
  // Static method to handle errors that can be used in a directive
  static handleError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement) {
      imgElement.src = 'assets/logo/athletiq-logo.jpeg';
    }
  }
}
