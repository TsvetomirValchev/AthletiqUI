import { Component, OnInit } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
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
  appVersion = '1.0.0';
  userEmail = '';
  username = '';
  
  constructor(
    private alertController: AlertController,
    private router: Router,
    private authService: AuthService
  ) { }

  ngOnInit() {
 
  }

  ionViewWillEnter() {
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.userEmail = user.email || '';
        this.username = user.username || '';
      }
    });
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
            this.authService.deleteAccount().subscribe({
              next: () => {
                this.router.navigate(['/login']);
              },
              error: async (error) => {
                console.error('Failed to delete account:', error);
                
                const errorAlert = await this.alertController.create({
                  header: 'Error',
                  message: 'Failed to delete account. Please try again later.',
                  buttons: ['OK']
                });
                
                await errorAlert.present();
              }
            });
          }
        }
      ]
    });
    
    await alert.present();
  }
  
  async openAbout() {
    const alert = await this.alertController.create({
      header: 'About Athletiq',
      message: 'Athletiq is your personal workout companion. Track your progress, plan your workouts, and achieve your fitness goals.<br><br>© 2025 Athletiq',
      buttons: ['Close']
    });
    
    await alert.present();
  }

  
  async showInfoModal(title: string, content: string) {
    const alert = await this.alertController.create({
      header: title,
      message: content,
      buttons: ['Close']
    });
    
    await alert.present();
  }
}
