import { NextResponse } from 'next/server';
import { getAllCourts, getCourtAvailability } from '@/utils/database';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get('parkId');  // Changed from courtId to parkId
    const date = searchParams.get('date');

    // If parkId and date are provided, return availability
    if (parkId && date) {
      const availability = await getCourtAvailability(parkId, date);
      return NextResponse.json(availability);
    }

    // Otherwise return all courts
    const courts = await getAllCourts();
    return NextResponse.json(courts);
  } catch (error) {
    console.error('Error fetching courts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch courts' },
      { status: 500 }
    );
  }
} 