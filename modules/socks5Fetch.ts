import { Buffer } from 'buffer';
import TcpSocket from 'react-native-tcp-socket';
import { getSocks5ConnectReplyLength } from './socks5ConnectReply';

const DEFAULT_SOCKS_HOST = '127.0.0.1';
const DEFAULT_SOCKS_PORT = 9050;
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_CONNECT_TIMEOUT = 10000;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

// Caller-supplied header keys/values are interpolated directly into the raw request below -
// stripping CR/LF here closes off header/request injection via a header value containing them.
const sanitizeHeaderField = (value: string): string => value.replace(/[\r\n]/g, '');

interface Socks5FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  connectTimeout?: number;
  socksHost?: string;
  socksPort?: number;
}

interface Socks5Response {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  json: () => Promise<any>;
  text: () => Promise<string>;
}

function parseUrl(url: string): { host: string; port: number; path: string } {
  if (url.startsWith('https://')) {
    throw new Error(
      'HTTPS URLs are not supported by socks5Fetch; use http:// (onion services are reached over plain HTTP through the Tor tunnel)',
    );
  }
  const match = url.match(/^http:\/\/([^/:]+)(?::(\d+))?(\/.*)?$/);
  if (!match) {
    throw new Error(`Invalid URL: ${url}`);
  }
  const host = match[1];
  const port = match[2] ? parseInt(match[2], 10) : 80;
  const path = match[3] || '/';
  return { host, port, path };
}

// Returns complete: false whenever more bytes are needed - on a short/malformed chunk this must
// signal "not done yet" rather than returning the partial body, or a truncated read looks like success.
// Operates on the raw Buffer throughout - chunk sizes are byte counts, and indexing a UTF-8
// string instead would misalign on any multi-byte character in the body.
function decodeChunked(data: Buffer): { body: Buffer; complete: boolean } {
  const chunks: Buffer[] = [];
  let remaining = data;

  while (remaining.length > 0) {
    const lineEnd = remaining.indexOf('\r\n');
    if (lineEnd === -1) return { body: Buffer.concat(chunks), complete: false };

    const chunkSizeStr = remaining.subarray(0, lineEnd).toString('ascii').trim();
    if (!chunkSizeStr) return { body: Buffer.concat(chunks), complete: false };

    const chunkSize = parseInt(chunkSizeStr, 16);
    if (isNaN(chunkSize)) return { body: Buffer.concat(chunks), complete: false };
    if (chunkSize === 0) return { body: Buffer.concat(chunks), complete: true };

    const chunkStart = lineEnd + 2;
    if (remaining.length < chunkStart + chunkSize + 2) return { body: Buffer.concat(chunks), complete: false };
    chunks.push(remaining.subarray(chunkStart, chunkStart + chunkSize));
    remaining = remaining.subarray(chunkStart + chunkSize + 2); // +2 for trailing \r\n
  }

  return { body: Buffer.concat(chunks), complete: false };
}

/**
 * Make an HTTP request through a SOCKS5 proxy (e.g., Orbot).
 * This enables connecting to .onion addresses via Tor.
 */
