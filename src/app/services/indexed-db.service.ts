import { Injectable } from '@angular/core';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class IndexedDBService {
  private dbName = 'athletiq_app';
  private version = 1;
  private db: IDBDatabase | null = null;

  constructor() {
    this.initDatabase().subscribe();
  }

  private initDatabase(): Observable<boolean> {
    return new Observable(observer => {
      if (this.db) {
        observer.next(true);
        observer.complete();
        return;
      }

      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = (event) => {
        console.error('Error opening IndexedDB:', event);
        observer.error('Failed to open database');
        observer.complete();
      };

      request.onsuccess = (event) => {
        this.db = request.result;
        console.log('IndexedDB initialized successfully');
        observer.next(true);
        observer.complete();
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;
        
        // Create active workout store
        if (!db.objectStoreNames.contains('active_workouts')) {
          const store = db.createObjectStore('active_workouts', { keyPath: 'id' });
          store.createIndex('workoutId', 'workoutId', { unique: true });
          console.log('Created active_workouts store');
        }
        
        // Create completed sets store
        if (!db.objectStoreNames.contains('completed_sets')) {
          const store = db.createObjectStore('completed_sets', { keyPath: 'setId' });
          store.createIndex('workoutId', 'workoutId', { unique: false });
          console.log('Created completed_sets store');
        }
      };
    });
  }

  // Save active workout session
  saveActiveWorkout(session: any): Observable<boolean> {
    return from(this.initDatabase()).pipe(
      switchMap(() => {
        if (!this.db) {
          return throwError(() => new Error('Database not initialized'));
        }

        return new Observable<boolean>(observer => {
          try {
            // Ensure the session has an ID
            if (!session.id) {
              session.id = 'active_session';
            }
            
            // Add null check for this.db
            if (!this.db) {
              throw new Error('Database is null');
            }
            
            // Debug log to verify the data being saved
            console.log('Saving to IndexedDB:', JSON.stringify({
              id: session.id,
              workoutId: session.workout?.workoutId,
              exerciseCount: session.exercises?.length,
              setCount: session.exercises?.reduce((count: any, ex: { sets: string | any[]; }) => count + (ex.sets?.length || 0), 0)
            }));
            
            const transaction = this.db.transaction(['active_workouts'], 'readwrite');
            const store = transaction.objectStore('active_workouts');
            
            // Save the session
            const request = store.put(session);
            
            request.onsuccess = () => {
              console.log('Active workout saved to IndexedDB successfully');
              observer.next(true);
              observer.complete();
            };
            
            request.onerror = (event) => {
              console.error('Error saving active workout:', event);
              observer.error('Failed to save active workout');
              observer.complete();
            };
          } catch (error) {
            console.error('Error in saveActiveWorkout:', error);
            observer.error(error);
            observer.complete();
          }
        });
      }),
      catchError(error => {
        console.error('Error saving workout to IndexedDB:', error);
        return of(false);
      })
    );
  }

  // Load active workout session
  getActiveWorkout(): Observable<any> {
    return from(this.initDatabase()).pipe(
      switchMap(() => {
        if (!this.db) {
          return throwError(() => new Error('Database not initialized'));
        }

        return new Observable<any>(observer => {
          try {
            // Fix #2: Add null check for this.db
            if (!this.db) {
              throw new Error('Database is null');
            }
            
            const transaction = this.db.transaction(['active_workouts'], 'readonly');
            const store = transaction.objectStore('active_workouts');
            
            // Get the active session
            const request = store.get('active_session');
            
            request.onsuccess = () => {
              const result = request.result;
              if (result) {
                console.log('Active workout loaded from IndexedDB:', result);
                observer.next(result);
              } else {
                console.log('No active workout found in IndexedDB');
                observer.next(null);
              }
              observer.complete();
            };
            
            request.onerror = (event) => {
              console.error('Error loading active workout:', event);
              observer.error('Failed to load active workout');
              observer.complete();
            };
          } catch (error) {
            console.error('Error in getActiveWorkout:', error);
            observer.error(error);
            observer.complete();
          }
        });
      }),
      catchError(error => {
        console.error('Error loading workout from IndexedDB:', error);
        return of(null);
      })
    );
  }

  // Clear active workout session
  clearActiveWorkout(): Observable<boolean> {
    return from(this.initDatabase()).pipe(
      switchMap(() => {
        if (!this.db) {
          return throwError(() => new Error('Database not initialized'));
        }

        return new Observable<boolean>(observer => {
          try {
            // Fix #3: Add null check for this.db
            if (!this.db) {
              throw new Error('Database is null');
            }
            
            const transaction = this.db.transaction(['active_workouts'], 'readwrite');
            const store = transaction.objectStore('active_workouts');
            
            // Delete the active session
            const request = store.delete('active_session');
            
            request.onsuccess = () => {
              console.log('Active workout cleared from IndexedDB');
              observer.next(true);
              observer.complete();
            };
            
            request.onerror = (event) => {
              console.error('Error clearing active workout:', event);
              observer.error('Failed to clear active workout');
              observer.complete();
            };
          } catch (error) {
            console.error('Error in clearActiveWorkout:', error);
            observer.error(error);
            observer.complete();
          }
        });
      }),
      catchError(error => {
        console.error('Error clearing workout from IndexedDB:', error);
        return of(false);
      })
    );
  }
}