/* Audiopheliac Family Remote - Local Relay
   Zero dependencies. Node 18+.
   Serves the PWA and proxies all device traffic server-side so the browser
   never hits CORS, self-signed TLS, or the no-UDP wall.
*/
'use strict';
const http = require('http');
const https = require('https');
const dgram = require('dgram');
const crypto = require('crypto');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT || 8099);
const PUBLIC = path.join(__dirname, 'public');
const STATE = path.join(__dirname, 'state.json');

/* ---------------- helpers ---------------- */

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; }
}
function saveState(s) {
  try { fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); } catch (e) { console.error('state save failed', e.message); }
}

function isV4(ni) {
  return ni && !ni.internal && (ni.family === 'IPv4' || ni.family === 4);
}

function lanBase() {
  const addrs = Object.values(os.networkInterfaces()).flat().filter(isV4);
  const pick = addrs.find((n) => n.address.startsWith('192.168.'));
  return pick ? pick.address.split('.').slice(0, 3).join('.') : '192.168.1';
}

function lanAddrs() {
  return Object.values(os.networkInterfaces()).flat().filter(isV4).map((n) => n.address);
}

/* Generic HTTP(S) request that ignores bad certs and never throws. */
function req(url, { method = 'GET', body = null, headers = {}, timeout = 4000 } = {}) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch { return resolve({ ok: false, error: 'bad url' }); }
    const mod = u.protocol === 'https:' ? https : http;
    const opts = {
      method, headers,
      rejectUnauthorized: false,
      servername: undefined,
    };
    const r = mod.request(u, opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        ok: res.statusCode >= 200 && res.statusCode < 400,
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    r.setTimeout(timeout, () => { r.destroy(); resolve({ ok: false, error: 'timeout' }); });
    r.on('error', (e) => resolve({ ok: false, error: e.message }));
    if (body) r.write(body);
    r.end();
  });
}

/* Fast TCP port check used to shortlist hosts before probing. */
function portOpen(ip, port, timeout = 500) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    const fin = (v) => { if (!done) { done = true; s.destroy(); resolve(v); } };
    s.setTimeout(timeout);
    s.once('connect', () => fin(true));
    s.once('timeout', () => fin(false));
    s.once('error', () => fin(false));
    s.connect(port, ip);
  });
}

/* ---------------- device probes ---------------- */

async function probeYamaha(ip) {
  const r = await req(`http://${ip}/YamahaExtendedControl/v1/system/getDeviceInfo`, { timeout: 2500 });
  if (!r.ok) return null;
  try {
    const j = JSON.parse(r.body);
    if (j.model_name) return { type: 'yamaha', ip, name: j.model_name, detail: `v${j.system_version || '?'}` };
  } catch {}
  return null;
}

async function probeHue(ip) {
  let r = await req(`https://${ip}/api/config`, { timeout: 2500 });
  if (!r.ok) r = await req(`http://${ip}/api/config`, { timeout: 2000 });
  if (!r.ok) return null;
  try {
    const j = JSON.parse(r.body);
    if (j.bridgeid || j.modelid) {
      return {
        type: 'hue', ip,
        name: j.name || 'Hue Bridge',
        detail: `${j.modelid || ''} sw${j.swversion || ''}`,
        apiv2: String(j.apiversion || '').split('.')[0] >= 1 && (j.modelid !== 'BSB001'),
      };
    }
  } catch {}
  return null;
}

async function probeBose(ip) {
  const r = await req(`http://${ip}:8090/info`, { timeout: 2500 });
  if (!r.ok || !/<info/i.test(r.body)) return null;
  const name = (r.body.match(/<name>([^<]*)<\/name>/i) || [])[1] || 'Bose';
  const id = (r.body.match(/deviceID="([^"]+)"/i) || [])[1] || '';
  const type = (r.body.match(/<type>([^<]*)<\/type>/i) || [])[1] || '';
  return { type: 'bose', ip, name, detail: `${type} ${id}`.trim(), deviceID: id };
}

async function probeSamsung(ip) {
  let r = await req(`http://${ip}:8001/api/v2/`, { timeout: 2500 });
  if (!r.ok) {
    r = await req(`https://${ip}:8002/api/v2/`, { timeout: 2500 });
  }
  if (!r.ok) return null;
  try {
    const j = JSON.parse(r.body);
    const d = j.device || {};
    return {
      type: 'samsung', ip,
      name: d.name || j.name || 'Samsung TV',
      detail: `${d.modelName || ''} ${d.model || ''}`.trim(),
      mac: (d.wifiMac || '').toUpperCase(),
      secure: !!d.TokenAuthSupport,
    };
  } catch {}
  return null;
}

