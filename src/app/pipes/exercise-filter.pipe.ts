import { Pipe, PipeTransform } from '@angular/core';
import { ExerciseTemplate } from '../models/exercise-template.model';

@Pipe({
  name: 'exerciseFilter',
  standalone: true
})
export class ExerciseFilterPipe implements PipeTransform {
  transform(
    exercises: ExerciseTemplate[],
    searchTerm?: string,
    muscleGroup?: string
  ): ExerciseTemplate[] {
    if (!exercises) return [];
    
    let filtered = [...exercises];
    
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(exercise => 
        exercise.name.toLowerCase().includes(search) || 
        exercise.targetMuscleGroups?.some(m => m.toLowerCase().includes(search))
      );
    }
    
    if (muscleGroup && muscleGroup !== 'All Muscles') {
      filtered = filtered.filter(exercise => 
        exercise.targetMuscleGroups?.some(muscle => 
          muscle.toLowerCase() === muscleGroup.toLowerCase())
      );
    }
    
    return filtered;
  }
}
