const Core = require('../core/config');
const { getConfig } = require('../models/settings');
// In-memory cache for GET endpoints to respect the 120 req/min limit
const apiCache = new Map();
const pendingReads = new Map();
const CACHE_TTL_MS = {
  '/server': 15000,
  '/players': 10000,
  '/teleport/locations': 60000,
  '/shop/dinos': 60000,
  '/shop/skins': 60000,
  '/diets': 300000,
  '/leaderboard': 60000,
  'default': 5000
};

// Helper: Call live IslePilot API with caching and scope awareness
async function callIslePilot(endpoint, method = 'GET', body = null, bypassCache = false) {
  const cfg = getConfig();
  const token = process.env.ISLEPILOT_API_KEY || process.env.ISLEPILOT_API_TOKEN || cfg.islepilot?.api_token || '';
  if (!token || cfg.islepilot?.enabled === false) return null;
  const base = process.env.ISLEPILOT_BASE_URL || process.env.ISLEPILOT_API_BASE_URL || cfg.islepilot?.api_base_url || Core.upstreamBaseURL;
  const cleanBase = base.replace(/\/$/, '');
  const url = `${cleanBase}${endpoint}`;

  const cleanEpKey = endpoint.split('?')[0];
  const cacheKey = `${method}:${endpoint}`;
  const scope = JSON.stringify([cleanBase, token]);

  if (method === 'GET' && !bypassCache && apiCache.has(cacheKey)) {
    const entry = apiCache.get(cacheKey);
    const ttl = /^\/players\/\d{17}$/.test(cleanEpKey) ? 2000 : (CACHE_TTL_MS[cleanEpKey] || CACHE_TTL_MS['default']);
    if (entry.scope === scope && Date.now() - entry.time < ttl) {
      return entry.data;
    }
  }

  // Fresh reads used around transactions must not join an older cached read.
  const pendingKey = JSON.stringify([url, token]);
  const shared = method === 'GET' && !bypassCache;
  if (shared && pendingReads.has(pendingKey)) return pendingReads.get(pendingKey).promise;
  const entry = { cacheKey, invalidated: false };
  const request = (async () => {
    try {
      const opts = {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Api-Key': token,
          'Content-Type': 'application/json'
        }
      };
      if (body && method !== 'GET') {
        opts.body = JSON.stringify(body);
      }
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(10000) });
      let json = null;
      try {
        json = await res.json();
      } catch (_) { }

      if (res.ok) {
        if (shared && json && !entry.invalidated) {
          apiCache.set(cacheKey, { time: Date.now(), data: json, scope });
        }
        return json;
      } else {
        console.warn(`IslePilot responded ${res.status} for [${method}] ${url}:`, json?.error || json?.message || '');
        return { _status: res.status, error: json?.error || `HTTP ${res.status}`, missingScope: res.status === 403 };
      }
    } catch (err) {
      console.error(`Error calling IslePilot API (${endpoint}): ${err.message}`);
      return null;
    }
  })();
  entry.promise = request;
  if (shared) pendingReads.set(pendingKey, entry);
  try { return await request; }
  finally { if (pendingReads.get(pendingKey) === entry) pendingReads.delete(pendingKey); }
}

// Helper dọn dẹp bộ nhớ đệm của người chơi ngay khi có giao dịch
function clearPlayerCache(steamId) {
  if (!steamId) return;
  const s = String(steamId).trim();
  const matches = key => key === `GET:/players/${s}` || key.startsWith(`GET:/players/${s}/`) || key.startsWith(`GET:/players/${s}?`);
  for (const [key, entry] of pendingReads) {
    if (matches(entry.cacheKey)) {
      entry.invalidated = true;
      pendingReads.delete(key);
    }
  }
  for (const key of apiCache.keys()) if (matches(key)) apiCache.delete(key);
  apiCache.delete(`GET:/players/${s}`);
  apiCache.delete(`GET:/players/${s}/garage`);
  apiCache.delete(`/players/${s}`);
  apiCache.delete(`/players/${s}/garage`);
}


module.exports = { callIslePilot, clearPlayerCache, apiCache };
