import { TimeSlot } from '@/types';

export interface SlotSummary {
  total: number;
  morning: number;   // Before 12:00
  afternoon: number; // 12:00 - 16:59
  evening: number;   // 17:00 onwards
}

export function getSlotSummary(slots: TimeSlot[]): SlotSummary {
  return slots.reduce((summary, slot) => {
    // Parse time like "6:00 a.m." or "2:30 p.m."
    const [timeStr, period] = slot.time.toLowerCase().split(' ');
    let [hours, minutes] = timeStr.split(':').map(Number);
    
    // Convert to 24-hour format
    if (period === 'p.m.' && hours !== 12) {
      hours += 12;
    } else if (period === 'a.m.' && hours === 12) {
      hours = 0;
    }

    // Classify slots
    if (hours < 12) {
      summary.morning++;
    } else if (hours < 17) {
      summary.afternoon++;
    } else {
      summary.evening++;
    }
    summary.total++;
    
    return summary;
  }, { total: 0, morning: 0, afternoon: 0, evening: 0 });
} 