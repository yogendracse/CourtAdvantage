# Changelog

All notable changes to the NYC Tennis Slots Finder project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2025-08-11

### Added
- **Manual ETL Refresh Page**: New admin page at `/etl-refresh` for manually triggering data refresh
- **Manual Data Scraping**: Button to manually scrape tennis court availability from NYC Parks
- **CSV Generation**: Automatic CSV file creation with timestamps for manual ETL runs
- **Real-time Status Updates**: Live status display showing ETL process progress and results
- **Park Availability Comparison Table**: Before/after comparison showing data changes
- **Data Status Monitoring**: File information, age tracking, and processing history
- **Admin API Endpoints**: New endpoints for ETL refresh, status, and park availability

### Changed
- Enhanced ETL pipeline with manual trigger capabilities
- Improved data monitoring and visualization for administrators
- Better integration with existing scraper and ETL infrastructure

## [Unreleased]

### Added
- Location-based court finding functionality
- Distance-based sorting of tennis courts
- Enhanced UI/UX with prominent input styling

## [1.1.0] - 2025-08-11

### 🆕 Added
- **Location-Based Features**
  - ZIP code input for NYC addresses
  - Full address geocoding via US Census Geocoder
  - Browser geolocation support with permission handling
  - Distance calculation using Haversine formula
  - Automatic court sorting by proximity to user location
  - User location markers on interactive map

- **Technical Infrastructure**
  - `/api/geocode` endpoint with rate limiting and caching
  - NYC ZIP code centroids for offline lookups
  - Distance utility functions for accurate mileage calculations
  - Next.js configuration for geolocation permissions

- **User Experience Improvements**
  - Enhanced input styling with borders, shadows, and hover effects
  - Enter key support for location input
  - Collapsible map instructions to save space
  - Step-by-step user guide for new users
  - Responsive layout optimizations

### 🔧 Changed
- Redesigned location input interface
- Updated map component to show user location
- Enhanced visual hierarchy and spacing
- Improved input prominence and accessibility

### 🐛 Fixed
- Added comprehensive NYC ZIP code coverage
- Fixed JSON formatting issues in ZIP centroids data
- Resolved geolocation permission policy errors

### 📚 Documentation
- Updated README with new features and usage guide
- Added comprehensive feature descriptions
- Included location input tips and best practices

## [1.0.0] - 2025-01-XX

### 🆕 Added
- **Core Application**
  - Interactive map showing NYC tennis courts
  - Real-time availability data from NYC Parks
  - Time preference filtering (Morning, Afternoon, Evening)
  - Court type filtering (Hard, Clay)
  - Direct reservation links

- **Data Pipeline**
  - ETL process for court and availability data
  - PostgreSQL database with staging and data warehouse layers
  - Automated data validation and cleanup
  - File registry and processing tracking

- **Technical Stack**
  - Next.js frontend with React and TypeScript
  - Python backend with SQLAlchemy
  - Tailwind CSS for styling
  - Leaflet maps integration

### 🔧 Changed
- Initial project setup and architecture
- Database schema design and migrations
- ETL pipeline implementation

### 📚 Documentation
- Initial README and deployment workflow
- Development setup instructions
- Branching strategy documentation

## [0.9.0] - 2025-01-XX

### 🆕 Added
- **ETL Scheduler System**
  - Hourly ETL scheduler with logging support
  - Automated data collection from NYC Parks
  - Log directory management and cleanup

- **Scraper Improvements**
  - Enhanced scraper to collect data from all parks
  - Updated frontend for new database schema
  - Improved data collection reliability

### 🔧 Changed
- Enhanced ETL pipeline automation
- Improved data collection processes
- Better error handling and logging

### 🐛 Fixed
- Added logs directory to .gitignore
- Improved scraper data collection coverage

---

## Version History

- **0.9.0**: ETL scheduler system and scraper improvements
- **1.0.0**: Initial release with core tennis court finding functionality
- **1.1.0**: Major feature addition - location-based court finding and distance sorting
- **Unreleased**: Future features and improvements

## Contributing

When contributing to this project, please update this changelog with your changes following the established format.
