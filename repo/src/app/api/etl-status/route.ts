import { NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';

export async function GET() {
  try {
    const projectRoot = process.cwd();
    const dataDir = join(projectRoot, 'data', 'court_availability', 'raw_files');
    
    try {
      // Get list of CSV files
      const files = await readdir(dataDir);
      const csvFiles = files.filter(file => file.startsWith('court_availability_') && file.endsWith('.csv'));
      
      if (csvFiles.length === 0) {
        return NextResponse.json({
          hasData: false,
          message: 'No availability data files found'
        });
      }
      
      // Get the latest file info
      const latestFile = csvFiles.sort().pop()!;
      const latestFilePath = join(dataDir, latestFile);
      const fileStats = await stat(latestFilePath);
      
      // Extract timestamp from filename
      const timestampMatch = latestFile.match(/court_availability_(\d{8}_\d{6})\.csv/);
      const fileTimestamp = timestampMatch ? timestampMatch[1] : 'Unknown';
      
      // Calculate how old the data is
      const now = new Date();
      const fileAge = now.getTime() - fileStats.mtime.getTime();
      const fileAgeHours = Math.floor(fileAge / (1000 * 60 * 60));
      const fileAgeMinutes = Math.floor((fileAge % (1000 * 60 * 60)) / (1000 * 60));
      
      let ageDescription = '';
      if (fileAgeHours > 0) {
        ageDescription = `${fileAgeHours} hour${fileAgeHours > 1 ? 's' : ''} ago`;
      } else {
        ageDescription = `${fileAgeMinutes} minute${fileAgeMinutes > 1 ? 's' : ''} ago`;
      }
      
      return NextResponse.json({
        hasData: true,
        latestFile: latestFile,
        fileTimestamp: fileTimestamp,
        fileSize: fileStats.size,
        lastModified: fileStats.mtime.toISOString(),
        ageDescription: ageDescription,
        totalFiles: csvFiles.length,
        dataDirectory: dataDir
      });
      
    } catch (error) {
      return NextResponse.json({
        hasData: false,
        message: 'Could not access data directory',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    
  } catch (error) {
    console.error('Error in ETL status API:', error);
    return NextResponse.json({
      hasData: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}
