// Returns the full length of a SOCKS5 CONNECT reply in `buf`, or null if more bytes are needed
// to determine it, or -1 if the address type is unknown. Shared by socks5Fetch.ts and
// socksSocket.ts, which both parse this same wire format.
export function getSocks5ConnectReplyLength(buf: Buffer): number | null {
  if (buf.length < 5) return null;
  const atyp = buf[3];
  if (atyp === 0x01) return buf.length >= 10 ? 10 : null; // IPv4: VER+REP+RSV+ATYP + 4 + PORT(2)
  if (atyp === 0x04) return buf.length >= 22 ? 22 : null; // IPv6: VER+REP+RSV+ATYP + 16 + PORT(2)
  if (atyp === 0x03) {
    const domainLength = buf[4];
    return buf.length >= 5 + domainLength + 2 ? 5 + domainLength + 2 : null;
  }
  return -1;
}
