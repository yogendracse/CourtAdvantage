import { NextResponse } from 'next/server';
import zipCentroids from '../../../data/nyc_zip_centroids.json';

type CacheEntry = { lat: number; lon: number; displayName: string; ts: number };

// Simple in-memory cache and throttle (per instance)
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
let lastRequestAt = 0;
const MIN_INTERVAL_MS = 1000; // ~1 req/sec

function sanitizeQuery(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return null;
  // Allow common US address chars: letters, numbers, space, comma, period, hyphen, #, apostrophe, slash
  const valid = /^[A-Za-z0-9 ,.#'\-/]+$/;
  if (!valid.test(trimmed)) return null;
  return trimmed;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const qRaw = searchParams.get('q') || '';
    const q = sanitizeQuery(qRaw);
    if (!q) {
      return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
    }

    // If it's a 5-digit ZIP and we have a centroid, short-circuit without external call
    if (/^\d{5}$/.test(q) && (zipCentroids as Record<string, { lat: number; lon: number }>)[q]) {
      const { lat, lon } = (zipCentroids as Record<string, { lat: number; lon: number }>)[q];
      const displayName = `ZIP ${q}`;
      cache.set(q, { lat, lon, displayName, ts: Date.now() });
      return NextResponse.json({ lat, lon, displayName });
    }

    // Serve from cache if fresh
    const cached = cache.get(q);
    const now = Date.now();
    if (cached && now - cached.ts < CACHE_TTL_MS) {
      return NextResponse.json({ lat: cached.lat, lon: cached.lon, displayName: cached.displayName });
    }

    // Light throttle
    if (now - lastRequestAt < MIN_INTERVAL_MS) {
      return NextResponse.json({ error: 'Too many requests, slow down' }, { status: 429 });
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
        'User-Agent': 'NYC Tennis Slots Finder (US Census Geocoder Proxy)'
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json({ error: 'Geocoding failed' }, { status: 502 });
    }

    const data = (await response.json()) as {
      result?: {
        addressMatches?: Array<{
          matchedAddress?: string;
          coordinates?: { x: number; y: number };
        }>;
      };
    };

    const match = data?.result?.addressMatches?.[0];
    if (!match || !match.coordinates) {
      return NextResponse.json({ error: 'No results found' }, { status: 404 });
    }

    const lat = match.coordinates.y;
    const lon = match.coordinates.x;
    const displayName = match.matchedAddress || q;

    cache.set(q, { lat, lon, displayName, ts: Date.now() });
    return NextResponse.json({ lat, lon, displayName });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}


