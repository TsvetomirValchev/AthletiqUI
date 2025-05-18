import { TestBed } from '@angular/core/testing';
import { StatisticsService } from './statistics.service';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { of } from 'rxjs';

describe('StatisticsService', () => {
  let service: StatisticsService;
  let authServiceSpy: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    // Create spy for AuthService
    authServiceSpy = jasmine.createSpyObj('AuthService', [], {
      currentUser$: of({ userId: 'test-user-id' })
    });

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: AuthService, useValue: authServiceSpy }
      ]
    });
    
    service = TestBed.inject(StatisticsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should parse ISO duration string correctly', () => {
    // Test PT1H30M format (1 hour 30 minutes)
    expect(service.calculateDurationInMinutes('PT1H30M')).toBe(90);
    
    // Test PT45M format (45 minutes)
    expect(service.calculateDurationInMinutes('PT45M')).toBe(45);
    
    // Test PT2H format (2 hours)
    expect(service.calculateDurationInMinutes('PT2H')).toBe(120);
    
    // Test PT30S format (30 seconds)
    expect(service.calculateDurationInMinutes('PT30S')).toBe(0.5);
    
    // Test PT1H30M15S format (1 hour, 30 minutes, 15 seconds)
    expect(service.calculateDurationInMinutes('PT1H30M15S')).toBe(90.25);
  });
});
