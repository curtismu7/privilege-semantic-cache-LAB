// Safety rules. Pure functions plus two tiny middlewares. No I/O.
//  1. Loopback bind only unless PSC_BIND is set on purpose.
//  2. Host header must be a loopback name or one on LAB_ALLOWED_HOSTS (DNS-rebinding defence): otherwise 421 Misdirected Request.
//  3. A write must be same-origin and JSON: a cross-origin Origin or cross-site Sec-Fetch-Site is 403, a non-JSON body is 415.
//  4. The port 7847 is PROVISIONAL (not claimed on the board yet); PORT may override it with any port that is not reserved.

export function isLoopbackHost(host) {
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || /^127(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(h);
}

export const bindHost = (env = process.env) => env.PSC_BIND || '127.0.0.1';

export function assertBindAllowed(host, env = process.env) {
  if (isLoopbackHost(host) || env.PSC_BIND) return host;
  throw new Error(`refusing to bind ${host}: loopback only. Set PSC_BIND to opt in.`);
}

export const DEFAULT_PORT = 7847; // PROVISIONAL: not claimed on the board yet
const FORBIDDEN_PORTS = new Set([8080, 5173, 3000, 3900, 4000, 4400, 4510, 4600, 4601, 4840, 18080, 19080, 19090]);
export function resolvePort(env = process.env) {
  const port = env.PORT === undefined || env.PORT === '' ? DEFAULT_PORT : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be a whole number from 1024 to 65535');
  if (FORBIDDEN_PORTS.has(port)) throw new Error(`port ${port} is reserved for something else`);
  return port;
}

const HOSTNAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
export function allowedExtraHosts(env = process.env) {
  const extra = String(env.LAB_ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  for (const h of extra) if (!HOSTNAME.test(h)) throw new Error(`LAB_ALLOWED_HOSTS: not a host name: ${h.slice(0, 60)}`);
  return new Set(extra);
}

// The host part of a Host header: a bracketed IPv6 literal or a name or IPv4, with an optional :port. Anything else is null and refused.
export function hostOf(raw) {
  const m = /^(\[[0-9a-fA-F:.]+\]|[^\s:[\]]+)(?::\d{1,5})?$/.exec(String(raw));
  return m ? m[1] : null;
}

export function makeHostCheck(env = process.env) {
  let extra;
  try { extra = allowedExtraHosts(env); } catch { extra = new Set(); } // a bad setting is a start-up error (index.js); a request never matches it
  return function hostCheck(req, res, next) {
    const host = hostOf(req.headers.host || '');
    if (host === null || (!isLoopbackHost(host) && !extra.has(host.toLowerCase()))) {
      return res.status(421).json({ error: 'bad_host', message: 'this server answers loopback Host headers (and LAB_ALLOWED_HOSTS) only' });
    }
    return next();
  };
}

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export function sameOriginWrites(req, res, next) {
  if (!WRITE.has(req.method)) return next();
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return res.status(403).json({ error: 'cross_origin', message: 'writes must be same-origin' });
  const origin = req.headers.origin;
  if (origin) {
    let ok = false;
    // Behind the shared lab-proxy the browser origin is https://local.ping-devops.com:8443 while this app serves plain http on loopback:
    // the proxy sets X-Forwarded-Host and X-Forwarded-Proto, so compare against that pair when present, else against Host with http.
    const fwdHost = String(req.headers['x-forwarded-host'] || '').toLowerCase();
    const fwdProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
    try {
      const u = new URL(origin);
      if (fwdHost) ok = u.host.toLowerCase() === fwdHost && u.protocol === (fwdProto ? `${fwdProto}:` : 'https:');
      else ok = u.protocol === 'http:' && u.host.toLowerCase() === String(req.headers.host || '').toLowerCase();
    } catch { /* malformed origin */ }
    if (!ok) return res.status(403).json({ error: 'cross_origin', message: 'writes must be same-origin' });
  }
  return next();
}

export function jsonWritesOnly(req, res, next) {
  if (!WRITE.has(req.method)) return next();
  const len = Number(req.headers['content-length'] || 0);
  const hasBody = len > 0 || req.headers['transfer-encoding'];
  if (hasBody && !/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) {
    return res.status(415).json({ error: 'unsupported_media_type', message: 'send application/json' });
  }
  return next();
}
