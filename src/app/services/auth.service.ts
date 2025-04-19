import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, BehaviorSubject, from } from 'rxjs';
import { map, catchError, tap, switchMap } from 'rxjs/operators';
import { StorageService } from './storage.service';
import { Platform } from '@ionic/angular';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:6969/auth';
  private currentUserSubject = new BehaviorSubject<any>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  
  // For in-memory token storage
  private accessToken: string | null = null;

  constructor(
    private http: HttpClient,
    private storage: StorageService,
    private platform: Platform
  ) {
    // Check authentication on startup
    this.checkAuthentication();
  }

  private async checkAuthentication(): Promise<void> {
    // Different auth strategies for mobile vs web
    if (this.storage.isMobile()) {
      await this.checkMobileAuth();
    } else {
      await this.checkWebAuth();
    }
  }

  private async checkMobileAuth(): Promise<void> {
    // For mobile: try to use stored token directly
    const token = await this.storage.getItem('mobileAuthToken');
    const userDataStr = await this.storage.getItem('userData');
    
    if (token) {
      // Set token for immediate use
      this.accessToken = token;
      
      try {
        // Parse and set user data if available
        if (userDataStr) {
          const userData = JSON.parse(userDataStr);
          this.currentUserSubject.next(userData);
        }
        
        // Silently validate/refresh in background
        this.validateToken().subscribe();
      } catch (e) {
        console.error('Error parsing stored data', e);
      }
    }
  }

  private async checkWebAuth(): Promise<void> {
    // For web: more standard approach with validation
    const token = await this.storage.getItem('webAuthToken');
    if (token) {
      try {
        // Validate token before setting it
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
    // Memory-first check for token
    if (this.accessToken) {
      return of({ exists: true, valid: true });
    }
    
    // Fall back to storage
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
          
          // On mobile, consider expired tokens still "valid" for UI purposes
          // We'll refresh them in the background
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
    // Check memory first
    if (this.accessToken) {
      return of(true);
    }
    
    // Fall back to storage
    const storageKey = this.storage.isMobile() ? 'mobileAuthToken' : 'webAuthToken';
    return from(this.storage.getItem(storageKey)).pipe(
      map(token => !!token)
    );
  }

  validateToken(): Observable<boolean> {
    // Try to validate token with server
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
          // Only logout on web - mobile keeps trying with existing token
          if (!this.storage.isMobile()) {
            this.logout();
          }
          return of(false);
        })
      );
  }

  login(username: string, password: string): Observable<any> {
    const headers = {
      'X-Client-Type': this.storage.isMobile() ? 'mobile' : 'web'
    };
    return this.http.post(`${this.apiUrl}/login`, { 
      usernameOrEmail: username,
      password 
    }, { headers, responseType: "text" })
    .pipe(
      tap(token => {
        // Store in memory
        this.accessToken = token;
        
        // Store in appropriate persistence
        this.saveTokenBasedOnPlatform(token);
        
        // Update user data
        const userData = { username };
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

  logout(): void {
    // Clear memory
    this.accessToken = null;
    this.currentUserSubject.next(null);
    
    // Clear storage
    this.storage.removeItem('mobileAuthToken');
    this.storage.removeItem('webAuthToken');
    this.storage.removeItem('userData');
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
}
