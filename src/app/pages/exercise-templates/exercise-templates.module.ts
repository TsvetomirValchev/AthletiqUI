import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ExerciseTemplatesPageRoutingModule } from './exercise-templates-routing.module';
import { ExerciseTemplatesPage } from './exercise-templates.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ExerciseTemplatesPageRoutingModule,
    ExerciseTemplatesPage
  ]
})
export class ExerciseTemplatesPageModule {}
