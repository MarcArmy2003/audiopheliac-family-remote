/* Audiopheliac house host - GDMARCHE only. Zero deps. */
"use strict";
const http = require("http");
const https = require("https");
const { spawn, execSync } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");

const PORT = 8099;
const KIT = __dirname;
const STATE = path.join(KIT, "state.json");
let child = null;
let lastTalk = 0;

function say(msg) {
  console.log("  [" + new Date().toLocaleTimeString() + "] " + msg);
}

function lanUrls() {
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      if (!n || n.internal) continue;
      if ((n.family === "IPv4" || n.family === 4) && String(n.address).startsWith("192.168.")) {
        urls.push("http://" + n.address + ":" + PORT);
      }
    }
  }
  urls.sort(function (a, b) { return a.indexOf("192.168.1.119") >= 0 ? -1 : 1; });
  return urls;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return {}; }
}
function saveState(s) {
  try { fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); } catch (e) { say("Could not save settings: " + e.message); }
}

function req(url, opts) {
  opts = opts || {};
  const method = opts.method || "GET";
  const timeout = opts.timeout || 4000;
  return new Promise(function (resolve) {
    let u;
    try { u = new URL(url); } catch { return resolve({ ok: false, error: "bad url" }); }
    const mod = u.protocol === "https:" ? https : http;
    const r = mod.request({
      method: method,
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      timeout: timeout,
      headers: { "content-type": "application/json" },
      rejectUnauthorized: false
    }, function (res) {
      const c = [];
      res.on("data", function (d) { c.push(d); });
      res.on("end", function () {
        const text = Buffer.concat(c).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch (e) {}
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: text, json: json });
      });
    });
    r.on("error", function (e) { resolve({ ok: false, error: e.message }); });
    r.on("timeout", function () { try { r.destroy(); } catch (e) {} resolve({ ok: false, error: "timeout" }); });
    if (opts.body) r.write(typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body));
    r.end();
  });
}

function freePort() {
  try {
    const out = execSync("netstat -ano", { encoding: "utf8" });
    const pids = {};
    out.split(/\r?\n/).forEach(function (line) {
      if (line.indexOf(":" + PORT) < 0 || line.indexOf("LISTENING") < 0) return;
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[parts.length - 1]);
      if (pid && pid !== process.pid) pids[pid] = true;
    });
    Object.keys(pids).forEach(function (pid) {
      try { execSync("taskkill /PID " + pid + " /F", { stdio: "ignore" }); say("Stopped an old remote process."); } catch (e) {}
    });
  } catch (e) {}
}

function startRelay() {
  if (child && !child.killed) {
    try { child.kill(); } catch (e) {}
  }
  freePort();
  child = spawn(process.execPath, ["relay.js"], { cwd: KIT, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  child.stderr.on("data", function (d) {
    if (String(d).toLowerCase().indexOf("eaddrinuse") >= 0) say("Port 8099 was busy. Retrying.");
  });
  child.on("exit", function (code) {
    child = null;
    if (code) say("The remote engine stopped. I will start it again.");
  });
}

function health() {
  return req("http://127.0.0.1:" + PORT + "/api/health", { timeout: 2500 }).then(function (r) {
    return !!(r.ok && r.json && r.json.ok);
  });
}

function findTv() {
  return req("http://127.0.0.1:" + PORT + "/api/samsung/find", { timeout: 25000 }).then(function (r) {
    if (r.json && r.json.ok && r.json.ip) {
      const st = loadState();
      st.tv = r.json.ip;
      if (r.json.mac) st.tvmac = String(r.json.mac).toUpperCase();
      saveState(st);
      say("Found the family room TV at " + r.json.ip + ".");
      return r.json;
    }
    return null;
  });
}

function checkHouse() {
  const st = loadState();
  const notes = [];
  return req("http://" + (st.yamaha || "192.168.1.191") + "/YamahaExtendedControl/v1/system/getDeviceInfo", { timeout: 2500 }).then(function (y) {
    notes.push(y.ok ? "Yamaha: ok" : "Yamaha: not answering. Power the receiver on.");
    const tvIp = st.tv || "192.168.1.19";
    return req("http://" + tvIp + ":8001/api/v2/", { timeout: 2500 }).then(function (tv) {
      notes.push(tv.ok ? "Family room TV: on at " + tvIp : "Family room TV: off or not on Wi-Fi. Turn it on with the clicker, press Home.");
      return req("http://" + (st.hue || "192.168.1.165") + "/api/config", { timeout: 2500 }).then(function (hue) {
        notes.push(hue.ok ? "Hue: ok" : "Hue: bridge not answering.");
        if (!st.bose) return notes;
        return req("http://" + st.bose + ":8090/info", { timeout: 2500 }).then(function (b) {
          notes.push(b.ok ? "Bose: ok" : "Bose: console not answering. Wake the Lifestyle.");
          return notes;
        });
      });
    });
  });
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function ensure() {
  return health().then(function (up) {
    if (up) return true;
    say("Starting the house remote on this PC...");
    startRelay();
    let i = 0;
    function wait() {
      return sleep(500).then(health).then(function (ok) {
        i += 1;
        if (ok || i >= 12) return ok;
        return wait();
      });
    }
    return wait().then(function (ok) {
      if (ok) return true;
      say("Still not up. Trying one more clean start.");
      startRelay();
      return sleep(1500).then(health);
    });
  });
}

function banner(ok) {
  const urls = lanUrls();
  console.log("");
  console.log("  ==============================================");
  console.log("   THE AUDIOPHELIAC  -  GDMARCHE");
  console.log("  ==============================================");
  if (ok) {
    console.log("   Status: LIVE");
    console.log("   On a tablet or phone, same Wi-Fi, open:");
    urls.forEach(function (u) { console.log("      " + u); });
    console.log("   Use: http://192.168.1.119:8099");
    console.log("   Leave this window open. I restart it if it dies.");
  } else {
    console.log("   Status: NOT RUNNING");
    console.log("   I could not start the remote. Node.js may be missing.");
  }
  console.log("  ==============================================");
  console.log("");
}

(function main() {
  process.title = "Audiopheliac GO - GDMARCHE";
  const st = loadState();
  st.host = "GDMARCHE";
  if (!st.tv || st.tv === "192.168.1.145" || st.tv === "192.168.1.239") st.tv = "192.168.1.19";
  if (!st.tvmac || st.tvmac === "38:8C:EF:10:D9:BF") st.tvmac = "70:2A:D5:01:36:F0";
  saveState(st);

  ensure().then(function (ok) {
    banner(ok);
    if (!ok) return;
    return checkHouse().then(function (notes) {
      notes.forEach(function (n) { say(n); });
      const tvOff = notes.some(function (n) { return n.indexOf("Family room TV: off") === 0; });
      if (tvOff) {
        say("Looking for the family room TV...");
        return findTv();
      }
    });
  });

  setInterval(function () {
    health().then(function (up) {
      if (!up) {
        say("The remote went down. Healing...");
        return ensure().then(function (ok) {
          say(ok ? "Back. Tablets can refresh." : "Still down. Close this window and double-click GO on the desktop.");
        });
      }
      if (Date.now() - lastTalk < 5 * 60 * 1000) return;
      lastTalk = Date.now();
      return checkHouse().then(function (notes) {
        const bad = notes.filter(function (n) { return n.indexOf(": ok") < 0 && n.indexOf(": on ") < 0; });
        if (bad.length) {
          say("Check:");
          bad.forEach(function (b) { say("  " + b); });
        } else {
          say("Still live. House devices answering.");
        }
      });
    });
  }, 8000);
})();