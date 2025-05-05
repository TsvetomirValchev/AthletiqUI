import { Component, Input, Output, EventEmitter } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-exercise-set',
  templateUrl: './exercise-set.component.html',
  styleUrls: ['./exercise-set.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class ExerciseSetComponent {
  @Input() displayLabel: string = '';
  @Input() weight: number = 0;
  @Input() reps: number = 0;
  @Input() completed: boolean = false;
  @Output() toggle = new EventEmitter<void>();

  toggleComplete() {
    this.toggle.emit();
  }
}
