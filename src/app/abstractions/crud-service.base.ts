import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export abstract class CrudServiceBase<T> {  constructor(
    protected http: HttpClient,
    protected apiUrl: string
  ) {
    console.log(`🌐 CRUD Service initialized with API URL: ${this.apiUrl}`);
  }

  /**
   * Gets HTTP options with appropriate headers for API requests
   */
  protected getHttpOptions() {
    return {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }),
      withCredentials: true // Include cookies for CORS if needed
    };
  }

  /**
   * Enhanced error handler for API calls with detailed diagnostics
   */
  protected handleError<R>(operation: string, fallbackValue?: R, error?: any) {
    if (error instanceof HttpErrorResponse) {
      console.error(`❌ Error in ${operation}:`, error);
      
      // Log detailed error information
      if (error.error instanceof ErrorEvent) {
        // Client-side error
        console.error(`Client-side error: ${error.error.message}`);
      } else {
        // Backend error
        console.error(`Backend returned code ${error.status}, body:`, error.error);
        
        // Check for common issues
        if (error.status === 0) {
          console.error('📡 Network error - Is the backend server running at', environment.apiUrl, '?');
          console.error('Please check that your backend server is running at the correct URL');
        } else if (error.status === 401) {
          console.error('🔑 Authentication error - Token may be invalid or expired');
        } else if (error.status === 403) {
          console.error('🚫 Authorization error - User may not have permission');
        } else if (error.status === 404) {
          console.error('🔍 Resource not found - API endpoint may be incorrect');
          console.error(`Attempted to access: ${error.url}`);
        } else if (error.status === 500) {
          console.error('💥 Server error - Backend threw an exception');
        }
      }
    } else {
      console.error(`❌ Unknown error in ${operation}:`, error);
    }
    return fallbackValue !== undefined ? of(fallbackValue as R) : throwError(() => error);
  }
  getAll(): Observable<T[]> {
    console.log(`📡 CRUD getAll: ${this.apiUrl}`);
    return this.http.get<T[]>(this.apiUrl, this.getHttpOptions())
      .pipe(
        timeout(10000), // 10 second timeout
        catchError(error => this.handleError<T[]>('getAll', [], error))
      );
  }

  getById(id: string): Observable<T> {
    console.log(`📡 CRUD getById: ${this.apiUrl}/${id}`);
    return this.http.get<T>(`${this.apiUrl}/${id}`, this.getHttpOptions())
      .pipe(
        timeout(10000), // 10 second timeout
        catchError(error => this.handleError<T>(`getById id=${id}`, null as unknown as T, error))
      );
  }

  create(item: T): Observable<T> {
    console.log(`📡 CRUD create: ${this.apiUrl}`);
    return this.http.post<T>(this.apiUrl, item, this.getHttpOptions())
      .pipe(
        timeout(10000), // 10 second timeout
        catchError(error => this.handleError<T>('create', null as unknown as T, error))
      );
  }

  update(id: string, item: T): Observable<T> {
    console.log(`📡 CRUD update: ${this.apiUrl}/${id}`);
    return this.http.put<T>(`${this.apiUrl}/${id}`, item, this.getHttpOptions())
      .pipe(
        timeout(10000), // 10 second timeout
        catchError(error => this.handleError<T>(`update id=${id}`, null as unknown as T, error))
      );
  }

  delete(id: string): Observable<void> {
    console.log(`📡 CRUD delete: ${this.apiUrl}/${id}`);
    return this.http.delete<void>(`${this.apiUrl}/${id}`, this.getHttpOptions())
      .pipe(
        timeout(10000), // 10 second timeout
        catchError(error => this.handleError<void>(`delete id=${id}`, undefined, error))
      );
  }
}