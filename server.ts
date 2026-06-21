import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import csv from 'csv-parser';
import cloudscraper from 'cloudscraper';
import * as cheerio from 'cheerio';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where,
  orderBy,
  limit 
} from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

// Initialize Firebase Client
const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase, firebaseConfig.firestoreDatabaseId);

const FAVORITE_PARK_IDS = ['3', '11'];
const FAVORITE_PARK_NAMES: Record<string, string> = {
  '3': 'Riverside Park (96th St)',
  '11': 'McCarren Park'
};

function isWeekend(dateStr: string): boolean {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  return dayOfWeek === 0 || dayOfWeek === 6;
}

function isTargetFavoriteSlot(parkId: string, dateStr: string, timeStr: string): boolean {
  if (!FAVORITE_PARK_IDS.includes(String(parkId))) return false;
  
  const weekend = isWeekend(dateStr);
  const cleanTime = timeStr.trim().toLowerCase();
  
  if (weekend) {
    // Weekend target hours: 9:00 AM, 10:00 AM, 11:00 AM, 12:00 PM
    const weekendTargetHours = ['9:00 a.m.', '10:00 a.m.', '11:00 a.m.', '12:00 p.m.'];
    return weekendTargetHours.includes(cleanTime);
  } else {
    // Weekday target hours: 7:00 AM, 8:00 AM, 4:00 PM, 5:00 PM, 6:00 PM
    const weekdayTargetHours = ['7:00 a.m.', '8:00 a.m.', '4:00 p.m.', '5:00 p.m.', '6:00 p.m.'];
    return weekdayTargetHours.includes(cleanTime);
  }
}

async function getActiveLocks(): Promise<Record<string, { lockedAt: string; expiresAt: string; slotDetails?: any }>> {
  try {
    const locksCollection = collection(db, 'slotLocks');
    const querySnapshot = await getDocs(locksCollection);
    const now = new Date().getTime();
    const locksMap: Record<string, { lockedAt: string; expiresAt: string; slotDetails?: any }> = {};
    
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const expiresMs = new Date(data.expiresAt).getTime();
      if (expiresMs > now) {
        locksMap[docSnap.id] = {
          lockedAt: data.lockedAt,
          expiresAt: data.expiresAt,
          slotDetails: data.slotDetails
        };
      } else {
        // Clean up expired lock in the background
        deleteDoc(doc(db, 'slotLocks', docSnap.id)).catch(() => {});
      }
    });
    return locksMap;
  } catch (err) {
    console.error('Error fetching locks:', err);
    return {};
  }
}

