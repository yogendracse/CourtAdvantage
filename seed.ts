import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import csv from 'csv-parser';

let firebaseConfig;
if (fs.existsSync('./firebase-applet-config.json')) {
  firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
}

const app = initializeApp({ 
  credential: applicationDefault(),
  projectId: firebaseConfig?.projectId 
});
const db = getFirestore(app, firebaseConfig?.firestoreDatabaseId);

const results: any[] = [];

fs.createReadStream('./data/nyc_tennis_courts.csv')
  .pipe(csv())
  .on('data', (data) => results.push(data))
  .on('end', async () => {
    try {
      let count = 0;
      for (const row of results) {
        // court_id is equivalent to park_id in this context
        const courtId = row.court_id || `park-${count}`;
        
        await db.collection('courts').doc(courtId).set({
          park_id: courtId,
          park_name: row.park_name || '',
          park_details: row.park_details || '',
          address: row.address || '',
          phone: row.phone || '',
          email: row.email || '',
          hours: row.hours || '',
          website: row.website || '',
          num_courts: parseInt(row.num_courts) || 0,
          lat: parseFloat(row.lat) || 0,
          lon: parseFloat(row.lon) || 0,
          court_type: row.court_type || ''
        });
        count++;
      }
      console.log(`Successfully seeded ${count} courts to Firestore.`);
    } catch (err) {
      console.error('Error seeding:', err);
    }
    process.exit(0);
  });
