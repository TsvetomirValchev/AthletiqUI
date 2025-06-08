import { Component, OnInit } from '@angular/core';
import { App } from '@capacitor/app';
import { Platform, IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { ActiveWorkoutService } from './services/active-workout.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [
    IonicModule,
    RouterModule,
  ]
})
export class AppComponent implements OnInit {
  constructor(
    private platform: Platform,
    private activeWorkoutService: ActiveWorkoutService
  ) {
    this.initializeApp();
  }

  ngOnInit() {
    console.log('App component initializing');
    
    // Load any saved workout session
    this.activeWorkoutService.loadSavedSession().subscribe({
      next: hasSession => {
        console.log('Has active workout session:', hasSession);
        
        // Force refresh of current workout stream
        if (hasSession) {
          const session = this.activeWorkoutService.getCurrentSession();
          if (session && session.workout) {
            console.log('Broadcasting active session to components', session.workout);
            // Force a refresh of the currentSessionSubject to trigger subscribers
            this.activeWorkoutService['currentSessionSubject'].next({...session});
          }
        }
      },
      error: error => {
        console.error('Error loading session:', error);
      }
    });
  }

  initializeApp() {
    this.platform.ready().then(() => {
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          this.activeWorkoutService.saveCurrentSession();
        }
      });
    });
  }
}
