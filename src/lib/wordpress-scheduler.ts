/**
 * WordPress Post Scheduler Utilities
 * Calculates scheduled dates for bulk WordPress posts based on frequency and start date
 */

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface ScheduleOptions {
  frequency: ScheduleFrequency;
  customInterval?: number; // For custom frequency: number of days
  dayOfWeek?: number; // 0-6, where 0 is Sunday (only used for weekly frequency)
  startDate: Date;
  startTime: string; // HH:MM format
  totalRows: number;
}

/**
 * Calculate the scheduled date for a specific row index
 * 
 * @param rowIndex - Zero-based index of the row (0 = first post)
 * @param options - Scheduling options
 * @returns Date object in UTC for the scheduled post
 */
export function calculateScheduledDate(
  rowIndex: number,
  options: ScheduleOptions
): Date {
  const { frequency, customInterval, dayOfWeek, startDate, startTime } = options;
  
  // Parse start time (HH:MM)
  const [hours, minutes] = startTime.split(':').map(Number);
  
  // Create base date from start date with specified time
  const baseDate = new Date(startDate);
  baseDate.setUTCHours(hours || 0, minutes || 0, 0, 0);
  
  // Calculate offset based on frequency
  let daysOffset = 0;
  
  switch (frequency) {
    case 'daily':
      daysOffset = rowIndex;
      break;
      
    case 'weekly':
      if (dayOfWeek !== undefined) {
        // For weekly with specific day of week, find the next occurrence of that day
        if (rowIndex === 0) {
          // First post: find the next occurrence of the selected day of week from start date
          const currentDayOfWeek = baseDate.getUTCDay();
          let daysToAdd = (dayOfWeek - currentDayOfWeek + 7) % 7;
          // If the start date is already the selected day, check if time has passed
          if (daysToAdd === 0) {
            const now = new Date();
            if (baseDate.getTime() <= now.getTime()) {
              // Time has passed, use next week
              daysToAdd = 7;
            }
          }
          daysOffset = daysToAdd;
        } else {
          // Subsequent posts: every 7 days from the first post
          // Calculate first post date
          const firstPostCurrentDay = baseDate.getUTCDay();
          const firstPostDaysToAdd = (dayOfWeek - firstPostCurrentDay + 7) % 7;
          const firstPostDate = new Date(baseDate);
          firstPostDate.setUTCDate(baseDate.getUTCDate() + (firstPostDaysToAdd === 0 && baseDate.getTime() <= new Date().getTime() ? 7 : firstPostDaysToAdd));
          // Calculate this post's date (7 days * rowIndex from first post)
          daysOffset = firstPostDaysToAdd + (rowIndex * 7);
          // Adjust if first post needed to skip to next week
          if (firstPostDaysToAdd === 0 && baseDate.getTime() <= new Date().getTime()) {
            daysOffset = 7 + (rowIndex * 7);
          }
        }
      } else {
        // Fallback to simple weekly calculation if no day specified
        daysOffset = rowIndex * 7;
      }
      break;
      
    case 'monthly':
      // Approximate months as 30 days (WordPress will handle actual month boundaries)
      daysOffset = rowIndex * 30;
      break;
      
    case 'custom':
      daysOffset = rowIndex * (customInterval || 1);
      break;
  }
  
  // Add offset to base date
  const scheduledDate = new Date(baseDate);
  scheduledDate.setUTCDate(baseDate.getUTCDate() + daysOffset);
  
  return scheduledDate;
}

/**
 * Format scheduled date as ISO 8601 string for WordPress API (UTC)
 * 
 * @param date - Date object
 * @returns ISO 8601 string in UTC format (e.g., "2024-01-15T10:00:00")
 */
export function formatWordPressDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/**
 * Generate a human-readable schedule preview
 * 
 * @param options - Scheduling options
 * @returns String describing the schedule (e.g., "5 posts scheduled: Jan 1, Jan 2, Jan 3...")
 */
export function formatSchedulePreview(options: ScheduleOptions): string {
  const { frequency, customInterval, dayOfWeek, startDate, startTime, totalRows } = options;
  
  if (totalRows === 0) {
    return 'No posts to schedule';
  }
  
  // Format frequency description
  let frequencyDesc = '';
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  switch (frequency) {
    case 'daily':
      frequencyDesc = 'daily';
      break;
    case 'weekly':
      if (dayOfWeek !== undefined) {
        frequencyDesc = `weekly on ${dayNames[dayOfWeek]}s`;
      } else {
        frequencyDesc = 'weekly';
      }
      break;
    case 'monthly':
      frequencyDesc = 'monthly';
      break;
    case 'custom':
      frequencyDesc = `every ${customInterval || 1} day${(customInterval || 1) !== 1 ? 's' : ''}`;
      break;
  }
  
  // Calculate first few dates for preview
  const previewDates: string[] = [];
  const maxPreview = Math.min(5, totalRows);
  
  for (let i = 0; i < maxPreview; i++) {
    const date = calculateScheduledDate(i, options);
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== startDate.getFullYear() ? 'numeric' : undefined,
    });
    previewDates.push(dateStr);
  }
  
  let preview = previewDates.join(', ');
  if (totalRows > maxPreview) {
    preview += `... (${totalRows} total)`;
  } else {
    preview += ` (${totalRows} post${totalRows !== 1 ? 's' : ''})`;
  }
  
  return `${totalRows} post${totalRows !== 1 ? 's' : ''} scheduled ${frequencyDesc} starting ${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${startTime}: ${preview}`;
}

/**
 * Get the next available start date (today or tomorrow) based on current time and posting time
 * 
 * @param postingTime - Time of day to post (HH:MM format)
 * @returns Date object for the next available posting time
 */
export function getNextAvailableStartDate(postingTime: string): Date {
  const now = new Date();
  const [hours, minutes] = postingTime.split(':').map(Number);
  
  // Create date with posting time today
  const todayWithTime = new Date(now);
  todayWithTime.setHours(hours || 0, minutes || 0, 0, 0);
  
  // If posting time has already passed today, use tomorrow
  if (todayWithTime <= now) {
    todayWithTime.setDate(todayWithTime.getDate() + 1);
  }
  
  return todayWithTime;
}

