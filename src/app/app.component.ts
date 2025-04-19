import { Component } from '@angular/core';
import { Platform } from '@ionic/angular';
import { AuthService } from './services/auth.service';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

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

  async initializeApp() {
    this.platform.ready().then(async () => {
      // Just log that app is initialized - redirection logic disabled for debugging
      console.log('App initialized - redirection logic disabled for debugging');
      
      // Comment out all redirection logic
      /*
      const tokenStatus = await firstValueFrom(this.authService.checkTokenStatus());
      
      console.log('Token status on app init:', tokenStatus);

      const currentUrl = this.router.url;
      console.log('Current URL:', currentUrl);
      
      // Don't redirect if already on login or register page
      if (currentUrl.includes('/login') || 
        currentUrl.includes('/register') || 
        currentUrl.includes('/reset-password') ||  
        currentUrl.includes('/forgot-password')) { 
        console.log('User accessing auth pages directly, not redirecting');
        return;
      }
      
      if (tokenStatus.exists && tokenStatus.valid) {
        this.router.navigate(['/tabs/tab1']);
      } else {
        // Always go to login by default instead of register
        this.router.navigate(['/login']);
      }
      */
    });
  }
}
