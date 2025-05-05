import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

export abstract class CrudServiceBase<T> {
  constructor(
    protected http: HttpClient,
    protected apiUrl: string
  ) {}

  protected handleError<R>(operation: string, fallbackValue?: R) {
    return catchError(error => {
      console.error(`Error in ${operation}:`, error);
      return fallbackValue !== undefined ? of(fallbackValue as R) : throwError(() => error);
    });
  }

  getAll(): Observable<T[]> {
    return this.http.get<T[]>(this.apiUrl)
      .pipe(this.handleError('getAll', [] as T[]));
  }

  getById(id: string): Observable<T> {
    return this.http.get<T>(`${this.apiUrl}/${id}`)
      .pipe(this.handleError('getById'));
  }

  create(item: T): Observable<T> {
    return this.http.post<T>(this.apiUrl, item)
      .pipe(this.handleError('create'));
  }

  update(id: string, item: T): Observable<T> {
    return this.http.put<T>(`${this.apiUrl}/${id}`, item)
      .pipe(this.handleError('update'));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`)
      .pipe(this.handleError('delete'));
  }
}