import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-exercise-list',
  templateUrl: './exercise-list.component.html',
  styleUrls: ['./exercise-list.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class ExerciseListComponent implements OnInit {
  constructor() { }

  ngOnInit() {}
}
