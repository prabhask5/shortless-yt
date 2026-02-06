const isDev = process.env.NODE_ENV !== 'production';

interface LogEntry {
	level: 'info' | 'warn' | 'error' | 'debug';
	message: string;
	data?: Record<string, unknown>;
	timestamp: string;
}

function log(entry: LogEntry): void {
	const line = `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.message}`;
	if (entry.data && isDev) {
		console.log(line, entry.data);
	} else {
		console.log(line);
	}
}

export function logInfo(message: string, data?: Record<string, unknown>): void {
	log({ level: 'info', message, data, timestamp: new Date().toISOString() });
}

export function logWarn(message: string, data?: Record<string, unknown>): void {
	log({ level: 'warn', message, data, timestamp: new Date().toISOString() });
}

export function logError(message: string, data?: Record<string, unknown>): void {
	log({ level: 'error', message, data, timestamp: new Date().toISOString() });
}

export function logDebug(message: string, data?: Record<string, unknown>): void {
	if (isDev) {
		log({ level: 'debug', message, data, timestamp: new Date().toISOString() });
	}
}

// Structured logging for API stats
export function logApiCall(
	endpoint: string,
	params: Record<string, string>,
	cacheHit: boolean
): void {
	logInfo(`API call: ${endpoint}`, { ...params, cacheHit });
}

export function logShortsFilter(
	filteredCount: number,
	totalCount: number,
	backfillPages: number
): void {
	logInfo('Shorts filter stats', { filteredCount, totalCount, backfillPages });
}

export function logAuthEvent(event: string, success: boolean): void {
	logInfo(`Auth: ${event}`, { success });
}
