import { Component, OnInit, isDevMode, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProfileService } from '../../services/profile.service';
import { WorkoutHistoryService } from '../../services/workout-history.service';
import { WorkoutHistory } from '../../models/workout-history.model';
import { ExerciseHistory } from '../../models/exercise-history.model';
import { AuthService } from '../../services/auth.service';
import { switchMap } from 'rxjs/operators';
import { of, forkJoin, Subscription, BehaviorSubject } from 'rxjs';
import { ToastController } from '@ionic/angular';
import { ExerciseImagePipe, } from '../../pipes/exercise-image.pipe';

interface ExerciseHistoryWithUIState extends ExerciseHistory {
  showSets?: boolean;
}

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    RouterLink,
    ExerciseImagePipe,
  ],
  providers: [ExerciseImagePipe]
})
export class ProfilePage implements OnInit, OnDestroy {
  username: string = '';
  totalWorkouts: number = 0;
  hoursActive: number = 0;  daysActive: number = 0;
  userId: string | null = null;
  public showDebug = true;
  
  workoutHistory: WorkoutHistory[] = [];
  expandedWorkoutId: string | null = null;
  expandedWorkoutDetails: WorkoutHistory | null = null;
  isLoading: boolean = true;
  loadingDetails: boolean = false;
  expandedWorkoutIndex: number | null = null;

  exerciseVisibilityMap: Map<string, boolean> = new Map();

  private subscriptions: Subscription = new Subscription();
  private refreshTrigger = new BehaviorSubject<boolean>(true);
  
  constructor(
    private profileService: ProfileService,
    private workoutHistoryService: WorkoutHistoryService,
    private authService: AuthService,
    private toastController: ToastController,
    private changeDetector: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadUserProfile();
    
    this.subscriptions.add(
      this.workoutHistoryService.historyRefresh$.subscribe(() => {
        console.log('History refresh event received in profile page');
        this.loadWorkoutHistory();
      })
    );
  }

