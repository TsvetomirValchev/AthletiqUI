import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { BrowseExercisesPageRoutingModule } from './browse-exercises-routing.module';

import { BrowseExercisesPage } from './browse-exercises.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    BrowseExercisesPageRoutingModule
  ],
  declarations: [BrowseExercisesPage]
})
export class BrowseExercisesPageModule {}
