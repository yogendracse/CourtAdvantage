export interface TimeSlot {
  time: string;
  court: string;
  status?: string;
  reservationLink?: string;
}

export interface DaySchedule {
  date: string;
  slots: TimeSlot[];
}

export interface TennisCourt {
  id: string;
  name: string;
  location: string;
  schedules: DaySchedule[];
}

export interface Park {
  id: string;
  name: string;
  details: string;
  address: string;
  latitude: number;
  longitude: number;
  availableSlots: {
    [date: string]: TimeSlot[];
  };
}

export interface ScrapeResult {
  success: boolean;
  parks: Park[];
  timestamp?: Date;
  error?: string;
}

export interface ParksMapProps {
  parks: Park[];
  selectedDate: Date;
  onParkClick?: (parkId: string) => void;
} 