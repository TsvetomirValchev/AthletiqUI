import { Component, OnInit } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ExerciseTemplate } from '../../models/exercise-template.model';
import { ExerciseTemplateService } from '../../services/exercise-template.service';
import { ExerciseImagePipe } from '../../pipes/exercise-image.pipe';

@Component({
  selector: 'app-browse-exercises',
  templateUrl: './browse-exercises.page.html',
  styleUrls: ['./browse-exercises.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, ExerciseImagePipe]
})
export class BrowseExercisesPage implements OnInit {
  exerciseTemplates: ExerciseTemplate[] = [];
  filteredTemplates: ExerciseTemplate[] = [];
  isLoading = false;
  searchTerm: string = '';

  constructor(
    private exerciseTemplateService: ExerciseTemplateService,
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
        this.showErrorAlert();
      }
    });
  }

  filterExercises() {
    this.filteredTemplates = this.exerciseTemplates.filter(template => {
      return !this.searchTerm || 
             template.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
             template.targetMuscleGroups?.some(muscle => 
               muscle.toLowerCase().includes(this.searchTerm.toLowerCase())
             );
    });
  }

  onSearch(event: any) {
    this.searchTerm = event.detail.value;
    this.filterExercises();
  }

  onImageError(event: Event) {
    ExerciseImagePipe.handleError(event);
  }

  async showErrorAlert() {
    const alert = await this.alertController.create({
      header: 'Error',
      message: 'Failed to load exercises. Please try again later.',
      buttons: ['OK']
    });

    await alert.present();
  }
}
