import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);
const PROXY_ENV_KEYS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy'
];

function isLoopbackProxyValue(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  } catch {
    return value.includes('127.0.0.1') || value.includes('localhost');
  }
}

function getCleanPythonEnv(projectRoot: string): NodeJS.ProcessEnv {
  const cleanEnv: NodeJS.ProcessEnv = { ...process.env, PYTHONPATH: projectRoot };
  for (const key of PROXY_ENV_KEYS) {
    if (isLoopbackProxyValue(cleanEnv[key])) {
      delete cleanEnv[key];
    }
  }
  return cleanEnv;
}

interface ParkAvailability {
  park_id: string;
  park_name: string;
  total_slots: number;
  available_slots: number;
  last_updated: string;
}

export async function GET() {
  try {
    // Get the project root directory
    const projectRoot = process.cwd();
    
    // Check if virtual environment exists
    const venvPath = `${projectRoot}/venv`;
    const pythonPath = `${venvPath}/bin/python`;
    
    // Determine the Python command to use
    let pythonCommand: string;
    let args: string[];
    
    try {
      // Try to use virtual environment first
      await execAsync(`test -f "${pythonPath}"`);
      pythonCommand = pythonPath;
      args = ['-c', `
import sys
import os
sys.path.insert(0, '${projectRoot}')

from src.database.config import SessionLocal
from sqlalchemy import text
from datetime import datetime

def get_park_availability():
    session = SessionLocal()
    try:
        # Query to get availability counts for each park
        result = session.execute(text("""
            SELECT 
                tc.park_id,
                tc.park_name,
                COUNT(*) as total_slots,
                COUNT(CASE WHEN ca.is_available THEN 1 END) as available_slots,
                MAX(ca.last_updated) as last_updated
            FROM dwh.tennis_courts tc
            LEFT JOIN dwh.court_availability ca ON tc.park_id = ca.park_id
            WHERE ca.date >= CURRENT_DATE
            GROUP BY tc.park_id, tc.park_name
            ORDER BY tc.park_name
        """))
        
        parks = []
        for row in result:
            parks.append({
                'park_id': row[0],
                'park_name': row[1],
                'total_slots': row[2],
                'available_slots': row[3],
                'last_updated': row[4].isoformat() if row[4] else None
            })
        
        return parks
    finally:
        session.close()

if __name__ == "__main__":
    parks = get_park_availability()
    import json
    print(json.dumps(parks))
`];
    } catch {
      // Fall back to system Python
      pythonCommand = 'python3';
      args = ['-c', `
import sys
import os
sys.path.insert(0, '${projectRoot}')

from src.database.config import SessionLocal
from sqlalchemy import text
from datetime import datetime

def get_park_availability():
    session = SessionLocal()
    try:
        # Query to get availability counts for each park
        result = session.execute(text("""
            SELECT 
                tc.park_id,
                tc.park_name,
                COUNT(*) as total_slots,
                COUNT(CASE WHEN ca.is_available THEN 1 END) as available_slots,
                MAX(ca.last_updated) as last_updated
            FROM dwh.tennis_courts tc
            LEFT JOIN dwh.court_availability ca ON tc.park_id = ca.park_id
            WHERE ca.date >= CURRENT_DATE
            GROUP BY tc.park_id, tc.park_name
            ORDER BY tc.park_name
        """))
        
        parks = []
        for row in result:
            parks.append({
                'park_id': row[0],
                'park_name': row[1],
                'total_slots': row[2],
                'available_slots': row[3],
                'last_updated': row[4].isoformat() if row[4] else None
            })
        
        return parks
    finally:
        session.close()

if __name__ == "__main__":
    parks = get_park_availability()
    import json
    print(json.dumps(parks))
`];
    }

    // Run the Python command to get park availability
    const result = await new Promise<{ success: boolean; data?: ParkAvailability[]; error?: string }>((resolve) => {
      const pythonProcess = spawn(pythonCommand, args, {
        cwd: projectRoot,
        stdio: 'pipe',
        env: getCleanPythonEnv(projectRoot)
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const parks = JSON.parse(stdout.trim());
            resolve({
              success: true,
              data: parks
            });
          } catch (parseError) {
            resolve({
              success: false,
              error: `Failed to parse output: ${parseError}`
            });
          }
        } else {
          resolve({
            success: false,
            error: `Python process failed with exit code ${code}: ${stderr || stdout}`
          });
        }
      });

      pythonProcess.on('error', (error) => {
        resolve({
          success: false,
          error: `Failed to start Python process: ${error.message}`
        });
      });

      // Set a timeout
      setTimeout(() => {
        pythonProcess.kill();
        resolve({
          success: false,
          error: 'Process timed out'
        });
      }, 30 * 1000); // 30 seconds timeout
    });

    if (result.success && result.data) {
      return NextResponse.json({
        success: true,
        parks: result.data
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || 'Unknown error occurred'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in park availability API:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}
