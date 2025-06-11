import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false
})
export class LoginPage implements OnInit {
  loginForm: FormGroup;
  isLoading = false;

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private alertController: AlertController,
    private toastController: ToastController
  ) {
    this.loginForm = this.formBuilder.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', [Validators.required, Validators.minLength(8)]],
    });
  }

  ngOnInit() {}

  async onLogin() {
    if (this.loginForm.valid) {
      this.isLoading = true;
      const { username, password } = this.loginForm.value;
      
      this.authService.login(username, password).subscribe({
        next: (response) => {
          this.isLoading = false;
          const token = response;
          this.authService.saveToken(token);
          console.log('Login successful:', token);
          this.router.navigate(['/tabs/profile']);
        },
        error: async (error) => {
          this.isLoading = false;
          console.error('Login failed:', error);
          
          let errorMessage = 'Login failed.';
          
          if (error.status === 0) {
            errorMessage = 'Cannot connect to the server. Please check your internet connection or try again later.';
            this.presentAlert('Connection Error', errorMessage);
          } else if (error.status === 401) {
            errorMessage = 'Invalid username or password.';
            this.presentToast(errorMessage, 'danger');
            this.loginForm.get('password')?.reset();
            this.loginForm.get('password')?.setErrors({ invalidCredentials: true });
          } else {
            this.presentToast(errorMessage, 'danger');
          }
        }
      });
    } else {
      console.log('Form is invalid');
      this.markFormGroupTouched(this.loginForm);
      this.presentToast('Please enter valid credentials', 'warning');
    }
  }
  
  async presentToast(message: string, color: 'danger' | 'warning' = 'danger') {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,
      position: 'bottom',
      color: color,
      cssClass: 'login-toast',
      buttons: [
        {
          icon: 'close',
          role: 'cancel'
        }
      ]
    });
    
    await toast.present();
  }
  
  async presentAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header: header,
      message: message,
      buttons: ['OK']
    });
    
    await alert.present();
  }
  
  markFormGroupTouched(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }
}
