import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:6969/auth';
  private currentUserSubject = new BehaviorSubject<any>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    // Check for existing auth on service initialization
    this.checkAuthentication();
  }

  // Check if we have authentication data in storage
  private checkAuthentication(): void {
    const token = this.getToken();
    const userData = this.getUserData();
    
    if (token && userData) {
      this.currentUserSubject.next(userData);
    }
  }

  checkTokenStatus(): { exists: boolean, valid: boolean } {
    const token = this.getToken();
    if (!token) {
      return { exists: false, valid: false };
    }
    
    try {
      const payload = token.split('.')[1];
      const decodedPayload = JSON.parse(atob(payload));
      const expired = decodedPayload.exp * 1000 < Date.now();
      
      return { exists: true, valid: !expired };
    } catch (e) {
      return { exists: true, valid: false };
    }
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  validateToken(): Observable<boolean> {
    const token = this.getToken();
    if (!token) {
      return of(false);
    }
    
    return this.http.get<any>(`${this.apiUrl}/validate-token`)
      .pipe(
        map(response => {
          this.saveUserData(response);
          return true;
        }),
        catchError(() => {
          this.logout();
          return of(false);
        })
      );
  }

  login(username: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, { username, password }, {responseType: "text"})
      .pipe(
        tap(token => {
          this.saveToken(token);
          
          const userData = {
            username: username,
          };
          this.saveUserData(userData);
          
          this.currentUserSubject.next(userData);
        })
      );
  }

  register(user: { username: string; password: string; email: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/register`, user);
  }

  saveToken(token: string): void {
    localStorage.setItem('jwtToken', token);
  }

  getToken(): string | null {
    return localStorage.getItem('jwtToken');
  }

  saveUserData(userData: any): void {
    localStorage.setItem('userData', JSON.stringify(userData));
  }

  getUserData(): any {
    const userData = localStorage.getItem('userData');
    if (userData) {
      try {
        return JSON.parse(userData);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  logout(): void {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('userData');
    this.currentUserSubject.next(null);
  }
}
