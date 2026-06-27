import { fetchWithRetries } from '../../util/fetch';

/**
 * Error carrying the HTTP status of a failed indexer response, so callers can
 * branch on it — e.g. fall back to the JSON scan path when a binary endpoint
 * returns 404 on an older indexer deployment.
 */
export class IndexerHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'IndexerHttpError';
  }
}

const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);
const RETRY_DELAYS_MS = [500, 1000, 2000];

export class IndexerHttpClient {
  constructor(
    private baseUrl: string,
    private timeout: number = 30000,
  ) {}

  /**
   * Wraps a fetch call with bounded exponential backoff for transient failures
   * (502/503/504/429 and thrown network errors). Non-retryable responses are
   * returned immediately so the caller can inspect `response.ok` and status.
   */
  private async fetchWithLocalRetry(url: string, options: Parameters<typeof fetchWithRetries>[1]): Promise<Response> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
      }
      try {
        const response = await fetchWithRetries(url, options);
        if (response.ok || !TRANSIENT_STATUSES.has(response.status)) {
          return response;
        }
        // Retryable status — keep looping; on exhaustion fall through to return below.
        lastErr = new IndexerHttpError(response.status, `HTTP error! status: ${response.status}`);
        if (attempt === RETRY_DELAYS_MS.length) return response;
      } catch (err) {
        lastErr = err;
        if (attempt === RETRY_DELAYS_MS.length) throw err;
      }
    }
    throw lastErr;
  }

  private async executeGet<T>(endpoint: string, errorContext: string): Promise<T> {
    try {
      const response = await this.fetchWithLocalRetry(`${this.baseUrl}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: this.timeout,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`${errorContext}:`, error);
      throw new Error(`${errorContext}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async get<T>(endpoint: string, errorContext: string): Promise<T> {
    return this.executeGet<T>(endpoint, errorContext);
  }

  /**
   * GET an `application/octet-stream` endpoint and return the raw bytes.
   * Throws {@link IndexerHttpError} (carrying the status) on a non-OK response so
   * callers can distinguish a 404 (fall back) from other failures (abort).
   */
  async getBinary(endpoint: string, errorContext: string): Promise<Uint8Array> {
    try {
      const response = await this.fetchWithLocalRetry(`${this.baseUrl}${endpoint}`, {
        method: 'GET',
        headers: {
          Accept: 'application/octet-stream',
        },
        timeout: this.timeout,
      });

      if (!response.ok) {
        throw new IndexerHttpError(response.status, `HTTP error! status: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    } catch (error) {
      if (error instanceof IndexerHttpError) {
        console.error(`${errorContext}:`, error.message);
        throw error;
      }
      console.error(`${errorContext}:`, error);
      throw new Error(`${errorContext}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '');
  }
}
