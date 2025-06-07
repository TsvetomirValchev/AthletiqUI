import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'sort',
  standalone: true
})
export class SortPipe implements PipeTransform {
  transform<T>(array: T[], property: keyof T, direction: 'asc' | 'desc' = 'asc'): T[] {
    if (!array) return [];
    
    return [...array].sort((a, b) => {
      // Ensure missing values are treated as highest number (bottom of list)
      const aVal = a[property] !== undefined && a[property] !== null ? a[property] : Number.MAX_SAFE_INTEGER;
      const bVal = b[property] !== undefined && b[property] !== null ? b[property] : Number.MAX_SAFE_INTEGER;
      
      if (direction === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });
  }
}