export function socks5Fetch(url: string, options: Socks5FetchOptions = {}): Promise<Socks5Response> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = DEFAULT_TIMEOUT,
    connectTimeout = DEFAULT_CONNECT_TIMEOUT,
    socksHost = DEFAULT_SOCKS_HOST,
    socksPort = DEFAULT_SOCKS_PORT,
  } = options;

  const { host, port, path } = parseUrl(url);

  return new Promise((resolve, reject) => {
    let resolved = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (fn: () => void) => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      fn();
    };

    timer = setTimeout(() => {
      finish(() => {
        try {
          client.destroy();
        } catch {}
        reject(new Error(`SOCKS5 connect timeout after ${connectTimeout}ms`));
      });
    }, connectTimeout);

    const client = TcpSocket.createConnection({ host: socksHost, port: socksPort }, () => {
      // Phase 1: SOCKS5 greeting - version 5, 1 auth method, no auth
      client.write(Buffer.from([0x05, 0x01, 0x00]));
    });

    let phase: 'greeting' | 'connect' | 'http' = 'greeting';
    let pending: Buffer = Buffer.alloc(0);

    let httpBuffer: Buffer = Buffer.alloc(0);
    let headerEnd = -1;
    let status = 0;
    let statusText = '';
    const responseHeaders: Record<string, string> = {};
    let expectedBodyLength: number | null = null;
    let isChunked = false;

    // Parses the status line + headers once the header terminator has arrived. Returns false
    // while more bytes are still needed.
    const parseHeadersIfNeeded = (): boolean => {
      if (headerEnd !== -1) return true;
      const idx = httpBuffer.indexOf('\r\n\r\n');
      if (idx === -1) return false;
      headerEnd = idx;

      const headerPart = httpBuffer.subarray(0, headerEnd).toString('utf-8');
      const statusLine = headerPart.split('\r\n')[0];
      const statusMatch = statusLine.match(/HTTP\/[\d.]+\s+(\d+)\s*(.*)/);
      status = statusMatch ? parseInt(statusMatch[1], 10) : 0;
      statusText = statusMatch ? statusMatch[2] : '';

      const headerLines = headerPart.split('\r\n').slice(1);
      for (const line of headerLines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim().toLowerCase();
          const value = line.substring(colonIndex + 1).trim();
          responseHeaders[key] = value;
        }
      }

      isChunked = responseHeaders['transfer-encoding']?.includes('chunked') ?? false;
      const contentLengthHeader = responseHeaders['content-length'];
      expectedBodyLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : null;
      return true;
    };

    const buildResponse = (bodyText: string): Socks5Response => ({
      ok: status >= 200 && status < 300,
      status,
      statusText,
      headers: responseHeaders,
      json: async () => JSON.parse(bodyText),
      text: async () => bodyText,
    });

    // Resolves as soon as the body is verifiably complete (Content-Length reached, or the
    // chunked terminator seen). Returns false when there's not yet enough to tell - including
    // when there's no length info at all, in which case only the 'close' handler can finish it.
    const tryFinalizeHttpResponse = (): boolean => {
      if (!parseHeadersIfNeeded()) return false;
      const bodyBuf = httpBuffer.subarray(headerEnd + 4);

      if (isChunked) {
        const decoded = decodeChunked(bodyBuf);
        if (!decoded.complete) return false;
        finish(() => resolve(buildResponse(decoded.body.toString('utf-8'))));
        return true;
      }

      if (expectedBodyLength !== null) {
        if (bodyBuf.length < expectedBodyLength) return false;
        finish(() => resolve(buildResponse(bodyBuf.subarray(0, expectedBodyLength as number).toString('utf-8'))));
        return true;
      }

      return false;
    };

    client.on('data', (data: string | Buffer) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      pending = pending.length ? Buffer.from(Buffer.concat([pending, buf])) : buf;

      while (pending.length > 0) {
        if (phase === 'greeting') {
          if (pending.length < 2) return;

          // Verify SOCKS5 server accepted no-auth
          if (pending[0] !== 0x05 || pending[1] !== 0x00) {
            finish(() => {
              client.destroy();
              reject(new Error('SOCKS5 authentication negotiation failed'));
            });
            return;
          }
          pending = pending.subarray(2);

          // Phase 2: Send CONNECT request with domain name
          phase = 'connect';
          const domainBuf = Buffer.from(host, 'ascii');
          const req = Buffer.alloc(7 + domainBuf.length);
          req[0] = 0x05; // SOCKS version
          req[1] = 0x01; // CONNECT command
          req[2] = 0x00; // Reserved
          req[3] = 0x03; // Address type: domain name
          req[4] = domainBuf.length; // Domain length
          domainBuf.copy(req, 5);
          req.writeUInt16BE(port, 5 + domainBuf.length); // Port
          client.write(req);
        } else if (phase === 'connect') {
          const replyLength = getSocks5ConnectReplyLength(pending);
          if (replyLength === null) return;

          if (replyLength < 0 || pending[0] !== 0x05 || pending[1] !== 0x00) {
            const errorCode = pending.length >= 2 ? pending[1] : -1;
            finish(() => {
              client.destroy();
              reject(new Error(`SOCKS5 CONNECT failed (code: ${errorCode})`));
            });
            return;
          }
          pending = pending.subarray(replyLength);

          // Phase 3: Tunnel established - swap to full request timeout and send HTTP request
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            finish(() => {
              try {
                client.destroy();
              } catch {}
              reject(new Error(`SOCKS5 request timeout after ${timeout}ms`));
            });
          }, timeout);
          phase = 'http';
          const requestHeaders: Record<string, string> = {
            Host: host,
            Connection: 'close',
            Accept: 'application/json',
            ...headers,
          };

          let httpRequest = `${method} ${path} HTTP/1.1\r\n`;
          for (const [key, value] of Object.entries(requestHeaders)) {
            httpRequest += `${sanitizeHeaderField(key)}: ${sanitizeHeaderField(value)}\r\n`;
          }
          if (body) {
            httpRequest += `Content-Length: ${Buffer.byteLength(body)}\r\n`;
          }
          httpRequest += '\r\n';
          if (body) {
            httpRequest += body;
          }

          client.write(Buffer.from(httpRequest));
        } else if (phase === 'http') {
          httpBuffer = httpBuffer.length ? Buffer.concat([httpBuffer, pending]) : pending;
          pending = Buffer.alloc(0);

          if (httpBuffer.length > MAX_RESPONSE_BYTES) {
            finish(() => {
              client.destroy();
              reject(new Error(`SOCKS5 response exceeded ${MAX_RESPONSE_BYTES} byte limit`));
            });
            return;
          }

          tryFinalizeHttpResponse();
        }
      }
    });

    // Fallback for when 'data' never saw a complete body: a genuine HTTP/1.0-style
    // connection-closed-delimited response (no Content-Length, not chunked) is only
    // complete once the socket closes. If we *do* have a Content-Length or were mid-chunk,
    // closing early means the read was truncated - resolving anyway would hand truncated
    // data to the caller as if it were a full response.
    client.on('close', () => {
      finish(() => {
        try {
          if (!parseHeadersIfNeeded()) {
            reject(new Error('Invalid HTTP response: no header terminator'));
            return;
          }
          if (expectedBodyLength !== null || isChunked) {
            reject(new Error('SOCKS5 response ended before the declared body length was received'));
            return;
          }
          const bodyBuf = httpBuffer.subarray(headerEnd + 4);
          resolve(buildResponse(bodyBuf.toString('utf-8')));
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error instanceof Error ? error.message : String(error)}`));
        }
      });
    });

    client.on('error', (error: Error) => {
      finish(() => {
        reject(new Error(`SOCKS5 connection error: ${error.message}`));
      });
    });
  });
}
