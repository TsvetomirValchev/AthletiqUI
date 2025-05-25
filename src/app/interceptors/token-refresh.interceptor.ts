import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError, BehaviorSubject, of } from 'rxjs';
import { catchError, switchMap, filter, take, finalize } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable()
export class TokenRefreshInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  constructor(private authService: AuthService) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Skip token refreshing for auth endpoints to avoid loops
    if (request.url.includes('/auth/')) {
      return next.handle(request);
    }

    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          return this.handle401Error(request, next);
        }
        return throwError(() => error);
      })
    );
  }

  private handle401Error(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      return this.authService.validateToken().pipe(
        switchMap(success => {
          this.isRefreshing = false;
          this.refreshTokenSubject.next(success);
          
          if (success) {
            // Clone the request with the new token
            const token = this.authService.getToken();
            if (token) {
              request = this.addToken(request, token);
            }
            return next.handle(request);
          }
          
          // If token refresh failed, redirect to login
          this.authService.logout().subscribe(() => {
            // Navigate to login page (handle in app component)
            window.location.href = '/login';
          });
          
          return throwError(() => new Error('Session expired'));
        }),
        catchError(error => {
          this.isRefreshing = false;
          this.authService.logout().subscribe();
          return throwError(() => error);
        }),
        finalize(() => {
          this.isRefreshing = false;
        })
      );
    } else {
      return this.refreshTokenSubject.pipe(
        filter(token => token !== null),
        take(1),
        switchMap(() => {
          const newToken = this.authService.getToken();
          if (newToken) {
            request = this.addToken(request, newToken);
          }
          return next.handle(request);
        })
      );
    }
  }

  private addToken(request: HttpRequest<any>, token: string): HttpRequest<any> {
    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }
}
