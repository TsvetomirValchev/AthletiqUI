import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ActiveWorkoutPageRoutingModule } from './active-workout-routing.module';

import { ActiveWorkoutPage } from './active-workout.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ActiveWorkoutPageRoutingModule
  ],
  declarations: [ActiveWorkoutPage]
})
export class ActiveWorkoutPageModule {}
