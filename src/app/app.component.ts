import { Component } from '@angular/core';
import { Platform } from '@ionic/angular';
import { AuthService } from './services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false
})
export class AppComponent {
  constructor(
    private platform: Platform,
    private authService: AuthService,
    private router: Router
  ) {
    this.initializeApp();
  }

  initializeApp() {
    this.platform.ready().then(() => {
      // Only check auth on initial app load, not for every navigation
      const currentUrl = window.location.pathname;
      console.log('Current URL:', currentUrl);
      
      // Don't redirect if user is explicitly trying to access login or register
      if (currentUrl.includes('/login') || currentUrl.includes('/register')) {
        console.log('User accessing auth pages directly, not redirecting');
        return;
      }
      
      // Only redirect from the root path or protected routes
      const tokenStatus = this.authService.checkTokenStatus();
      if (tokenStatus.exists && tokenStatus.valid) {
        this.router.navigate(['/tabs/tab1']);
      } else if (tokenStatus.exists && !tokenStatus.valid) {
        this.router.navigate(['/login']);
      } else {
        this.router.navigate(['/register']);
      }
    });
  }
}
