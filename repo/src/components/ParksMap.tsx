'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { format } from 'date-fns';
import { TennisCourt, CourtAvailability } from '@/utils/database';

// Import L only on client side
let L: any;
if (typeof window !== 'undefined') {
  L = require('leaflet');
}

interface TimeSlot {
  time: string;
  court: string;
  status: string;
  reservation_link?: string;
}

interface SlotSummary {
  total: number;
  morning: number;   // Before 12:00
  afternoon: number; // 12:00 - 16:59
  evening: number;   // 17:00 onwards
}

interface ParksMapProps {
  courts: TennisCourt[];
  selectedDate: Date;
  onParkClick: (parkId: string) => void;
  userLocation?: { lat: number; lon: number };
}

function getSlotSummary(slots: TimeSlot[]): SlotSummary {
  return slots.reduce((summary, slot) => {
    // Parse time like "6:00 a.m." or "2:30 p.m."
    const timeComponents = slot.time.toLowerCase().split(' ');
    const timeStr = timeComponents[0];
    const period = timeComponents[1]; // Will be "a.m." or "p.m."
    
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

// Create a dynamic map component that only loads on the client side
const Map = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), {
  ssr: false,
});

// Default coordinates (Central Park Tennis Center)
const DEFAULT_CENTER = [40.7831, -73.9712];

export default function ParksMap({ courts, selectedDate, onParkClick, userLocation }: ParksMapProps) {
  const [mounted, setMounted] = useState(false);
  const [expandedCourtId, setExpandedCourtId] = useState<string | null>(null);
  const [availabilityData, setAvailabilityData] = useState<Record<string, TimeSlot[]>>({});
  const [customIcon, setCustomIcon] = useState<any>(null);

  useEffect(() => {
    setMounted(true);
    // Initialize Leaflet icon only on client side
    if (typeof window !== 'undefined') {
      setCustomIcon(
        new L.Icon({
          iconUrl: '/tennis-marker.svg',
          iconSize: [32, 32],
          iconAnchor: [16, 32],
          popupAnchor: [0, -32],
        })
      );
    }
  }, []);

  useEffect(() => {
    // Fetch availability data for all courts when selectedDate changes
    const fetchAvailability = async () => {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const availabilityPromises = courts.map(async (court) => {
        const response = await fetch(`/api/courts?parkId=${court.park_id}&date=${dateStr}`);
        const data: CourtAvailability[] = await response.json();
        return {
          parkId: court.park_id,
          slots: data.map(slot => ({
            time: slot.time,
            court: slot.court_id,
            status: slot.status,
            reservation_link: slot.reservation_link
          }))
        };
      });

      const results = await Promise.all(availabilityPromises);
      const availabilityMap = results.reduce((acc, { parkId, slots }) => {
        acc[parkId] = slots;
        return acc;
      }, {} as Record<string, TimeSlot[]>);
      
      setAvailabilityData(availabilityMap);
    };

    if (courts.length > 0) {
      fetchAvailability();
    }
  }, [selectedDate, courts]);

  // Calculate center of all courts with valid coordinates
  const center = courts.length > 0 ? courts.reduce(
    (acc, court) => {
      if (isFinite(court.lat) && isFinite(court.lon)) {
        acc[0] += court.lat;
        acc[1] += court.lon;
        acc[2]++; // Count valid coordinates
      }
      return acc;
    },
    [0, 0, 0]
  ).map((val, idx) => idx < 2 ? (val / (courts.length || 1)) || DEFAULT_CENTER[idx] : val) : DEFAULT_CENTER;

  if (!mounted || !customIcon) return null;

  const handleMarkerClick = (courtId: string) => {
    if (expandedCourtId === courtId) {
      // If marker is already expanded, clicking again will scroll to details
      onParkClick(courtId);
    } else {
      // First click just expands the popup
      setExpandedCourtId(courtId);
    }
  };

  // Filter out courts with invalid coordinates
  const validCourts = courts.filter(court => 
    isFinite(court.lat) && 
    isFinite(court.lon) && 
    Math.abs(court.lat) <= 90 && 
    Math.abs(court.lon) <= 180
  );

  return (
    <div className="relative w-full h-[400px] rounded-lg overflow-hidden shadow-lg">
      <Map
        center={[center[0], center[1]]}
        zoom={12}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lon]}>
            <Popup>
              <div className="p-2 text-sm">Your location</div>
            </Popup>
          </Marker>
        )}

        {validCourts.map((court) => {
          const slots = availabilityData[court.park_id] || [];
          const summary = getSlotSummary(slots);

          return (
            <Marker
              key={court.park_id}
              position={[court.lat, court.lon]}
              icon={customIcon}
              eventHandlers={{
                click: () => handleMarkerClick(court.park_id),
              }}
            >
              <Popup>
                <div className="p-3 min-w-[250px]">
                  <h3 className="font-bold text-sm mb-2">{court.park_name}</h3>
                  <p className="text-xs text-gray-600 mb-2">{court.address}</p>
                  
                  <div className="mt-3 space-y-1 text-sm">
                    <div className={`font-semibold ${summary.total > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                      {summary.total > 0 ? (
                        `${summary.total} Available Slots on ${format(selectedDate, 'MMMM d, yyyy')}`
                      ) : (
                        `No available slots on ${format(selectedDate, 'MMMM d, yyyy')}`
                      )}
                    </div>
                    {summary.total > 0 && (
                      <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                        <div className="bg-yellow-50 p-2 rounded" title="6:00 a.m. - 11:59 a.m.">
                          <div className="font-medium text-yellow-800">Morning</div>
                          <div className="text-yellow-600">{summary.morning} slots</div>
                        </div>
                        <div className="bg-blue-50 p-2 rounded" title="12:00 p.m. - 4:59 p.m.">
                          <div className="font-medium text-blue-800">Afternoon</div>
                          <div className="text-blue-600">{summary.afternoon} slots</div>
                        </div>
                        <div className="bg-purple-50 p-2 rounded" title="5:00 p.m. - onwards">
                          <div className="font-medium text-purple-800">Evening</div>
                          <div className="text-purple-600">{summary.evening} slots</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onParkClick(court.park_id);
                    }}
                    className="mt-3 w-full text-xs bg-blue-500 hover:bg-blue-600 text-white py-2 px-3 rounded transition-colors"
                  >
                    View Full Details
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </Map>
    </div>
  );
} 