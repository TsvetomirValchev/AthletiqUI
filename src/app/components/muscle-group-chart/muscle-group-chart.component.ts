import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { catchError, finalize, take, timeout } from 'rxjs/operators';
import { of } from 'rxjs';
import { Chart, ChartConfiguration, RadarController, LineController, 
         PointElement, LineElement, RadialLinearScale, Filler } from 'chart.js';
import { StatisticsService } from '../../services/statistics.service';

interface MuscleGroupStats {
  muscleGroup: string;
  workoutCount: number;
}

@Component({
  selector: 'app-muscle-group-chart',
  templateUrl: './muscle-group-chart.component.html',
  styleUrls: ['./muscle-group-chart.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class MuscleGroupChartComponent implements OnInit {
  isLoading = true;
  error: string | null = null;
  chart: Chart | null = null;
  
  // Default muscle groups to ensure a complete chart even if some are missing
  private readonly muscleGroups = ['Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Legs'];

  // First, add a static chartId to ensure unique IDs across component instances
  private static chartCounter = 0;
  public chartId = `muscle-group-chart-${MuscleGroupChartComponent.chartCounter++}`;

  constructor(private statisticsService: StatisticsService) {
    // Register required Chart.js components including Filler
    Chart.register(
      RadarController, 
      LineController, 
      PointElement, 
      LineElement, 
      RadialLinearScale,
      Filler  // Add this line to register the Filler plugin
    );
  }

  ngOnInit() {
    this.loadMuscleGroupStats();
  }

  /**
   * Load muscle group statistics from the API
   */
  loadMuscleGroupStats(): void {
    this.isLoading = true;
    this.error = null;
    
    // If there's an existing chart, destroy it first
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    
    this.statisticsService.getMuscleGroupStats().pipe(
      take(1), // Take only one emission
      timeout(4000), // Add a timeout for the operation
      catchError(error => {
        console.error('Error loading muscle group stats:', error);
        this.error = 'Failed to load muscle group statistics.';
        return of([]);
      }),
      finalize(() => {
        this.isLoading = false;
      })
    ).subscribe(stats => {
      // Add a small delay to ensure DOM is ready before creating/updating chart
      setTimeout(() => {
        this.processStatsData(stats || []);
      }, 50);
    });
  }

  /**
   * Process the statistics data and update the chart
   */
  private processStatsData(stats: MuscleGroupStats[]): void {
    if (!stats || stats.length === 0) {
      // If no data, show zero values for all muscle groups
      if (this.chart) {
        this.chart.data.datasets[0].data = this.muscleGroups.map(() => 0);
        this.chart.update();
      }
      return;
    }

    // Create a map for faster lookups
    const statsMap = new Map<string, number>();
    stats.forEach(item => {
      statsMap.set(item.muscleGroup, item.workoutCount);
    });

    // Map data to the muscle groups in the correct order
    const data = this.muscleGroups.map(group => {
      return statsMap.get(group) || 0;
    });

    // Update chart with real data
    if (this.chart) {
      this.chart.data.datasets[0].data = data;
      this.chart.update();
    } else {
      this.initChart(data);
    }
  }

  /**
   * Initialize the radar chart with the given data
   */
  private initChart(data: number[]): void {
    try {
      // Make sure we're using the dynamic chartId, not a hardcoded ID
      const canvas = document.getElementById(this.chartId) as HTMLCanvasElement;
      if (!canvas) {
        console.error(`Canvas element not found with ID: ${this.chartId}`);
        this.error = 'Chart rendering failed';
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Canvas context not found');
        return;
      }

      // IMPORTANT: Destroy the previous chart instance if it exists
      if (this.chart) {
        console.log('Destroying previous chart instance');
        this.chart.destroy();
        this.chart = null;
      }

      // Chart options
      const options: ChartConfiguration['options'] = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            angleLines: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            pointLabels: {
              color: 'rgba(255, 255, 255, 0.7)',
              font: {
                size: 14
              }
            },
            ticks: {
              display: false
            },
            beginAtZero: true
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            titleColor: 'rgba(255, 255, 255, 0.9)',
            bodyColor: 'rgba(255, 255, 255, 0.9)',
            displayColors: false,
            callbacks: {
              label: (context) => `Workouts: ${context.raw}`
            }
          }
        }
      };

      // Create chart
      this.chart = new Chart(ctx, {
        type: 'radar',
        data: {
          labels: this.muscleGroups,
          datasets: [
            {
              data: data,
              label: 'Muscle Group Training',
              backgroundColor: 'rgba(103, 155, 240, 0.4)',
              fill: true,
              borderColor: 'rgba(103, 155, 240, 1)',
              pointBorderColor: '#fff',
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: 'rgba(103, 155, 240, 1)',
              borderWidth: 2
            }
          ]
        },
        options: options
      });

      console.log('Muscle group chart initialized with data:', data);
    } catch (err) {
      console.error('Error initializing chart:', err);
      this.error = 'Chart initialization failed';
    }
  }
}
