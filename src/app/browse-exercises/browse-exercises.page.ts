import { Component, OnInit } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ExerciseTemplate } from '../models/exercise-template.model';
import { ExerciseTemplateService } from '../services/exercise-template.service';

@Component({
  selector: 'app-browse-exercises',
  templateUrl: './browse-exercises.page.html',
  styleUrls: ['./browse-exercises.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class BrowseExercisesPage implements OnInit {
  exerciseTemplates: ExerciseTemplate[] = [];
  filteredTemplates: ExerciseTemplate[] = [];
  isLoading = false;
  searchTerm: string = '';

  constructor(
    private exerciseTemplateService: ExerciseTemplateService,
    private router: Router,
    private alertController: AlertController
  ) { }

  ngOnInit() {
    this.loadExerciseTemplates();
  }

  loadExerciseTemplates() {
    this.isLoading = true;
    this.exerciseTemplateService.getAll().subscribe({
      next: (templates: ExerciseTemplate[]) => {
        this.exerciseTemplates = templates;
        this.filteredTemplates = [...templates];
        this.isLoading = false;
      },
      error: (error: Error) => {
        console.error('Error loading exercise templates:', error);
        this.isLoading = false;
      }
    });
  }

  filterExercises() {
    this.filteredTemplates = this.exerciseTemplates.filter(template => {
      return !this.searchTerm || 
             template.name.toLowerCase().includes(this.searchTerm.toLowerCase());
    });
  }

  onSearch(event: any) {
    this.searchTerm = event.detail.value;
    this.filterExercises();
  }

  async viewExerciseDetails(exercise: ExerciseTemplate) {
    const alert = await this.alertController.create({
      header: exercise.name,
      message: `
      <div>
      ${exercise.description || 'No description available'}
      </div>
      <div class="ion-padding-top">
      <strong>Target muscles:</strong> ${exercise.targetMuscleGroups?.join(', ') || 'Not specified'}
      </div>
      `,
      buttons: ['Close']
    });

    await alert.present();
  }
}
