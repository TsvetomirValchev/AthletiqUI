import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { RegisterResponse } from '../../models/register-response.model';
import { AlertController, ToastController } from '@ionic/angular';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: false
})
export class RegisterPage implements OnInit {
  registerForm: FormGroup;
  isLoading = false;
  showValidationMessages = false;

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private alertController: AlertController,
    private toastController: ToastController
  ) {
    this.registerForm = this.formBuilder.group({
      username: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
    });
  }

  ngOnInit() {}

  isFieldInvalid(fieldName: string): boolean {
    const field = this.registerForm.get(fieldName);
    return field ? field.invalid && this.showValidationMessages : false;
  }

  onRegister() {
    this.showValidationMessages = true;
    
    if (this.registerForm.valid) {
      this.isLoading = true;
      const { username, email, password } = this.registerForm.value;
      
      this.authService.register({ username, email, password }).subscribe({
        next: (response: RegisterResponse) => {
          this.isLoading = false;
          console.log('Registration successful:', response);
          
          this.presentToast('Registration successful! Please log in.', 'success');
          this.router.navigate(['/login']);
        },
        error: (error: HttpErrorResponse) => {
          this.isLoading = false;
          console.error('Registration failed:', error);
          
          if (error.status === 0) {
            this.presentAlert('Connection Error', 
              'Cannot connect to the server. Please check your internet connection or try again later.');
            return;
          }
          
          if (error.status === 400 && error.error) {
            this.handleValidationErrors(error.error);
          } else if (error.status === 409) {
            this.presentToast('Username or email is already taken. Please try another.', 'danger');
          } else {
            this.presentToast('Registration failed. Please try again.', 'danger');
          }
        }
      });
    } else {
      console.log('Form is invalid');
      this.showFormValidationErrors();
    }
  }

  handleValidationErrors(errorResponse: any) {
    if (typeof errorResponse === 'object') {
      const fields = Object.keys(errorResponse);
      
      fields.forEach(field => {
        const control = this.registerForm.get(field);
        if (control) {
          const errorMsg = errorResponse[field];
          control.setErrors({ serverError: errorMsg });
          
          this.presentToast(`${this.capitalizeField(field)}: ${errorMsg}`, 'danger');
        }
      });
      
      if (fields.length === 0) {
        this.presentToast('Invalid registration data. Please check your information.', 'danger');
      }
    } else if (typeof errorResponse === 'string') {
      this.presentToast(errorResponse, 'danger');
    } else {
      // Generic error fallback
      this.presentToast('Registration failed. Please check your information and try again.', 'danger');
    }
  }
  
  showFormValidationErrors() {
    const errors: string[] = [];
    
    Object.keys(this.registerForm.controls).forEach(key => {
      const control = this.registerForm.get(key);
      if (control?.invalid) {
        if (control.errors?.['required']) {
          errors.push(`${this.capitalizeField(key)} is required`);
        } else if (key === 'email' && control.errors?.['email']) {
          errors.push('Please enter a valid email address');
        } else if (key === 'password' && control.errors?.['minlength']) {
          errors.push('Password must be at least 8 characters long');
        }
      }
    });
    
    if (errors.length > 0) {
      this.presentToast(errors.join(','), 'warning');
    }
  }
  
  capitalizeField(field: string): string {
    return field.charAt(0).toUpperCase() + field.slice(1);
  }
  
  markFormGroupTouched(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }
  
  async presentToast(message: string, color: 'success' | 'danger' | 'warning' = 'danger') {
    const toast = await this.toastController.create({
      message: message,
      duration: 3000,
      position: 'bottom',
      color: color,
      cssClass: 'register-toast',
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
}