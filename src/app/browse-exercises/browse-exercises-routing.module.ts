import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { BrowseExercisesPage } from './browse-exercises.page';

const routes: Routes = [
  {
    path: '',
    component: BrowseExercisesPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BrowseExercisesPageRoutingModule {}
