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

export async function POST() {
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
      args = ['src/court_availability_finder.py'];
    } catch {
      // Fall back to system Python
      pythonCommand = 'python3';
      args = ['src/court_availability_finder.py'];
    }

    // Run the existing ETL process
    const result = await new Promise<{ success: boolean; message: string; error?: string; details?: string }>((resolve) => {
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
          // Parse the stdout to extract useful information
          const output = stdout.trim();
          const collectedNoData =
            output.includes('No availability data collected!') ||
            output.includes('Total available slots collected: 0');

          if (collectedNoData) {
            resolve({
              success: false,
              message: 'ETL completed but collected no availability data',
              error: output || 'No availability data collected'
            });
            return;
          }

          let details = '';
          
          // Look for specific patterns in the output
          if (output.includes('Successfully scraped')) {
            const match = output.match(/Successfully scraped (\d+) courts/);
            if (match) {
              details = `Scraped data from ${match[1]} courts`;
            }
          }
          
          if (output.includes('Generated CSV file')) {
            const match = output.match(/Generated CSV file: (.+)/);
            if (match) {
              details += details ? ` | CSV: ${match[1]}` : `CSV: ${match[1]}`;
            }
          }
          
          if (output.includes('ETL process completed successfully')) {
            details += details ? ' | Database updated' : 'Database updated';
          }
          
          resolve({
            success: true,
            message: `Data scraping completed successfully`,
            details: details || output
          });
        } else {
          resolve({
            success: false,
            message: `ETL process failed with exit code ${code}`,
            error: stderr || stdout
          });
        }
      });

      pythonProcess.on('error', (error) => {
        resolve({
          success: false,
          message: 'Failed to start ETL process',
          error: error.message
        });
      });

      // Set a timeout to prevent hanging
      setTimeout(() => {
        pythonProcess.kill();
        resolve({
          success: false,
          message: 'ETL process timed out after 10 minutes',
          error: 'Process exceeded maximum execution time'
        });
      }, 10 * 60 * 1000); // 10 minutes timeout
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || result.message
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in ETL refresh API:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}
