import { Pipe, PipeTransform } from '@angular/core';
import { SetType } from '../models/set-type.enum';
import { ExerciseSet } from '../models/exercise-set.model';

@Pipe({
  name: 'setTypeDisplay',
  standalone: true
})
export class SetTypeDisplayPipe implements PipeTransform {

  transform(
    type: SetType | string | undefined, 
    sets: ExerciseSet[] | undefined, 
    setIndex: number
  ): string {
    if (!type || type === SetType.NORMAL) {
      return this.getNormalSetNumber(sets, setIndex).toString();
    }
    
    switch(type) {
      case SetType.WARMUP:
        return 'W';
      case SetType.DROPSET:
        return 'D';
      case SetType.FAILURE:
        return 'F';
      default:
        return '1';
    }
  }

  private getNormalSetNumber(sets: ExerciseSet[] | undefined, currentIndex: number): number {
    if (!sets) return 1;
    
    let normalSetCount = 0;
    for (let i = 0; i <= currentIndex; i++) {
      if (sets[i] && sets[i].type === SetType.NORMAL) {
        normalSetCount++;
      }
    }
    return normalSetCount;
  }
}
