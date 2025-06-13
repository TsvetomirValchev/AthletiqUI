import { Component, OnInit } from '@angular/core';
import { App } from '@capacitor/app';
import { Platform, IonicModule } from '@ionic/angular';
import { RouterModule, Router } from '@angular/router';
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
    private activeWorkoutService: ActiveWorkoutService,
    private router: Router
  ) {
    this.initializeApp();
  }

  ngOnInit() {
    console.log('App component initializing');
    
    this.activeWorkoutService.loadSavedSession().subscribe({
      next: hasSession => {
        console.log('Has active workout session:', hasSession);
        
        if (hasSession) {
          const session = this.activeWorkoutService.getCurrentSession();
          if (session && session.workout) {
            console.log('Broadcasting active session to components', session.workout);
            this.activeWorkoutService['currentSessionSubject'].next({...session});
          }
        }
      },
      error: error => {
        console.error('Error loading session:', error);
      }
    });

    App.addListener('appUrlOpen', (data: { url: string }) => {
      const url = new URL(data.url);
      
      if (url.pathname === '/reset-password') {
        const token = url.searchParams.get('token');
        this.router.navigate(['/reset-password'], { queryParams: { token } });
      }
    });
  }

  initializeApp() {
    this.platform.ready().then(() => {
      if ((window as any).AndroidWebView) {
        (window as any).AndroidWebView.setWebContentsDebuggingEnabled(true);
      }

      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          this.activeWorkoutService.saveCurrentSession();
        }
      });
    });
  }
}
