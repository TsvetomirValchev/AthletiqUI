import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, of, BehaviorSubject, from } from 'rxjs';
import { map, catchError, tap, switchMap } from 'rxjs/operators';
import { StorageService } from './storage.service';
import { Platform } from '@ionic/angular';
import { DecodedToken } from '../models/token.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/auth`;
  private currentUserSubject = new BehaviorSubject<any>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  
  private accessToken: string | null = null;

  constructor(
    private http: HttpClient,
    private storage: StorageService,
    private platform: Platform
  ) {
    this.checkAuthentication();
  }

  private async checkAuthentication(): Promise<void> {
    if (this.storage.isMobile()) {
      await this.checkMobileAuth();
    } else {
      await this.checkWebAuth();
    }
  }

  private async checkMobileAuth(): Promise<void> {
    const token = await this.storage.getItem('mobileAuthToken');
    const userDataStr = await this.storage.getItem('userData');
    
    if (token) {
      this.accessToken = token;
      
      try {
        if (userDataStr) {
          const userData = JSON.parse(userDataStr);
          this.currentUserSubject.next(userData);
        }
        
        this.validateToken().subscribe();
      } catch (e) {
        console.error('Error parsing stored data', e);
      }
    }
  }

  private async checkWebAuth(): Promise<void> {
    const token = await this.storage.getItem('webAuthToken');
    if (token) {
      try {
        const payload = token.split('.')[1];
        const decodedPayload = JSON.parse(atob(payload));
        const expired = decodedPayload.exp * 1000 < Date.now();
        
        if (!expired) {
          this.accessToken = token;
          const userDataStr = await this.storage.getItem('userData');
          if (userDataStr) {
            const userData = JSON.parse(userDataStr);
            this.currentUserSubject.next(userData);
          }
        }
      } catch (e) {
        console.error('Error checking stored token', e);
      }
    }
  }

  checkTokenStatus(): Observable<{ exists: boolean, valid: boolean }> {
    if (this.accessToken) {
      return of({ exists: true, valid: true });
    }
    
    const storageKey = this.storage.isMobile() ? 'mobileAuthToken' : 'webAuthToken';
    return from(this.storage.getItem(storageKey)).pipe(
      map(token => {
        if (!token) {
          return { exists: false, valid: false };
        }
        
        try {
          const payload = token.split('.')[1];
          const decodedPayload = JSON.parse(atob(payload));
          const expired = decodedPayload.exp * 1000 < Date.now();
          
          if (this.storage.isMobile() && expired) {
            return { exists: true, valid: true };
          }
          
          return { exists: true, valid: !expired };
        } catch (e) {
          return { exists: true, valid: false };
        }
      })
    );
  }

  isAuthenticated(): Observable<boolean> {
    if (this.accessToken) {
      return of(true);
    }
    
    const storageKey = this.storage.isMobile() ? 'mobileAuthToken' : 'webAuthToken';
    return from(this.storage.getItem(storageKey)).pipe(
      map(token => !!token)
    );
  }

  validateToken(): Observable<boolean> {
    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'X-Client-Type': this.storage.isMobile() ? 'mobile' : 'web'
    };

    return this.http.get<any>(`${this.apiUrl}/validate-token`, { headers })
      .pipe(
        map(response => {
          // Refresh the token on success
          if (response && response.token) {
            this.accessToken = response.token;
            this.saveTokenBasedOnPlatform(response.token);
            this.saveUserData(response.user || { username: response.username });
          }
          return true;
        }),
        catchError(error => {
          if (!this.storage.isMobile()) {
            this.logout();
          }
          return of(false);
        })
      );
  }

  private decodeToken(token: string): DecodedToken | null {
    try {
      const payload = token.split('.')[1];
      const decodedPayload = JSON.parse(atob(payload));
      return decodedPayload;
    } catch (e) {
      console.error('Error decoding token', e);
      return null;
    }
  }

  login(usernameOrEmail: string, password: string): Observable<any> {
    const headers = {
      'X-Client-Type': this.storage.isMobile() ? 'mobile' : 'web'
    };
    return this.http.post(`${this.apiUrl}/login`, { 
      usernameOrEmail: usernameOrEmail,
      password 
    }, { headers, responseType: "text" })
    .pipe(
      tap(token => {
        this.accessToken = token;
        
        const decodedToken = this.decodeToken(token);
        const userId = decodedToken?.userId || decodedToken?.sub;
        
        this.saveTokenBasedOnPlatform(token);
        
        const userData = { 
          username: usernameOrEmail,
          userId: userId
        };
        this.saveUserData(userData);
        this.currentUserSubject.next(userData);
      })
    );
  }

  private async saveTokenBasedOnPlatform(token: string): Promise<void> {
    const storageKey = this.storage.isMobile() ? 'mobileAuthToken' : 'webAuthToken';
    await this.storage.setItem(storageKey, token);
  }

  async saveToken(token: string): Promise<void> {
    return this.saveTokenBasedOnPlatform(token);
  }

  register(user: { username: string; email: string; password: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/register`, user);
  }

  getToken(): string | null {
    return this.accessToken;
  }

  async saveUserData(userData: any): Promise<void> {
    await this.storage.setItem('userData', JSON.stringify(userData));
  }

  async getUserData(): Promise<any> {
    const userDataStr = await this.storage.getItem('userData');
    if (userDataStr) {
      try {
        return JSON.parse(userDataStr);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  logout(): Observable<any> {
    this.accessToken = null;
    this.currentUserSubject.next(null);
    
    return from(Promise.all([
      this.storage.removeItem('mobileAuthToken'),
      this.storage.removeItem('webAuthToken'),
      this.storage.removeItem('userData')
    ])).pipe(
      map(() => null),
      catchError(error => {
        console.error('Error during logout:', error);
        return of(null);
      })
    );
  }

  requestPasswordReset(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<any> {
    console.log('Sending reset password request with token:', token);
    return this.http.patch(`${this.apiUrl}/reset-password`, {
      token,
      newPassword
    }).pipe(
      tap(response => console.log('Reset successful:', response)),
      catchError(error => {
        console.error('Reset error details:', error);
        throw error;
      })
    );
  }

  isLoggedInSync(): boolean {
    return this.accessToken !== null;
  }

  // Add this to your auth.service.ts to check token validity
isTokenExpired(): boolean {
  const token = this.getToken();
  if (!token) return true;
  
  const decodedToken = this.decodeToken(token);
  if (!decodedToken?.exp) return true;
  
  const expirationDate = new Date(0);
  expirationDate.setUTCSeconds(decodedToken.exp);
  
  return expirationDate.valueOf() <= new Date().valueOf();
}
}
