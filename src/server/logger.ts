import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from './paths';

export interface IngestErrorLogEntry {
  timestamp: string;
  jobId: string;
  title: string;
  step?: string | null;
  errorMessage: string;
  stack?: string | null;
}

/**
 * Record a structured error event to data/logs/ingest-errors.log.
 * Preserves full diagnostic telemetry for offline review without exposing
 * failures to the end-user interface.
 */
export function logIngestError(params: {
  jobId: string;
  title: string;
  step?: string | null;
  error: unknown;
}): void {
  try {
    const logsDir = path.join(getDataDir(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logFile = path.join(logsDir, 'ingest-errors.log');
    const timestamp = new Date().toISOString();
    const errorMessage = params.error instanceof Error ? params.error.message : String(params.error);
    const stack = params.error instanceof Error ? params.error.stack : null;

    const entry: IngestErrorLogEntry = {
      timestamp,
      jobId: params.jobId,
      title: params.title,
      step: params.step || 'Unknown step',
      errorMessage,
      stack,
    };

    const formattedLine = `[${timestamp}] [JOB: ${params.jobId}] [DOC: "${params.title}"] [STEP: ${entry.step}]\nERROR: ${errorMessage}\n${stack ? `STACK:\n${stack}\n` : ''}---\n`;

    fs.appendFileSync(logFile, formattedLine, 'utf-8');
  } catch (err) {
    console.error('Failed to write to ingest error log:', err);
  }
}
