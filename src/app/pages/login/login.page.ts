import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';

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
    private alertController: AlertController
  ) {
    this.loginForm = this.formBuilder.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(6)]],
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
          
          // Show different messages based on error type
          let errorMessage = 'Login failed.';
          
          if (error.status === 0) {
            errorMessage = 'Cannot connect to the server. Please check your internet connection or try again later.';
          } else if (error.status === 401) {
            errorMessage = 'Invalid username or password.';
          } else if (error.status === 403) {
            errorMessage = 'Account is locked or disabled.';
          }
          
          const alert = await this.alertController.create({
            header: 'Login Error',
            message: errorMessage,
            buttons: ['OK']
          });
          
          await alert.present();
        }
      });
    } else {
      console.log('Form is invalid');
      // Show validation errors
      this.markFormGroupTouched(this.loginForm);
    }
  }
  
  // Helper to show validation errors
  markFormGroupTouched(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }
}
