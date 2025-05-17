import { Component, OnInit, isDevMode } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FormatDurationPipe } from '../../pipes/format-duration.pipe';
import { ProfileService, UserProfile } from '../../services/profile.service';
import { WorkoutHistoryService } from '../../services/workout-history.service';
import { WorkoutHistory } from '../../models/workout-history.model';
import { ExerciseHistory } from '../../models/exercise-history.model';
import { SetHistory } from '../../models/set-history.model';
import { AuthService } from '../../services/auth.service';
import { finalize, switchMap } from 'rxjs/operators';
import { of, forkJoin, Observable } from 'rxjs';
import { ToastController } from '@ionic/angular';
import { ExerciseImageService } from '../../services/exercise-image.service';
import { SetType } from '../../models/set-type.enum';

// Interface to extend ExerciseHistory with UI state
interface ExerciseHistoryWithUIState extends ExerciseHistory {
  showSets?: boolean;
}

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, RouterLink]
})
export class ProfilePage implements OnInit {
  // User profile data
  username: string = '';
  totalWorkouts: number = 0;
  hoursActive: number = 0;  daysActive: number = 0;
  userId: string | null = null;
  public showDebug = true; // Set this to false in production
  
  // Workout history
  workoutHistory: WorkoutHistory[] = [];
  expandedWorkoutId: string | null = null;
  expandedWorkoutDetails: WorkoutHistory | null = null;
  isLoading: boolean = true;
  loadingDetails: boolean = false;
  expandedWorkoutIndex: number | null = null;

  // Map to track expanded exercise states
  exerciseVisibilityMap: Map<string, boolean> = new Map();
  
  constructor(
    private profileService: ProfileService,
    private workoutHistoryService: WorkoutHistoryService,
    private authService: AuthService,
    private toastController: ToastController,
    private exerciseImageService: ExerciseImageService
  ) {}

  ngOnInit() {
    this.loadUserProfile();
  }

  ionViewWillEnter() {
    this.loadUserProfile();
  }

  /**
   * Load user profile and workout statistics
   */
  loadUserProfile() {
    // Use only the authenticated user information from the auth service
    this.authService.currentUser$.pipe(
      switchMap(user => {
        if (user && user.userId) {
          // Get basic user info directly from auth service
          this.userId = user.userId;
          this.username = user.username || 'Athlete';
          
          // Only get stats from the backend
          return this.profileService.getWorkoutStats();
        } else {
          // Try to validate token if no current user
          return this.authService.validateToken().pipe(
            switchMap(valid => {
              if (valid) {
                // After validation, try again with current user
                return this.authService.currentUser$.pipe(
                  switchMap(refreshedUser => {
                    if (refreshedUser && refreshedUser.userId) {
                      this.userId = refreshedUser.userId;
                      this.username = refreshedUser.username || 'Athlete';
                      return this.profileService.getWorkoutStats();
                    }
                    return of(null);
                  })
                );
              }
              console.error('No valid authentication found');
              return of(null);
            })
          );
        }
      })
    ).subscribe({
      next: (stats) => {
        if (stats) {
          // Update stats from the endpoint
          this.totalWorkouts = stats.totalWorkouts;
          this.daysActive = stats.uniqueDays; // Using uniqueDays from the DTO
          
          // If hoursActive is not available from backend, calculate it from workouts
          if (stats.hoursActive !== undefined) {
            this.hoursActive = stats.hoursActive;
          } else {
            // hoursActive will be calculated when workout history is loaded
            this.hoursActive = 0;
          }
          
          console.log('Workout stats loaded:', stats);
        }
        
        // Load workout history for display
        this.loadWorkoutHistory();
      },
      error: (error) => {
        console.error('Error loading workout stats:', error);
        this.showToast('Failed to load workout statistics');
        
        // Still try to load workout history
        this.loadWorkoutHistory();
      }
    });
  }

  /**
   * Load workout history data with complete details
   */
  loadWorkoutHistory() {
    this.isLoading = true;
    console.log('Loading workout history...');
    
    this.workoutHistoryService.getWorkoutHistory().subscribe({
      next: (history) => {
        console.log('Received workout history:', history);
        
        // Update the workout count based on the actual history
        if (history && history.length > 0) {
          // Update totalWorkouts with the actual count
          this.totalWorkouts = history.length;
          
          const missingIds = history.filter(w => !w.workoutHistoryId).length;
          if (missingIds > 0) {
            console.warn(`Warning: ${missingIds} workout(s) have missing IDs`);
          }
          
          // Load details for each workout
          this.loadAllWorkoutDetails(history);
        } else {
          this.workoutHistory = [];
          this.totalWorkouts = 0; // Set to 0 if no workouts
          this.isLoading = false;
        }
      },
      error: (error) => {
        console.error('Error loading workout history:', error);
        this.isLoading = false;
        this.showToast('Failed to load workout history');
      }
    });
  }

