import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-workout-history',
  templateUrl: './workout-history.page.html',
  styleUrls: ['./workout-history.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class WorkoutHistoryPage implements OnInit {
  constructor() {}

  ngOnInit() {}
}
