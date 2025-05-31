import { TestBed } from '@angular/core/testing';

import { ExerciseImageService } from './exercise-image.service';

describe('ExerciseImageService', () => {
  let service: ExerciseImageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ExerciseImageService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