  /**
   * Load details for all workouts
   */
  loadAllWorkoutDetails(workouts: WorkoutHistory[]) {
    if (!workouts || workouts.length === 0) {
      this.workoutHistory = [];
      this.isLoading = false;
      return;
    }
    
    // Create an array of observables for each workout detail request
    const detailRequests = workouts.map(workout => {
      if (!workout.workoutHistoryId) {
        return of(workout); // Return as-is if no ID
      }
      
      return this.workoutHistoryService.getWorkoutHistoryDetail(workout.workoutHistoryId);
    });
    
    // Execute all requests in parallel
    forkJoin(detailRequests).subscribe({
      next: (detailedWorkouts) => {
        console.log('All workout details loaded:', detailedWorkouts);
        
        // Make sure the data exists before assigning
        if (detailedWorkouts && detailedWorkouts.length > 0) {
          // Force Angular change detection by creating a new array
          this.workoutHistory = [...detailedWorkouts];
            // Debug each workout to verify structure
          this.workoutHistory.forEach((workout, index) => {
            console.log(`Workout ${index}:`, workout);
            console.log(`Has ${workout.exerciseHistories?.length || 0} exercises`);
            
            // Initialize exercise visibility states
            this.initializeExerciseVisibility(workout);
            
            if (workout.exerciseHistories) {
              workout.exerciseHistories.forEach((ex, i) => {
                console.log(`Exercise ${i}: ${ex.exerciseName}, Sets: ${ex.exerciseSetHistories?.length || 0}`);
              });
            }
          });
        } else {
          this.workoutHistory = [];
        }
        
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading workout details:', error);
        this.workoutHistory = workouts; // Fall back to basic workouts
        this.isLoading = false;
        this.showToast('Some workout details could not be loaded');
      }
    });
  }

  /**
   * Toggle displaying workout details
   */
  toggleWorkoutDetails(workoutId: string | undefined) {
    console.log('Toggle workout details called with ID:', workoutId);
    
    if (!workoutId) {
      console.error('Cannot toggle workout details: missing ID');
      // Show the error to the user
      this.showToast('Error: Could not load workout details - missing ID');
      return;
    }
    
    if (this.expandedWorkoutId === workoutId) {
      // If already expanded, collapse it
      console.log('Collapsing workout details');
      this.expandedWorkoutId = null;
      this.expandedWorkoutDetails = null;
      return;
    }
    
    // Expand the selected workout
    console.log('Expanding workout details for ID:', workoutId);
    this.expandedWorkoutId = workoutId;
    this.loadingDetails = true;
    
    // Fetch detailed data for this workout
    this.workoutHistoryService.getWorkoutHistoryDetail(workoutId).subscribe({
      next: (details) => {
        console.log('Workout details loaded successfully:', details);
        this.expandedWorkoutDetails = details;
        this.loadingDetails = false;
      },
      error: (error) => {
        console.error('Error loading workout details:', error);
        this.loadingDetails = false;
        this.expandedWorkoutId = null;
        this.showToast('Failed to load workout details');
      }
    });
  }

