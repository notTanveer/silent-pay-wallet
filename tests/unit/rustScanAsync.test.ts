// Verifies the binary scan goes through the async (off-JS-thread) JSI global when
// present, and transparently falls back to the synchronous global on older native
// binaries. The RustJsiBridge module is mocked at its boundary so no native code runs.

describe('spScanSilentBlockRangeAsync', () => {
  const realModulePath = '../../modules/RustJsiBridge';

  afterEach(() => {
    jest.resetModules();
    // @ts-ignore
    delete (global as any).spScanSilentBlockRangeAsync;
    // @ts-ignore
    delete (global as any).spScanSilentBlockRange;
  });

  function loadInstalled() {
    // Force isInstalled=true by stubbing the native install before first import.
    jest.doMock('react-native', () => ({
      NativeModules: { RustJsiBridge: { install: () => true } },
      Platform: { select: () => '', OS: 'ios' },
    }));
    const mod = require(realModulePath);
    mod.initializeRustJsiBridge();
    return mod;
  }

  it('uses the async global when it exists', async () => {
    const mod = loadInstalled();
    const result = { matchedUtxos: [], transactionsScanned: 3, outputsScanned: 7 };
    const asyncFn = jest.fn().mockResolvedValue(JSON.stringify(result));
    // @ts-ignore
    (global as any).spScanSilentBlockRangeAsync = asyncFn;

    const buf = new Uint8Array([0, 1, 2]).buffer;
    const out = await mod.spScanSilentBlockRangeAsync('aa', 'bb', buf);

    expect(asyncFn).toHaveBeenCalledWith('aa', 'bb', buf);
    expect(out).toEqual(result);
  });

  it('falls back to the sync global when async is missing', async () => {
    const mod = loadInstalled();
    const result = { matchedUtxos: [], transactionsScanned: 1, outputsScanned: 1 };
    const syncFn = jest.fn().mockReturnValue(JSON.stringify(result));
    // @ts-ignore
    (global as any).spScanSilentBlockRange = syncFn;

    const buf = new Uint8Array([9]).buffer;
    const out = await mod.spScanSilentBlockRangeAsync('aa', 'bb', buf);

    expect(syncFn).toHaveBeenCalledWith('aa', 'bb', buf);
    expect(out).toEqual(result);
  });

  it('throws when Rust returns an error payload', async () => {
    const mod = loadInstalled();
    // @ts-ignore
    (global as any).spScanSilentBlockRangeAsync = jest.fn().mockResolvedValue(JSON.stringify({ error: 'boom' }));
    await expect(mod.spScanSilentBlockRangeAsync('aa', 'bb', new Uint8Array([0]).buffer)).rejects.toThrow('boom');
  });
});
