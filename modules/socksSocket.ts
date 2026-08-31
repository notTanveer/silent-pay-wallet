import { Buffer } from 'buffer';
import { EventEmitter } from 'events';
import TcpSocket from 'react-native-tcp-socket';
import { getSocks5ConnectReplyLength } from './socks5ConnectReply';

// react-native-tcp-socket doesn't export its BufferEncoding type at the package root, and
// Node's own BufferEncoding includes values (e.g. 'utf-16le') it doesn't accept - derive the
// type from the real method instead of guessing at a name.
type SocketEncoding = Parameters<InstanceType<typeof TcpSocket.Socket>['setEncoding']>[0];

// Orbot accepts the local TCP connection instantly, so the OS-level connect timeout never
// fires even when the SOCKS5 negotiation itself stalls - this bounds the handshake phase
// specifically, mirroring socks5Fetch.ts's connectTimeout.
const HANDSHAKE_TIMEOUT_MS = 10000;

/**
 * A net.Socket-compatible object (the subset `electrum-client` actually calls) that tunnels a
 * TCP connection through a SOCKS5 proxy (Orbot) instead of dialing the target host directly.
 * This is what makes connecting to a .onion Electrum server possible at all - .onion hosts have
 * no DNS record and are only reachable by routing through Tor.
 *
 * `electrum-client` registers its own 'data'/'connect'/'close'/'error' listeners on this object
 * synchronously, before connect() is even called - so the SOCKS5 handshake bytes must be
 * consumed internally and never surfaced as a 'data' event, or they'd corrupt its JSON-RPC
 * message parser. Only bytes that arrive after the tunnel is established are forwarded.
 */
export class SocksTunnelSocket extends EventEmitter {
  private readonly real: InstanceType<typeof TcpSocket.Socket>;
  private phase: 'idle' | 'greeting' | 'connect' | 'tunnel' = 'idle';
  private pending: Buffer = Buffer.alloc(0);
  private pendingEncoding: SocketEncoding | undefined;
  private targetHost = '';
  private targetPort = 0;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly socksHost: string,
    private readonly socksPort: number,
  ) {
    super();
    this.real = new TcpSocket.Socket();
  }

  connect(options: { host: string; port: number }, callback?: () => void): this {
    if (callback) this.once('connect', callback);

    this.targetHost = options.host;
    this.targetPort = options.port;
    this.phase = 'greeting';

    this.handshakeTimer = setTimeout(() => {
      this.failHandshake(new Error(`SOCKS5 handshake timed out after ${HANDSHAKE_TIMEOUT_MS}ms`));
    }, HANDSHAKE_TIMEOUT_MS);

    this.real.on('data', this.onHandshakeData);
    this.real.on('error', (error: Error) => this.emit('error', error));
    this.real.on('close', (hadError: boolean) => this.emit('close', hadError));

    this.real.connect({ host: this.socksHost, port: this.socksPort }, () => {
      this.real.write(Buffer.from([0x05, 0x01, 0x00]));
    });

    return this;
  }

  private onHandshakeData = (data: string | Buffer) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.pending = this.pending.length ? Buffer.concat([this.pending, buf]) : buf;

    if (this.phase === 'greeting') {
      if (this.pending.length < 2) return;
      if (this.pending[0] !== 0x05 || this.pending[1] !== 0x00) {
        this.failHandshake(new Error('SOCKS5 authentication negotiation failed'));
        return;
      }
      this.pending = this.pending.subarray(2);
      this.phase = 'connect';

      const domainBuf = Buffer.from(this.targetHost, 'ascii');
      const req = Buffer.alloc(7 + domainBuf.length);
      req[0] = 0x05; // SOCKS version
      req[1] = 0x01; // CONNECT command
      req[2] = 0x00; // Reserved
      req[3] = 0x03; // Address type: domain name
      req[4] = domainBuf.length;
      domainBuf.copy(req, 5);
      req.writeUInt16BE(this.targetPort, 5 + domainBuf.length);
      this.real.write(req);
    }

    if (this.phase === 'connect') {
      const replyLength = getSocks5ConnectReplyLength(this.pending);
      if (replyLength === null) return;

      if (replyLength < 0 || this.pending[0] !== 0x05 || this.pending[1] !== 0x00) {
        const errorCode = this.pending.length >= 2 ? this.pending[1] : -1;
        this.failHandshake(new Error(`SOCKS5 CONNECT failed (code: ${errorCode})`));
        return;
      }

      const leftover = this.pending.subarray(replyLength);
      this.completeHandshake(leftover);
    }
  };

  private clearHandshakeTimer(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
  }

  private failHandshake(error: Error): void {
    this.clearHandshakeTimer();
    this.real.removeListener('data', this.onHandshakeData);
    try {
      this.real.destroy();
    } catch {}
    this.emit('error', error);
  }

  private completeHandshake(leftoverBytes: Buffer): void {
    this.clearHandshakeTimer();
    this.real.removeListener('data', this.onHandshakeData);
    this.phase = 'tunnel';

    // Only safe to switch the real socket to string mode now - doing it during the handshake
    // risks a lossy UTF-8 round-trip on arbitrary SOCKS5 reply bytes.
    if (this.pendingEncoding) this.real.setEncoding(this.pendingEncoding);

    this.real.on('data', (chunk: string | Buffer) => this.emit('data', chunk));

    if (leftoverBytes.length > 0) {
      this.emit('data', this.pendingEncoding ? leftoverBytes.toString(this.pendingEncoding) : leftoverBytes);
    }

    this.emit('connect');
  }

  write(data: string | Buffer): boolean {
    this.real.write(data);
    return true;
  }

  end(): void {
    this.real.end();
  }

  destroy(): void {
    this.clearHandshakeTimer();
    this.real.destroy();
  }

  setTimeout(timeout: number): this {
    this.real.setTimeout(timeout);
    return this;
  }

  setEncoding(encoding: SocketEncoding): this {
    // Deferred - see completeHandshake().
    this.pendingEncoding = encoding;
    return this;
  }

  setKeepAlive(enable: boolean, initialDelay?: number): this {
    this.real.setKeepAlive(enable, initialDelay);
    return this;
  }

  setNoDelay(noDelay?: boolean): this {
    this.real.setNoDelay(noDelay);
    return this;
  }
}

/**
 * Builds a `net`-shaped object that `ElectrumClient` (electrum-client) can be constructed with
 * in place of the real `net` module, so its plain-TCP connection routes through the given SOCKS5
 * proxy instead of dialing the host directly. Only meant for `protocol: 'tcp'` - TLS is not
 * supported here (react-native-tcp-socket's TLSSocket needs a real native socket underneath,
 * which this wrapper isn't; .onion Electrum servers are also typically plaintext, since Tor
 * already provides transport encryption, so this isn't a practical gap).
 */
export function createSocksNet(socksHost: string, socksPort: number): { Socket: new () => SocksTunnelSocket } {
  return {
    Socket: class extends SocksTunnelSocket {
      constructor() {
        super(socksHost, socksPort);
      }
    },
  };
}
