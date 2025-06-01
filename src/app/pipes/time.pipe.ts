import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'time',
  standalone: true
})
export class TimePipe implements PipeTransform {
  transform(seconds: number, format: 'elapsed' | 'duration' | 'rest' = 'elapsed'): string {
    if (!seconds && seconds !== 0) return '00:00';
    
    switch (format) {
      case 'elapsed':
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
      case 'duration':
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSecs = seconds % 60;
        let duration = 'PT';
        if (hours > 0) duration += `${hours}H`;
        if (minutes > 0) duration += `${minutes}M`;
        if (remainingSecs > 0 || (hours === 0 && minutes === 0)) duration += `${remainingSecs}S`;
        return duration;
        
      case 'rest':
        if (seconds === 0) return 'Off';
        if (seconds < 60) return `${seconds}s`;
        const restMins = Math.floor(seconds / 60);
        const restSecs = seconds % 60;
        return restSecs > 0 ? `${restMins}m ${restSecs}s` : `${restMins}m`;
        
      default:
        return '00:00';
    }
  }
}