  /**
   * Toggle displaying workout details using array index
   */
  toggleWorkoutDetailsByIndex(index: number, workoutId?: string) {
    console.log(`Toggle workout at index ${index}, raw ID:`, workoutId);
    
    // Get the actual workout object
    const workout = this.workoutHistory[index];
    
    console.log("Full workout object:", workout);
    console.log("ID from workout object:", workout.workoutHistoryId);
    
    if (this.expandedWorkoutIndex === index) {
      // If already expanded, collapse it
      this.expandedWorkoutIndex = null;
      this.expandedWorkoutId = null;
      this.expandedWorkoutDetails = null;
      return;
    }
    
    // Expand the selected workout
    this.expandedWorkoutIndex = index;
    this.loadingDetails = true;
    
    // Make sure we have a valid ID
    const actualWorkoutId = workoutId || workout.workoutHistoryId;
    
    if (!actualWorkoutId) {
      console.error('Cannot toggle workout details: missing ID');
      this.loadingDetails = false;
      this.expandedWorkoutDetails = workout;
      return;
    }
    
    this.expandedWorkoutId = actualWorkoutId;
    console.log('Using ID for details request:', actualWorkoutId);
      // Load workout details with exercises and sets
    this.workoutHistoryService.getWorkoutHistoryDetail(actualWorkoutId).subscribe({
      next: (details) => {        
        console.log('Workout details loaded successfully:', details);
        console.log('Exercise histories present:', details.exerciseHistories?.length || 0);
        
        if (details.exerciseHistories) {
          details.exerciseHistories.forEach((ex, i) => {
            console.log(`Exercise ${i}: ${ex.exerciseName}, Sets: ${ex.exerciseSetHistories?.length || 0}`);
          });
          
          // Initialize exercise visibility states for the newly loaded details
          this.initializeExerciseVisibility(details);
          
          // Update the workout in our main array with the detailed version that includes sets
          if (this.workoutHistory[index]) {
            this.workoutHistory[index] = details;
          }
        }
        
        this.expandedWorkoutDetails = details;
        this.loadingDetails = false;
      },
      error: (error) => {
        console.error('Error loading workout details:', error);
        this.loadingDetails = false;
        this.expandedWorkoutId = null;
        
        // On error, use the workout from the list as a fallback
        this.expandedWorkoutDetails = workout;
        this.showToast('Error loading workout details');
      }
    });
  }  /**
   * Initialize exercise visibility map for a workout
   */  private initializeExerciseVisibility(workout: WorkoutHistory): void {
    if (!workout.exerciseHistories) return;
    
    workout.exerciseHistories.forEach(exercise => {
      const typedExercise = exercise as ExerciseHistoryWithUIState;
      const key = this.getExerciseKey(typedExercise);
      
      // Always set the visibility state (don't check if it exists)
      // This ensures we have a clean state when loading/reloading exercises
      this.exerciseVisibilityMap.set(key, false);
      
      // Debug the exercise sets data
      console.log(`Initializing exercise: ${exercise.exerciseName} with ${exercise.exerciseSetHistories?.length || 0} sets`);
    });
  }
    /**
   * Create a unique key for an exercise to track its visibility state
   */
  getExerciseKey(exercise: ExerciseHistoryWithUIState): string {
    return `${exercise.exerciseHistoryId || ''}-${exercise.exerciseName}-${exercise.orderPosition}`;
  }
    /**
   * Toggle visibility of sets for a specific exercise
   */  toggleExerciseSets(exercise: ExerciseHistoryWithUIState): void {
    // Get the current visibility state
    const key = this.getExerciseKey(exercise);
    const currentValue = this.exerciseVisibilityMap.get(key) || false;
    
    // Debug the exercise to see if sets are available
    console.log('Toggle exercise sets:', exercise);
    console.log('Exercise sets available:', exercise.exerciseSetHistories?.length || 0);
    if (exercise.exerciseSetHistories && exercise.exerciseSetHistories.length > 0) {
      console.log('First set:', exercise.exerciseSetHistories[0]);
    } else {
      console.warn('No sets found for this exercise. This might indicate a data loading issue.');
      
      // If no sets are found and we're expanding, try to find the workout and ensure sets are loaded
      if (!currentValue && this.expandedWorkoutIndex !== null) {
        const workout = this.workoutHistory[this.expandedWorkoutIndex];
        console.log('Attempting to ensure exercise sets are loaded from workout:', workout);
      }
    }
    
    // Toggle and update the map
    this.exerciseVisibilityMap.set(key, !currentValue);
  }
  
  /**
   * Helper method for the template to get exercise visibility state
   * This is safe to use in template expressions
   */
  getExerciseVisibility(exercise: ExerciseHistoryWithUIState): boolean {
    const key = this.getExerciseKey(exercise);
    return this.exerciseVisibilityMap.get(key) || false;
  }

  /**
   * Calculate total sets from a workout
   */  calculateTotalSets(workout: WorkoutHistory): number {
    if (!workout.exerciseHistories) return 0;
    
    return workout.exerciseHistories.reduce((total, exercise) => {
      return total + (exercise.exerciseSetHistories?.length || 0);
    }, 0);
  }

