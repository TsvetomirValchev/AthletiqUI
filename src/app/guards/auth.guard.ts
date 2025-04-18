import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const tokenStatus = authService.checkTokenStatus();
  
  console.log('Auth Guard Check:', { 
    url: state.url, 
    tokenExists: tokenStatus.exists,
    tokenValid: tokenStatus.valid
  });
  
  // For protected routes (tabs, account pages, etc)
  if (tokenStatus.exists && tokenStatus.valid) {
    return true; // Allow access if token is valid
  }
  
  // For invalid or expired token, go to login
  if (tokenStatus.exists && !tokenStatus.valid) {
    return router.createUrlTree(['/login']);
  }
  
  // For new users (no token), go to register
  return router.createUrlTree(['/register']);
};