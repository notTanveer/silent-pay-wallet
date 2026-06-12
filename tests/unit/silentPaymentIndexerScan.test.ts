import { initializeIndexer, getDefaultIndexer, disconnectIndexer } from '../../modules/SilentPaymentIndexer';
import { IndexerHttpError } from '../../helpers/silent-payments/IndexerHttpClient';
import type { IndexerTransaction } from '../../helpers/silent-payments/types';

// Exercises the rewritten scan loop in SilentPaymentIndexer (PLAN.md Part 2.4):
// binary fetch, one-ahead prefetch pipeline, abort-on-failure, empty-range
// progress, and 404 fallback to the JSON path. The per-range handlers stand in
// for the wallet (which commits lastScannedBlock = rangeEnd from each handler).

type Indexer = ReturnType<typeof getDefaultIndexer>;

function recordingHandlers() {
  const binaryCalls: Array<{ rangeEnd: number; frames: Uint8Array }> = [];
  const jsonCalls: Array<{ rangeEnd: number; transactions: IndexerTransaction[] }> = [];
  return {
    binaryCalls,
    jsonCalls,
    handlers: {
      processBinaryRange: async (frames: Uint8Array, rangeEnd: number) => {
        binaryCalls.push({ rangeEnd, frames });
        return 0;
      },
      processJsonRange: async (transactions: IndexerTransaction[], rangeEnd: number) => {
        jsonCalls.push({ rangeEnd, transactions });
        return 0;
      },
    },
  };
}

describe('SilentPaymentIndexer scan loop', () => {
  let indexer: Indexer;

  beforeEach(() => {
    initializeIndexer({ baseUrl: 'http://indexer.test' });
    indexer = getDefaultIndexer();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    disconnectIndexer();
  });

  it('fetches binary ranges and reports rangeEnd for every range, including empty ones', async () => {
    const binarySpy = jest.spyOn(indexer, 'getSilentBlocksRange').mockImplementation(async () => new Uint8Array([0]));
    const jsonSpy = jest.spyOn(indexer, 'getTransactionsByRange');

    const { handlers, binaryCalls, jsonCalls } = recordingHandlers();
    const progress: number[] = [];

    // 100..174 → two ranges with RANGE_BATCH_SIZE=50: [100,149], [150,174].
    await indexer.scanForwardWithCallback(100, 174, handlers, p => {
      progress.push(p.currentBlock);
    });

    expect(binarySpy).toHaveBeenCalledTimes(2);
    expect(binarySpy).toHaveBeenNthCalledWith(1, 100, 149);
    expect(binarySpy).toHaveBeenNthCalledWith(2, 150, 174);
    expect(jsonSpy).not.toHaveBeenCalled();

    // Handler invoked once per range with rangeEnd — even though the frames carry
    // no matches, so the wallet still advances lastScannedBlock past empty blocks.
    expect(binaryCalls.map(c => c.rangeEnd)).toEqual([149, 174]);
    expect(jsonCalls).toHaveLength(0);

    // Progress is reported per range and reaches the tip.
    expect(progress).toEqual([149, 174]);
  });

  it('prefetches the next range while processing the current one (one-ahead pipeline)', async () => {
    const binarySpy = jest.spyOn(indexer, 'getSilentBlocksRange').mockImplementation(async () => new Uint8Array([0]));

    // Number of fetches already dispatched at the moment each range is processed.
    const fetchesDispatchedDuringProcessing: number[] = [];
    const handlers = {
      processBinaryRange: async () => {
        fetchesDispatchedDuringProcessing.push(binarySpy.mock.calls.length);
        return 0;
      },
      processJsonRange: async () => 0,
    };

    // 100..249 → three ranges: [100,149], [150,199], [200,249].
    await indexer.scanForwardWithCallback(100, 249, handlers);

    // While processing range 0, range 1's fetch is already in flight (2 dispatched);
    // while processing range 1, range 2's is too (3); range 2 has nothing to prefetch.
    expect(fetchesDispatchedDuringProcessing).toEqual([2, 3, 3]);
    expect(binarySpy).toHaveBeenCalledTimes(3);
  });

  it('aborts the whole scan on a fetch failure and does not advance past the last good range', async () => {
    const binarySpy = jest.spyOn(indexer, 'getSilentBlocksRange').mockImplementation(async (start: number) => {
      if (start === 150) {
        throw new Error('network down');
      }
      return new Uint8Array([0]);
    });

    const { handlers, binaryCalls } = recordingHandlers();

    // 100..249 → [100,149] ok, [150,199] fails, [200,249] should never be fetched.
    await expect(indexer.scanForwardWithCallback(100, 249, handlers)).rejects.toThrow('Failed to fetch range 150-199');

    // Only the first range was processed (committed up to 149); the failed and
    // subsequent ranges were not, so lastScannedBlock stays at the last good range.
    expect(binaryCalls.map(c => c.rangeEnd)).toEqual([149]);
    // The range after the failure is never fetched.
    expect(binarySpy.mock.calls.map(c => c[0])).toEqual([100, 150]);
  });

  it('falls back to the JSON path for the rest of the scan when the binary endpoint 404s', async () => {
    const binarySpy = jest.spyOn(indexer, 'getSilentBlocksRange').mockImplementation(async () => {
      throw new IndexerHttpError(404, 'HTTP error! status: 404');
    });
    const jsonSpy = jest.spyOn(indexer, 'getTransactionsByRange').mockImplementation(async (start: number) => ({
      transactions: [{ id: `tx-${start}` } as unknown as IndexerTransaction],
    }));

    const { handlers, binaryCalls, jsonCalls } = recordingHandlers();

    // 100..199 → [100,149], [150,199].
    await indexer.scanForwardWithCallback(100, 199, handlers);

    // Binary is tried once (404 on the first range); after that the loop uses JSON
    // directly and never probes the binary endpoint again.
    expect(binarySpy).toHaveBeenCalledTimes(1);
    expect(jsonSpy).toHaveBeenCalledTimes(2);
    expect(jsonSpy).toHaveBeenNthCalledWith(1, 100, 149);
    expect(jsonSpy).toHaveBeenNthCalledWith(2, 150, 199);

    expect(binaryCalls).toHaveLength(0);
    expect(jsonCalls.map(c => c.rangeEnd)).toEqual([149, 199]);
  });
});