async function syncFavoriteParksData() {
  try {
    const scrapedAvailability: any[] = [];
    
    for (const courtId of FAVORITE_PARK_IDS) {
      const url = `https://www.nycgovparks.org/tennisreservation/availability/${courtId}`;
      try {
        const html = (await cloudscraper.get(url)) as any;
        const $ = cheerio.load(html);
        
        $('div[id^="20"]').each((_: any, tab: any) => {
          const date = $(tab).attr('id') || ''; 
          
          $(tab).find('tbody tr').each((_: any, row: any) => {
            const time = $(row).find('td:first-child').text().trim();
            
            $(row).find('td:not(:first-child)').each((_: any, cell: any) => {
              const status = $(cell).text().trim();
              const reservationLink = $(cell).find('a').attr('href');
              const courtName = $(cell).closest('table').find('th').eq($(cell).index() - 1).text().trim();

              const isAvailable = status.toLowerCase().includes('reserve');
              if (isAvailable && isTargetFavoriteSlot(courtId, date, time)) {
                scrapedAvailability.push({
                  park_id: courtId, 
                  park_name: FAVORITE_PARK_NAMES[courtId] || 'Favorite Park',
                  court_id: courtName,
                  date,
                  time,
                  status,
                  reservation_link: reservationLink ? (reservationLink.startsWith('http') ? reservationLink : `https://www.nycgovparks.org${reservationLink}`) : '',
                  is_available: true,
                  last_updated: new Date().toISOString()
                });
              }
            });
          });
        });
      } catch (err: any) {
        console.error(`Failed to scrape favorite park ${courtId}:`, err.message);
      }
    }

    const nowIso = new Date().toISOString();
    
    // Compare with previous slots to generate notifications
    let previousSlotsMap = new Set<string>();
    try {
      const docSnap = await getDoc(doc(db, 'favoritesData', 'latest'));
      if (docSnap.exists()) {
        const prevSlots = docSnap.data()?.slots || [];
        prevSlots.forEach((slot: any) => {
          const slotId = `${slot.park_id}-${slot.date}-${slot.time}-${slot.court_id}`.replace(/[\s.]/g, '');
          previousSlotsMap.add(slotId);
        });
      }
    } catch (e) {
      console.warn("Could not fetch previous favorites for comparison:", e);
    }

    const newSlots = scrapedAvailability.filter(slot => {
      const slotId = `${slot.park_id}-${slot.date}-${slot.time}-${slot.court_id}`.replace(/[\s.]/g, '');
      return !previousSlotsMap.has(slotId);
    });

    for (const slot of newSlots) {
      const slotId = `${slot.park_id}-${slot.date}-${slot.time}-${slot.court_id}`.replace(/[\s./:]/g, '-');
      const notifDocRef = doc(db, 'notifications', slotId);
      await setDoc(notifDocRef, {
        id: slotId,
        parkId: slot.park_id,
        parkName: slot.park_name,
        courtId: slot.court_id,
        date: slot.date,
        time: slot.time,
        reservationLink: slot.reservation_link,
        createdAt: nowIso,
        read: false
      });

      // Auto-lock the slot on the server side so it shows as Held/Locked in the UI immediately
      const expiresAt = new Date(new Date(nowIso).getTime() + 15 * 60 * 1000);
      const lockDocRef = doc(db, 'slotLocks', slotId);
      await setDoc(lockDocRef, {
        slotId,
        lockedAt: nowIso,
        expiresAt: expiresAt.toISOString(),
        slotDetails: slot
      });
      console.log(`Auto-locked new favorite slot ${slotId} until ${expiresAt.toISOString()}`);
    }

    await setDoc(doc(db, 'favoritesData', 'latest'), {
      slots: scrapedAvailability,
      lastUpdated: nowIso
    });

    console.log(`Favorites sync complete. ${scrapedAvailability.length} slots. Generated ${newSlots.length} notifications.`);
    return scrapedAvailability;
  } catch (err) {
    console.error("Error in syncFavoriteParksData:", err);
    return [];
  }
}

let lastDailySyncDate = "";

async function checkAndRunDailySync() {
  try {
    const nycTimeStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
    const nycDate = new Date(nycTimeStr);
    const hour = nycDate.getHours();
    const dateStr = nycDate.toISOString().split('T')[0]; 
    
    if (hour === 0 && lastDailySyncDate !== dateStr) {
      console.log(`It is 12:00 AM NY time! Running daily favorites sync for ${dateStr}...`);
      lastDailySyncDate = dateStr;
      await syncFavoriteParksData();
    }
  } catch (err) {
    console.error("Error in checkAndRunDailySync:", err);
  }
}



