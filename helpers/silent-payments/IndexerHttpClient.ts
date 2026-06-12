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

export class IndexerHttpClient {
  constructor(
    private baseUrl: string,
    private timeout: number = 30000,
  ) {}

  private async executeGet<T>(endpoint: string, errorContext: string): Promise<T> {
    try {
      const response = await fetchWithRetries(`${this.baseUrl}${endpoint}`, {
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
      const response = await fetchWithRetries(`${this.baseUrl}${endpoint}`, {
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
