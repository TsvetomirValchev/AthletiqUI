import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { SetType } from '../../models/set-type.enum';

@Component({
  selector: 'app-exercise-set',
  templateUrl: './exercise-set.component.html',
  styleUrls: ['./exercise-set.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class ExerciseSetComponent {
  @Input() exerciseId: string = '';
  @Input() setId: string = '';
  @Input() index: number = 0;
  @Input() weight: number = 0;
  @Input() reps: number = 0;
  @Input() completed: boolean = false;
  @Input() type: SetType = SetType.NORMAL;
  @Input() normalSetCount: number = 0; // For tracking normal set numbers
  
  @Output() toggleComplete = new EventEmitter<{exerciseId: string, setId: string}>();
  
  get displayLabel(): string {
    switch (this.type) {
      case SetType.WARMUP:
        return 'W';
      case SetType.DROPSET:
        return 'D';
      case SetType.FAILURE:
        return 'F';
      default:
        return `${this.normalSetCount || this.index + 1}`;
    }
  }
  
  onToggleComplete() {
    this.toggleComplete.emit({exerciseId: this.exerciseId, setId: this.setId});
  }
}
