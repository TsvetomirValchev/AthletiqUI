import { TestBed } from '@angular/core/testing';

import { ExerciseTemplateService } from './exercise-template.service';

describe('ExerciseTemplateService', () => {
  let service: ExerciseTemplateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ExerciseTemplateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
