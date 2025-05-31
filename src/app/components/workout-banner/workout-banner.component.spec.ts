import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { WorkoutBannerComponent } from './workout-banner.component';

describe('WorkoutBannerComponent', () => {
  let component: WorkoutBannerComponent;
  let fixture: ComponentFixture<WorkoutBannerComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [WorkoutBannerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkoutBannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
