import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { WorkoutService } from '../../services/workout.service';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, RouterLink, DatePipe]
})
export class ProfilePage implements OnInit {
  userData: any = null;
  isLoading = false;
  workoutCount = 0;
  totalHours = 0;
  daysActive = 0;
  
  achievements = [
    {
      name: 'First Workout',
      description: 'Complete your first workout',
      icon: 'trophy-outline',
      unlocked: false
    },
    {
      name: 'Consistency',
      description: 'Work out 3 days in a row',
      icon: 'calendar-outline',
      unlocked: false
    },
    {
      name: 'Heavy Lifter',
      description: 'Lift more than 100kg in any exercise',
      icon: 'barbell-outline',
      unlocked: false
    },
    {
      name: 'Balanced Athlete',
      description: 'Train all major muscle groups',
      icon: 'body-outline',
      unlocked: false
    }
  ];
  
  personalRecords = [
    {
      exercise: 'Bench Press',
      weight: 100,
      reps: 5,
      date: new Date()
    },
    {
      exercise: 'Squat',
      weight: 120,
      reps: 8,
      date: new Date()
    },
    {
      exercise: 'Deadlift',
      weight: 150,
      reps: 3,
      date: new Date()
    }
  ];

  constructor(
    private authService: AuthService,
    private workoutService: WorkoutService
  ) { }

  ngOnInit() {
    this.loadUserData();
    this.loadUserStats();
  }

  async loadUserData() {
    this.isLoading = true;
    try {
      this.userData = await this.authService.getUserData();
    } catch (error) {
      console.error('Error loading user data', error);
    }
    this.isLoading = false;
  }

  loadUserStats() {

    this.workoutCount = 42;
    this.totalHours = 67;
    this.daysActive = 30;
    
    // Update achievements based on stats
    if (this.workoutCount > 0) {
      this.achievements[0].unlocked = true;
    }
    
    if (this.daysActive >= 3) {
      this.achievements[1].unlocked = true;
    }
    
  }
}
