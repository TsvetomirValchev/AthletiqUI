import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

Chart.register(...registerables);

@Component({
  selector: 'app-statistics',
  templateUrl: './statistics.page.html',
  styleUrls: ['./statistics.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, RouterLink]
})
export class StatisticsPage implements OnInit {
  @ViewChild('consistencyChart') consistencyChartCanvas!: ElementRef;
  @ViewChild('muscleGroupChart') muscleGroupChartCanvas!: ElementRef;
  
  consistencyChart: any;
  muscleGroupChart: any;
  isLoading = true;

  constructor() { }

  ngOnInit() { }

  ionViewDidEnter() {
    this.loadStatistics();
  }

  loadStatistics() {
    this.isLoading = true;
    
    setTimeout(() => {
      this.createConsistencyChart();
      this.createMuscleGroupChart();
      this.isLoading = false;
    }, 1000);
  }

  createConsistencyChart() {
    if (this.consistencyChart) {
      this.consistencyChart.destroy();
    }

    const ctx = this.consistencyChartCanvas.nativeElement.getContext('2d');
    
    this.consistencyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
          label: 'Workout Minutes',
          data: [60, 75, 0, 45, 90, 30, 0],
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Minutes'
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Last 7 Days Workout Consistency'
          }
        }
      }
    });
  }

  createMuscleGroupChart() {
    if (this.muscleGroupChart) {
      this.muscleGroupChart.destroy();
    }

    const ctx = this.muscleGroupChartCanvas.nativeElement.getContext('2d');
    
    this.muscleGroupChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'],
        datasets: [{
          label: 'Volume by Muscle Group',
          data: [12, 19, 8, 15, 10, 5],
          backgroundColor: [
            'rgba(255, 99, 132, 0.2)',
            'rgba(54, 162, 235, 0.2)',
            'rgba(255, 206, 86, 0.2)',
            'rgba(75, 192, 192, 0.2)',
            'rgba(153, 102, 255, 0.2)',
            'rgba(255, 159, 64, 0.2)'
          ],
          borderColor: [
            'rgba(255, 99, 132, 1)',
            'rgba(54, 162, 235, 1)',
            'rgba(255, 206, 86, 1)',
            'rgba(75, 192, 192, 1)',
            'rgba(153, 102, 255, 1)',
            'rgba(255, 159, 64, 1)'
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Volume by Muscle Group'
          }
        }
      }
    });
  }
}
