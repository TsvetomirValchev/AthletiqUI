import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'profile',
        loadChildren: () => import('../pages/profile/profile.module').then(m => m.ProfilePageModule)
      },
      {
        path: 'workouts',
        loadChildren: () => import('../pages/workout/workout.module').then(m => m.WorkoutPageModule)
      },
      {
        path: 'statistics',
        loadChildren: () => import('../pages/statistics/statistics.module').then(m => m.StatisticsPageModule)
      },
      {
        path: '',
        redirectTo: '/tabs/workouts',
        pathMatch: 'full'
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TabsPageRoutingModule {}
