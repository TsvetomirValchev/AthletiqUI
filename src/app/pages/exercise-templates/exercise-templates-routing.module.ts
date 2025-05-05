import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ExerciseTemplatesPage } from './exercise-templates.page';

const routes: Routes = [
  {
    path: '',
    component: ExerciseTemplatesPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ExerciseTemplatesPageRoutingModule {}
