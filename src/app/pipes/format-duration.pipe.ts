import { Pipe, PipeTransform } from '@angular/core';
import { WorkoutHistoryService } from '../services/workout-history.service';

@Pipe({
  name: 'formatDuration',
  standalone: true
})
export class FormatDurationPipe implements PipeTransform {
  
  constructor(private workoutHistoryService: WorkoutHistoryService) {}
  
  transform(duration: string | undefined): string {
    if (!duration) return '0m';
    return this.workoutHistoryService.formatDuration(duration);
  }
}