const PROBES = [
  { port: 80,   fn: probeYamaha },
  { port: 443,  fn: probeHue },
  { port: 80,   fn: probeHue },
  { port: 8090, fn: probeBose },
  { port: 8001, fn: probeSamsung },
  { port: 8002, fn: probeSamsung },
];

async function scanNetwork(base) {
  base = base || lanBase();
  const ips = [];
  for (let i = 1; i <= 254; i++) ips.push(`${base}.${i}`);

  const found = [];
  const seen = new Set();
  const CONC = 32;
  let idx = 0;

  async function worker() {
    while (idx < ips.length) {
      const ip = ips[idx++];
      for (const p of PROBES) {
        if (seen.has(ip)) break;
        const open = await portOpen(ip, p.port, 400);
        if (!open) continue;
        const d = await p.fn(ip);
        if (d) { seen.add(ip); found.push(d); break; }
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  found.sort((a, b) => Number(a.ip.split('.')[3]) - Number(b.ip.split('.')[3]));
  return found;
}

/* ---------------- wake on lan ---------------- */

function wol(mac, broadcast, alsoIp) {
  return new Promise((resolve) => {
    const clean = String(mac).replace(/[^0-9a-fA-F]/g, '');
    if (clean.length !== 12) return resolve({ ok: false, error: 'bad mac' });
    const m = Buffer.from(clean, 'hex');
    const pkt = Buffer.concat([Buffer.alloc(6, 0xff), Buffer.concat(Array(16).fill(m))]);
    const s = dgram.createSocket('udp4');
    const targets = [broadcast || `${lanBase()}.255`, '255.255.255.255'];
    if (alsoIp) targets.push(alsoIp);
    s.bind(() => {
      s.setBroadcast(true);
      let left = targets.length * 2;
      const done = () => { if (--left <= 0) { try { s.close(); } catch {} resolve({ ok: true }); } };
      for (const t of targets) {
        try { s.send(pkt, 9, t, done); } catch { done(); }
        try { s.send(pkt, 7, t, done); } catch { done(); }
      }
    });
    s.on('error', (e) => { try { s.close(); } catch {} resolve({ ok: false, error: e.message }); });
  });
}

/* ---------------- minimal websocket client (Samsung remote) ---------------- */

function encodeFrame(payload) {
  const data = Buffer.from(payload, 'utf8');
  const len = data.length;
  const mask = crypto.randomBytes(4);
  let header;
  if (len < 126) { header = Buffer.alloc(2); header[1] = 0x80 | len; }
  else if (len < 65536) { header = Buffer.alloc(4); header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[1] = 0x80 | 127; header.writeUInt32BE(0, 2); header.writeUInt32BE(len, 6); }
  header[0] = 0x81;
  const out = Buffer.alloc(len);
  for (let i = 0; i < len; i++) out[i] = data[i] ^ mask[i % 4];
  return Buffer.concat([header, mask, out]);
}

function decodeFrames(buf) {
  const msgs = [];
  let off = 0;
  while (off + 2 <= buf.length) {
    const b1 = buf[off], b2 = buf[off + 1];
    const opcode = b1 & 0x0f;
    let len = b2 & 0x7f;
    let p = off + 2;
    if (len === 126) { if (p + 2 > buf.length) break; len = buf.readUInt16BE(p); p += 2; }
    else if (len === 127) { if (p + 8 > buf.length) break; len = Number(buf.readBigUInt64BE(p)); p += 8; }
    if (p + len > buf.length) break;
    if (opcode === 1) msgs.push(buf.slice(p, p + len).toString('utf8'));
    off = p + len;
  }
  return { msgs, rest: buf.slice(off) };
}

function samsungKey(ip, key, token, secure = true, waitMs) {
  return new Promise((resolve) => {
    const name = encodeURIComponent(Buffer.from('Audiopheliac').toString('base64'));
    const port = secure ? 8002 : 8001;
    const p = `/api/v2/channels/samsung.remote.control?name=${name}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    const wsKey = crypto.randomBytes(16).toString('base64');
    const mod = secure ? https : http;
    const limit = waitMs || (secure ? 3500 : 8000);
    const r = mod.request({
      host: ip, port, path: p, method: 'GET', rejectUnauthorized: false,
      timeout: limit,
      headers: {
        Connection: 'Upgrade', Upgrade: 'websocket',
        'Sec-WebSocket-Key': wsKey, 'Sec-WebSocket-Version': '13',
        Origin: 'http://' + ip + ':' + port,
      },
    });
    let settled = false;
    const fin = (v) => { if (!settled) { settled = true; resolve(v); } };
    const timer = setTimeout(() => {
      try { r.destroy(); } catch {}
      fin({ ok: false, error: secure ? 'secure port timed out' : 'TV did not pair. Press Home on the Samsung, then tap Pair TV.' });
    }, limit);

    r.on('upgrade', (res, socket) => {
      let buf = Buffer.alloc(0);
      let newToken = null;
      const done = (v) => { clearTimeout(timer); try { socket.destroy(); } catch {} fin(v); };
      socket.on('data', (c) => {
        buf = Buffer.concat([buf, c]);
        const { msgs, rest } = decodeFrames(buf);
        buf = rest;
        for (const m of msgs) {
          let j; try { j = JSON.parse(m); } catch { continue; }
          if (j.event === 'ms.channel.connect') {
            if (j.data && j.data.token) newToken = j.data.token;
            if (key) {
              socket.write(encodeFrame(JSON.stringify({
                method: 'ms.remote.control',
                params: { Cmd: 'Click', DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey' },
              })));
              setTimeout(() => done({ ok: true, token: newToken, port }), 500);
            } else done({ ok: true, paired: true, token: newToken, port });
          }
          if (j.event === 'ms.channel.unauthorized') {
            done({ ok: false, error: 'TV denied Audiopheliac. Delete it in Device connection manager, then Pair TV again.' });
          }
        }
      });
      socket.on('error', (e) => { clearTimeout(timer); fin({ ok: false, error: e.message }); });
    });
    r.on('response', (res) => {
      const code = res.statusCode;
      res.resume();
      clearTimeout(timer);
      fin({ ok: false, error: 'TV answered on port ' + port + ' but refused the remote (' + code + '). Turn on Device connection manager.' });
    });
    r.on('timeout', () => { try { r.destroy(); } catch {} });
    r.on('error', (e) => { clearTimeout(timer); fin({ ok: false, error: e.message }); });
    r.end();
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function samsungIsOn(ip) {
  const a = await req(`http://${ip}:8001/api/v2/`, { timeout: 2000 });
  if (a.ok) return { on: true, port: 8001, body: a.body };
  const b = await req(`https://${ip}:8002/api/v2/`, { timeout: 2000 });
  if (b.ok) return { on: true, port: 8002, body: b.body };
  return { on: false };
}

/* ---------------- Bose Lifestyle 650 / SoundTouch ---------------- */

function boseXml(ip, path, xml) {
  return req(`http://${ip}:8090${path}`, {
    method: xml ? 'POST' : 'GET',
    body: xml || null,
    headers: xml ? { 'Content-Type': 'text/xml' } : {},
    timeout: 6000,
  });
}

function parseBoseNow(xml) {
  const src = ((xml || '').match(/\bsource="([^"]+)"/) || (xml || '').match(/<source>([^<]+)<\/source>/) || [])[1] || '';
  const account = ((xml || '').match(/\bsourceAccount="([^"]*)"/) || [])[1] || '';
  const standby = !src || /^STANDBY$/i.test(src);
  return { source: src, account, standby, on: !standby };
}

async function boseKeyRaw(ip, key) {
  const press = `<key state="press" sender="Gabbo">${key}</key>`;
  const release = `<key state="release" sender="Gabbo">${key}</key>`;
  const a = await boseXml(ip, '/key', press);
  await sleep(400);
  const b = await boseXml(ip, '/key', release);
  return { ok: !!(a.ok || b.ok) };
}

async function boseStatus(ip) {
  const r = await boseXml(ip, '/now_playing');
  if (!r.ok) return { ok: false, error: 'Lifestyle did not answer on ' + ip };
  return { ok: true, ...parseBoseNow(r.body) };
}

async function bosePower({ ip, on } = {}) {
  const st = loadState();
  ip = ip || st.bose;
  if (!ip) return { ok: false, error: 'Bose IP missing. Scan with the Lifestyle on.' };
  const before = await boseStatus(ip);
  if (!before.ok) return before;
  const wantOn = on == null ? !before.on : !!on;
  if (wantOn === before.on) return { ok: true, already: true, on: before.on, source: before.source };

  await boseKeyRaw(ip, 'POWER');
  await sleep(1600);
  let after = await boseStatus(ip);
  if (after.ok && after.on === wantOn) return { ok: true, on: after.on, source: after.source, via: 'POWER' };

  if (!wantOn) {
    await boseXml(ip, '/select', '<ContentItem source="STANDBY"></ContentItem>');
    await sleep(1400);
    after = await boseStatus(ip);
    if (after.ok && !after.on) return { ok: true, on: false, via: 'select-STANDBY' };
    await boseKeyRaw(ip, 'POWER');
    await sleep(1400);
    after = await boseStatus(ip);
  } else {
    await boseXml(ip, '/select', '<ContentItem source="PRODUCT" sourceAccount="TV"></ContentItem>');
    await sleep(1600);
    after = await boseStatus(ip);
    if (after.ok && after.on) return { ok: true, on: true, source: after.source, via: 'PRODUCT-TV' };
    await boseXml(ip, '/select', '<ContentItem source="PRODUCT"></ContentItem>');
    await sleep(1400);
    after = await boseStatus(ip);
    if (after.ok && after.on) return { ok: true, on: true, source: after.source, via: 'PRODUCT' };
    await boseKeyRaw(ip, 'POWER');
    await sleep(1400);
    after = await boseStatus(ip);
  }

  const good = after.ok && after.on === wantOn;
  return {
    ok: good,
    on: after.on,
    source: after.source,
    error: good ? undefined : ('Lifestyle stayed ' + (after.on ? 'on' : 'off') + (after.source ? (' (' + after.source + ')') : '') + '.'),
  };
}

function persistSamsung(info) {
  const st = loadState();
  if (info.ip) st.tv = info.ip;
  if (info.mac) st.tvmac = String(info.mac).toUpperCase();
  if (info.token) st.tvtoken = info.token;
  saveState(st);
  return st;
}

function parseSamsungBody(body, ip) {
  try {
    const j = JSON.parse(body || '{}');
    const d = j.device || {};
    return {
      ok: true,
      on: true,
      ip,
      model: d.modelName || d.name || j.name || 'Samsung',
      mac: String(d.wifiMac || d.wifiMacAddress || d.mac || '').toUpperCase(),
      tokenAuth: String(d.TokenAuthSupport || '') === 'true',
      name: d.name || j.name || 'Samsung TV',
    };
  } catch {
    return { ok: true, on: true, ip, model: 'Samsung' };
  }
}

function tvEncode(str) {
  const encoded = Buffer.from(String(str)).toString('base64');
  const buf = Buffer.from(encoded);
  const len = Buffer.alloc(2);
  len.writeUInt16LE(buf.length, 0);
  return Buffer.concat([len, buf]);
}

function samsungLegacy(ip, key) {
  return new Promise((resolve) => {
    const s = net.connect({ host: ip, port: 55000 });
    let settled = false;
    const fin = (v) => { if (!settled) { settled = true; try { s.destroy(); } catch {} resolve(v); } };
    const t = setTimeout(() => fin({ ok: false, error: 'legacy port 55000 timed out' }), 4000);
    s.on('connect', () => {
      const payload = Buffer.concat([
        Buffer.from([0x64, 0x00]),
        tvEncode('10.0.0.2'),
        tvEncode('00:00:00:00:00:00'),
        tvEncode('Audiopheliac'),
      ]);
      const auth = Buffer.concat([Buffer.from([0x00]), tvEncode('iphone.iapp.samsung'), payload]);
      s.write(auth);
      if (key) {
        const kpay = Buffer.concat([Buffer.from([0x00, 0x00, 0x00]), tvEncode(key)]);
        const kp = Buffer.concat([Buffer.from([0x00, 0x00, 0x00]), Buffer.from([kpay.length & 0xff, (kpay.length >> 8) & 0xff]), kpay]);
        setTimeout(() => s.write(kp), 200);
      }
      setTimeout(() => { clearTimeout(t); fin({ ok: true, via: 'legacy-55000' }); }, 700);
    });
    s.on('error', (e) => { clearTimeout(t); fin({ ok: false, error: e.message }); });
  });
}

async function samsungInfo(ip) {
  const st = await samsungIsOn(ip);
  if (!st.on) return { ok: false, on: false, error: 'TV is not answering at ' + ip + '. It may be off or the IP moved. Tap Find TV.' };
  const info = parseSamsungBody(st.body, ip);
  info.port = st.port;
  persistSamsung(info);
  return info;
}

async function samsungFind() {
  const st = loadState();
  const guesses = [];
  if (st.tv) guesses.push(st.tv);
  guesses.push('192.168.1.145');
  const seen = new Set();
  for (const ip of guesses) {
    if (!ip || seen.has(ip)) continue;
    seen.add(ip);
    const hit = await probeSamsung(ip);
    if (hit) {
      persistSamsung(hit);
      return { ok: true, found: true, ...hit };
    }
  }
  const base = lanBase();
  const ips = [];
  for (let i = 2; i <= 254; i++) ips.push(`${base}.${i}`);
  let idx = 0;
  let found = null;
  async function worker() {
    while (idx < ips.length && !found) {
      const ip = ips[idx++];
      if (seen.has(ip)) continue;
      const open = await portOpen(ip, 8001, 250);
      if (!open) continue;
      const hit = await probeSamsung(ip);
      if (hit) found = hit;
    }
  }
  await Promise.all(Array.from({ length: 40 }, worker));
  if (!found) return { ok: false, error: 'No Samsung answered on the LAN. Turn the TV on with the physical remote, press Home, then Find TV again.' };
  persistSamsung(found);
  return { ok: true, found: true, ...found };
}

async function samsungSendKey(ip, key, token) {
  let out = await samsungKey(ip, key, token, false);
  if (!out.ok) out = await samsungKey(ip, key, token, true);
  if (!out.ok) out = await samsungLegacy(ip, key);
  return out;
}

async function samsungPair(ip, token) {
  let out = await samsungKey(ip, '', token, false, 25000);
  if (!out.ok) out = await samsungKey(ip, '', token, true, 12000);
  if (!out.ok) out = await samsungLegacy(ip, '');
  if (out.ok) persistSamsung({ ip, token: out.token });
  return out;
}

async function samsungPower({ ip, on, token, mac }) {
  const st = loadState();
  ip = ip || st.tv;
  mac = mac || st.tvmac;
  token = token || st.tvtoken;
  if (!ip) {
    const found = await samsungFind();
    if (!found.ok) return found;
    ip = found.ip;
    mac = found.mac || mac;
  }
  const alive = await samsungIsOn(ip);
  if (on && alive.on) return { ok: true, already: true, on: true, ip, token };
  if (!on && !alive.on) return { ok: true, already: true, on: false, ip, token };
  if (on && !alive.on && mac) {
    await wol(mac, `${lanBase()}.255`, ip);
    await sleep(3500);
    const again = await samsungIsOn(ip);
    if (again.on) return { ok: true, via: 'wol', on: true, ip, token };
  }
  const out = await samsungSendKey(ip, 'KEY_POWER', token);
  await sleep(1600);
  const now = await samsungIsOn(ip);
  const good = on ? now.on : !now.on;
  if (out.token) persistSamsung({ ip, token: out.token, mac });
  return {
    ok: good,
    on: now.on,
    ip,
    token: out.token || token,
    via: out.via,
    error: good ? undefined : (out.error || 'TV ignored power. Press Home on the set, then Pair TV.'),
  };
}

/* ---------------- static file serving ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function serveStatic(req_, res) {
  let p = decodeURIComponent(req_.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

function json(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
  res.end(b);
}

function readBody(r) {
  return new Promise((resolve) => {
    const c = []; r.on('data', (d) => c.push(d));
    r.on('end', () => { try { resolve(JSON.parse(Buffer.concat(c).toString() || '{}')); } catch { resolve({}); } });
  });
}

/* ---------------- Honeywell RTH9585WF / Total Connect Comfort ---------------- */

const TCC_HOST = 'mytotalconnectcomfort.com';
const TCC_BASE = '/portal';
const tccJar = {};
const TCC_COOKIE_FILE = path.join(__dirname, 'tcc-cookies.json');

function tccLoadCookies() {
  try { Object.assign(tccJar, JSON.parse(fs.readFileSync(TCC_COOKIE_FILE, 'utf8'))); } catch {}
}
function tccSaveCookies() {
  try { fs.writeFileSync(TCC_COOKIE_FILE, JSON.stringify(tccJar)); } catch {}
}
function tccEat(headers) {
  const raw = headers['set-cookie'];
  if (!raw) return;
  (Array.isArray(raw) ? raw : [raw]).forEach((c) => {
    const nv = String(c).split(';')[0];
    const i = nv.indexOf('=');
    if (i > 0) tccJar[nv.slice(0, i).trim()] = nv.slice(i + 1);
  });
  tccSaveCookies();
}
function tccCookieHeader() {
  return Object.keys(tccJar).map((k) => k + '=' + tccJar[k]).join('; ');
}

function tccReq(pathname, { method = 'GET', form = null } = {}) {
  return new Promise((resolve) => {
    const body = form ? new URLSearchParams(form).toString() : null;
    const headers = {
      Host: TCC_HOST,
      'User-Agent': 'Mozilla/5.0 (compatible; AudiopheliacRemote/1.0)',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://' + TCC_HOST + TCC_BASE + '/',
      Cookie: tccCookieHeader(),
    };
    if (body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const r = https.request({
      hostname: TCC_HOST,
      path: pathname.startsWith('/') ? pathname : (TCC_BASE + '/' + pathname),
      method,
      headers,
    }, (res) => {
      tccEat(res.headers);
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode,
          body: text,
          json: parsed,
          location: res.headers.location || '',
        });
      });
    });
    r.setTimeout(18000, () => { r.destroy(); resolve({ ok: false, error: 'timeout' }); });
    r.on('error', (e) => resolve({ ok: false, error: e.message }));
    if (body) r.write(body);
    r.end();
  });
}

function tccLooksLoggedIn(html) {
  if (!html) return false;
  if (/name="Password"/i.test(html) && /UserName/i.test(html)) return false;
  if (/incorrect email or password/i.test(html)) return false;
  return /CheckDataSession|LocationID|thermostat|logout/i.test(html);
}

function tccParseIds(html) {
  const loc = (html.match(/locationId=(\d+)/i) || html.match(/"LocationID"\s*:\s*(\d+)/i) || [])[1];
  const dev = (html.match(/data-id="(\d+)"/) || html.match(/deviceId=(\d+)/i) || html.match(/"DeviceID"\s*:\s*(\d+)/i) || [])[1];
  return { locationId: loc || '', deviceId: dev || '' };
}

function tccNormalize(j, deviceId) {
  if (!j || typeof j !== 'object') return null;
  const latest = j.latestData && j.latestData.uiData ? j.latestData.uiData : j;
  const fan = j.latestData && j.latestData.fanData ? j.latestData.fanData : {};
  const sw = Number(latest.SystemSwitchPosition);
  const modes = { 0: 'emergency', 1: 'heat', 2: 'off', 3: 'cool', 4: 'auto', 5: 'emergency' };
  const fans = { 0: 'auto', 1: 'on', 2: 'circulate' };
  return {
    ok: true,
    brand: 'Honeywell RTH9585WF',
    deviceId: String(deviceId || latest.DeviceID || ''),
    indoor: latest.DispTemperature ?? latest.indoorTemp ?? null,
    outdoor: latest.OutdoorTemp ?? latest.outdoorTemp ?? null,
    cool: latest.CoolSetpoint ?? latest.coolSetpoint ?? null,
    heat: latest.HeatSetpoint ?? latest.heatSetpoint ?? null,
    mode: modes[sw] || 'unknown',
    modeCode: sw,
    fan: fans[Number(fan.fanMode ?? latest.FanMode)] || 'auto',
    fanCode: Number(fan.fanMode ?? latest.FanMode ?? 0),
    humidity: latest.IndoorHumidity ?? null,
    hold: Number(latest.StatusCool) > 0 || Number(latest.StatusHeat) > 0,
    rawSwitch: sw,
  };
}

async function tccLogin(user, pass) {
  tccLoadCookies();
  await tccReq(TCC_BASE + '/', { method: 'GET' });
  const login = await tccReq(TCC_BASE + '/', {
    method: 'POST',
    form: { UserName: user, Password: pass, RememberMe: 'false', timeOffset: '240' },
  });
  const home = await tccReq(TCC_BASE + '/', { method: 'GET' });
  if (!tccLooksLoggedIn(home.body || login.body || '')) {
    return { ok: false, error: 'Honeywell sign-in failed. Check the Total Connect Comfort email and password.' };
  }
  const ids = tccParseIds(home.body || '');
  const st = loadState();
  if (ids.locationId) st.tccLocation = ids.locationId;
  if (ids.deviceId) st.tccDevice = ids.deviceId;
  st.honeywellUser = user;
  st.honeywellPass = pass;
  saveState(st);
  if (!st.tccDevice) {
    const locPage = await tccReq(TCC_BASE + '/locations', { method: 'GET' });
    const more = tccParseIds(locPage.body || '');
    if (more.deviceId) { st.tccDevice = more.deviceId; saveState(st); }
    if (more.locationId) { st.tccLocation = more.locationId; saveState(st); }
  }
  return { ok: true, deviceId: loadState().tccDevice || '' };
}

async function tccEnsureSession() {
  tccLoadCookies();
  const st = loadState();
  const probe = await tccReq(TCC_BASE + '/', { method: 'GET' });
  if (tccLooksLoggedIn(probe.body || '')) return { ok: true };
  if (st.honeywellUser && st.honeywellPass) return tccLogin(st.honeywellUser, st.honeywellPass);
  return { ok: false, error: 'Sign in to Honeywell in Setup.' };
}

async function tccStatus() {
  const sess = await tccEnsureSession();
  if (!sess.ok) return sess;
  const st = loadState();
  let id = st.tccDevice;
  if (!id) {
    const home = await tccReq(TCC_BASE + '/', { method: 'GET' });
    id = tccParseIds(home.body || '').deviceId;
    if (id) { st.tccDevice = id; saveState(st); }
  }
  if (!id) return { ok: false, error: 'Signed in, but no thermostat id yet. Open Total Connect Comfort once on the PC.' };
  const r = await tccReq(TCC_BASE + '/Device/CheckDataSession/' + id, { method: 'GET' });
  const norm = tccNormalize(r.json, id);
  if (!norm) return { ok: false, error: 'Thermostat did not return status.' };
  return norm;
}

async function tccSet({ cool, heat, mode, fan, delta } = {}) {
  const cur = await tccStatus();
  if (!cur.ok) return cur;
  const st = loadState();
  const id = st.tccDevice || cur.deviceId;
  const modeMap = { heat: 1, off: 2, cool: 3, auto: 4, emergency: 5 };
  let coolSp = cur.cool;
  let heatSp = cur.heat;
  if (delta) {
    const n = Number(delta);
    if (cur.mode === 'heat') heatSp = Number(heatSp) + n;
    else coolSp = Number(coolSp) + n;
  }
  if (cool != null) coolSp = Number(cool);
  if (heat != null) heatSp = Number(heat);
  const sw = mode != null ? (modeMap[String(mode)] ?? cur.modeCode) : cur.modeCode;
  const fanMap = { auto: 0, on: 1, circulate: 2 };
  const fanCode = fan != null ? (fanMap[String(fan)] ?? cur.fanCode) : cur.fanCode;
  const form = {
    DeviceID: String(id),
    SystemSwitch: String(sw),
    HeatSetpoint: String(heatSp ?? 68),
    CoolSetpoint: String(coolSp ?? 74),
    HeatNextPeriod: '0',
    CoolNextPeriod: '0',
    StatusHeat: '1',
    StatusCool: '1',
    FanMode: String(fanCode),
  };
  const r = await tccReq(TCC_BASE + '/Device/SubmitControlScreenChanges', { method: 'POST', form });
  if (!r.ok) return { ok: false, error: 'Honeywell rejected the change.' };
  await new Promise((res) => setTimeout(res, 700));
  return tccStatus();
}

tccLoadCookies();

/* ---------------- server ---------------- */

let scanCache = { at: 0, devices: [] };

const server = http.createServer(async (rq, rs) => {
  const url = new URL(rq.url, 'http://x');
  const p = url.pathname;

  if (rq.method === 'OPTIONS') {
    rs.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': '*',
    });
    return rs.end();
  }

  try {
    if (p === '/api/health') {
      return json(rs, 200, { ok: true, lan: lanBase(), addrs: lanAddrs(), uptime: process.uptime() });
    }

    if (p === '/api/thermo/status' && rq.method === 'GET') {
      return json(rs, 200, await tccStatus());
    }
    if (p === '/api/thermo/login' && rq.method === 'POST') {
      const b = await readBody(rq);
      if (!b.user || !b.pass) return json(rs, 400, { ok: false, error: 'email and password required' });
      return json(rs, 200, await tccLogin(b.user, b.pass));
    }
    if (p === '/api/thermo/set' && rq.method === 'POST') {
      return json(rs, 200, await tccSet(await readBody(rq)));
    }

    if (p === '/api/scan') {
      const force = url.searchParams.get('force') === '1';
      if (!force && Date.now() - scanCache.at < 60000 && scanCache.devices.length) {
        return json(rs, 200, { cached: true, devices: scanCache.devices });
      }
      const devices = await scanNetwork(url.searchParams.get('base'));
      scanCache = { at: Date.now(), devices };
      return json(rs, 200, { cached: false, devices });
    }

    if (p === '/api/state' && rq.method === 'GET') return json(rs, 200, loadState());
    if (p === '/api/state' && rq.method === 'POST') {
      const b = await readBody(rq); saveState(b); return json(rs, 200, { ok: true });
    }

    if (p === '/api/proxy') {
      const target = url.searchParams.get('url');
      if (!target) return json(rs, 400, { ok: false, error: 'url required' });
      const body = ['POST', 'PUT'].includes(rq.method) ? await new Promise((r) => {
        const c = []; rq.on('data', (d) => c.push(d)); rq.on('end', () => r(Buffer.concat(c).toString()));
      }) : null;
      const headers = {};
      if (rq.headers['hue-application-key']) headers['hue-application-key'] = rq.headers['hue-application-key'];
      if (body) headers['content-type'] = rq.headers['content-type'] || 'application/json';
      const out = await req(target, { method: rq.method, body, headers, timeout: 8000 });
      return json(rs, out.ok ? 200 : 502, out);
    }

    if (p === '/api/wol' && rq.method === 'POST') {
      const b = await readBody(rq);
      const base = lanBase();
      return json(rs, 200, await wol(b.mac, b.broadcast || `${base}.255`));
    }

    if (p === '/api/samsung/key' && rq.method === 'POST') {
      const b = await readBody(rq);
      if (!b.ip || !b.key) return json(rs, 400, { ok: false, error: 'ip and key required' });
      let out = await samsungKey(b.ip, b.key, b.token, b.secure !== false);
      if (!out.ok && b.secure !== false) out = await samsungKey(b.ip, b.key, b.token, false);
      return json(rs, 200, out);
    }

    if (p === '/api/samsung/power' && rq.method === 'POST') {
      return json(rs, 200, await samsungPower(await readBody(rq)));
    }
    if (p === '/api/samsung/pair' && rq.method === 'POST') {
      const b = await readBody(rq);
      if (!b.ip) return json(rs, 400, { ok: false, error: 'ip required' });
      return json(rs, 200, await samsungPair(b.ip, b.token));
    }
    if (p === '/api/samsung/info') {
      const ip = url.searchParams.get('ip') || loadState().tv;
      if (!ip) return json(rs, 400, { ok: false, error: 'ip required' });
      return json(rs, 200, await samsungInfo(ip));
    }
    if (p === '/api/samsung/find') {
      return json(rs, 200, await samsungFind());
    }
    if (p === '/api/bose/status') {
      const ip = url.searchParams.get('ip') || loadState().bose;
      if (!ip) return json(rs, 400, { ok: false, error: 'bose ip missing' });
      return json(rs, 200, await boseStatus(ip));
    }
    if (p === '/api/bose/power' && rq.method === 'POST') {
      return json(rs, 200, await bosePower(await readBody(rq)));
    }
    if (p === '/api/bose/key' && rq.method === 'POST') {
      const b = await readBody(rq);
      const ip = b.ip || loadState().bose;
      if (!ip || !b.key) return json(rs, 400, { ok: false, error: 'ip and key required' });
      const out = await boseKeyRaw(ip, b.key);
      return json(rs, 200, out);
    }

    return serveStatic(rq, rs);
  } catch (e) {
    return json(rs, 500, { ok: false, error: e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const base = lanBase();
  const me = lanAddrs();
  console.log('');
  console.log('  Audiopheliac Family Remote - relay running');
  console.log('  ------------------------------------------------');
  me.forEach((a) => console.log(`  Open on the tablet:  http://${a}:${PORT}`));
  console.log(`  Scanning subnet:     ${base}.0/24`);
  console.log('  Leave this window open. Ctrl+C to stop.');
  console.log('');
});
