import { TestBed } from '@angular/core/testing';

import { ActiveWorkoutService } from './active-workout.service';

describe('ActiveWorkoutService', () => {
  let service: ActiveWorkoutService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ActiveWorkoutService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