let zipCentroids: any = {};
try {
  const rawData = fs.readFileSync(path.join(process.cwd(), 'data', 'nyc_zip_centroids.json'), 'utf8');
  zipCentroids = JSON.parse(rawData);
} catch (e) {
  console.log("Could not load zip centroids, continuing...");
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // Simple in-memory cache and throttle (per instance)
  const cache = new Map<string, { lat: number; lon: number; displayName: string; ts: number }>();
  const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
  let lastRequestAt = 0;
  const MIN_INTERVAL_MS = 1000; // ~1 req/sec

  // Helper for geocoding
  function sanitizeQuery(input: string): string | null {
    const trimmed = input.trim();
    if (trimmed.length === 0 || trimmed.length > 200) return null;
    const valid = /^[A-Za-z0-9 ,.#'\-/]+$/;
    if (!valid.test(trimmed)) return null;
    return trimmed;
  }

  app.get('/api/courts', async (req, res) => {
    try {
      const results: any[] = [];
      fs.createReadStream('./data/nyc_tennis_courts.csv')
        .pipe(csv())
        .on('data', (data: any) => results.push({
          park_id: data.court_id,
          park_name: data.park_name,
          address: data.address,
          phone: data.phone,
          num_courts: data.num_courts,
          lat: parseFloat(data.lat),
          lon: parseFloat(data.lon)
        }))
        .on('end', () => res.json(results));

    } catch (error) {
      console.error('Error fetching courts:', error);
      res.status(500).json({ error: 'Failed to fetch courts' });
    }
  });

  app.get('/api/availability', async (req, res) => {
    try {
      const docSnap = await getDoc(doc(db, 'tennisData', 'latest'));
      let slots = [];
      let lastUpdated = new Date().toISOString();
      if (docSnap.exists()) {
        slots = docSnap.data()?.slots || [];
        lastUpdated = docSnap.data()?.lastUpdated || lastUpdated;
      }
      
      const locksMap = await getActiveLocks();
      
      const enrichedSlots = slots.map((slot: any) => {
        const slotId = `${slot.park_id}-${slot.date}-${slot.time}-${slot.court_id}`.replace(/[\s./:]/g, '-');
        const activeLock = locksMap[slotId];
        return {
          ...slot,
          id: slotId,
          isLocked: !!activeLock,
          lockExpiresAt: activeLock ? activeLock.expiresAt : null
        };
      });
      
      // Append active locks that are missing from scraped slots
      Object.keys(locksMap).forEach((slotId) => {
        const isAlreadyInList = enrichedSlots.some((s: any) => s.id === slotId);
        if (!isAlreadyInList) {
          const lockInfo = locksMap[slotId];
          if (lockInfo.slotDetails) {
            enrichedSlots.push({
              ...lockInfo.slotDetails,
              id: slotId,
              isLocked: true,
              lockExpiresAt: lockInfo.expiresAt
            });
          }
        }
      });
      
      res.json({ slots: enrichedSlots, lastUpdated });
    } catch (error) {
      console.error('Error fetching availability from DB:', error);
      res.status(500).json({ error: 'Failed to fetch availability' });
    }
  });

  app.get('/api/debug-cache', async (req, res) => {
    try {
      const docSnap = await getDoc(doc(db, 'tennisData', 'latest'));
      if (docSnap.exists()) {
        const slots = docSnap.data()?.slots || [];
        res.json({
          count: slots.length,
          availableCount: slots.filter((c: any) => c.is_available).length,
          sample: slots.slice(0, 5)
        });
      } else {
        res.json({ count: 0 });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  async function runSyncCourts() {
    try {
      const scrapedAvailability: any[] = [];

      // Fetch data for courts 1-13 (NYC Parks uses integer IDs 1-13 roughly)
      for (let i = 1; i <= 13; i++) {
        const courtId = String(i);
        const url = `https://www.nycgovparks.org/tennisreservation/availability/${courtId}`;
        try {
          const html = (await cloudscraper.get(url)) as any;
          const $ = cheerio.load(html);
          
          $('div[id^="20"]').each((_: any, tab: any) => {
            const date = $(tab).attr('id') || ''; // '2023-09-24'
            
            $(tab).find('tbody tr').each((_: any, row: any) => {
              const time = $(row).find('td:first-child').text().trim();
              
              $(row).find('td:not(:first-child)').each((_: any, cell: any) => {
                const status = $(cell).text().trim();
                const reservationLink = $(cell).find('a').attr('href');
                const courtName = $(cell).closest('table').find('th').eq($(cell).index() - 1).text().trim();

                const isAvailable = status.toLowerCase().includes('reserve');
                if (isAvailable) {
                  scrapedAvailability.push({
                    park_id: courtId, 
                    court_id: courtName,
                    date,
                    time,
                    status,
                    reservation_link: reservationLink ? (reservationLink.startsWith('http') ? reservationLink : `https://www.nycgovparks.org${reservationLink}`) : '',
                    is_available: true,
                    last_updated: new Date().toISOString()
                  });
                }
              });
            });
          });
          console.log(`Parsed ${scrapedAvailability.length} total slots after processing court ${courtId}`);
        } catch (err: any) {
          if (err?.response?.status === 403 || err?.statusCode === 403) {
            console.warn(`Court ${courtId}: Scrape blocked by NYC Parks (403 Forbidden). No real data could be fetched.`);
          } else {
            console.error(`Failed to scrape court ${courtId}:`, err.message);
          }
        }
      }

      if (scrapedAvailability.length > 0) {
        try {
          const nowIso = new Date().toISOString();
          
          // 1. Overwrite the latest slots cache for the frontend
          await setDoc(doc(db, 'tennisData', 'latest'), {
            slots: scrapedAvailability,
            lastUpdated: nowIso
          });
          
          // 2. Archive snapshot to history collection
          const historyDocId = nowIso.replace(/[:.]/g, '-');
          await setDoc(doc(db, 'tennisHistory', historyDocId), {
            slots: scrapedAvailability,
            lastUpdated: nowIso
          });
          
          console.log(`Saved ${scrapedAvailability.length} available slots to Firestore (latest & history: ${historyDocId}).`);
        } catch (e: any) {
          console.warn("Failed to write to Firestore:", e.message);
        }
      } else {
        console.warn("Scraping returned 0 available slots. Updating lastUpdated timestamp only.");
        try {
          const nowIso = new Date().toISOString();
          const docSnap = await getDoc(doc(db, 'tennisData', 'latest'));
          if (docSnap.exists()) {
            await setDoc(doc(db, 'tennisData', 'latest'), {
              ...docSnap.data(),
              lastUpdated: nowIso
            }, { merge: true });
          } else {
            await setDoc(doc(db, 'tennisData', 'latest'), {
              slots: [],
              lastUpdated: nowIso
            });
          }
        } catch (e: any) {
          console.warn("Failed to update timestamp in Firestore:", e.message);
        }
      }

      return scrapedAvailability.length;
    } catch (err: any) {
      console.error("General error during syncCourts:", err);
      return 0;
    }
  }

  // Start background sync interval (30 min) to respect limits while keeping reasonable freshness
  setInterval(() => {
    console.log("Running scheduled background sync...");
    runSyncCourts();
  }, 30 * 60 * 1000);

  // Start daily sync checker interval (30 min)
  setInterval(() => {
    checkAndRunDailySync();
  }, 30 * 60 * 1000);

  app.get('/api/favorites', async (req, res) => {
    try {
      await checkAndRunDailySync();
      
      const docSnap = await getDoc(doc(db, 'favoritesData', 'latest'));
      let slots = [];
      let lastUpdated = new Date().toISOString();
      if (docSnap.exists()) {
        slots = docSnap.data()?.slots || [];
        lastUpdated = docSnap.data()?.lastUpdated || lastUpdated;
      }
      
      const locksMap = await getActiveLocks();
      
      const enrichedSlots = slots.map((slot: any) => {
        const slotId = `${slot.park_id}-${slot.date}-${slot.time}-${slot.court_id}`.replace(/[\s./:]/g, '-');
        const activeLock = locksMap[slotId];
        return {
          ...slot,
          id: slotId,
          isLocked: !!activeLock,
          lockExpiresAt: activeLock ? activeLock.expiresAt : null
        };
      });
      
      // Append active locks that are missing from scraped slots
      Object.keys(locksMap).forEach((slotId) => {
        const isAlreadyInList = enrichedSlots.some((s: any) => s.id === slotId);
        if (!isAlreadyInList) {
          const lockInfo = locksMap[slotId];
          if (lockInfo.slotDetails) {
            enrichedSlots.push({
              ...lockInfo.slotDetails,
              id: slotId,
              isLocked: true,
              lockExpiresAt: lockInfo.expiresAt
            });
          }
        }
      });
      
      res.json({ slots: enrichedSlots, lastUpdated });
    } catch (err: any) {
      console.error("Error getting favorites:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/favorites/sync', async (req, res) => {
    try {
      const slots = await syncFavoriteParksData();
      const locksMap = await getActiveLocks();
      const enrichedSlots = slots.map((slot: any) => {
        const slotId = `${slot.park_id}-${slot.date}-${slot.time}-${slot.court_id}`.replace(/[\s./:]/g, '-');
        const activeLock = locksMap[slotId];
        return {
          ...slot,
          id: slotId,
          isLocked: !!activeLock,
          lockExpiresAt: activeLock ? activeLock.expiresAt : null
        };
      });
      
      // Append active locks that are missing from scraped slots
      Object.keys(locksMap).forEach((slotId) => {
        const isAlreadyInList = enrichedSlots.some((s: any) => s.id === slotId);
        if (!isAlreadyInList) {
          const lockInfo = locksMap[slotId];
          if (lockInfo.slotDetails) {
            enrichedSlots.push({
              ...lockInfo.slotDetails,
              id: slotId,
              isLocked: true,
              lockExpiresAt: lockInfo.expiresAt
            });
          }
        }
      });
      
      res.json({ message: 'Sync complete', slots: enrichedSlots });
    } catch (err: any) {
      console.error("Error syncing favorites:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/favorites/lock', async (req, res) => {
    try {
      const { slotId, slot } = req.body;
      if (!slotId) {
        return res.status(400).json({ error: 'Missing slotId' });
      }
      
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); 
      
      const lockDocRef = doc(db, 'slotLocks', slotId);
      await setDoc(lockDocRef, {
        slotId,
        lockedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        slotDetails: slot || null
      });
      
      console.log(`Locked slot ${slotId} until ${expiresAt.toISOString()}`);
      res.json({ message: 'Slot locked', expiresAt: expiresAt.toISOString() });
    } catch (err: any) {
      console.error("Error locking slot:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/favorites/unlock', async (req, res) => {
    try {
      const { slotId } = req.body;
      if (!slotId) {
        return res.status(400).json({ error: 'Missing slotId' });
      }
      
      const lockDocRef = doc(db, 'slotLocks', slotId);
      await deleteDoc(lockDocRef);
      
      console.log(`Unlocked slot ${slotId}`);
      res.json({ message: 'Slot unlocked' });
    } catch (err: any) {
      console.error("Error unlocking slot:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/notifications', async (req, res) => {
    try {
      const notifCollection = collection(db, 'notifications');
      const q = query(notifCollection, orderBy('createdAt', 'desc'), limit(50));
      const querySnapshot = await getDocs(q);
      
      const notifications: any[] = [];
      querySnapshot.forEach((docSnap) => {
        notifications.push(docSnap.data());
      });
      res.json(notifications);
    } catch (err: any) {
      console.error("Error fetching notifications:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/notifications/read-all', async (req, res) => {
    try {
      const notifCollection = collection(db, 'notifications');
      const q = query(notifCollection, where('read', '==', false));
      const querySnapshot = await getDocs(q);
      
      const promises: Promise<any>[] = [];
      querySnapshot.forEach((docSnap) => {
        const docRef = doc(db, 'notifications', docSnap.id);
        promises.push(setDoc(docRef, { read: true }, { merge: true }));
      });
      await Promise.all(promises);
      
      res.json({ message: 'All notifications marked as read' });
    } catch (err: any) {
      console.error("Error marking notifications read:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Note: Initial startup sync can be triggered explicitly by the user if empty,
  // avoiding unexpected quota burn when instances bounce during dev.

  app.get('/api/sync', async (req, res) => {
    try {
      const updatedCount = await runSyncCourts();
      return res.json({ message: 'Sync complete', slotsUpdated: updatedCount });
    } catch (error) {
      console.error('Error syncing data:', error);
      res.status(500).json({ error: 'Failed to sync courts', details: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/geocode', async (req, res) => {
    try {
      const qRaw = (req.query.q as string) || '';
      const q = sanitizeQuery(qRaw);
      if (!q) {
        return res.status(400).json({ error: 'Invalid query' });
      }

      // If it's a 5-digit ZIP and we have a centroid, short-circuit without external call
      if (/^\d{5}$/.test(q) && zipCentroids[q]) {
        const { lat, lon } = zipCentroids[q];
        const displayName = `ZIP ${q}`;
        cache.set(q, { lat, lon, displayName, ts: Date.now() });
        return res.json({ lat, lon, displayName });
      }

      // Serve from cache if fresh
      const cached = cache.get(q);
      const now = Date.now();
      if (cached && now - cached.ts < CACHE_TTL_MS) {
        return res.json({ lat: cached.lat, lon: cached.lon, displayName: cached.displayName });
      }

      // Light throttle
      if (now - lastRequestAt < MIN_INTERVAL_MS) {
        return res.status(429).json({ error: 'Too many requests, slow down' });
      }
      lastRequestAt = now;

      const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
      url.searchParams.set('address', q);
      url.searchParams.set('benchmark', 'Public_AR_Current');
      url.searchParams.set('format', 'json');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'CourtAdvantage (US Census Geocoder Proxy)'
        },
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(502).json({ error: 'Geocoding failed' });
      }

      const data = (await response.json()) as any;

      const match = data?.result?.addressMatches?.[0];
      if (!match || !match.coordinates) {
        return res.status(404).json({ error: 'No results found' });
      }

      const lat = match.coordinates.y;
      const lon = match.coordinates.x;
      const displayName = match.matchedAddress || q;

      cache.set(q, { lat, lon, displayName, ts: Date.now() });
      return res.json({ lat, lon, displayName });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
