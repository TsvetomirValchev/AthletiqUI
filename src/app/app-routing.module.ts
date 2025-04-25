import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

const routes: Routes = [
  {
    path: 'login',
    loadChildren: () => import('./login/login.module').then(m => m.LoginPageModule)
  },
  {
    path: 'register',
    loadChildren: () => import('./register/register.module').then(m => m.RegisterPageModule)
  },
  {
    path: 'reset-password',
    loadChildren: () => import('./reset-password/reset-password.module').then(m => m.ResetPasswordPageModule)
  },
  {
    path: 'forgot-password',
    loadChildren: () => import('./forgot-password/forgot-password.module').then(m => m.ForgotPasswordPageModule)
  },
  {
    path: 'tabs',
    loadChildren: () => import('./tabs/tabs.module').then(m => m.TabsPageModule),
    canActivate: [authGuard]
  },
  {
    path: 'active-workout',
    loadChildren: () => import('./active-workout/active-workout.module').then(m => m.ActiveWorkoutPageModule),
    canActivate: [authGuard]
  },
  {
    path: 'settings',
    loadChildren: () => import('./settings/settings.module').then(m => m.SettingsPageModule),
    canActivate: [authGuard]
  },
  {
    path: '',
    redirectTo: '/tabs/workouts',
    pathMatch: 'full'
  },
  {
    path: 'create-routine',
    loadComponent: () => import('./create-routine/create-routine.page').then(m => m.CreateRoutinePage),
    canActivate: [authGuard]
  },
  {
    path: 'browse-exercises',
    loadComponent: () => import('./browse-exercises/browse-exercises.page').then(m => m.BrowseExercisesPage),
    canActivate: [authGuard]
  },  {
    path: 'active-workout',
    loadChildren: () => import('./pages/active-workout/active-workout.module').then( m => m.ActiveWorkoutPageModule)
  },
  {
    path: 'workout-history',
    loadChildren: () => import('./pages/workout-history/workout-history.module').then( m => m.WorkoutHistoryPageModule)
  },
  {
    path: 'workout-detail',
    loadChildren: () => import('./pages/workout-detail/workout-detail.module').then( m => m.WorkoutDetailPageModule)
  },
  {
    path: 'exercise-templates',
    loadChildren: () => import('./pages/exercise-templates/exercise-templates.module').then( m => m.ExerciseTemplatesPageModule)
  },


];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
