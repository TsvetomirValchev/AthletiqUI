import { FormatDurationPipe } from './format-duration.pipe';
import { WorkoutHistoryService } from '../services/workout-history.service';

describe('FormatDurationPipe', () => {
  // Create a mock WorkoutHistoryService
  const mockWorkoutHistoryService = jasmine.createSpyObj('WorkoutHistoryService', ['getWorkoutById']);
  
  it('create an instance', () => {
    const pipe = new FormatDurationPipe(mockWorkoutHistoryService);
    expect(pipe).toBeTruthy();
  });
  
});
