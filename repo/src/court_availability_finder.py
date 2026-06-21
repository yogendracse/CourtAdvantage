from bs4 import BeautifulSoup
import requests
import pandas as pd
from datetime import datetime, timedelta
import os
from pathlib import Path
from requests import Response

# Constants
BASE_URL = "https://www.nycgovparks.org/tennisreservation"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "court_availability", "raw_files")
DEFAULT_COURTS_FILE = os.path.join(os.path.dirname(__file__), "..", "nyc_tennis_courts.csv")

REQUEST_TIMEOUT_SECONDS = 30

def request_with_network_fallback(url: str, headers: dict, referer: str | None = None) -> Response:
    """Request URL with both direct and env-proxy network modes."""
    modes = (
        (False, "direct"),
        (True, "env-proxy"),
    )
    last_error: Exception | None = None

    for trust_env, mode_name in modes:
        session = requests.Session()
        session.trust_env = trust_env
        request_headers = dict(headers)
        if referer:
            request_headers['Referer'] = referer
        try:
            # Prime session cookie then request target URL.
            session.get(BASE_URL, headers=request_headers, timeout=REQUEST_TIMEOUT_SECONDS)
            response = session.get(url, headers=request_headers, timeout=REQUEST_TIMEOUT_SECONDS)
            return response
        except requests.RequestException as error:
            print(f"  - Network mode '{mode_name}' failed for {url}: {error}")
            last_error = error
        finally:
            session.close()

    if last_error:
        raise last_error
    raise RuntimeError(f"Failed to request {url} using all network modes")

def get_court_id_from_url(url: str) -> str:
    """Extract court ID from facility URL."""
    return url.split('/')[-1]

def parse_availability_table(html: str, park_id: str) -> list[dict]:
    """Parse availability table from HTML."""
    soup = BeautifulSoup(html, 'html.parser')
    # Try different table classes
    table = soup.find('table', class_='table table-bordered')
    if not table:
        table = soup.find('table', class_='table')
    if not table:
        return []
    
    availability = []
    
    # Get court names from header (these are the actual court numbers like "Court 5", "Court 6")
    headers = table.find_all('th')
    court_names = [h.text.strip() for h in headers[1:]]  # Skip 'Time' column
    
    # Parse rows
    for row in table.find_all('tr')[1:]:  # Skip header row
        cells = row.find_all(['td', 'th'])
        if not cells:
            continue
        
        time = cells[0].text.strip()
        
        # Process each court's availability
        for i, cell in enumerate(cells[1:], 0):
            # Look for different types of reservation links
            link = cell.find('a')
            
            if link:
                link_text = link.text.strip()
                href = link.get('href')
                
                # Check for different reservation link patterns
                is_reservation_link = (
                    link_text == 'Reserve this time' or
                    'reserve' in href.lower() or
                    'reservecp' in href.lower()
                )
                
                if is_reservation_link and href:
                    # Handle both relative and absolute URLs
                    if href.startswith('/'):
                        reservation_link = f"https://www.nycgovparks.org{href}"
                    elif href.startswith('http'):
                        reservation_link = href
                    else:
                        reservation_link = f"https://www.nycgovparks.org/{href}"
                    
                    # Extract court number from the header (e.g., "Court 5" -> "5")
                    court_header = court_names[i]
                    court_number = court_header.replace('Court ', '') if court_header.startswith('Court ') else court_header
                    
                    availability.append({
                        'time': time,
                        'court_id': court_number,
                        'status': 'Reserve this time',
                        'reservation_link': reservation_link,
                        'is_available': True
                    })
    
    return availability

