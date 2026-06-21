import cloudscraper from 'cloudscraper';
import * as cheerio from 'cheerio';

async function checkMcCarren() {
  const url = 'https://www.nycgovparks.org/tennisreservation/availability/11';
  
  console.log("Fetching via cloudscraper...");
  const html = (await cloudscraper.get(url)) as any;
  console.log("Response Data Length:", html.length);
  console.log("Snippet:", html.substring(0, 1000));

  const $ = cheerio.load(html);
  
  const tabs = $('div[id^="20"]');
  console.log("Found tabs:", tabs.map((i, el) => $(el).attr('id')).get());
  
  if (tabs.length === 0) {
    console.log("No date tabs found at all");
    return;
  }
  const tab = tabs.first();
  console.log("Using first tab:", tab.attr('id'));
  
  const table = tab.find('table');
  if (table.length === 0) {
    console.log("No table found inside the 2026-06-28 tab");
    return;
  }
  
  // Print all headers
  const headers = table.find('th').map((i, el) => `${i}: "${$(el).text().trim()}"`).get();
  console.log("Table Headers:");
  console.log(headers);
  
  // Print all rows with time and cell details
  console.log("\nTable Rows:");
  table.find('tbody tr').each((i, tr) => {
    const time = $(tr).find('td').first().text().trim();
    const cells = $(tr).find('td').slice(1).map((j, td) => {
      const text = $(td).text().trim();
      const hasLink = $(td).find('a').length > 0;
      const linkHref = $(td).find('a').attr('href') || '';
      return { colIndex: j + 1, tdIndex: $(td).index(), text, hasLink, linkHref };
    }).get();
    
    // Only print if there are links or if it's the 11am/12pm rows
    if (time.includes('11:00') || time.includes('12:00') || cells.some(c => c.hasLink)) {
      console.log(`Row: ${time}`);
      cells.forEach(c => {
        if (c.hasLink || time.includes('11:00') || time.includes('12:00')) {
          console.log(`  Cell at tdIndex ${c.tdIndex} (colIndex ${c.colIndex}): "${c.text}" (hasLink: ${c.hasLink}, href: ${c.linkHref})`);
        }
      });
    }
  });
}

checkMcCarren().catch(console.error);
