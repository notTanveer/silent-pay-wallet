import { IndexerHttpClient, IndexerHttpError } from '../../helpers/silent-payments/IndexerHttpClient';

jest.mock('../../util/fetch', () => ({
  fetchWithRetries: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchWithRetries } = require('../../util/fetch') as { fetchWithRetries: jest.Mock };

function mockOkResponse(body: ArrayBuffer = new ArrayBuffer(4)): Response {
  return { ok: true, status: 200, arrayBuffer: async () => body } as unknown as Response;
}

function mockStatusResponse(status: number): Response {
  return { ok: false, status, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
}

describe('IndexerHttpClient retry logic', () => {
  let client: IndexerHttpClient;

  beforeEach(() => {
    client = new IndexerHttpClient('http://indexer.test', 5000);
    jest.useFakeTimers();
    fetchWithRetries.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries getBinary on 502 and succeeds on a subsequent attempt', async () => {
    fetchWithRetries
      .mockResolvedValueOnce(mockStatusResponse(502))
      .mockResolvedValueOnce(mockStatusResponse(502))
      .mockResolvedValueOnce(mockOkResponse());

    const promise = client.getBinary('/silent-block/range', 'test');
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeInstanceOf(Uint8Array);
    expect(fetchWithRetries).toHaveBeenCalledTimes(3);
  });

  it('retries getBinary on 503 and 504', async () => {
    fetchWithRetries
      .mockResolvedValueOnce(mockStatusResponse(503))
      .mockResolvedValueOnce(mockStatusResponse(504))
      .mockResolvedValueOnce(mockOkResponse());

    const promise = client.getBinary('/silent-block/range', 'test');
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeInstanceOf(Uint8Array);
    expect(fetchWithRetries).toHaveBeenCalledTimes(3);
  });

  it('retries getBinary on thrown network errors', async () => {
    fetchWithRetries
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(mockOkResponse());

    const promise = client.getBinary('/silent-block/range', 'test');
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeInstanceOf(Uint8Array);
    expect(fetchWithRetries).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry getBinary on 404 and throws IndexerHttpError(404) immediately', async () => {
    fetchWithRetries.mockResolvedValue(mockStatusResponse(404));

    await expect(client.getBinary('/not-found', 'test')).rejects.toBeInstanceOf(IndexerHttpError);
    const err = await client.getBinary('/not-found', 'test').catch(e => e);
    expect((err as IndexerHttpError).status).toBe(404);

    // 404 is non-retryable: one attempt per call
    expect(fetchWithRetries).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry getBinary on other 4xx (e.g. 403)', async () => {
    fetchWithRetries.mockResolvedValue(mockStatusResponse(403));

    await expect(client.getBinary('/forbidden', 'test')).rejects.toBeInstanceOf(IndexerHttpError);
    expect(fetchWithRetries).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting all retries on persistent 502', async () => {
    fetchWithRetries.mockResolvedValue(mockStatusResponse(502));

    const promise = client.getBinary('/silent-block/range', 'test');
    // Prevent unhandled-rejection noise while timers are running; the rejection
    // is still asserted below via `rejects`.
    promise.catch(() => {});
    await jest.runAllTimersAsync();

    await expect(promise).rejects.toBeInstanceOf(IndexerHttpError);
    // 4 total attempts: 1 initial + 3 retries
    expect(fetchWithRetries).toHaveBeenCalledTimes(4);
  });
});
