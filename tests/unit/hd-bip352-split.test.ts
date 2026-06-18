import { HDSilentPaymentsWallet } from '../../class/wallets/hd-bip352-wallet';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function makeWallet(): HDSilentPaymentsWallet {
  const w = new HDSilentPaymentsWallet();
  w.setSecret(MNEMONIC);
  return w;
}

describe('getChangeAddresses', () => {
  it('returns one address for count = 1 without advancing the pointer', () => {
    const w = makeWallet();
    const before = w.next_free_change_address_index;
    const addrs = (w as any).getChangeAddresses(1);
    expect(addrs).toHaveLength(1);
    expect(w.next_free_change_address_index).toBe(before);
  });

  it('returns N distinct sequential addresses and advances the pointer', () => {
    const w = makeWallet();
    const base = w.next_free_change_address_index;
    const addrs: string[] = (w as any).getChangeAddresses(3);
    expect(addrs).toHaveLength(3);
    expect(new Set(addrs).size).toBe(3);
    expect(addrs[0]).toBe(w._getInternalAddressByIndex(base));
    expect(addrs[2]).toBe(w._getInternalAddressByIndex(base + 2));
    expect(w.next_free_change_address_index).toBe(base + 3);
  });
});

describe('shuffleOutputs', () => {
  it('preserves the multiset of elements', async () => {
    const w = makeWallet();
    const input = [{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }, { v: 5 }];
    const out = await (w as any).shuffleOutputs(input);
    expect(out).toHaveLength(5);
    expect(out.map((o: any) => o.v).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('reorders across trials (not always identity)', async () => {
    const w = makeWallet();
    let reordered = false;
    for (let trial = 0; trial < 20 && !reordered; trial++) {
      const out = await (w as any).shuffleOutputs([1, 2, 3, 4, 5]);
      if (out.join(',') !== '1,2,3,4,5') reordered = true;
    }
    expect(reordered).toBe(true);
  });
});
