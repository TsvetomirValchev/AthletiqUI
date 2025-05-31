import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { TokenRefreshInterceptor } from './token-refresh.interceptor';
import { AuthService } from '../services/auth.service';

describe('TokenRefreshInterceptor', () => {
  let interceptor: TokenRefreshInterceptor;
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;
  let authService: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['validateToken', 'getToken', 'logout']);
    
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        TokenRefreshInterceptor,
        { provide: AuthService, useValue: authServiceSpy },
        { provide: HTTP_INTERCEPTORS, useClass: TokenRefreshInterceptor, multi: true }
      ]
    });
    
    interceptor = TestBed.inject(TokenRefreshInterceptor);
    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
  });

  it('should be created', () => {
    expect(interceptor).toBeTruthy();
  });

  afterEach(() => {
    httpMock.verify();
  });
});
