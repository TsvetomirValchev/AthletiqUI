import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Exercise } from '../../models/exercise.model';
import { RouterModule } from '@angular/router';
import { ExerciseSetComponent } from '../exercise-set/exercise-set.component';

@Component({
  selector: 'app-exercise-list',
  templateUrl: './exercise-list.component.html',
  styleUrls: ['./exercise-list.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, ExerciseSetComponent]
})
export class ExerciseListComponent {
  @Input() exercises: Exercise[] = [];
  @Input() showActions = true;
  
  @Output() addSetEvent = new EventEmitter<Exercise>();
  @Output() deleteExerciseEvent = new EventEmitter<Exercise>();
  
  constructor() {}

  addSet(exercise: Exercise) {
    this.addSetEvent.emit(exercise);
  }
  
  deleteExercise(exercise: Exercise) {
    this.deleteExerciseEvent.emit(exercise);
  }
}
