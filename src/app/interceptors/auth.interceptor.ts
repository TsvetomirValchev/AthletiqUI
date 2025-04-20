import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  constructor(private authService: AuthService) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {

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
      const authReq = request.clone({
        setHeaders: {
          'Authorization': `Bearer ${token}`
        }
      });
      return next.handle(authReq);
    }
    
    return next.handle(request);
  }
}
