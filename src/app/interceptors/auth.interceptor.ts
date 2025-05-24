import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  constructor(private authService: AuthService) {}  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {

    console.log('Intercepting request to:', request.url);
    
    const publicEndpoints = [
      '/auth/register',
      '/auth/login',
      '/auth/forgot-password',
      '/auth/reset-password'    
    ];
    
    const isPublicEndpoint = publicEndpoints.some(endpoint => 
      request.url.includes(endpoint)
    );
    
    const token = this.authService.getToken();
    console.log('Token exists:', !!token, 'Is public endpoint:', isPublicEndpoint);
    
    if (token && !isPublicEndpoint) {
      console.log('Adding auth token to request');
      const authReq = request.clone({
        setHeaders: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }      });
      return next.handle(authReq);
    } else {
      console.log('No token available or public endpoint - sending request without auth');
    }
    
    return next.handle(request).pipe(
      tap(event => {
        console.log('Response received for:', request.url);
      }),
      catchError((error: HttpErrorResponse) => {
        console.error('HTTP error occurred:', error);
        console.error('Error details:', {
          status: error.status,
          statusText: error.statusText,
          url: error.url,
          message: error.message
        });
        return throwError(() => error);
      })
    );
  }
}
