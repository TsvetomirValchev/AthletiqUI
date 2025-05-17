import { Injectable } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { Observable } from 'rxjs';

export interface ConfirmationOptions {
  header: string;
  message: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DialogService {
  constructor(private alertController: AlertController) {}
  
  /**
   * Show a confirmation dialog
   * @returns Observable that resolves to true if confirmed, false if cancelled
   */
  showConfirmation(options: ConfirmationOptions): Observable<boolean> {
    return new Observable<boolean>(observer => {
      this.alertController
        .create({
          header: options.header,
          message: options.message,
          buttons: [
            {
              text: options.cancelButtonText || 'Cancel',
              role: 'cancel',
              handler: () => {
                observer.next(false);
                observer.complete();
              }
            },
            {
              text: options.confirmButtonText || 'Confirm',
              handler: () => {
                observer.next(true);
                observer.complete();
              }
            }
          ]
        })
        .then(alert => {
          alert.present();
        });
    });
  }
}
