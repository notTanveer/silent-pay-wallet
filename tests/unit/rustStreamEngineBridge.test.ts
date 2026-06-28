// Drives streamViaRustEngine with mocked native globals: feeds engine events and
// asserts they map to onProgress/onMatch and that done resolves / unsupported rejects.
import { streamViaRustEngine } from '../../modules/SilentBlockStreamClient';
import { StreamUnsupportedError } from '../../modules/SilentBlockStreamClient';

function withMockEngine(script: (onEvent: (j: string) => void) => void) {
  (global as any).spScanStart = (_cfg: string, onEvent: (j: string) => void) => {
    setImmediate(() => script(onEvent));
  };
  (global as any).spScanCancel = () => {};
  (global as any).spScanPause = () => {};
  (global as any).spScanResume = () => {};
}

afterEach(() => {
  ['spScanStart','spScanCancel','spScanPause','spScanResume'].forEach(k => { delete (global as any)[k]; });
});

it('maps progress events and resolves on done', async () => {
  const progress: number[] = [];
  withMockEngine(onEvent => {
    onEvent(JSON.stringify({ type: 'progress', currentBlock: 5, tipHeight: 10, totalBlocks: 10, blocksScanned: 5, percentComplete: 50, utxosFound: 0 }));
    onEvent(JSON.stringify({ type: 'done' }));
  });
  await streamViaRustEngine({
    wsUrl: 'wss://x/', from: 1, to: 10, scanPrivkeyHex: 'aa', spendPubkeyHex: 'bb',
    handlers: { onMatch: async () => {} },
    onProgress: p => { progress.push(p.percentComplete); },
  });
  expect(progress).toContain(50);
});

it('rejects with StreamUnsupportedError on unsupported', async () => {
  withMockEngine(onEvent => onEvent(JSON.stringify({ type: 'error', code: 'unsupported', message: 'no sync' })));
  await expect(streamViaRustEngine({
    wsUrl: 'wss://x/', from: 1, to: 10, scanPrivkeyHex: 'aa', spendPubkeyHex: 'bb',
    handlers: { onMatch: async () => {} },
  })).rejects.toBeInstanceOf(StreamUnsupportedError);
});

it('forwards match events to onMatch', async () => {
  const matches: any[] = [];
  withMockEngine(onEvent => {
    onEvent(JSON.stringify({ type: 'match', utxos: [{ txid: 'a', vout: 0, value: 1, height: 2, pubKey: 'p', tweakHex: 't' }] }));
    onEvent(JSON.stringify({ type: 'done' }));
  });
  await streamViaRustEngine({
    wsUrl: 'wss://x/', from: 1, to: 10, scanPrivkeyHex: 'aa', spendPubkeyHex: 'bb',
    handlers: { onMatch: async (u: any[]) => { matches.push(...u); } },
  });
  expect(matches).toHaveLength(1);
});

it('calls spScanCancel and rejects with SCAN_CANCELLED when cancelCallback returns true', async () => {
  jest.useFakeTimers();
  // Engine that never emits done — cancel drives settlement.
  (global as any).spScanStart = (_cfg: string, _onEvent: (j: string) => void) => {};
  const mockCancel = jest.fn();
  (global as any).spScanCancel = mockCancel;

  const p = streamViaRustEngine({
    wsUrl: 'wss://x/', from: 1, to: 10, scanPrivkeyHex: 'aa', spendPubkeyHex: 'bb',
    handlers: { onMatch: async () => {} },
    cancelCallback: () => true,
  });

  jest.advanceTimersByTime(300); // fire the 250ms poll
  await expect(p).rejects.toThrow('SCAN_CANCELLED');
  expect(mockCancel).toHaveBeenCalled();
  jest.useRealTimers();
});
