import { ExerciseImagePipe } from './exercise-image.pipe';
import { DomSanitizer } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';

describe('ExerciseImagePipe', () => {
  let sanitizer: DomSanitizer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    sanitizer = TestBed.inject(DomSanitizer);
  });

  it('create an instance', () => {
    const pipe = new ExerciseImagePipe(sanitizer);
    expect(pipe).toBeTruthy();
  });
});
