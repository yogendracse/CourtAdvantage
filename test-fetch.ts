import axios from "axios";
async function test() {
  try {
    const res = await axios.get('https://www.nycgovparks.org/tennisreservation/availability/1', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    console.log("Status:", res.status);
    console.log("Length:", res.data.length);
  } catch(e: any) {
    console.log("Error:", e.message);
  }
}
test();
