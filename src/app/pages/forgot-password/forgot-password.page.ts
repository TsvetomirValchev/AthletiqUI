import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { AlertController } from '@ionic/angular';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
  standalone: false
})
export class ForgotPasswordPage {
  forgotPasswordForm: FormGroup;
  isSubmitting = false;

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private alertController: AlertController
  ) {
    this.forgotPasswordForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  onSubmit() {
    if (this.forgotPasswordForm.invalid) {
      return;
    }

    const email = this.forgotPasswordForm.value.email;
    this.isSubmitting = true;

    this.authService.requestPasswordReset(email).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.showSuccessAlert();
      },
      error: (error) => {
        this.isSubmitting = false;
        // Always show success message even on error for security
        // (prevents email enumeration attacks)
        this.showSuccessAlert();
        console.error('Error:', error);
      }
    });
  }

  async showSuccessAlert() {
    const alert = await this.alertController.create({
      header: 'Email Sent',
      message: 'Email sent.',
      buttons: ['OK']
    });
    await alert.present();
  }
}
