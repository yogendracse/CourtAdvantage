// Tennis court types
export interface TennisCourt {
  park_id: string;  
  park_name: string;
  park_details?: string;
  address: string;
  lat: number;
  lon: number;
  num_courts: number;
  phone?: string;
  email?: string;
  hours?: string;
  website?: string;
  court_type?: string;
}

export interface CourtAvailability {
  park_id: string;  
  court_id: string; 
  date: string;
  time: string;
  status: string;
  reservation_link?: string;
  is_available: boolean; 
} 