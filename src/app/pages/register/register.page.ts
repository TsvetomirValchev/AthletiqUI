import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { RegisterResponse } from '../../models/register-response.model';


@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: false
})
export class RegisterPage implements OnInit {
  registerForm: FormGroup;

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.registerForm = this.formBuilder.group({
      username: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
    console.log('Register form initialized:', this.registerForm);
  }

  ngOnInit() {
    console.log('RegisterPage initialized');
  }

  onRegister() {
    console.log('Register button clicked');
    console.log('Form valid?', this.registerForm.valid);
    console.log('Form values:', this.registerForm.value);
    
    if (this.registerForm.valid) {
      const { username, email, password } = this.registerForm.value;
      console.log('Attempting to register user:', { username, email });
      
      this.authService.register({ username, email, password }).subscribe({
        next: (response: RegisterResponse) => {
          console.log('Registration successful:', response);
          this.router.navigate(['/login']);
        },
        error: (error: HttpErrorResponse) => {
          console.error('Registration failed:', error);
        }
      });
    } else {
      console.log('Form validation errors:', this.registerForm.errors);
      
      Object.keys(this.registerForm.controls).forEach(key => {
        const control = this.registerForm.get(key);
        if (control?.invalid) {
          console.log(`Field ${key} has errors:`, control.errors);
        }
      });
    }
  }
}