import { TimeSlot, Park, ScrapeResult, DaySchedule, TennisCourt } from '@/types';
import axios from 'axios';
import * as cheerio from 'cheerio';

async function fetchCourtData(courtId: string): Promise<TennisCourt | null> {
  try {
    const url = `https://www.nycgovparks.org/tennisreservation/availability/${courtId}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const name = $('h1').text().trim();
    const location = $('#location_details').text().trim();

    const schedules: DaySchedule[] = [];
    $('.tab-pane').each((_, tab) => {
      const date = $(tab).attr('id') || '';
      const slots: TimeSlot[] = [];

      $(tab).find('tbody tr').each((_, row) => {
        const time = $(row).find('td:first-child').text().trim();
        $(row).find('td:not(:first-child)').each((_, cell) => {
          const status = $(cell).text().trim();
          const reservationLink = $(cell).find('a').attr('href');
          const court = $(cell).closest('table').find('th').eq($(cell).index()).text().trim();

          slots.push({
            time,
            court,
            status,
            reservationLink: reservationLink ? `https://www.nycgovparks.org${reservationLink}` : undefined
          });
        });
      });

      schedules.push({ date, slots });
    });

    return {
      id: courtId,
      name,
      location,
      schedules
    };
  } catch (error) {
    console.error(`Error fetching court ${courtId}:`, error);
    return null;
  }
}

export async function scrapeAllCourts(): Promise<ScrapeResult> {
  try {
    const courts: TennisCourt[] = [];
    
    // Fetch data for courts 1-13
    for (let i = 1; i <= 13; i++) {
      const court = await fetchCourtData(i.toString());
      if (court) {
        courts.push(court);
      }
    }

    // Convert to Park format
    const parks: Park[] = courts.map(court => ({
      id: court.id,
      name: court.name,
      details: court.location,
      address: '', // Will be filled from CSV
      latitude: 0, // Will be filled from CSV
      longitude: 0, // Will be filled from CSV
      availableSlots: court.schedules.reduce((acc, schedule) => {
        acc[schedule.date] = schedule.slots.filter(slot => slot.status === 'Reserve this time');
        return acc;
      }, {} as { [key: string]: TimeSlot[] })
    }));

    return {
      success: true,
      parks,
      timestamp: new Date()
    };
  } catch (error) {
    return {
      success: false,
      parks: [],
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
} 