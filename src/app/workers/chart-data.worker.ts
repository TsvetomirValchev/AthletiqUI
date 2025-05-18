/// <reference lib="webworker" />

// Chart data worker for offloading heavy calculations
// This worker handles processing workout data for charts

const ctx: Worker = self as any;

// Process data for the last N days
function processLastNDaysData(days: number, workoutHistory: any[], weekDays: string[]): any {
  const labels: string[] = [];
  const data: number[] = [];
  
  const today = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const dayName = weekDays[date.getDay()];
    labels.push(dayName);
    
    // Find workouts for this day
    const dateString = date.toISOString().split('T')[0];
    const workoutsOnDay = workoutHistory.filter(w => w.date === dateString);
    
    // Calculate hours
    let totalHours = 0;
    workoutsOnDay.forEach(workout => {
      if (workout.duration) {
        // Convert ISO duration to hours
        const durationMatch = workout.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (durationMatch) {
          const hours = durationMatch[1] ? parseInt(durationMatch[1]) : 0;
          const minutes = durationMatch[2] ? parseInt(durationMatch[2]) : 0;
          const seconds = durationMatch[3] ? parseInt(durationMatch[3]) : 0;
          totalHours += hours + (minutes / 60) + (seconds / 3600);
        }
      }
    });
    
    // Convert to minutes for consistency chart
    data.push(Math.round(totalHours * 60));
  }
  
  return { labels, data };
}

// Process data for the last N months
function processLastNMonthsData(months: number, workoutHistory: any[]): any {
  const labels: string[] = [];
  const data: number[] = [];
  
  const today = new Date();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  for (let i = months - 1; i >= 0; i--) {
    const currentMonth = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthName = monthNames[currentMonth.getMonth()];
    const year = currentMonth.getFullYear();
    
    // Add year for January to make the x-axis clearer
    labels.push(monthName + (currentMonth.getMonth() === 0 ? ` ${year}` : ''));
    
    // Get all workouts for this month
    let totalHours = 0;
    
    workoutHistory.forEach(workout => {
      if (workout.date) {
        const workoutDate = new Date(workout.date);
        if (
          workoutDate.getMonth() === currentMonth.getMonth() && 
          workoutDate.getFullYear() === currentMonth.getFullYear()
        ) {
          if (workout.duration) {
            // Convert ISO duration to hours
            const durationMatch = workout.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
            if (durationMatch) {
              const hours = durationMatch[1] ? parseInt(durationMatch[1]) : 0;
              const minutes = durationMatch[2] ? parseInt(durationMatch[2]) : 0;
              const seconds = durationMatch[3] ? parseInt(durationMatch[3]) : 0;
              totalHours += hours + (minutes / 60) + (seconds / 3600);
            }
          }
        }
      }
    });
    
    data.push(parseFloat(totalHours.toFixed(1)));
  }
  
  return { labels, data };
}

// Process calendar data
function processCalendarData(calendarData: any[], year: number, month: number): any[] {
  // Process and prepare calendar data for display
  return calendarData.map(day => {
    const date = new Date(day.date);
    return {
      date,
      hasWorkout: true,
      dayNumber: date.getDate(),
      workouts: day.workouts || []
    };
  });
}

// Listen for messages from the main thread
self.addEventListener('message', (event: MessageEvent) => {
  try {
    const data = event.data;
    switch (data.type) {
      case 'lastNDays':      
        ctx.postMessage({
          type: 'lastNDaysResult',
          data: processLastNDaysData(data.days, data.workoutHistory, data.weekDays)
        });
        break;
      case 'lastNMonths':      
        ctx.postMessage({
          type: 'lastNMonthsResult',
          data: processLastNMonthsData(data.months, data.workoutHistory)
        });
        break;
      case 'calendarData':      
        ctx.postMessage({
          type: 'calendarDataResult',
          data: processCalendarData(data.calendarData, data.year, data.month)
        });
        break;
      default:
        ctx.postMessage({
          type: 'error',
          error: 'Unknown message type: ' + data.type
        });
    }
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error in worker'
    });
  }
});
