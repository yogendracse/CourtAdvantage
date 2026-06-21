export interface GeoPoint {
  lat: number;
  lon: number;
}

export function haversineDistanceMiles(pointA: GeoPoint, pointB: GeoPoint): number {
  const toRadians = (deg: number) => (deg * Math.PI) / 180;
  const R_km = 6371; // km
  const dLat = toRadians(pointB.lat - pointA.lat);
  const dLon = toRadians(pointB.lon - pointA.lon);
  const lat1 = toRadians(pointA.lat);
  const lat2 = toRadians(pointB.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const km = R_km * c;
  const miles = km * 0.621371;
  return miles;
}


