import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

const routes: Routes = [
  {
    path: 'login',
    loadChildren: () => import('./pages/login/login.module').then(m => m.LoginPageModule)
  },
  {
    path: 'register',
    loadChildren: () => import('./pages/register/register.module').then(m => m.RegisterPageModule)
  },
  {
    path: 'reset-password',
    loadChildren: () => import('./pages/reset-password/reset-password.module').then(m => m.ResetPasswordPageModule)
  },
  {
    path: 'forgot-password',
    loadChildren: () => import('./pages/forgot-password/forgot-password.module').then(m => m.ForgotPasswordPageModule)
  },
  {
    path: 'active-workout/:id',
    loadComponent: () => import('./pages/active-workout/active-workout.page').then(m => m.ActiveWorkoutPage),
    canActivate: [authGuard]
  },
  {
    path: 'active-workout/empty',
    loadComponent: () => import('./pages/active-workout/active-workout.page').then(m => m.ActiveWorkoutPage),
    canActivate: [authGuard]
  },
  {
    path: 'active-workout',
    loadChildren: () => import('./pages/active-workout/active-workout.module').then(m => m.ActiveWorkoutPageModule),
    canActivate: [authGuard]
  },
  {
    path: 'settings',
    loadChildren: () => import('./pages/settings/settings.module').then(m => m.SettingsPageModule),
    canActivate: [authGuard]
  },
  {
    path: 'create-routine',
    loadComponent: () => import('./pages/create-routine/create-routine.page').then(m => m.CreateRoutinePage),
    canActivate: [authGuard]
  },
  {
    path: 'browse-exercises',
    loadComponent: () => import('./pages/browse-exercises/browse-exercises.page').then(m => m.BrowseExercisesPage),
    canActivate: [authGuard]
  },
  {
    path: 'exercise-templates',
    loadChildren: () => import('./pages/exercise-templates/exercise-templates.module').then( m => m.ExerciseTemplatesPageModule)
  },
  {
    path: '',
    redirectTo: '/tabs/workouts',
    pathMatch: 'full'
  },
  {
    path: 'tabs',
    loadChildren: () => import('./tabs/tabs.module').then(m => m.TabsPageModule),
    canActivate: [authGuard]
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
