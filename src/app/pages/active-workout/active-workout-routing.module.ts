import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ActiveWorkoutPage } from './active-workout.page';

const routes: Routes = [
  {
    path: '',
    component: ActiveWorkoutPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ActiveWorkoutPageRoutingModule {}
