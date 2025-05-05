import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-exercise-templates',
  templateUrl: './exercise-templates.page.html',
  styleUrls: ['./exercise-templates.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class ExerciseTemplatesPage implements OnInit {
  constructor() {}

  ngOnInit() {}
}
