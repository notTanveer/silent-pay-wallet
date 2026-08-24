import assert from 'assert';
import { EventEmitter } from 'events';
import TcpSocket from 'react-native-tcp-socket';
import { socks5Fetch } from '../../modules/socks5Fetch';

jest.mock('react-native-tcp-socket', () => {
  class FakeTcpSocket extends EventEmitter {
    write = jest.fn();
    destroy = jest.fn();
  }
  return {
    __esModule: true,
    default: {
      createConnection: jest.fn((_options: unknown, callback: () => void) => {
        const socket = new FakeTcpSocket();
        setImmediate(callback);
        return socket;
      }),
    },
  };
});

const mockCreateConnection = TcpSocket.createConnection as jest.Mock;

const latestSocket = (): EventEmitter & { write: jest.Mock; destroy: jest.Mock } => {
  const results = mockCreateConnection.mock.results;
  return results[results.length - 1].value;
};

// Waits a macrotask so the socket's connect callback (scheduled via setImmediate) has run
// and socks5Fetch has sent the SOCKS5 greeting, before the test starts pushing server bytes.
const flush = () => new Promise(resolve => setImmediate(resolve));

const SOCKS5_GREETING_ACCEPT = Buffer.from([0x05, 0x00]);
const socks5ConnectReplyIPv4 = () => Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);

const httpResponse = (status: number, headers: Record<string, string>, body: string): Buffer => {
  const headerLines = Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}\r\n`)
    .join('');
  return Buffer.from(`HTTP/1.1 ${status} OK\r\n${headerLines}\r\n${body}`);
};

// Drives a socket through the SOCKS5 handshake (greeting + CONNECT) so tests can focus on
// what happens after the tunnel is established, without repeating the handshake bytes everywhere.
const completeHandshake = async (socket: EventEmitter) => {
  await flush();
  socket.emit('data', SOCKS5_GREETING_ACCEPT);
  socket.emit('data', socks5ConnectReplyIPv4());
};

describe('unit - socks5Fetch', () => {
  beforeEach(() => {
    mockCreateConnection.mockClear();
  });

  it('completes the SOCKS5 handshake and resolves a Content-Length response', async () => {
    const promise = socks5Fetch('http://abc123.onion/status');
    const socket = latestSocket();
    await completeHandshake(socket);

    socket.emit('data', httpResponse(200, { 'Content-Length': '12' }, '{"ok": true}'));

    const response = await promise;
    assert.strictEqual(response.ok, true);
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), { ok: true });
  });

  it('parses a CONNECT reply split across two TCP segments', async () => {
    const promise = socks5Fetch('http://abc123.onion/status');
    const socket = latestSocket();
    await flush();
    socket.emit('data', SOCKS5_GREETING_ACCEPT);

    // IPv4 CONNECT reply is 10 bytes - split 5+5, the exact case the length-check fix covers.
    const reply = socks5ConnectReplyIPv4();
    socket.emit('data', reply.subarray(0, 5));
    socket.emit('data', reply.subarray(5, 10));

    socket.emit('data', httpResponse(200, { 'Content-Length': '2' }, '{}'));

    const response = await promise;
    assert.strictEqual(response.ok, true);
    assert.deepStrictEqual(await response.json(), {});
  });

  it('decodes a chunked response delivered across multiple data events', async () => {
    const promise = socks5Fetch('http://abc123.onion/status');
    const socket = latestSocket();
    await completeHandshake(socket);

    const header = Buffer.from('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n');
    // "{"a" (3 bytes) then "":1}" (4 bytes) then the terminal zero-size chunk.
    const chunk1 = Buffer.from('3\r\n{"a\r\n');
    const chunk2 = Buffer.from('4\r\n":1}\r\n0\r\n\r\n');

    socket.emit('data', header);
    socket.emit('data', chunk1);
    socket.emit('data', chunk2);

    const response = await promise;
    assert.strictEqual(response.ok, true);
    assert.deepStrictEqual(await response.json(), { a: 1 });
  });

  it('rejects instead of resolving truncated data when the socket closes before Content-Length is met', async () => {
    const promise = socks5Fetch('http://abc123.onion/status');
    const socket = latestSocket();
    await completeHandshake(socket);

    // Declares 100 bytes but only 5 ever arrive, then the connection drops.
    socket.emit('data', httpResponse(200, { 'Content-Length': '100' }, 'short'));
    socket.emit('close');

    await assert.rejects(promise, /body length/);
  });

  it('resolves connection-closed-delimited bodies (no Content-Length, not chunked) once the socket closes', async () => {
    const promise = socks5Fetch('http://abc123.onion/status');
    const socket = latestSocket();
    await completeHandshake(socket);

    socket.emit('data', Buffer.from('HTTP/1.1 200 OK\r\n\r\n{"ok":true}'));
    socket.emit('close');

    const response = await promise;
    assert.strictEqual(response.ok, true);
    assert.deepStrictEqual(await response.json(), { ok: true });
  });

  it('rejects once the response exceeds the size cap instead of buffering it unbounded', async () => {
    const promise = socks5Fetch('http://abc123.onion/status');
    const socket = latestSocket();
    await completeHandshake(socket);

    const oversized = Buffer.concat([
      Buffer.from(`HTTP/1.1 200 OK\r\nContent-Length: ${21 * 1024 * 1024}\r\n\r\n`),
      Buffer.alloc(21 * 1024 * 1024),
    ]);
    socket.emit('data', oversized);

    await assert.rejects(promise, /byte limit/);
    assert.strictEqual(socket.destroy.mock.calls.length, 1);
  });

  it('strips CRLF from caller-supplied header values instead of letting them inject extra headers', async () => {
    const promise = socks5Fetch('http://abc123.onion/status', { headers: { 'X-Custom': 'value\r\nX-Injected: evil' } });
    const socket = latestSocket();
    await completeHandshake(socket);
    socket.emit('data', httpResponse(200, { 'Content-Length': '2' }, '{}'));
    await promise;

    // write() is called 3 times: SOCKS5 greeting, CONNECT request, then the HTTP request itself.
    const sentRequest = socket.write.mock.calls[2][0].toString('utf-8');
    assert.ok(!sentRequest.includes('\r\nX-Injected:'), 'CRLF in the value must not start a new header line');
    assert.ok(sentRequest.includes('X-Custom: valueX-Injected: evil'), 'CRLF should be stripped, not the surrounding text');
  });

  it('rejects when the SOCKS5 server refuses no-auth', async () => {
    const promise = socks5Fetch('http://abc123.onion/status');
    const socket = latestSocket();
    await flush();
    socket.emit('data', Buffer.from([0x05, 0xff]));

    await assert.rejects(promise, /authentication negotiation failed/);
  });

  it('rejects when the SOCKS5 CONNECT request fails', async () => {
    const promise = socks5Fetch('http://abc123.onion/status');
    const socket = latestSocket();
    await flush();
    socket.emit('data', SOCKS5_GREETING_ACCEPT);
    // REP=0x04 (host unreachable)
    socket.emit('data', Buffer.from([0x05, 0x04, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));

    await assert.rejects(promise, /CONNECT failed \(code: 4\)/);
  });
});
