import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActiveWorkoutPage } from './active-workout.page';

describe('ActiveWorkoutPage', () => {
  let component: ActiveWorkoutPage;
  let fixture: ComponentFixture<ActiveWorkoutPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ActiveWorkoutPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