  /**
   * Calculate total volume (weight × reps) for a workout
   */  calculateTotalVolume(workout: WorkoutHistory): number {
    let volume = 0;
    if (workout.exerciseHistories) {
      for (const exercise of workout.exerciseHistories) {
        if (exercise.exerciseSetHistories) {
          for (const set of exercise.exerciseSetHistories) {
            if (set.completed) {
              volume += (set.weight || 0) * (set.reps || 0);
            }
          }
        }
      }
    }
    return volume;
  }

  /**
   * Show a toast message
   */
  async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      position: 'bottom',
      color: 'dark'
    });
    await toast.present();
  }

  /**
   * Format duration for display
   */
  formatDuration(isoDuration: string): string {
    const durationSeconds = this.parseDuration(isoDuration);
    
    if (durationSeconds < 60) {
      return `${durationSeconds}s`;
    } else if (durationSeconds < 3600) {
      const minutes = Math.floor(durationSeconds / 60);
      const seconds = durationSeconds % 60;
      return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
    } else {
      const hours = Math.floor(durationSeconds / 3600);
      const minutes = Math.floor((durationSeconds % 3600) / 60);
      if (minutes > 0) {
        return `${hours}h ${minutes}m`;
      } else {
        return `${hours}h`;
      }
    }
  }

  /**
   * Parse an ISO 8601 duration string into seconds
   */
  parseDuration(isoDuration: string): number {
    if (!isoDuration) return 0;
    
    // Simple parsing of PT[hours]H[minutes]M[seconds]S format
    let seconds = 0;
    
    // Hours
    const hoursMatch = isoDuration.match(/(\d+)H/);
    if (hoursMatch) {
      seconds += parseInt(hoursMatch[1]) * 3600;
    }
    
    // Minutes
    const minutesMatch = isoDuration.match(/(\d+)M/);
    if (minutesMatch) {
      seconds += parseInt(minutesMatch[1]) * 60;
    }
    
    // Seconds
    const secondsMatch = isoDuration.match(/(\d+)S/);
    if (secondsMatch) {
      seconds += parseInt(secondsMatch[1]);
    }
    
    return seconds;
  }

  /**
   * Get image URL for an exercise
   */
  getExerciseImage(exerciseName: string): string {
    return this.exerciseImageService.getExerciseImageUrl(exerciseName);
  }

  /**
   * Handle image loading errors
   */
  handleImageError(event: any): void {
    this.exerciseImageService.handleImageError(event);
  }

  /**
   * Get the CSS class for a set type
   */
  getSetTypeClass(type?: string): string {
    if (!type) return 'normal-type';
    
    switch (type) {
      case 'WARMUP':
        return 'warmup-type';
      case 'DROPSET':
        return 'dropset-type';
      case 'FAILURE':
        return 'failure-type';
      default:
        return 'normal-type';
    }
  }

  /**
   * Get display label for a set
   */
  getSetDisplay(set: SetHistory): string {
    // If it's a special set type, return the letter
    if (set.type) {
      switch (set.type) {
        case 'WARMUP':
          return 'W';
        case 'DROPSET':
          return 'D';
        case 'FAILURE':
          return 'F';
      }
    }
    
    // For normal sets, just return the order position
    if (!set.orderPosition) {
      return '1';
    }
    
    // Find which exercise contains this set
    const exercise = this.findExerciseForSet(set);
    if (!exercise || !exercise.exerciseSetHistories) {
      return set.orderPosition.toString();
    }
    
    // Count only normal sets up to this one
    let normalSetCount = 0;
    for (const currentSet of exercise.exerciseSetHistories) {
      // If we've reached this set, return the count
      if (currentSet.setHistoryId === set.setHistoryId) {
        return (normalSetCount + 1).toString();
      }
      
      // Only count normal sets
      if (!currentSet.type || currentSet.type === 'NORMAL') {
        normalSetCount++;
      }
    }
    
    // Fallback
    return set.orderPosition.toString();
  }

  /**
   * Find which exercise contains a given set
   */
  private findExerciseForSet(set: SetHistory): ExerciseHistory | undefined {
    if (!this.workoutHistory) return undefined;
    
    for (const workout of this.workoutHistory) {
      if (!workout.exerciseHistories) continue;
      
      for (const exercise of workout.exerciseHistories) {
        if (!exercise.exerciseSetHistories) continue;
        
        // Check if this set belongs to this exercise by comparing IDs
        if (exercise.exerciseSetHistories.some(s => s.setHistoryId === set.setHistoryId)) {
          return exercise;
        }
      }
    }
    
    return undefined;
  }
}
