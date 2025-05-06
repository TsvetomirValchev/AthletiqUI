import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowseExercisesPage } from './browse-exercises.page';

describe('BrowseExercisesPage', () => {
  let component: BrowseExercisesPage;
  let fixture: ComponentFixture<BrowseExercisesPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(BrowseExercisesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
