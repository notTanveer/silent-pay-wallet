import assert from 'assert';
import { EventEmitter } from 'events';
import { createSocksNet } from '../../modules/socksSocket';

jest.mock('react-native-tcp-socket', () => {
  class FakeTcpSocket extends EventEmitter {
    write = jest.fn();
    destroy = jest.fn();
    end = jest.fn();
    setTimeout = jest.fn();
    setEncoding = jest.fn();
    setKeepAlive = jest.fn();
    setNoDelay = jest.fn();
    connect = jest.fn((options: unknown, callback: () => void) => {
      setImmediate(callback);
      return this;
    });
  }
  return {
    __esModule: true,
    default: { Socket: FakeTcpSocket },
  };
});

const flush = () => new Promise(resolve => setImmediate(resolve));

const SOCKS5_GREETING_ACCEPT = Buffer.from([0x05, 0x00]);
const socks5ConnectReplyIPv4 = () => Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);

describe('unit - socksSocket (SOCKS5-tunneled net.Socket for onion Electrum)', () => {
  it('performs the SOCKS5 handshake then forwards post-tunnel data as a normal socket would', async () => {
    const net = createSocksNet('127.0.0.1', 9050);
    const socket = new net.Socket();
    const dataEvents: Array<string | Buffer> = [];
    socket.on('data', (d: string | Buffer) => dataEvents.push(d));

    const connectCallback = jest.fn();
    socket.connect({ host: 'abc123.onion', port: 50001 }, connectCallback);
    await flush();

    // The wrapper's internal real socket is whatever `new TcpSocket.Socket()` last returned.
    const real = (socket as unknown as { real: EventEmitter }).real;
    real.emit('data', SOCKS5_GREETING_ACCEPT);
    real.emit('data', socks5ConnectReplyIPv4());

    assert.strictEqual(connectCallback.mock.calls.length, 1, 'connect callback should fire once the tunnel is up');

    real.emit('data', Buffer.from('post-tunnel bytes'));
    assert.strictEqual(dataEvents.length, 1);
    assert.strictEqual(dataEvents[0].toString(), 'post-tunnel bytes');
  });

  it('never surfaces handshake bytes as a data event', async () => {
    const net = createSocksNet('127.0.0.1', 9050);
    const socket = new net.Socket();
    const dataEvents: Array<string | Buffer> = [];
    socket.on('data', (d: string | Buffer) => dataEvents.push(d));

    socket.connect({ host: 'abc123.onion', port: 50001 });
    await flush();

    const real = (socket as unknown as { real: EventEmitter }).real;
    real.emit('data', SOCKS5_GREETING_ACCEPT);
    real.emit('data', socks5ConnectReplyIPv4());

    assert.strictEqual(dataEvents.length, 0, 'handshake bytes must never reach the public data event');
  });

  it('emits error and destroys the socket if the proxy refuses no-auth', async () => {
    const net = createSocksNet('127.0.0.1', 9050);
    const socket = new net.Socket();
    const errors: Error[] = [];
    socket.on('error', (e: Error) => errors.push(e));

    socket.connect({ host: 'abc123.onion', port: 50001 });
    await flush();

    const real = (socket as unknown as { real: EventEmitter & { destroy: jest.Mock } }).real;
    real.emit('data', Buffer.from([0x05, 0xff]));

    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /authentication negotiation failed/);
    assert.strictEqual(real.destroy.mock.calls.length, 1);
  });

  it('emits error if the SOCKS5 CONNECT request fails', async () => {
    const net = createSocksNet('127.0.0.1', 9050);
    const socket = new net.Socket();
    const errors: Error[] = [];
    socket.on('error', (e: Error) => errors.push(e));

    socket.connect({ host: 'abc123.onion', port: 50001 });
    await flush();

    const real = (socket as unknown as { real: EventEmitter }).real;
    real.emit('data', SOCKS5_GREETING_ACCEPT);
    real.emit('data', Buffer.from([0x05, 0x04, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));

    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /CONNECT failed \(code: 4\)/);
  });

  it('defers setEncoding until after the tunnel is established, keeping handshake bytes as raw Buffers', async () => {
    const net = createSocksNet('127.0.0.1', 9050);
    const socket = new net.Socket();
    socket.setEncoding('utf8');

    socket.connect({ host: 'abc123.onion', port: 50001 });
    await flush();

    const real = (socket as unknown as { real: EventEmitter & { setEncoding: jest.Mock } }).real;
    assert.strictEqual(real.setEncoding.mock.calls.length, 0, 'must not switch encoding before the handshake completes');

    real.emit('data', SOCKS5_GREETING_ACCEPT);
    real.emit('data', socks5ConnectReplyIPv4());

    assert.strictEqual(real.setEncoding.mock.calls.length, 1);
    assert.strictEqual(real.setEncoding.mock.calls[0][0], 'utf8');
  });

  it('forwards write/destroy/setKeepAlive/setNoDelay to the underlying socket', async () => {
    const net = createSocksNet('127.0.0.1', 9050);
    const socket = new net.Socket();
    socket.setKeepAlive(true, 0);
    socket.setNoDelay(true);
    socket.connect({ host: 'abc123.onion', port: 50001 });
    await flush();

    const real = (
      socket as unknown as {
        real: EventEmitter & { write: jest.Mock; destroy: jest.Mock; setKeepAlive: jest.Mock; setNoDelay: jest.Mock };
      }
    ).real;
    real.emit('data', SOCKS5_GREETING_ACCEPT);
    real.emit('data', socks5ConnectReplyIPv4());

    socket.write('hello');
    socket.destroy();

    assert.strictEqual(real.write.mock.calls[real.write.mock.calls.length - 1][0], 'hello');
    assert.strictEqual(real.destroy.mock.calls.length, 1);
    assert.strictEqual(real.setKeepAlive.mock.calls.length, 1);
    assert.strictEqual(real.setNoDelay.mock.calls.length, 1);
  });
});