def get_available_dates(html: str) -> dict[str, str]:
    """Extract all available dates from the page."""
    soup = BeautifulSoup(html, 'html.parser')
    dates = {}
    
    # Look for date tabs
    for tab in soup.find_all('a', attrs={'data-toggle': 'tab'}):
        # Get the actual date text and tab ID
        date_text = tab.text.strip()
        tab_id = tab.get('href', '').replace('#', '')
        
        try:
            # Try different date formats
            if len(date_text) > 8:  # Full date format
                date_obj = datetime.strptime(date_text, '%A, %B %d, %Y')
            elif len(date_text) == 8:  # Short format like 'Tue08/12'
                month_day = date_text[-5:]  # Get '08/12' part
                date_obj = datetime.strptime(month_day + '/2025', '%m/%d/%Y')
            elif len(date_text) <= 2:  # Just day number
                # Get current month and year
                today = datetime.now()
                try:
                    # Try to create a date with the current month
                    date_obj = datetime(today.year, today.month, int(date_text))
                    # If the day is less than today's day, it's for next month
                    if date_obj.day < today.day:
                        if today.month == 12:
                            date_obj = datetime(today.year + 1, 1, int(date_text))
                        else:
                            date_obj = datetime(today.year, today.month + 1, int(date_text))
                except ValueError:
                    # If the day is invalid for current month, try next month
                    if today.month == 12:
                        date_obj = datetime(today.year + 1, 1, int(date_text))
                    else:
                        date_obj = datetime(today.year, today.month + 1, int(date_text))
            else:
                print(f"Warning: Could not parse date '{date_text}'")
                continue
            
            date_str = date_obj.strftime('%Y-%m-%d')
            dates[tab_id] = date_str
        except ValueError:
            print(f"Warning: Could not parse date '{date_text}'")
            continue
    
    return dates

def get_availability_data(court_id: str) -> list[dict]:
    """Get availability data for a specific court."""
    # Common headers
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    }
    
    # Then visit the availability page
    url = f"{BASE_URL}/availability/{court_id}"
    response = request_with_network_fallback(url, headers, referer=BASE_URL)
    
    # Check if we got a valid response
    if response.status_code != 200:
        print(f"  - HTTP Error: Got status code {response.status_code} for court {court_id}")
        return []
    
    html = response.text
    
    # Check if the page has content
    if len(html.strip()) < 1000:
        print(f"  - Warning: Very short HTML response for court {court_id} (length: {len(html)})")
        return []
    
    # Get all available dates
    date_mapping = get_available_dates(html)
    print(f"  - Found {len(date_mapping)} date tabs")
    
    if not date_mapping:
        print(f"  - Warning: No date tabs found for court {court_id}")
        return []
    
    all_availability = []
    for tab_id, date_str in date_mapping.items():
        # Parse availability table for each date
        soup = BeautifulSoup(html, 'html.parser')
        date_tab = soup.find('div', {'id': tab_id})
        if date_tab:
            table_html = str(date_tab)
            availability = parse_availability_table(table_html, court_id)
            
            # Add park_id and date to each record
            for record in availability:
                record['park_id'] = str(court_id)  # This is actually the park_id
                record['date'] = date_str
            
            all_availability.extend(availability)
        else:
            print(f"  - Warning: Could not find date tab {tab_id} for court {court_id}")
    
    return all_availability

def save_availability_data(data: list[dict], output_dir: str) -> str:
    """Save availability data to CSV file."""
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Create DataFrame
    df = pd.DataFrame(data)
    
    # Ensure court_id is string
    df['court_id'] = df['court_id'].astype(str)
    
    # Reorder columns
    columns = ['park_id', 'date', 'time', 'court_id', 'status', 'reservation_link', 'is_available']
    df = df[columns]
    
    # Generate filename with timestamp
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"court_availability_{timestamp}.csv"
    file_path = os.path.join(output_dir, filename)
    
    # Save to CSV
    df.to_csv(file_path, index=False)
    return file_path

def main() -> str:
    """Main function to fetch and save availability data."""
    # Get court IDs from CSV
    courts_file = os.getenv('COURTS_FILE', DEFAULT_COURTS_FILE)
    courts_df = pd.read_csv(courts_file)
    
    print(f"Found {len(courts_df)} parks to scrape")
    
    # Fetch availability for each court
    all_availability = []
    for court_id in courts_df['court_id']:
        print(f"Scraping park {court_id} ({courts_df[courts_df['court_id'] == court_id]['park_name'].iloc[0]})...")
        try:
            availability = get_availability_data(str(court_id))
            print(f"  - Found {len(availability)} available slots")
            all_availability.extend(availability)
        except Exception as e:
            print(f"  - ERROR fetching data for court {court_id}: {str(e)}")
            import traceback
            traceback.print_exc()
    
    print(f"Total available slots collected: {len(all_availability)}")
    
    # Save data
    if all_availability:
        file_path = save_availability_data(all_availability, OUTPUT_DIR)
        print(f"Data saved to: {file_path}")
        return file_path
    else:
        print("No availability data collected!")
        return ""

if __name__ == "__main__":
    main()