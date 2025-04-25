import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WorkoutHistoryPage } from './workout-history.page';

describe('WorkoutHistoryPage', () => {
  let component: WorkoutHistoryPage;
  let fixture: ComponentFixture<WorkoutHistoryPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(WorkoutHistoryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
