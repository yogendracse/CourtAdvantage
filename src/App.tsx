import { useState, useRef, Suspense, lazy, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { TennisCourt, CourtAvailability } from '@/utils/database';
import { MagnifyingGlassIcon, ClockIcon, MapPinIcon, ArrowPathIcon, SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { haversineDistanceMiles } from '@/utils/distance';

// Dynamic import of ParksMap
const ParksMap = lazy(() => import('./components/ParksMap'));

type TimePreference = 'no-preference' | 'morning' | 'afternoon' | 'evening';
type CourtTypePreference = 'no-preference' | 'hard' | 'clay';

const TIME_PREFERENCES = [
  { id: 'no-preference', label: 'No Preference', icon: ClockIcon },
  { id: 'morning', label: 'Morning (6:00 AM - 11:59 AM)', icon: SunIcon },
  { id: 'afternoon', label: 'Afternoon (12:00 PM - 4:59 PM)', icon: SunIcon },
  { id: 'evening', label: 'Evening (5:00 PM onwards)', icon: MoonIcon },
] as const;

const COURT_TYPE_PREFERENCES = [
  { id: 'no-preference', label: 'No Preference' },
  { id: 'hard', label: 'Hard Courts' },
  { id: 'clay', label: 'Clay Courts' },
] as const;

function isTimeInPreference(time: string, preference: TimePreference): boolean {
  if (preference === 'no-preference') return true;

  const timeComponents = time.toLowerCase().split(' ');
  const timeStr = timeComponents[0];
  const period = timeComponents[1]; // Will be "a.m." or "p.m."
  
  let [hours, minutes] = timeStr.split(':').map(Number);
  
  // Convert to 24-hour format
  if (period === 'p.m.' && hours !== 12) {
    hours += 12;
  } else if (period === 'a.m.' && hours === 12) {
    hours = 0;
  }

  switch (preference) {
    case 'morning':
      return hours < 12;
    case 'afternoon':
      return hours >= 12 && hours < 17;
    case 'evening':
      return hours >= 17;
    default:
      return true;
  }
}

function isCourtTypeMatch(court: TennisCourt, preference: CourtTypePreference): boolean {
  if (preference === 'no-preference') return true;
  return court.court_type?.toLowerCase() === preference;
}

function playChime() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1); // A5
    
    gain1.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    
    osc1.start();
    osc1.stop(audioCtx.currentTime + 0.15);
    
    setTimeout(() => {
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
      osc2.frequency.exponentialRampToValueAtTime(659.25, audioCtx.currentTime + 0.08); // E5
      
      gain2.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
      
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      
      osc2.start();
      osc2.stop(audioCtx.currentTime + 0.12);
    }, 120);
  } catch (e) {
    console.error("Audio chime failed to play:", e);
  }
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'search' | 'tracker'>('search');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [timePreference, setTimePreference] = useState<TimePreference>('no-preference');
  const [courtTypePreference, setCourtTypePreference] = useState<CourtTypePreference>('no-preference');
  const [isLoading, setIsLoading] = useState(false);
  
  // Data caches
  const [rawCourts, setRawCourts] = useState<TennisCourt[]>([]);
  const [rawAvailability, setRawAvailability] = useState<CourtAvailability[]>([]);
  
  // Rendered state
  const [courts, setCourts] = useState<TennisCourt[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedParkId, setSelectedParkId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [courtAvailability, setCourtAvailability] = useState<Record<string, CourtAvailability[]>>({});
  const mapRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Location input and state
  const [locationQuery, setLocationQuery] = useState<string>('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<string>('');

  // Favorites & Alerts State
  const [favoriteSlots, setFavoriteSlots] = useState<any[]>([]);
  const [favoritesLastUpdated, setFavoritesLastUpdated] = useState<string | null>(null);
  const [isFavoritesLoading, setIsFavoritesLoading] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoOpenEnabled, setAutoOpenEnabled] = useState(true);

  // Periodic 1s timer for lock countdowns
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Request notifications permission on load
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  const triggerDesktopNotification = (title: string, body: string, onClick?: () => void) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, { body });
      if (onClick) {
        notification.onclick = (e) => {
          e.preventDefault();
          window.focus();
          onClick();
        };
      }
    }
  };

  const handleDateChange = (date: Date | null) => {
    setSelectedDate(date);
  };

  const handleSetLocation = async () => {
    const q = locationQuery.trim();
    if (!q) return;
    try {
      setLocationStatus('Resolving location...');
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err?.error || 'Failed to resolve address');
      }
      const data = await res.json();
      setUserLocation({ lat: data.lat, lon: data.lon });
      setLocationStatus(`Location set: ${data.displayName || q}`);
    } catch (e: any) {
      setLocationStatus(e?.message || 'Failed to resolve address');
    }
  };

  const handleCourtClick = (parkId: string) => {
    setSelectedParkId(parkId);
    const courtElement = document.getElementById(`court-${parkId}`);
    if (courtElement) {
      courtElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const scrollToMap = () => {
    if (mapRef.current) {
      mapRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [courtsResponse, availabilityResponse] = await Promise.all([
        fetch('/api/courts'),
        fetch('/api/availability')
      ]);

      if (!courtsResponse.ok || !availabilityResponse.ok) {
        throw new Error('Failed to fetch data');
      }

      const courtsData = await courtsResponse.json();
      const availabilityResponseData = await availabilityResponse.json();
      
      setRawCourts(courtsData);
      setRawAvailability(availabilityResponseData.slots || []);
      setLastUpdate(new Date(availabilityResponseData.lastUpdated || Date.now()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchFavorites = useCallback(async () => {
    setIsFavoritesLoading(true);
    try {
      const res = await fetch('/api/favorites');
      if (!res.ok) throw new Error('Failed to fetch favorite slots');
      const data = await res.json();
      setFavoriteSlots(data.slots || []);
      setFavoritesLastUpdated(data.lastUpdated || null);
    } catch (err) {
      console.error("Error fetching favorites:", err);
    } finally {
      setIsFavoritesLoading(false);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) throw new Error('Failed to fetch notifications');
      const data = await res.json();
      
      // Compare and play chime + notify if new alerts are present
      const lastTime = localStorage.getItem('lastNotifiedTime') || '';
      const unreadNew = data.filter((n: any) => !n.read && n.createdAt > lastTime);
      
      if (unreadNew.length > 0) {
        if (soundEnabled) {
          playChime();
        }
        
        unreadNew.slice(0, 3).forEach((n: any) => {
          if (autoOpenEnabled && n.reservationLink) {
            window.open(n.reservationLink, '_blank');
            // Auto-lock the slot in the app
            const slotId = n.id;
            const slotObj = {
              id: n.id,
              park_id: n.parkId,
              park_name: n.parkName,
              court_id: n.courtId,
              date: n.date,
              time: n.time,
              reservation_link: n.reservationLink,
              is_available: true,
              last_updated: new Date().toISOString()
            };
            fetch('/api/favorites/lock', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slotId, slot: slotObj })
            }).then(() => {
              fetchFavorites();
            }).catch(err => console.error("Auto-lock failed:", err));
          }

          triggerDesktopNotification(
            `New Tennis Slot Available!`,
            `${n.parkName} on ${n.date} at ${n.time} (${n.courtId})`,
            () => {
              setActiveTab('tracker');
            }
          );
        });
        
        const maxCreated = unreadNew.reduce((max: string, n: any) => n.createdAt > max ? n.createdAt : max, lastTime);
        localStorage.setItem('lastNotifiedTime', maxCreated);
      }
      
      setNotifications(data);
    } catch (err) {
      console.error("Error fetching notifications:", err);
    }
  }, [soundEnabled, autoOpenEnabled, fetchFavorites]);

  const applyFilters = useCallback(() => {
    let filteredCourts = rawCourts.filter(court => isCourtTypeMatch(court, courtTypePreference));

    if (userLocation) {
      const origin = { lat: userLocation.lat, lon: userLocation.lon };
      filteredCourts = [...filteredCourts]
        .map(c => ({
          ...c,
          _distanceMiles: isFinite(c.lat) && isFinite(c.lon)
            ? haversineDistanceMiles(origin, { lat: c.lat, lon: c.lon })
            : Number.POSITIVE_INFINITY
        }))
        .sort((a: any, b: any) => (a._distanceMiles ?? Infinity) - (b._distanceMiles ?? Infinity))
        .map(({ _distanceMiles, ...rest }) => rest as TennisCourt);
    }
    setCourts(filteredCourts);

    const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
    
    const availabilityMap = filteredCourts.reduce((acc, court) => {
      const slotsForCourt = rawAvailability.filter(slot => 
        String(slot.park_id) === String(court.park_id) &&
        (dateStr === null || slot.date === dateStr) &&
        isTimeInPreference(slot.time, timePreference)
      );

      if (slotsForCourt.length > 0) {
        acc[court.park_id] = slotsForCourt;
      }
      return acc;
    }, {} as Record<string, CourtAvailability[]>);

    setCourtAvailability(availabilityMap);
  }, [rawCourts, rawAvailability, selectedDate, timePreference, courtTypePreference, userLocation]);

  useEffect(() => {
    fetchData();
    fetchFavorites();
    fetchNotifications();

    const interval = setInterval(() => {
      fetchFavorites();
      fetchNotifications();
    }, 15 * 1000); // refresh favorites & notifications feed every 15s

    return () => clearInterval(interval);
  }, [fetchData, fetchFavorites, fetchNotifications]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const handleSyncData = async () => {
     setIsLoading(true);
     setError(null);
     try {
       const res = await fetch('/api/sync');
       if (!res.ok) throw new Error('Failed to sync data');
       await fetchData();
     } catch (err) {
       setError(err instanceof Error ? err.message : 'Sync Failed');
       setIsLoading(false);
     }
  };

  const handleSyncFavorites = async () => {
    setIsFavoritesLoading(true);
    try {
      const res = await fetch('/api/favorites/sync');
      if (!res.ok) throw new Error('Failed to sync favorites');
      const data = await res.json();
      const slots = data.slots || [];
      
      // Auto-open and auto-lock the slots immediately when synced manually
      if (autoOpenEnabled) {
        slots.forEach((slot: any) => {
          if (slot.reservation_link && !slot.isLocked) {
            window.open(slot.reservation_link, '_blank');
            // Optimistically lock in local UI state
            slot.isLocked = true;
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
            slot.lockExpiresAt = expiresAt.toISOString();
            
            // Register lock in Firestore
            fetch('/api/favorites/lock', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slotId: slot.id, slot })
            }).catch(err => console.error("Auto-lock failed:", err));
          }
        });
      }

      setFavoriteSlots(slots);
      setFavoritesLastUpdated(new Date().toISOString());
      await fetchNotifications();
    } catch (err) {
      console.error("Favorites sync failed:", err);
    } finally {
      setIsFavoritesLoading(false);
    }
  };

  const handleLockSlot = async (slot: any) => {
    if (slot.reservation_link) {
      window.open(slot.reservation_link, '_blank');
    }
    
    try {
      const res = await fetch('/api/favorites/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId: slot.id, slot })
      });
      if (!res.ok) throw new Error('Failed to lock slot');
      await fetchFavorites();
    } catch (err) {
      console.error("Failed to lock slot:", err);
    }
  };

  const handleUnlockSlot = async (slotId: string) => {
    try {
      const res = await fetch('/api/favorites/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId })
      });
      if (!res.ok) throw new Error('Failed to unlock slot');
      await fetchFavorites();
    } catch (err) {
      console.error("Failed to unlock slot:", err);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to clear notifications');
      await fetchNotifications();
    } catch (err) {
      console.error("Failed to read all notifications:", err);
    }
  };

  const formatCountdown = (expiresAtIso: string, currentNowMs: number) => {
    const expiresMs = new Date(expiresAtIso).getTime();
    const remainingMs = expiresMs - currentNowMs;
    if (remainingMs <= 0) return 'Expired';
    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans border-8 border-[#006bb6] overflow-hidden">
      {/* Top Navigation Bar */}
      <nav className="h-16 bg-white border-b-2 border-[#006bb6] flex items-center justify-between px-6 md:px-8 shrink-0 relative z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#f58426] border-2 border-[#006bb6] flex items-center justify-center">
              <div className="w-4 h-4 bg-white rounded-full"></div>
            </div>
            <h1 className="text-xl font-black uppercase tracking-tighter text-[#006bb6] hidden sm:block">
              Court<span className="text-[#f58426] underline">Advantage</span>
            </h1>
          </div>
          
          {/* Navigation Tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('search')}
              className={`px-4 py-2 border-2 border-[#006bb6] text-xs font-black uppercase tracking-wider transition-colors cursor-pointer ${
                activeTab === 'search'
                  ? 'bg-[#006bb6] text-white'
                  : 'bg-white text-[#006bb6] hover:bg-slate-50'
              }`}
            >
              Find Courts
            </button>
            <button
              onClick={() => setActiveTab('tracker')}
              className={`px-4 py-2 border-2 border-[#006bb6] text-xs font-black uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-2 ${
                activeTab === 'tracker'
                  ? 'bg-[#006bb6] text-white'
                  : 'bg-white text-[#006bb6] hover:bg-slate-50'
              }`}
            >
              Favorite Tracker
              <span className="w-2 h-2 rounded-full bg-[#f58426] animate-pulse"></span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Auto-Open Toggle */}
          <button
            onClick={() => setAutoOpenEnabled(!autoOpenEnabled)}
            className={`p-2 border-2 border-[#006bb6] transition-colors cursor-pointer text-xs font-black uppercase ${
              autoOpenEnabled ? 'bg-orange-500 text-white border-orange-500' : 'text-[#006bb6] hover:bg-slate-50'
            }`}
            title={autoOpenEnabled ? "Disable automatic tab opening on new slots" : "Enable automatic tab opening on new slots"}
          >
            {autoOpenEnabled ? '⚡ Auto-Open: On' : '⚡ Auto-Open: Off'}
          </button>

          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 border-2 border-[#006bb6] text-[#006bb6] hover:bg-slate-50 transition-colors cursor-pointer text-xs font-black uppercase"
            title={soundEnabled ? "Mute audio chime" : "Unmute audio chime"}
          >
            {soundEnabled ? '🔊 Sound' : '🔇 Muted'}
          </button>

          {/* Notifications Bell Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className="p-2 border-2 border-[#006bb6] text-[#006bb6] hover:bg-slate-50 transition-colors flex items-center gap-1 relative cursor-pointer text-xs font-black uppercase"
            >
              <span>Alerts</span>
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center animate-bounce border-2 border-white">
                  {notifications.filter(n => !n.read).length}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white border-2 border-[#006bb6] shadow-[6px_6px_0px_#006bb6] overflow-hidden z-50">
                <div className="p-3 border-b-2 border-[#006bb6] flex justify-between items-center bg-slate-50">
                  <span className="text-[10px] font-black uppercase text-slate-500">Notifications Feed</span>
                  {notifications.filter(n => !n.read).length > 0 && (
                    <button
                      onClick={handleMarkAllNotificationsRead}
                      className="text-[9px] font-black uppercase text-[#006bb6] underline hover:text-[#f58426]"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 uppercase font-bold">
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map((n, i) => (
                      <div key={i} className={`p-3 text-xs ${n.read ? 'opacity-60' : 'bg-orange-50/50'}`}>
                        <div className="flex justify-between items-start gap-1">
                          <span className="font-black text-[#006bb6] uppercase break-words">{n.parkName}</span>
                          <span className="text-[9px] text-slate-400 font-mono shrink-0">
                            {format(new Date(n.createdAt), 'MM/dd HH:mm')}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-600 font-bold uppercase mt-1">
                          {n.date} @ {n.time} ({n.courtId})
                        </p>
                        <div className="flex justify-between items-center mt-2">
                          <a
                            href={n.reservationLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] font-black uppercase text-white bg-[#f58426] px-2 py-0.5 hover:bg-[#e07622]"
                          >
                            Book
                          </a>
                          {!n.read && (
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="hidden md:flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#f58426] animate-pulse"></span>
            <span className="text-xs font-bold uppercase text-slate-500">Live Scrape Active</span>
          </div>
        </div>
      </nav>

      {/* Main Layout Container */}
      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {activeTab === 'search' ? (
          <>
            {/* Left Sidebar: Controls */}
            <aside className="w-full md:w-80 border-b-2 md:border-b-0 md:border-r-2 border-[#006bb6] bg-white p-6 flex flex-col gap-8 overflow-y-auto shrink-0">
              
              {/* Location Input */}
              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Location</h2>
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={locationQuery}
                      onChange={(e) => setLocationQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSetLocation();
                        }
                      }}
                      placeholder="ZIP or Address"
                      className="w-full border-2 border-[#006BB6] focus:outline-none focus:ring-0 focus:border-[#f58426] h-12 pl-4 pr-12 text-[#006BB6] font-bold placeholder-slate-400 transition-colors bg-white rounded-none shadow-[4px_4px_0px_#f58426]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!('geolocation' in navigator)) {
                          setLocationStatus('Geolocation not supported');
                          return;
                        }
                        setLocationStatus('Requesting location permission...');
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            const { latitude, longitude } = pos.coords;
                            setUserLocation({ lat: latitude, lon: longitude });
                            setLocationStatus('Location set from device');
                          },
                          (err) => {
                            setLocationStatus(err.message || 'Failed to get current location');
                          },
                          { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 }
                        );
                      }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 p-2 text-slate-400 hover:text-[#f58426] transition-colors"
                      title="Use my current location"
                    >
                      <MapPinIcon className="w-5 h-5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleSetLocation}
                    className="w-full px-4 py-3 mt-2 border-2 border-[#006bb6] bg-white text-[#006bb6] font-black uppercase text-xs hover:bg-slate-50 transition-colors shadow-[4px_4px_0px_#006bb6] active:translate-y-1 active:shadow-none"
                  >
                    Set Location
                  </button>
                  {locationStatus && (
                    <p className="mt-2 text-xs font-bold text-slate-500 uppercase">{locationStatus}</p>
                  )}
                </div>
              </div>

              {/* Date Selection */}
              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Select Date</h2>
                <DatePicker
                  selected={selectedDate}
                  onChange={handleDateChange}
                  dateFormat="MMMM d, yyyy"
                  minDate={new Date()}
                  isClearable
                  placeholderText="All Dates"
                  className="w-full border-2 border-[#006bb6] focus:outline-none focus:ring-0 focus:border-[#f58426] h-12 px-4 text-[#006bb6] font-bold transition-colors bg-white rounded-none shadow-[4px_4px_0px_#f58426]"
                  wrapperClassName="w-full"
                  calendarClassName="!font-sans !border-2 !border-[#006bb6] !rounded-none !shadow-[6px_6px_0px_#006bb6]"
                />
              </div>

              {/* Court Type Preference */}
              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Court Type</h2>
                <div className="flex flex-col gap-3">
                  {COURT_TYPE_PREFERENCES.map(({ id, label }) => (
                    <label key={id} className="flex items-center gap-3 cursor-pointer group">
                      <div className={`w-5 h-5 border-2 border-[#006bb6] ${courtTypePreference === id ? 'bg-[#f58426]' : 'bg-white'}`}></div>
                      <input 
                        type="radio" 
                        name="courtTypePreference" 
                        value={id} 
                        checked={courtTypePreference === id} 
                        onChange={() => setCourtTypePreference(id as CourtTypePreference)} 
                        className="sr-only" 
                      />
                      <span className={`text-sm font-bold text-[#006bb6] group-hover:text-[#f58426] ${courtTypePreference === id ? 'text-[#f58426]' : ''}`}>
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Time Preference */}
              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Time Preference</h2>
                <div className="grid grid-cols-2 gap-2">
                  {TIME_PREFERENCES.map(({ id, label }) => {
                    const shortLabel = id === 'no-preference' ? 'Any' : id === 'morning' ? 'Morning' : id === 'afternoon' ? 'Afternoon' : 'Evening';
                    return (
                      <button
                        key={id}
                        onClick={() => setTimePreference(id as TimePreference)}
                        className={`p-2 border-2 border-[#006bb6] text-[10px] font-black uppercase transition-colors shadow-[2px_2px_0px_#006bb6] ${
                          timePreference === id
                            ? 'bg-[#006bb6] text-white'
                            : 'bg-white text-[#006bb6] hover:bg-slate-50'
                        }`}
                      >
                        {shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sync Latest Data Button */}
              <div className="mt-8">
                <button
                  onClick={handleSyncData}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center px-4 py-4 border-2 border-[#006bb6] text-sm font-black uppercase rounded-none shadow-[6px_6px_0px_#f58426] text-white bg-[#f58426] hover:bg-[#e07622] disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-1 active:shadow-none transition-all"
                >
                  {isLoading ? (
                    <>
                      <ArrowPathIcon className="animate-spin -ml-1 mr-2 h-5 w-5" />
                      Syncing System...
                    </>
                  ) : (
                    <>
                      <ArrowPathIcon className="-ml-1 mr-2 h-5 w-5" />
                      Download Availability
                    </>
                  )}
                </button>
                <p className="text-xs text-[#006bb6] opacity-70 text-center mt-3 font-bold uppercase tracking-wider">
                  Fetches global NYCParks slots
                </p>
              </div>

              <div className="mt-auto pt-6 border-t font-mono text-[10px] text-slate-400 uppercase font-black tracking-widest">
                {lastUpdate ? `Last updated: ${format(lastUpdate, 'HH:mm:ss')}` : 'Awaiting sync...'}
              </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 p-4 md:p-8 bg-[#E2E8F0] overflow-y-auto">
              {error && (
                <div className="bg-red-50 border-2 border-red-500 p-4 mb-8 shadow-[4px_4px_0px_#ef4444]">
                  <p className="text-red-700 font-bold uppercase text-sm">{error}</p>
                </div>
              )}

              {/* Results Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4">
                <div>
                  <h2 className="text-4xl font-black text-[#006bb6] uppercase tracking-tighter leading-none">
                    {courts.length > 0 ? 'Court Results' : 'Find Your Court'}
                  </h2>
                  <p className="text-slate-600 font-bold uppercase tracking-widest mt-2">{selectedDate ? format(selectedDate, 'EEEE — MMMM do, yyyy') : 'All Dates'}</p>
                </div>
                {lastUpdate && (
                  <div className="bg-white border-2 border-[#f58426] px-4 py-2 shadow-[4px_4px_0px_#f58426]">
                     <p className="text-[10px] text-[#f58426] font-black uppercase tracking-widest mb-1">Data Last Synced</p>
                     <p className="text-[#006bb6] font-mono font-bold text-sm">
                       {format(lastUpdate, 'MMM do, h:mm a')}
                     </p>
                  </div>
                )}
              </div>

              {/* Map Section */}
              <div className="mb-8" ref={mapRef}>
                <div className="bg-white border-2 border-[#006bb6] p-2 shadow-[6px_6px_0px_#006bb6] mb-8">
                  <Suspense fallback={
                    <div className="w-full h-[400px] bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center">
                      <div className="text-slate-400 font-bold uppercase tracking-widest text-xs">Loading map data...</div>
                    </div>
                  }>
                    <ParksMap
                      courts={courts}
                      selectedDate={selectedDate}
                      onParkClick={handleCourtClick}
                      userLocation={userLocation || undefined}
                      courtAvailability={courtAvailability}
                    />
                  </Suspense>
                </div>
              </div>

              {/* Results Grid */}
              <div ref={resultsRef} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {courts.map((court) => {
                  const availableSlots = courtAvailability[court.park_id] || [];
                  if (availableSlots.length === 0) return null;

                  const slotsCount = availableSlots.length;

                  return (
                    <div 
                      key={court.park_id} 
                      id={`court-${court.park_id}`}
                      className={`bg-white border-2 border-[#006bb6] p-5 shadow-[6px_6px_0px_#006bb6] flex flex-col transition-all duration-300 h-[500px] ${
                        selectedParkId === court.park_id ? 'ring-4 ring-[#f58426] ring-offset-2 ring-offset-[#E2E8F0]' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start mb-4 shrink-0">
                        <span className="px-2 py-1 bg-orange-100 text-[#f58426] text-[10px] font-black border border-[#f58426] uppercase">
                          {slotsCount} Slot{slotsCount !== 1 ? 's' : ''} Left
                        </span>
                        <span className="text-slate-400 font-mono text-xs hidden sm:inline-block truncate max-w-[80px]">#{court.park_id.substring(0, 8)}</span>
                      </div>
                      
                      <h3 className="text-lg font-black text-[#006bb6] uppercase leading-none break-words">
                        {court.park_name}
                      </h3>
                      <div className="flex flex-col gap-1 mt-2 mb-4 shrink-0">
                        <p className="text-xs text-slate-500 uppercase font-bold break-words">{court.address}</p>
                        {userLocation && isFinite(court.lat) && isFinite(court.lon) && (
                          <p className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                            DST: {haversineDistanceMiles(userLocation, { lat: court.lat, lon: court.lon }).toFixed(1)} MILES
                          </p>
                        )}
                      </div>

                      <div className="mt-4 space-y-4 flex-grow overflow-y-auto pr-2 custom-scrollbar">
                        {Object.entries(
                          availableSlots.reduce((acc, slot) => {
                            if (!acc[slot.date]) acc[slot.date] = {};
                            if (!acc[slot.date][slot.court_id]) acc[slot.date][slot.court_id] = [];
                            acc[slot.date][slot.court_id].push(slot);
                            return acc;
                          }, {} as Record<string, Record<string, typeof availableSlots>>)
                        ).sort(([dateA], [dateB]) => dateA.localeCompare(dateB)).map(([dateStr, courtsMap]) => {
                          const [year, month, day] = dateStr.split('-');
                          const d = new Date(parseInt(year), parseInt(month)-1, parseInt(day));
                          
                          return (
                            <div key={dateStr} className="border-t border-[#f58426]/30 pt-3">
                              <span className="text-[#006bb6] text-xs uppercase font-black block mb-3 border-l-4 border-[#f58426] pl-2">{format(d, 'EEEE, MMM do')}</span>
                              
                              <div className="space-y-3">
                                {Object.entries(courtsMap).map(([courtName, slots]) => (
                                  <div key={courtName} className="pl-2">
                                    <span className="text-slate-500 text-[10px] uppercase font-bold block mb-2">{courtName}</span>
                                    {slots.map((slot: any, index) => {
                                      const isLocked = slot.isLocked && slot.lockExpiresAt && new Date(slot.lockExpiresAt).getTime() > nowMs;
                                      return (
                                        <div key={index} className="flex justify-between items-center text-sm py-1.5 border-b border-slate-50 last:border-b-0">
                                          <span className="font-bold flex items-center text-slate-700">
                                            <ClockIcon className="w-3 h-3 mr-1 text-[#f58426]" />
                                            {slot.time}
                                          </span>
                                          {isLocked ? (
                                            <div className="flex gap-1.5 items-center">
                                              <span className="text-[9px] font-black uppercase text-orange-600 bg-orange-50 border border-orange-400 px-2 py-1 animate-pulse">
                                                Locked ({formatCountdown(slot.lockExpiresAt, nowMs)})
                                              </span>
                                              {slot.reservation_link && (
                                                <a
                                                  href={slot.reservation_link}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="text-[9px] font-black text-white bg-orange-500 hover:bg-orange-600 px-2 py-1 rounded-sm uppercase tracking-wider transition-colors"
                                                >
                                                  Open
                                                </a>
                                              )}
                                              <button
                                                onClick={() => handleUnlockSlot(slot.id)}
                                                className="text-[9px] font-black text-red-500 hover:text-red-700 uppercase cursor-pointer"
                                              >
                                                Release
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() => handleLockSlot(slot)}
                                              className="text-white bg-[#f58426] px-2 py-1 rounded-sm font-black uppercase text-[10px] hover:bg-[#e07622] transition-colors cursor-pointer"
                                            >
                                              Book
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="pt-4 mt-4 border-t border-slate-100 flex justify-end shrink-0">
                        <button
                          onClick={scrollToMap}
                          className="text-slate-400 flex items-center font-bold text-[10px] uppercase tracking-widest hover:text-[#006bb6] transition-colors cursor-pointer"
                          title="View on map"
                        >
                          <MapPinIcon className="h-3 w-3 mr-1" /> View Map
                        </button>
                      </div>
                    </div>
                  );
                }).filter(Boolean)}
              </div>

              {/* No Results State */}
              {!isLoading && !error && courts.length > 0 && !Object.values(courtAvailability).some(slots => slots.length > 0) && (
                <div className="bg-white border-2 border-[#006bb6] p-8 shadow-[6px_6px_0px_#006bb6] text-center max-w-2xl mt-8">
                  <h3 className="text-xl font-black text-[#006bb6] uppercase tracking-tighter mb-2">No Slots Available</h3>
                  <p className="text-slate-600 font-medium text-sm">
                    No {courtTypePreference !== 'no-preference' ? `${courtTypePreference} ` : ''}courts found{selectedDate ? ` for ${format(selectedDate, 'MMMM d, yyyy')}` : ''}
                    {timePreference !== 'no-preference' && ` during ${timePreference} hours`}.
                  </p>
                  <p className="mt-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Adjust filters and search again</p>
                </div>
              )}
              
              {/* Bottom Highlight */}
              <div className="bg-[#006bb6] border-2 border-[#006bb6] p-6 flex flex-col sm:flex-row justify-between items-center mt-12 gap-4 shadow-[6px_6px_0px_#006bb6]">
                <div className="flex flex-col text-center sm:text-left">
                   <h4 className="text-[#f58426] font-black uppercase italic tracking-widest">Powered by Open Data</h4>
                   <p className="text-white text-xs opacity-70 mt-1">Data from NYC Parks matching current availability</p>
                </div>
                {userLocation && (
                  <div className="flex gap-4">
                    <div className="text-right hidden sm:block">
                       <p className="text-white font-mono text-[10px] leading-tight">Lat: {userLocation.lat.toFixed(4)}°</p>
                       <p className="text-white font-mono text-[10px] leading-tight">Lng: {userLocation.lon.toFixed(4)}°</p>
                    </div>
                  </div>
                )}
              </div>
            </main>
          </>
        ) : (
          <>
            {/* Tracker Left Sidebar: Config & Policy */}
            <aside className="w-full md:w-80 border-b-2 md:border-b-0 md:border-r-2 border-[#006bb6] bg-white p-6 flex flex-col gap-8 overflow-y-auto shrink-0">
              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Monitored Parks</h2>
                <div className="space-y-4">
                  <div className="p-4 border-2 border-[#006bb6] bg-slate-50 relative">
                    <span className="absolute -top-3 left-3 bg-[#f58426] text-white text-[9px] font-black uppercase px-2 py-0.5 border border-[#006bb6]">ID: 11</span>
                    <h3 className="font-black text-[#006bb6] uppercase text-sm mt-1">McCarren Park</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Williamsburg, Brooklyn (Hard Courts)</p>
                  </div>
                  <div className="p-4 border-2 border-[#006bb6] bg-slate-50 relative">
                    <span className="absolute -top-3 left-3 bg-[#f58426] text-white text-[9px] font-black uppercase px-2 py-0.5 border border-[#006bb6]">ID: 3</span>
                    <h3 className="font-black text-[#006bb6] uppercase text-sm mt-1">Riverside Park (96th St)</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Upper West Side, Manhattan (Clay Courts)</p>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Daily 12:00 AM Rules</h2>
                <div className="p-4 border-2 border-dashed border-[#006bb6] bg-orange-50/50 space-y-3">
                  <div>
                    <p className="text-xs font-black text-[#006bb6] uppercase">📅 Weekdays</p>
                    <p className="text-sm font-bold text-slate-700 mt-1">7:00 AM, 8:00 AM, 4:00 PM, 5:00 PM, 6:00 PM</p>
                  </div>
                  <div className="border-t border-[#006bb6]/20 pt-2">
                    <p className="text-xs font-black text-[#006bb6] uppercase">📅 Weekends</p>
                    <p className="text-sm font-bold text-slate-700 mt-1">9:00 AM, 10:00 AM, 11:00 AM, 12:00 PM</p>
                  </div>
                </div>
              </div>

              <div>
                <button
                  onClick={handleSyncFavorites}
                  disabled={isFavoritesLoading}
                  className="w-full flex items-center justify-center px-4 py-4 border-2 border-[#006bb6] text-sm font-black uppercase rounded-none shadow-[6px_6px_0px_#f58426] text-white bg-[#f58426] hover:bg-[#e07622] disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-1 active:shadow-none transition-all cursor-pointer"
                >
                  {isFavoritesLoading ? (
                    <>
                      <ArrowPathIcon className="animate-spin -ml-1 mr-2 h-5 w-5" />
                      Scanning Favorites...
                    </>
                  ) : (
                    <>
                      <ArrowPathIcon className="-ml-1 mr-2 h-5 w-5" />
                      Sync Tracker
                    </>
                  )}
                </button>
                <p className="text-xs text-[#006bb6] opacity-70 text-center mt-3 font-bold uppercase tracking-wider">
                  Manually pulls McCarren & Riverside slots
                </p>
                {autoOpenEnabled && (
                  <p className="text-[10px] text-orange-600 text-center mt-2 font-black uppercase tracking-wider animate-pulse">
                    ⚠️ Enable pop-ups for localhost:3000 to auto-lock drops
                  </p>
                )}
              </div>

              <div className="mt-auto pt-6 border-t font-mono text-[10px] text-slate-400 uppercase font-black tracking-widest">
                {favoritesLastUpdated ? `Last updated: ${format(new Date(favoritesLastUpdated), 'HH:mm:ss')}` : 'Awaiting sync...'}
              </div>
            </aside>

            {/* Tracker Main Content: Matching target slots */}
            <main className="flex-1 p-4 md:p-8 bg-[#E2E8F0] overflow-y-auto">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4">
                <div>
                  <h2 className="text-4xl font-black text-[#006bb6] uppercase tracking-tighter leading-none">
                    Favorite Tracker
                  </h2>
                  <p className="text-slate-600 font-bold uppercase tracking-widest mt-2">
                    Monitored Slots for McCarren & Riverside 96th St
                  </p>
                </div>
                {favoritesLastUpdated && (
                  <div className="bg-white border-2 border-[#f58426] px-4 py-2 shadow-[4px_4px_0px_#f58426]">
                    <p className="text-[10px] text-[#f58426] font-black uppercase tracking-widest mb-1">Tracker Synced</p>
                    <p className="text-[#006bb6] font-mono font-bold text-sm">
                      {format(new Date(favoritesLastUpdated), 'MMM do, h:mm a')}
                    </p>
                  </div>
                )}
              </div>

              {/* Active Matches Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {favoriteSlots.map((slot) => {
                  const isLocked = slot.isLocked && slot.lockExpiresAt && new Date(slot.lockExpiresAt).getTime() > nowMs;
                  return (
                    <div
                      key={slot.id}
                      className={`bg-white border-2 border-[#006bb6] p-5 shadow-[6px_6px_0px_#006bb6] flex flex-col justify-between transition-all duration-300 h-64 relative overflow-hidden ${
                        isLocked ? 'ring-4 ring-orange-500 border-orange-500' : ''
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="px-2 py-0.5 bg-orange-100 text-[#f58426] text-[9px] font-black border border-[#f58426] uppercase">
                            {slot.park_name}
                          </span>
                          <span className="text-slate-400 font-mono text-[10px] uppercase">
                            {slot.court_id}
                          </span>
                        </div>
                        
                        <h3 className="text-2xl font-black text-[#006bb6] uppercase mt-2 tracking-tighter leading-none">
                          {slot.time}
                        </h3>
                        
                        <p className="text-sm font-bold text-slate-500 uppercase mt-2">
                          {(() => {
                            const [y, m, d] = slot.date.split('-').map(Number);
                            return format(new Date(y, m - 1, d), 'EEEE, MMM do, yyyy');
                          })()}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2 items-center">
                        {isLocked ? (
                          <div className="flex flex-col gap-2 w-full">
                            <div className="flex gap-2">
                              <div className="flex-1 px-3 py-2.5 bg-orange-50 border border-orange-500 text-orange-700 font-black uppercase text-[10px] flex items-center justify-center gap-1.5 animate-pulse">
                                <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
                                Held: {formatCountdown(slot.lockExpiresAt, nowMs)}
                              </div>
                              {slot.reservation_link && (
                                <a
                                  href={slot.reservation_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-black uppercase text-[10px] flex items-center justify-center transition-colors cursor-pointer"
                                  title="Re-open the booking page"
                                >
                                  Reserve Link
                                </a>
                              )}
                            </div>
                            <button
                              onClick={() => handleUnlockSlot(slot.id)}
                              className="w-full py-2 border border-red-500 text-red-500 hover:bg-red-50 font-black uppercase text-[10px] transition-colors cursor-pointer"
                              title="Release this booking block immediately"
                            >
                              Unlock & Release Slot
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleLockSlot(slot)}
                            className="w-full py-2.5 bg-[#006bb6] hover:bg-[#005a9c] text-white font-black uppercase text-xs transition-colors cursor-pointer"
                          >
                            Book & Lock 15m
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Empty State */}
              {favoriteSlots.length === 0 && (
                <div className="bg-white border-2 border-[#006bb6] p-12 shadow-[6px_6px_0px_#006bb6] text-center max-w-2xl mx-auto mt-12">
                  <div className="w-16 h-16 bg-orange-100 border-2 border-[#006bb6] flex items-center justify-center mx-auto mb-4 rounded-full">
                    <span className="text-2xl">🎾</span>
                  </div>
                  <h3 className="text-xl font-black text-[#006bb6] uppercase tracking-tighter mb-2">No Monitored Slots Found</h3>
                  <p className="text-slate-600 font-bold text-sm uppercase tracking-wider">
                    No available court times match McCarren Park or Riverside 96th St for our daily target schedule.
                  </p>
                  <p className="mt-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Target hours: Weekdays 7-8am & 4-6pm | Weekends 9am-12pm
                  </p>
                </div>
              )}
            </main>
          </>
        )}
      </div>
    </div>
  );
}
