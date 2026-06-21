import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parse } from 'csv-parse';
import { Park, TimeSlot } from '@/types';

const execAsync = promisify(exec);

interface CourtAvailability {
  court_id: string;
  date: string;
  time: string;
  court: string;
  status: string;
  reservation_link: string;
}

interface CourtInfo {
  court_id: string;
  park_name: string;
  park_details: string;
  address: string;
  lat: string;
  lon: string;
}

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function runPythonScript(): Promise<void> {
  try {
    console.log('[PythonRunner] Starting Python script...');
    const scriptPath = path.join(process.cwd(), 'src', 'court_availability_finder.py');
    
    // Check if Python script exists
    if (!(await checkFileExists(scriptPath))) {
      throw new Error(`Python script not found at: ${scriptPath}`);
    }
    
    console.log('[PythonRunner] Script path:', scriptPath);
    const { stdout, stderr } = await execAsync(`python3 "${scriptPath}"`);
    
    if (stderr) {
      console.error('[PythonRunner] Python script stderr:', stderr);
    }
    console.log('[PythonRunner] Python script stdout:', stdout);
    console.log('[PythonRunner] Python script completed');
  } catch (error) {
    console.error('[PythonRunner] Error running Python script:', error);
    throw error;
  }
}

export async function readCSVData(): Promise<Park[]> {
  try {
    console.log('[PythonRunner] Reading CSV files...');
    
    // Get file paths
    const availabilityPath = path.join(process.cwd(), 'nyc_tennis_court_availability.csv');
    const courtsPath = path.join(process.cwd(), 'nyc_tennis_courts.csv');
    
    // Check if files exist
    const availabilityExists = await checkFileExists(availabilityPath);
    const courtsExists = await checkFileExists(courtsPath);
    
    if (!availabilityExists || !courtsExists) {
      console.error('[PythonRunner] Missing CSV files:', {
        'nyc_tennis_court_availability.csv': availabilityExists,
        'nyc_tennis_courts.csv': courtsExists
      });
      throw new Error('Required CSV files are missing. Please run Find Slots first.');
    }
    
    // Read both CSV files
    const availabilityData = await fs.readFile(availabilityPath, 'utf-8');
    const courtsData = await fs.readFile(courtsPath, 'utf-8');
    
    // Parse CSV data using callbacks to handle the asynchronous nature of csv-parse
    const availabilities: CourtAvailability[] = await new Promise((resolve, reject) => {
      const records: CourtAvailability[] = [];
      parse(availabilityData, {
        columns: true,
        skip_empty_lines: true,
      })
        .on('data', (record) => records.push(record))
        .on('end', () => resolve(records))
        .on('error', reject);
    });

    const courts: CourtInfo[] = await new Promise((resolve, reject) => {
      const records: CourtInfo[] = [];
      parse(courtsData, {
        columns: true,
        skip_empty_lines: true,
      })
        .on('data', (record) => {
          // Validate coordinates
          const lat = parseFloat(record.lat);
          const lon = parseFloat(record.lon);
          if (isNaN(lat) || isNaN(lon)) {
            console.warn(`[PythonRunner] Invalid coordinates for court ${record.court_id}: lat=${record.lat}, lon=${record.lon}`);
          } else if (lat === 0 || lon === 0) {
            console.warn(`[PythonRunner] Zero coordinates for court ${record.court_id}`);
          }
          records.push(record);
        })
        .on('end', () => resolve(records))
        .on('error', reject);
    });
    
    console.log(`[PythonRunner] Loaded ${courts.length} courts and ${availabilities.length} availability records`);

    // Log a sample of the data to verify structure
    if (availabilities.length > 0) {
      console.log('[PythonRunner] Sample availability record:', availabilities[0]);
    }
    if (courts.length > 0) {
      console.log('[PythonRunner] Sample court record:', courts[0]);
    }
    
    // Create a map of court_id to park info
    const parksMap = new Map<string, Park>();
    
    // Initialize parks data
    courts.forEach(court => {
      const lat = parseFloat(court.lat);
      const lon = parseFloat(court.lon);
      
      // Log each court's coordinates
      console.log(`[PythonRunner] Court ${court.court_id} coordinates:`, {
        name: court.park_name,
        raw: { lat: court.lat, lon: court.lon },
        parsed: { lat, lon }
      });

      parksMap.set(court.court_id, {
        id: court.court_id,
        name: court.park_name,
        details: court.park_details,
        address: court.address,
        latitude: lat,
        longitude: lon,
        availableSlots: {}
      });
    });
    
    // Process availability data
    availabilities.forEach(avail => {
      // Check for "Reserve this time" status
      if (avail.status === 'Reserve this time') {
        const park = parksMap.get(avail.court_id);
        if (park) {
          if (!park.availableSlots[avail.date]) {
            park.availableSlots[avail.date] = [];
          }
          
          // Only add the slot if it's not already added (avoid duplicates)
          const existingSlot = park.availableSlots[avail.date].find(
            slot => slot.time === avail.time && slot.court === avail.court
          );
          
          if (!existingSlot) {
            park.availableSlots[avail.date].push({
              time: avail.time,
              court: avail.court,
              reservationLink: avail.reservation_link
            });
            console.log(`[PythonRunner] Added slot for park ${park.name}: ${avail.time} - ${avail.court}`);
          }
        }
      }
    });
    
    // Convert map to array, filter out parks with no available slots, and sort by name
    const processedParks = Array.from(parksMap.values())
      .filter(park => Object.keys(park.availableSlots).length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    
    console.log(`[PythonRunner] Processed ${processedParks.length} parks with availability data`);
    processedParks.forEach(park => {
      const totalSlots = Object.values(park.availableSlots)
        .reduce((sum, slots) => sum + slots.length, 0);
      console.log(`[PythonRunner] Park ${park.name} has ${totalSlots} total slots across all dates`);
      console.log(`[PythonRunner] Available dates for ${park.name}:`, Object.keys(park.availableSlots));
    });
    
    return processedParks;
  } catch (error) {
    console.error('[PythonRunner] Error reading CSV data:', error);
    throw error;
  }
} 