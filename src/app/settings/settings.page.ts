import { Component, OnInit } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class SettingsPage implements OnInit {
  darkMode = false;
  
  constructor(
    private alertController: AlertController,
    private router: Router,
    private authService: AuthService
  ) { }

  ngOnInit() {
    // Check if dark mode is enabled
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    this.darkMode = prefersDark.matches;
    this.toggleDarkTheme(this.darkMode);

    // Listen for changes to dark mode preference
    prefersDark.addEventListener('change', (e) => {
      this.darkMode = e.matches;
    });
  }

  toggleDarkTheme(shouldAdd: boolean) {
    document.body.classList.toggle('dark', shouldAdd);
  }

  async resetPassword() {
    const alert = await this.alertController.create({
      header: 'Reset Password',
      message: 'A password reset link will be sent to your email address.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Send Link',
          handler: () => {
            // Logic to request password reset
          }
        }
      ]
    });
    
    await alert.present();
  }
  
  async confirmLogout() {
    const alert = await this.alertController.create({
      header: 'Confirm Logout',
      message: 'Are you sure you want to logout?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Logout',
          handler: () => {
            this.logout();
          }
        }
      ]
    });
    
    await alert.present();
  }

  logout() {
    this.authService.logout().subscribe({
      next: () => {
        this.router.navigateByUrl('/login');
      },
      error: (error: any) => {
        console.error('Error during logout:', error);
        this.router.navigateByUrl('/login');
      }
    });
  }
  
  async confirmDeleteAccount() {
    const alert = await this.alertController.create({
      header: 'Delete Account',
      message: 'Are you sure you want to delete your account? This action cannot be undone.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Delete',
          cssClass: 'danger',
          handler: () => {
            // Account deletion logic
          }
        }
      ]
    });
    
    await alert.present();
  }
}