  ionViewWillEnter() {
    this.loadUserProfile();
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  loadUserProfile() {
    this.authService.currentUser$.pipe(
      switchMap(user => {
        if (user && user.userId) {
          this.userId = user.userId;
          this.username = user.username || 'Athlete';
          
          return this.profileService.getWorkoutStats();
        } else {
          return this.authService.validateToken().pipe(
            switchMap(valid => {
              if (valid) {
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
          this.totalWorkouts = stats.totalWorkouts;
          this.daysActive = stats.uniqueDays;
          
          if (stats.hoursActive !== undefined) {
            this.hoursActive = stats.hoursActive;
          } else {
            this.hoursActive = 0;
          }
          
          console.log('Workout stats loaded:', stats);
        }
        
        this.loadWorkoutHistory();
      },
      error: (error) => {
        console.error('Error loading workout stats:', error);
        this.showToast('Failed to load workout statistics');
        
        this.loadWorkoutHistory();
      }
    });
  }

  loadWorkoutHistory() {
    this.isLoading = true;
    console.log('Loading workout history...');
    
    this.workoutHistoryService.getWorkoutHistory().subscribe({
      next: (history) => {
        console.log('Received workout history:', history);
        
        if (history && history.length > 0) {
          this.totalWorkouts = history.length;
          
          const missingIds = history.filter(w => !w.workoutHistoryId).length;
          if (missingIds > 0) {
            console.warn(`Warning: ${missingIds} workout(s) have missing IDs`);
          }
          
          this.loadAllWorkoutDetails(history);
        } else {
          this.workoutHistory = [];
          this.totalWorkouts = 0;
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

  loadAllWorkoutDetails(workouts: WorkoutHistory[]) {
    if (!workouts || workouts.length === 0) {
      this.workoutHistory = [];
      this.isLoading = false;
      return;
    }
    
    const detailRequests = workouts.map(workout => {
      if (!workout.workoutHistoryId) {
        return of(workout);
      }
      
      return this.workoutHistoryService.getWorkoutHistoryDetail(workout.workoutHistoryId);
    });
    
    forkJoin(detailRequests).subscribe({
      next: (detailedWorkouts) => {
        console.log('All workout details loaded:', detailedWorkouts);
        
        if (detailedWorkouts && detailedWorkouts.length > 0) {
          this.workoutHistory = [...detailedWorkouts];
          this.workoutHistory.forEach((workout) => {
            this.initializeExerciseVisibility(workout);
          });
        } else {
          this.workoutHistory = [];
        }
        
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading workout details:', error);
        this.workoutHistory = workouts;
        this.isLoading = false;
        this.showToast('Some workout details could not be loaded');
      }
    });
  }

  toggleWorkoutDetails(workoutId: string | undefined) {
    console.log('Toggle workout details called with ID:', workoutId);
    
    if (!workoutId) {
      console.error('Cannot toggle workout details: missing ID');
      this.showToast('Error: Could not load workout details - missing ID');
      return;
    }
    
    if (this.expandedWorkoutId === workoutId) {
      console.log('Collapsing workout details');
      this.expandedWorkoutId = null;
      this.expandedWorkoutDetails = null;
      return;
    }
    
    this.expandedWorkoutId = workoutId;
    this.loadingDetails = true;
    
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

  toggleWorkoutDetailsByIndex(index: number, workoutId?: string) {
    
    const workout = this.workoutHistory[index];
  
    
    if (this.expandedWorkoutIndex === index) {
      this.expandedWorkoutIndex = null;
      this.expandedWorkoutId = null;
      this.expandedWorkoutDetails = null;
      return;
    }
    
    this.expandedWorkoutIndex = index;
    this.loadingDetails = true;
    
    const actualWorkoutId = workoutId || workout.workoutHistoryId;
    
    if (!actualWorkoutId) {
      console.error('Cannot toggle workout details: missing ID');
      this.loadingDetails = false;
      this.expandedWorkoutDetails = workout;
      return;
    }
    
    this.expandedWorkoutId = actualWorkoutId;
    this.workoutHistoryService.getWorkoutHistoryDetail(actualWorkoutId).subscribe({
      next: (details) => {        
        console.log('Workout details loaded successfully:', details);
        
        this.ensureSortedSets(details);
        
        if (details.exerciseHistories) {
          this.initializeExerciseVisibility(details);
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
        
        this.expandedWorkoutDetails = workout;
        this.showToast('Error loading workout details');
      }
    });
  }
  
  private initializeExerciseVisibility(workout: WorkoutHistory): void {
    if (!workout.exerciseHistories) return;
    
    workout.exerciseHistories.forEach(exercise => {
      const typedExercise = exercise as ExerciseHistoryWithUIState;
      const key = this.getExerciseKey(typedExercise);
      
      this.exerciseVisibilityMap.set(key, false);
    });
  }
  
  getExerciseKey(exercise: ExerciseHistoryWithUIState): string {
    return `${exercise.exerciseHistoryId || ''}-${exercise.exerciseName}-${exercise.orderPosition}`;
  }

  toggleExerciseSets(exercise: ExerciseHistoryWithUIState): void {
    const key = this.getExerciseKey(exercise);
    const currentValue = this.exerciseVisibilityMap.get(key) || false;
    
    this.exerciseVisibilityMap.set(key, !currentValue);
    
    if (!currentValue) {
      setTimeout(() => {
        this.refreshTrigger.next(true);
        this.changeDetector.detectChanges();
      }, 50);
    }
  }
  
  getExerciseVisibility(exercise: ExerciseHistoryWithUIState): boolean {
    const key = this.getExerciseKey(exercise);
    return this.exerciseVisibilityMap.get(key) || false;
  }

  calculateTotalSets(workout: WorkoutHistory): number {
    if (!workout.exerciseHistories) return 0;
    
    return workout.exerciseHistories.reduce((total, exercise) => {
      return total + (exercise.exerciseSetHistories?.length || 0);
    }, 0);
  }

  calculateTotalVolume(workout: WorkoutHistory): number {
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

  async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      position: 'bottom',
      color: 'dark'
    });
    await toast.present();
  }

  private ensureSortedSets(workout: WorkoutHistory): void {
  if (!workout.exerciseHistories) return;
  
  let changed = false;
  
  workout.exerciseHistories.forEach(exercise => {
    if (exercise.exerciseSetHistories && exercise.exerciseSetHistories.length > 0) {
      const sortedSets = [...exercise.exerciseSetHistories].sort(
        (a, b) => (a.orderPosition || 0) - (b.orderPosition || 0)
      );
      
      exercise.exerciseSetHistories = sortedSets;
      changed = true;
      
      console.log(`Sorted sets for ${exercise.exerciseName}:`);
      sortedSets.forEach((s, i) => {
        console.log(`${i}: ID=${s.setHistoryId}, Type=${s.type || 'NORMAL'}, Order=${s.orderPosition}`);
      });
    }
  });
  
  if (changed) {
      setTimeout(() => {
        console.log('Forcing change detection after sort');
        this.changeDetector.detectChanges();
      }, 0);
    }
  }

  // Add missing methods
  formatDuration(duration: string | undefined): string {
    if (!duration) return '';
    
    // Clean up PT format to display minutes and seconds
    return duration
      .replace('PT', '')
      .replace('H', 'h ')
      .replace('M', 'm ')
      .replace('S', 's');
  }
  
  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement) {
      imgElement.src = 'assets/logo/athletiq-logo.jpeg';
    }
  }
  
  getSetTypeClass(type: string | undefined): string {
    if (!type) return '';
    
    switch(type) {
      case 'WARMUP': return 'warmup-set';
      case 'DROPSET': return 'dropset-set';
      case 'FAILURE': return 'failure-set';
      default: return '';
    }
  }
  
  getSetDisplay(set: any, exercise: any): string {
    if (!set || !set.type) return '1';
    
    if (set.type === 'NORMAL') {
      // Count normal sets
      const normalSets = (exercise.exerciseSetHistories || [])
        .filter((s: any) => s.type === 'NORMAL' && s.orderPosition <= set.orderPosition)
        .length;
      return normalSets.toString();
    }
    
    switch(set.type) {
      case 'WARMUP': return 'W';
      case 'DROPSET': return 'D';
      case 'FAILURE': return 'F';
      default: return '1';
    }
  }
  
}
