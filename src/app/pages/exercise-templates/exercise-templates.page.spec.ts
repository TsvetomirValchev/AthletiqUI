import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExerciseTemplatesPage } from './exercise-templates.page';

describe('ExerciseTemplatesPage', () => {
  let component: ExerciseTemplatesPage;
  let fixture: ComponentFixture<ExerciseTemplatesPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ExerciseTemplatesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
