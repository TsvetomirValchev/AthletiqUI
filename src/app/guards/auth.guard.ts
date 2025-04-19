import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { firstValueFrom } from 'rxjs';

export const authGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  // Convert Observable to Promise
  const tokenStatus = await firstValueFrom(authService.checkTokenStatus());
  
  console.log('Auth Guard Check:', { 
    url: state.url, 
    tokenExists: tokenStatus.exists,
    tokenValid: tokenStatus.valid
  });
  
  if (tokenStatus.exists && tokenStatus.valid) {
    return true; 
  }
  
  if (tokenStatus.exists && !tokenStatus.valid) {
    return router.createUrlTree(['/login']);
  }
  
  return router.createUrlTree(['/register']);
};