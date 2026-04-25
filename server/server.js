import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pLimit from 'p-limit';
import { GoogleGenAI, Type, Modality } from '@google/genai';

// Load .env.local first if present, then fallback to default .env
try {
  dotenv.config({ path: '.env.local' });
} catch (e) {
  // ignore
}
dotenv.config();

// Simple SVG placeholder (base64) used when image generation fails or quota is exhausted
const PLACEHOLDER_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <g fill="#94a3b8">
    <circle cx="400" cy="250" r="120" fill="#ffffff" stroke="#e2e8f0" stroke-width="4"/>
    <text x="50%" y="80%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#94a3b8">Image unavailable</text>
  </g>
</svg>`;
const PLACEHOLDER_BASE64 = Buffer.from(PLACEHOLDER_SVG).toString('base64');
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Serve generated images (PNG) from server/images
try {
  app.use('/images', express.static(path.resolve(process.cwd(), 'server', 'images')));
} catch (e) {
  console.warn('Could not set up static images route:', e?.message || e);
}

let PORT = parseInt(process.env.PORT, 10) || 4000;

// Accept either API_KEY or GEMINI_API_KEY (some users keep different names)
const loadedKey = process.env.API_KEY || process.env.GEMINI_API_KEY || (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
if (!loadedKey) {
  console.warn('Warning: Gemini API key not found in environment. Set API_KEY or GEMINI_API_KEY in .env.local or environment.');
} else {
  console.log('Gemini API key loaded from environment.');
}

const createClient = () => new GoogleGenAI({ apiKey: loadedKey || '' });

const extractTextFromAIResponse = (response) => {
  try {
    if (!response) return '';
    if (typeof response.text === 'string' && response.text.trim()) {
      return response.text.trim();
    }
    if (Array.isArray(response.candidates) && response.candidates.length > 0) {
      const cand = response.candidates[0];
      if (cand) {
        if (Array.isArray(cand.content)) {
          return cand.content.map(p => (p && (p.text || p)).toString()).join('').trim();
        }
        if (cand.content && typeof cand.content === 'string') {
          return cand.content.trim();
        }
      }
    }
    if (Array.isArray(response.output) && response.output.length > 0) {
      return response.output
        .map(item => {
          if (!item) return '';
          if (typeof item === 'string') return item;
          if (Array.isArray(item.content)) {
            return item.content.map(p => (p && (p.text || p)).toString()).join('');
          }
          return (item.content && item.content[0] && item.content[0].text) || item.text || '';
        })
        .join('')
        .trim();
    }
  } catch (e) {
    console.warn('Failed to extract response text from AI response:', e?.message || e);
  }
  return '';
};

// Try to fetch a representative photo from Unsplash Source as a fallback
const fetchRemoteImageAsBase64 = async (keyword) => {
  // Prefer using the Unsplash API if access key is available (more reliable)
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  try {
    if (accessKey) {
      const searchUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keyword)}&per_page=1`;
      const searchResp = await fetch(searchUrl, { headers: { Authorization: `Client-ID ${accessKey}` } });
      if (searchResp.ok) {
        const json = await searchResp.json();
        const results = json.results || [];
        if (results.length > 0) {
          const imgUrl = results[0].urls?.regular || results[0].urls?.small || results[0].urls?.raw;
          if (imgUrl) {
            const imgResp = await fetch(imgUrl);
            if (imgResp.ok) {
              const arr = await imgResp.arrayBuffer();
              return Buffer.from(arr).toString('base64');
            }
          }
        }
      } else {
        console.warn('Unsplash API search returned', searchResp.status);
      }
    }

    // Fallback to source.unsplash (no API key) if API not available or failed
    const query = encodeURIComponent(keyword.replace(/\s+/g, ','));
    const url = `https://source.unsplash.com/800x600/?${query}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Unsplash returned ${resp.status}`);
    const arr = await resp.arrayBuffer();
    return Buffer.from(arr).toString('base64');
  } catch (err) {
    console.warn('Failed to fetch remote Unsplash image:', err?.message || err);
    return null;
  }
};

// Try to fetch an image via Edamam Recipe Search API if credentials are provided
const fetchEdamamImageAsBase64 = async (keyword) => {
  const appId = process.env.EDAMAM_APP_ID || process.env.EDAMAM_APPID || process.env.EDAMAM_ID;
  const appKey = process.env.EDAMAM_APP_KEY || process.env.EDAMAM_KEY || process.env.EDAMAM_APPKEY;
  if (!appId || !appKey) return null;
  try {
    const q = encodeURIComponent(keyword.replace(/\s+/g, ' '));
    const url = `https://api.edamam.com/search?q=${q}&app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}&from=0&to=1`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) {
      console.warn('Edamam search returned', resp.status);
      return null;
    }
    const json = await resp.json();
    const hit = (json.hits && json.hits[0]) || null;
    const imageUrl = hit?.recipe?.image || hit?.recipe?.images?.THUMBNAIL?.url || null;
    if (!imageUrl) return null;
    // Fetch the image itself
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) return null;
    const arr = await imgResp.arrayBuffer();
    return Buffer.from(arr).toString('base64');
  } catch (e) {
    console.warn('Failed to fetch Edamam image for', keyword, e?.message || e);
    return null;
  }
};

// Fetch Edamam image info: returns object { imageUrl, base64 } or null
const fetchEdamamImageInfo = async (keyword) => {
  const appId = process.env.EDAMAM_APP_ID || process.env.EDAMAM_APPID || process.env.EDAMAM_ID;
  const appKey = process.env.EDAMAM_APP_KEY || process.env.EDAMAM_KEY || process.env.EDAMAM_APPKEY;
  if (!appId || !appKey) return null;
  try {
    const q = encodeURIComponent(String(keyword || '').replace(/\s+/g, ' ').trim());
    if (!q) return null;
    const url = `https://api.edamam.com/search?q=${q}&app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}&from=0&to=1`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) return null;
    const json = await resp.json();
    const hit = (json.hits && json.hits[0]) || null;
    const imageUrl = hit?.recipe?.image || hit?.recipe?.images?.THUMBNAIL?.url || null;
    if (!imageUrl) return null;
    // Try to fetch the image itself
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) return { imageUrl, base64: null };
    const arr = await imgResp.arrayBuffer();
    return { imageUrl, base64: Buffer.from(arr).toString('base64') };
  } catch (e) {
    console.warn('fetchEdamamImageInfo failed for', keyword, e?.message || e);
    return null;
  }
};

// Optional: generate image via OpenAI Images API if user provides OPENAI_API_KEY
const generateImageWithOpenAI = async (prompt) => {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return null;
  try {
    const resp = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json'
      })
    });
    if (!resp.ok) {
      console.warn('OpenAI image generation failed:', resp.status, await resp.text());
      return null;
    }
    const json = await resp.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (b64) return b64;
    // Some OpenAI endpoints may return a URL instead; try to fetch it
    const url = json?.data?.[0]?.url;
    if (url) {
      const imgResp = await fetch(url);
      if (imgResp.ok) {
        const arr = await imgResp.arrayBuffer();
        return Buffer.from(arr).toString('base64');
      }
    }
    return null;
  } catch (e) {
    console.warn('OpenAI image generation error:', e?.message || e);
    return null;
  }
};

// Image cache directory
const IMAGE_CACHE_DIR = path.resolve(process.cwd(), 'server', 'images');
if (!fs.existsSync(IMAGE_CACHE_DIR)) {
  fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
}

// Load optional local mapping of dishName -> external image URL
const FOOD_IMAGE_MAP_PATH = path.resolve(process.cwd(), 'server', 'foodImageMap.json');
let FOOD_IMAGE_MAP = {};
try {
  if (fs.existsSync(FOOD_IMAGE_MAP_PATH)) {
    const raw = fs.readFileSync(FOOD_IMAGE_MAP_PATH, 'utf8');
    FOOD_IMAGE_MAP = JSON.parse(raw || '{}');
    // Normalize keys to lowercase
    const normalized = {};
    for (const k of Object.keys(FOOD_IMAGE_MAP)) {
      // Keep original mapped URLs intact; only normalize as a fallback later if fetching fails
      normalized[k.trim().toLowerCase()] = FOOD_IMAGE_MAP[k];
    }
    FOOD_IMAGE_MAP = normalized;
    console.log('Loaded food image map with', Object.keys(FOOD_IMAGE_MAP).length, 'entries');
  }
} catch (e) {
  console.warn('Failed to load foodImageMap.json:', e?.message || e);
}

// Helper: normalize mapped URLs that are known to be unstable (e.g., source.unsplash)
function slugify(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 64);
}

function normalizeMappedUrl(url, name) {
  if (!url || typeof url !== 'string') return url;
  try {
    const u = url.trim();
    // If URL is source.unsplash.com (unstable redirect), replace with a seeded picsum.photos URL
    if (/source\.unsplash\.com/i.test(u)) {
      const seed = slugify(name || u);
      return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/600`;
    }
    // If url is a search-style Unsplash (e.g., source.unsplash.com/800x600/?query), treat similarly
    if (/source-unsplash/i.test(u)) {
      const seed = slugify(name || u);
      return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/600`;
    }
    // Otherwise leave as-is
    return u;
  } catch (e) {
    return url;
  }
}

// Try to sanitize and normalize a URL string from CSV or mapping sources.
function sanitizeUrlCandidate(rawUrl, name) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let u = rawUrl.trim();
  // Remove surrounding quotes if present
  if ((u.startsWith('"') && u.endsWith('"')) || (u.startsWith("'") && u.endsWith("'"))) {
    u = u.slice(1, -1).trim();
  }
  // If it's already a mapped picsum or data URL, return as-is
  if (/^data:|^https?:\/\//i.test(u)) {
    return normalizeMappedUrl(u, name);
  }
  // If it looks like a path with spaces or missing protocol, try to fix it
  try {
    // Replace unescaped spaces
    u = u.replace(/\s+/g, '%20');
    // Ensure it has a protocol
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(u)) {
      u = 'https://' + u;
    }
    // Validate URL
    const parsed = new URL(u);
    return normalizeMappedUrl(parsed.toString(), name);
  } catch (e) {
    // As a last-ditch, try picsum seeded by name
    try {
      return picsumFor(name || u);
    } catch (ee) {
      return null;
    }
  }
}

// Auto-import CSV mappings if present. Looks for:
//  - server/recommendations.csv
//  - food_items_with_image_urls_20000.csv (one level up or in project root)
try {
  // Basic CSV parser that handles quoted fields and newlines inside quoted fields.
  const parseCSV = (text) => {
    const rows = [];
    let cur = [];
    let curField = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i+1];
      if (inQuotes) {
        if (ch === '"') {
          if (next === '"') { curField += '"'; i++; continue; }
          inQuotes = false;
        } else {
          curField += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          cur.push(curField);
          curField = '';
        } else if (ch === '\r') {
          // ignore
        } else if (ch === '\n') {
          cur.push(curField);
          rows.push(cur);
          cur = [];
          curField = '';
        } else {
          curField += ch;
        }
      }
    }
    // add last field
    if (inQuotes) {
      // unbalanced quotes; try to salvage
      cur.push(curField);
      rows.push(cur);
    } else {
      if (curField !== '' || cur.length > 0) {
        cur.push(curField);
        rows.push(cur);
      }
    }
    return rows;
  };
  const csvCandidates = [
    path.resolve(process.cwd(), 'server', 'recommendations.csv'),
    path.resolve(process.cwd(), 'recommendations.csv'),
    // common CSVs users add with recipe name -> image_url
    path.resolve(process.cwd(), 'cuisine_updated.csv'),
    path.resolve(process.cwd(), 'server', 'cuisine_updated.csv'),
    path.resolve(process.cwd(), 'recipe_names.csv'),
    path.resolve(process.cwd(), 'server', 'recipe_names.csv'),
    path.resolve(process.cwd(), '..', 'food_items_with_image_urls_20000.csv'),
    path.resolve(process.cwd(), 'food_items_with_image_urls_20000.csv')
  ];
  let merged = 0;
  for (const csvPath of csvCandidates) {
    if (!fs.existsSync(csvPath)) continue;
    try {
      const raw = fs.readFileSync(csvPath, 'utf8');
      const rows = parseCSV(raw).filter(r => Array.isArray(r) && r.length > 0);
      if (rows.length === 0) continue;
      // Parse header
      const header = rows[0].map(h => ('' + (h || '')).trim().toLowerCase());
      const idxDish = header.findIndex(h => /dishname|dish_name|name/.test(h));
      const idxUrl = header.findIndex(h => /imageurl|image_url|url|image/.test(h));
      if (idxDish === -1 || idxUrl === -1) continue;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const name = (row[idxDish] || '').trim();
        let urlRaw = (row[idxUrl] || '').trim();
        // If urlRaw doesn't look like a URL, attempt to find the first http(s) URL in the entire row text
        if (name && urlRaw && !/^https?:\/\//i.test(urlRaw)) {
          const joined = row.join(',');
          const m = joined.match(/https?:\/\/[\w\-._~:\/?#\[\]@!$&'()*+,;=%]+/i);
          if (m) {
            urlRaw = m[0];
          }
        }
        if (!name || !urlRaw) continue;
        const key = name.toLowerCase();
        const url = urlRaw.trim();
        // Avoid overwriting existing explicit mappings unless empty
        if (!FOOD_IMAGE_MAP[key]) {
          FOOD_IMAGE_MAP[key] = url;
          merged += 1;
        }
      }
    } catch (e) {
      console.warn('Failed to parse CSV', csvPath, e?.message || e);
    }
  }
  if (merged > 0) {
    // persist merged map back to foodImageMap.json
    try {
      fs.writeFileSync(FOOD_IMAGE_MAP_PATH, JSON.stringify(FOOD_IMAGE_MAP, null, 2), 'utf8');
      console.log(`Merged ${merged} entries from CSV into foodImageMap.json`);
    } catch (e) {
      console.warn('Failed to write merged foodImageMap.json:', e?.message || e);
    }
  }
} catch (e) {
  console.warn('Error while auto-importing CSV mappings:', e?.message || e);
}

const hashKey = (str) => crypto.createHash('sha256').update(str).digest('hex');

const cachePathFor = (key) => path.join(IMAGE_CACHE_DIR, `${key}.base64`);

const readCache = async (key) => {
  const p = cachePathFor(key);
  try {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  } catch (e) {}
  return null;
};

const writeCache = async (key, base64) => {
  const p = cachePathFor(key);
  try {
    fs.writeFileSync(p, base64, 'utf8');
  } catch (e) {
    console.warn('Failed to write image cache:', e?.message || e);
  }
};

const pngPathFor = (key) => path.join(IMAGE_CACHE_DIR, `${key}.png`);

const writeImageFiles = async (key, base64) => {
  try {
    const pngPath = pngPathFor(key);
    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(pngPath, buffer);
    await writeCache(key, base64);
  } catch (e) {
    console.warn('Failed to write image files:', e?.message || e);
  }
};

// Download an external image URL and cache it locally under the provided key
// Accepts optional `name` used to generate a stable picsum fallback when the
// provided URL is malformed/unreachable.
const fetchAndCacheExternalImage = async (url, key, name = null) => {
  const pngPath = pngPathFor(key);
  try {
    // If already cached, return true
    if (fs.existsSync(pngPath)) return true;
    // sanitize and normalize the incoming URL candidate. Prefer the human-friendly
    // `name` to seed stable fallbacks when possible.
    const sanitized = sanitizeUrlCandidate(url, name || url) || sanitizeUrlCandidate(url, url);
    if (!sanitized) {
      console.warn('fetchAndCacheExternalImage: could not sanitize URL for', url, '-> trying picsum fallback');
      // immediate picsum fallback
      try {
        const pf = picsumFor(name || url);
        const controllerPf = new AbortController();
        const idPf = setTimeout(() => controllerPf.abort(), parseInt(process.env.FETCH_TIMEOUT_MS || '10000', 10));
        const respPf = await fetch(pf, { headers: { 'User-Agent': process.env.FETCH_USER_AGENT || 'Mozilla/5.0' }, signal: controllerPf.signal, redirect: 'follow' });
        clearTimeout(idPf);
        if (respPf.ok) {
          const arrPf = await respPf.arrayBuffer();
          fs.writeFileSync(pngPath, Buffer.from(arrPf));
          await writeCache(key, Buffer.from(arrPf).toString('base64'));
          return true;
        }
      } catch (e) {
        console.warn('picsum fallback failed for', name || url, e?.message || e);
      }
      return false;
    }

    const maxAttempts = Math.max(1, parseInt(process.env.FETCH_RETRIES || '3', 10));
    const timeoutMs = Math.max(3000, parseInt(process.env.FETCH_TIMEOUT_MS || '10000', 10));
    const headers = {
      'User-Agent': process.env.FETCH_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        const resp = await fetch(sanitized, { headers, signal: controller.signal, redirect: 'follow' });
        clearTimeout(id);

        if (resp.ok) {
          const ct = resp.headers.get('content-type') || '';
          const arr = await resp.arrayBuffer();
          const buffer = Buffer.from(arr);
          if (!ct.startsWith('image/') && buffer.length < 1000) {
            throw new Error('Fetched content is not an image');
          }
          fs.writeFileSync(pngPath, buffer);
          await writeCache(key, buffer.toString('base64'));
          return true;
        }

        console.warn(`fetchAndCacheExternalImage: non-OK response for ${sanitized} (status=${resp.status}) attempt=${attempt} name=${name || ''}`);

        // Special handling for Unsplash image CDN 404s: try adding standard query params
        if (resp.status === 404 && /images\.unsplash\.com\//i.test(sanitized)) {
          const alt = sanitized.includes('?') ? sanitized + '&auto=format&fit=crop&w=800&q=80' : sanitized + '?auto=format&fit=crop&w=800&q=80';
          try {
            const controller2 = new AbortController();
            const id2 = setTimeout(() => controller2.abort(), timeoutMs);
            const resp2 = await fetch(alt, { headers, signal: controller2.signal, redirect: 'follow' });
            clearTimeout(id2);
            if (resp2.ok) {
              const arr2 = await resp2.arrayBuffer();
              fs.writeFileSync(pngPath, Buffer.from(arr2));
              await writeCache(key, Buffer.from(arr2).toString('base64'));
              return true;
            }
          } catch (e2) {
            console.warn('fetchAndCacheExternalImage: unsplash alt fetch failed', e2?.message || e2);
          }
        }

        // For 503s or server errors, retry after backoff
        if (resp.status >= 500) {
          await sleep(500 * attempt);
          continue;
        }

        // For other non-OK statuses, break to fallback
        break;
      } catch (err) {
        // network or abort
        const reason = err?.message || err;
        if (err && err.name === 'AbortError') {
          console.warn(`fetchAndCacheExternalImage: aborted for ${sanitized} (timeout ${timeoutMs}ms) attempt=${attempt} name=${name || ''}`);
        } else {
          console.warn(`fetchAndCacheExternalImage: attempt=${attempt} for ${sanitized} failed:`, reason, 'name=', name || '');
        }
        // small backoff before next attempt
        await sleep(400 * attempt);
      }
    }

    // As a last resort, try a picsum fallback seeded by name (if provided)
    try {
      const fallback = picsumFor(name || sanitized);
      const controller3 = new AbortController();
      const id3 = setTimeout(() => controller3.abort(), timeoutMs);
      const resp3 = await fetch(fallback, { headers, signal: controller3.signal, redirect: 'follow' });
      clearTimeout(id3);
      if (resp3.ok) {
        const arr3 = await resp3.arrayBuffer();
        fs.writeFileSync(pngPath, Buffer.from(arr3));
        await writeCache(key, Buffer.from(arr3).toString('base64'));
        return true;
      }
    } catch (e) {
      console.warn('fetchAndCacheExternalImage: picsum fallback failed for', name || url, e?.message || e);
    }

    return false;
  } catch (e) {
    console.warn('Failed to fetch/cache external image', url, e?.message || e);
    return false;
  }
};

// Limit concurrent image generation to avoid bursting the API
const IMAGE_CONCURRENCY = 2;
const limit = pLimit(IMAGE_CONCURRENCY);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Check if an image URL is reachable (HEAD then GET fallback) with timeout and simple retries
const isImageUrlReachable = async (url, timeout = 5000) => {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    // Try HEAD first
    let resp = null;
    try {
      resp = await fetch(url, { method: 'HEAD', signal: controller.signal });
    } catch (e) {
      // HEAD may be blocked; try GET
      try {
        resp = await fetch(url, { method: 'GET', signal: controller.signal });
      } catch (e2) {
        clearTimeout(id);
        return false;
      }
    }
    clearTimeout(id);
    if (!resp || !resp.ok) return false;
    const ct = resp.headers.get('content-type') || '';
    return ct.startsWith('image/');
  } catch (e) {
    return false;
  }
};

const picsumFor = (name) => {
  const seed = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 64);
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/600`;
};

async function generateImageWithRetries(prompt, recipeKey, maxRetries = 3) {
  // Check cache first
  const cached = await readCache(recipeKey);
  if (cached) return cached;
  // Environment-driven overrides
  const forceUnsplash = (process.env.FORCE_UNSPLASH || '').toLowerCase() === 'true';
  const preferOpenAI = (process.env.PREFER_OPENAI || '').toLowerCase() === 'true';

  // If forced to Unsplash, return that immediately
  if (forceUnsplash) {
    const unsplash = await fetchRemoteImageAsBase64(prompt);
    if (unsplash) {
      await writeImageFiles(recipeKey, unsplash);
      return unsplash;
    }
    await writeImageFiles(recipeKey, PLACEHOLDER_BASE64);
    return PLACEHOLDER_BASE64;
  }

  // Optionally try OpenAI image generation first
  if (preferOpenAI || process.env.OPENAI_API_KEY) {
    try {
      const openaiBase64 = await generateImageWithOpenAI(prompt);
      if (openaiBase64) {
        await writeImageFiles(recipeKey, openaiBase64);
        return openaiBase64;
      }
    } catch (e) {
      console.warn('OpenAI generation attempt failed:', e?.message || e);
    }
  }
  // Try Edamam Recipe Search first for an accurate recipe image (if credentials present)
  try {
    const eda = await fetchEdamamImageAsBase64(prompt);
    if (eda) {
      await writeImageFiles(recipeKey, eda);
      return eda;
    }
  } catch (e) {
    console.warn('Edamam attempt failed in generateImageWithRetries:', e?.message || e);
  }

  // Try Gemini with retries
  let attempt = 0;
  let backoff = 1000;
  while (attempt <= maxRetries) {
    try {
      const ai = createClient();
      const imageResp = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: { responseModalities: [Modality.IMAGE] },
      });

      const candidate = imageResp.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData?.data) {
            const base64 = part.inlineData.data;
            await writeImageFiles(recipeKey, base64);
            return base64;
          }
        }
      }
      throw new Error('No inline image data');
    } catch (err) {
      const msg = err?.message || JSON.stringify(err || 'unknown');
      const isQuota = /Quota exceeded|RESOURCE_EXHAUSTED|quota/i.test(msg);
      if (isQuota) {
        console.warn('Quota hit during generateImageWithRetries:', msg);
        break;
      }
      attempt += 1;
      if (attempt > maxRetries) {
        console.error('generateImageWithRetries failed after attempts:', msg);
        break;
      }
      await sleep(backoff);
      backoff *= 2;
    }
  }

  // Try Unsplash fallback
  // Try Edamam Recipe Search as a fallback (use user's Edamam credentials if present)
  try {
    const eda = await fetchEdamamImageAsBase64(prompt);
    if (eda) {
      await writeImageFiles(recipeKey, eda);
      return eda;
    }
  } catch (e) {
    console.warn('Edamam fallback failed in generateImageWithRetries:', e?.message || e);
  }

  // Try Unsplash fallback
  const unsplash = await fetchRemoteImageAsBase64(prompt);
  if (unsplash) {
    await writeImageFiles(recipeKey, unsplash);
    return unsplash;
  }

  // Last resort placeholder
  await writeImageFiles(recipeKey, PLACEHOLDER_BASE64);
  return PLACEHOLDER_BASE64;
}

app.post('/api/recommendations', async (req, res) => {
  const preferences = req.body;
  if (!preferences) return res.status(400).json({ error: 'Missing preferences body' });

  const ai = createClient();

  const ingredientsProvided = Array.isArray(preferences.includeIngredients) && preferences.includeIngredients.length > 0;

  const recipePrompt = `
    You are a strict "Pantry Chef" AI. Your ONLY goal is to create recipes using a fixed list of ingredients and adhering to dietary rules.
    **PRIMARY DIRECTIVE: YOU MUST ONLY USE THE INGREDIENTS PROVIDED IN THE 'Ingredients Available' LIST. DO NOT, UNDER ANY CIRCUMSTANCES, ADD ANY INGREDIENT THAT IS NOT ON THIS LIST.**
    **SECOND DIRECTIVE: YOU MUST STRICTLY ADHERE to the user's 'Dietary Restrictions'.**

    User Preferences:
    - Cuisine: ${preferences.cuisine || 'Any'}
    - Dietary Restrictions: ${preferences.dietaryRestrictions || 'None'}
    - Ingredients Available: ${ingredientsProvided ? preferences.includeIngredients.join(', ') : 'User has not specified any ingredients, suggest popular dishes.'}

    Your task is to recommend 3 dishes. For each dish:
    - It must be possible to make it using ONLY a subset of the 'Ingredients Available'.
    - It MUST strictly follow the 'Dietary Restrictions'.
    - The list of ingredients in your response for each dish must also ONLY contain items from the 'Ingredients Available' list.

    Provide the response in a JSON array format.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: recipePrompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              dishName: { type: Type.STRING },
              description: { type: Type.STRING },
              ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['dishName', 'description', 'ingredients'],
          },
        },
      },
    });

    // Robustly extract JSON text from the AI response.
    const jsonText = extractTextFromAIResponse(response);

    let recipeDetails = null;
    if (jsonText) {
      try {
        recipeDetails = JSON.parse(jsonText);
      } catch (e) {
        // parsing failed; will fallback below
        console.warn('Failed to parse recipe JSON from AI response:', e?.message || e, 'raw:', jsonText.slice ? jsonText.slice(0, 400) : jsonText);
        recipeDetails = null;
      }
    }

    // If AI failed to produce valid JSON, fall back to a simple deterministic recipe generator
    if (!recipeDetails || !Array.isArray(recipeDetails) || recipeDetails.length === 0) {
      console.warn('AI did not return valid recipe JSON, falling back to deterministic generator');
      const provided = Array.isArray(preferences.includeIngredients) ? preferences.includeIngredients.map(i => String(i).trim()).filter(Boolean) : [];
      const makeRecipe = (base, idx) => {
        const name = `${base}${idx > 0 ? ' ' + (idx+1) : ''}`;
        const description = `Simple ${base}-forward dish using only the provided ingredients.`;
        // choose up to 6 ingredients including the base
        const ingredients = [base, ...provided.filter(p => p.toLowerCase() !== base.toLowerCase()).slice(0, 5)];
        return { dishName: name, description, ingredients };
      };
      const fallbackList = [];
      if (provided.length === 0) {
        fallbackList.push({ dishName: 'Quick Pan-Fry', description: 'A simple, quick pan-fry using common pantry ingredients.', ingredients: [] });
        fallbackList.push({ dishName: 'Simple Soup', description: 'A comforting soup made from common ingredients.', ingredients: [] });
        fallbackList.push({ dishName: 'Steamed Veggies', description: 'Light steamed vegetables seasoned to taste.', ingredients: [] });
      } else {
        for (let i = 0; i < Math.min(3, provided.length); i++) {
          fallbackList.push(makeRecipe(provided[i] || provided[0], i));
        }
      }
      recipeDetails = fallbackList;
    }

    // Generate images in parallel using the centralized helper (handles Gemini, OpenAI, Unsplash, Edamam, caching)
    const imagePromises = recipeDetails.map(async (recipe) => {
      const dietaryContext = preferences.dietaryRestrictions && preferences.dietaryRestrictions !== 'None' && preferences.dietaryRestrictions !== 'Any'
        ? `**DIET**: This is a **${preferences.dietaryRestrictions}** dish.`
        : '';

      const imagePrompt = `You are an expert food photographer AI. Generate a photorealistic image for: ${recipe.dishName}. Description: ${recipe.description} Ingredients: ${recipe.ingredients.join(', ')}. ${dietaryContext}`;
      const key = hashKey(recipe.dishName + '|' + recipe.ingredients.join(','));

      // 1) Try Edamam Recipe Search first (preferred source when credentials present)
      try {
        const edaQuery = `${recipe.dishName} ${Array.isArray(recipe.ingredients) ? recipe.ingredients.join(' ') : ''}`.trim();
        if (edaQuery) {
          const edaB64 = await fetchEdamamImageAsBase64(edaQuery);
          if (edaB64) {
            const edaKey = hashKey('edamam|' + edaQuery);
            await writeImageFiles(edaKey, edaB64);
            return { base64: edaB64, key: edaKey, source: 'edamam' };
          }
        }
      } catch (e) {
        // ignore and continue to other fallbacks
        console.warn('Edamam attempt in recommendations failed for', recipe.dishName, e?.message || e);
      }

      // 2) If a mapped external URL exists, prefer caching it and returning the local cached copy
      const mapped = FOOD_IMAGE_MAP[(recipe.dishName || '').trim().toLowerCase()];
      if (mapped) {
        try {
          const mappedKey = hashKey('mapped|' + mapped);
          const ok = await fetchAndCacheExternalImage(mapped, mappedKey, recipe.dishName);
          if (ok) {
            const b64 = await readCache(mappedKey);
            return { base64: b64, key: mappedKey, mappedUrl: mapped, source: 'mapped' };
          }
          // if caching fails, fall through to generation
        } catch (e) {
          // continue to generation
        }
      }

      // 3) Otherwise generate (or reuse cached) image via helper (Gemini/OpenAI/Unsplash/Edamam fallback)
      const base64 = await generateImageWithRetries(imagePrompt, key, 2);
      return { base64, key, source: 'generated' };
    });

    const base64Images = await Promise.all(imagePromises);
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const fullRecommendations = recipeDetails.map((r, i) => {
      // Use the image data returned from the generation/caching step
      const imgEntry = base64Images[i] || {};
      const entryBase64 = typeof imgEntry === 'string' ? imgEntry : (imgEntry?.base64 || null);
      const entryKey = imgEntry?.key || hashKey(r.dishName + '|' + r.ingredients.join(','));
      const pngPath = `/images/${entryKey}.png`;
      const mapped = FOOD_IMAGE_MAP[(r.dishName || '').trim().toLowerCase()];

      if (mapped) {
        try {
          const mappedKey = hashKey('mapped|' + mapped);
          // ensure background caching attempt (best-effort)
          fetchAndCacheExternalImage(mapped, mappedKey, r.dishName).catch(() => {});
          const localUrl = `${baseUrl}/images/${mappedKey}.png`;
          // If we have a base64 for the generated image, include it; otherwise null
          return { ...r, imageBase64: entryBase64, imageUrl: localUrl, mapped: true, originalUrl: mapped };
        } catch (e) {
          return { ...r, imageBase64: entryBase64, imageUrl: mapped, mapped: true, originalUrl: mapped };
        }
      }

      return { ...r, imageBase64: entryBase64, imageUrl: `${baseUrl}${pngPath}` };
    });
    return res.json(fullRecommendations);
  } catch (err) {
    console.error('Error in /api/recommendations (attempting fallback):', err && (err.message || err));
    // Always attempt deterministic fallback when any error occurs so the frontend still receives recipes
    try {
      const provided = Array.isArray(preferences.includeIngredients) ? preferences.includeIngredients.map(i => String(i).trim()).filter(Boolean) : [];
      const makeRecipe = (base, idx) => {
        const name = `${base}${idx > 0 ? ' ' + (idx+1) : ''}`;
        const description = `Simple ${base}-forward dish using only the provided ingredients.`;
        const ingredients = [base, ...provided.filter(p => p.toLowerCase() !== base.toLowerCase()).slice(0, 5)];
        return { dishName: name, description, ingredients };
      };
      const fallbackList = [];
      if (provided.length === 0) {
        fallbackList.push({ dishName: 'Quick Pan-Fry', description: 'A simple, quick pan-fry using common pantry ingredients.', ingredients: [] });
        fallbackList.push({ dishName: 'Simple Soup', description: 'A comforting soup made from common ingredients.', ingredients: [] });
        fallbackList.push({ dishName: 'Steamed Veggies', description: 'Light steamed vegetables seasoned to taste.', ingredients: [] });
      } else {
        for (let i = 0; i < Math.min(3, provided.length); i++) {
          fallbackList.push(makeRecipe(provided[i] || provided[0], i));
        }
      }

      // Return fallback recommendations without images (frontend will show recipe-only cards)
      return res.json(fallbackList.map(r => ({ ...r, imageBase64: null, imageUrl: null })));
    } catch (e2) {
      console.error('Fallback generator also failed:', e2);
      // If fallback also fails, return a generic 500 with a clear message
      return res.status(500).json({ error: 'Failed to get recommendations and fallback generator failed' });
    }
  }
});

app.post('/api/recipe', async (req, res) => {
  const { dishName, description, preferences } = req.body;
  if (!dishName || !description || !preferences) return res.status(400).json({ error: 'Missing fields' });

  const ai = createClient();
  const ingredientsProvided = Array.isArray(preferences.includeIngredients) && preferences.includeIngredients.length > 0;

  const prompt = `
    You are a strict "Pantry Chef" AI. Create a detailed recipe using only the available ingredients and following dietary rules.
    Dish Name: ${dishName}
    Description: ${description}
    Dietary Restrictions: ${preferences.dietaryRestrictions || 'None'}
    Available Ingredients: ${ingredientsProvided ? preferences.includeIngredients.join(', ') : 'Any common ingredients can be used.'}

    Provide JSON: { "ingredients": [..], "instructions": [..] }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
            instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['ingredients', 'instructions'],
        },
      },
    });

    const jsonText = extractTextFromAIResponse(response);
    let parsed = null;
    if (jsonText) {
      try {
        parsed = JSON.parse(jsonText);
      } catch (parseErr) {
        console.warn('Failed to parse recipe JSON from AI response:', parseErr?.message || parseErr, 'raw:', jsonText.slice ? jsonText.slice(0, 400) : jsonText);
        parsed = null;
      }
    }

    const fallbackRecipe = () => {
      const userIngredients = Array.isArray(preferences.includeIngredients)
        ? preferences.includeIngredients.map(i => String(i).trim()).filter(Boolean)
        : [];
      const safeBase = userIngredients[0] || 'Pantry'
      return {
        ingredients: userIngredients.length > 0 ? userIngredients.slice(0, 6) : ['salt', 'pepper', 'olive oil'],
        instructions: [
          `Use ${userIngredients.length > 0 ? userIngredients.join(', ') : 'common pantry ingredients'} to prepare a simple dish.`, 
          'Heat a pan and add oil.',
          'Combine ingredients and cook until done.',
          'Season to taste and serve warm.'
        ],
      };
    };

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.ingredients) || !Array.isArray(parsed.instructions)) {
      console.warn('AI recipe response was invalid; using fallback recipe generator. Raw response:', jsonText.slice ? jsonText.slice(0, 400) : jsonText);
      return res.json(fallbackRecipe());
    }

    return res.json(parsed);
  } catch (err) {
    console.error('Error in /api/recipe:', err);
    const fallbackRecipe = {
      ingredients: Array.isArray(preferences.includeIngredients) ? preferences.includeIngredients.map(i => String(i).trim()).filter(Boolean).slice(0, 6) : [],
      instructions: [
        'Combine available ingredients in a pan or oven-safe dish.',
        'Cook until tender and fully warmed through.',
        'Season with salt, pepper, and any herbs you have on hand.',
        'Serve hot and enjoy.'
      ],
    };
    return res.json(fallbackRecipe);
  }
});

// Generate a single image for a dish on demand (to reduce bulk image usage)
app.post('/api/generate-image', async (req, res) => {
  const { dishName, description, ingredients = [], preferences = {} } = req.body || {};
  if (!dishName || !description) return res.status(400).json({ error: 'Missing dishName or description' });

  const ai = createClient();
  const dietaryContext = preferences.dietaryRestrictions && preferences.dietaryRestrictions !== 'None' && preferences.dietaryRestrictions !== 'Any'
    ? `**DIET**: This is a **${preferences.dietaryRestrictions}** dish.`
    : '';

  const imagePrompt = `
    You are an expert food photographer AI. Generate a photorealistic image for: ${dishName}. Description: ${description}
    Ingredients: ${Array.isArray(ingredients) ? ingredients.join(', ') : ''}. ${dietaryContext}
  `;

  try {
    // If a mapped image URL exists for this dish, try to cache and return a local copy
    const mapped = FOOD_IMAGE_MAP[(dishName || '').trim().toLowerCase()];
    if (mapped) {
      try {
        const mappedKey = hashKey('mapped|' + mapped);
        const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
        // Ensure the image is cached locally (best-effort)
        const ok = await fetchAndCacheExternalImage(mapped, mappedKey, dishName);
        if (ok) {
          return res.json({ imageUrl: `${baseUrl}/images/${mappedKey}.png`, mapped: true, originalUrl: mapped });
        }
        // If caching failed, fall back to returning the original mapped URL
        return res.json({ imageUrl: mapped, mapped: true, originalUrl: mapped });
      } catch (e) {
        return res.json({ imageUrl: mapped, mapped: true, originalUrl: mapped });
      }
    }

    // Use the cached/generation helper which also writes files
    const recipeKey = hashKey(dishName + '|' + (Array.isArray(ingredients) ? ingredients.join(',') : ''));
    const base64 = await generateImageWithRetries(imagePrompt, recipeKey, 2);
    // ensure PNG file exists (writeImageFiles called by generator)
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const pngPath = `/images/${recipeKey}.png`;
    return res.json({ imageBase64: base64, imageUrl: `${baseUrl}${pngPath}` });
  } catch (err) {
    const message = err?.message || JSON.stringify(err || 'unknown');
    const isQuota = /Quota exceeded|RESOURCE_EXHAUSTED|quota/i.test(message);
    if (isQuota) console.warn(`Quota/rate-limit when generating image for ${dishName}: ${message}`);
    else console.error(`Error generating single image for ${dishName}:`, err);
    // Try to fetch Unsplash fallback before returning placeholder
    const unsplashImg = await fetchRemoteImageAsBase64(dishName + ' ' + (Array.isArray(ingredients) ? ingredients.join(' ') : ''));
    if (unsplashImg) {
      const recipeKey = hashKey(dishName + '|' + (Array.isArray(ingredients) ? ingredients.join(',') : ''));
      await writeImageFiles(recipeKey, unsplashImg);
      const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
      const pngPath = `/images/${recipeKey}.png`;
      return res.json({ imageBase64: unsplashImg, imageUrl: `${baseUrl}${pngPath}`, fallback: 'unsplash' });
    }

    // Try Edamam Recipe Search as another fallback
    try {
      const edaImg = await fetchEdamamImageAsBase64(dishName + ' ' + (Array.isArray(ingredients) ? ingredients.join(' ') : ''));
      if (edaImg) {
        const recipeKey = hashKey(dishName + '|' + (Array.isArray(ingredients) ? ingredients.join(',') : ''));
        await writeImageFiles(recipeKey, edaImg);
        const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
        const pngPath = `/images/${recipeKey}.png`;
        return res.json({ imageBase64: edaImg, imageUrl: `${baseUrl}${pngPath}`, fallback: 'edamam' });
      }
    } catch (e) {
      console.warn('Edamam fallback failed in /api/generate-image catch path', e?.message || e);
    }
    const recipeKey = hashKey(dishName + '|' + (Array.isArray(ingredients) ? ingredients.join(',') : ''));
    await writeImageFiles(recipeKey, PLACEHOLDER_BASE64);
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const pngPath = `/images/${recipeKey}.png`;
    return res.json({ imageBase64: PLACEHOLDER_BASE64, imageUrl: `${baseUrl}${pngPath}`, warning: isQuota ? 'quota_exhausted' : 'generation_failed' });
  }
});

// Check if a cached image exists for a dish name (either generated or mapped)
app.get('/api/has-image', async (req, res) => {
  try {
    const name = (req.query.name || '').toString().trim();
    if (!name) return res.status(400).json({ error: 'Missing name query param' });

    const keyForName = hashKey(name);
    const pngForName = pngPathFor(keyForName);
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

    // If a direct generated image exists for the name
    if (fs.existsSync(pngForName)) {
      return res.json({ imageUrl: `${baseUrl}/images/${keyForName}.png`, source: 'generated' });
    }

    // If a mapped external URL exists, check its mapped cached key
    const mapped = FOOD_IMAGE_MAP[name.toLowerCase()];
    if (mapped) {
      const mappedKey = hashKey('mapped|' + mapped);
      const pngForMapped = pngPathFor(mappedKey);
      if (fs.existsSync(pngForMapped)) {
        return res.json({ imageUrl: `${baseUrl}/images/${mappedKey}.png`, source: 'mapped', originalUrl: mapped });
      }
      // mapped exists but not cached yet — attempt a best-effort cache in background
      fetchAndCacheExternalImage(mapped, mappedKey, name).catch(() => {});
      // still return original mapped URL so frontend can use it
      return res.json({ imageUrl: mapped, source: 'mapped-remote', originalUrl: mapped });
    }

    return res.status(404).json({ error: 'No cached image found' });
  } catch (e) {
    console.error('Error in /api/has-image:', e);
    return res.status(500).json({ error: e?.message || 'failed' });
  }
});

// Force route: aggressively attempt Gemini image generation (no Unsplash fallback).
// WARNING: If your project quota is 0 or quota exhausted, this will still fail with 429.
app.post('/api/generate-image-force', async (req, res) => {
  const { dishName, description, ingredients = [], preferences = {} } = req.body || {};
  if (!dishName || !description) return res.status(400).json({ error: 'Missing dishName or description' });

  const dietaryContext = preferences.dietaryRestrictions && preferences.dietaryRestrictions !== 'None' && preferences.dietaryRestrictions !== 'Any'
    ? `**DIET**: This is a **${preferences.dietaryRestrictions}** dish.`
    : '';

  const prompt = `
    You are an expert food photographer AI. Generate a photorealistic image for: ${dishName}. Description: ${description}
    Ingredients: ${Array.isArray(ingredients) ? ingredients.join(', ') : ''}. ${dietaryContext}
  `;

  const maxRetries = parseInt(process.env.FORCE_MAX_RETRIES || '6', 10);
  let attempt = 0;
  let backoff = 1000;
  try {
    // If mapped image exists, try to cache and return a local copy for forced endpoint as well
    const mapped = FOOD_IMAGE_MAP[(dishName || '').trim().toLowerCase()];
    if (mapped) {
      try {
        const mappedKey = hashKey('mapped|' + mapped);
        const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
        const ok = await fetchAndCacheExternalImage(mapped, mappedKey, dishName);
        if (ok) return res.json({ imageUrl: `${baseUrl}/images/${mappedKey}.png`, mapped: true, originalUrl: mapped, forced: true });
        return res.json({ imageUrl: mapped, mapped: true, originalUrl: mapped, forced: true });
      } catch (e) {
        return res.json({ imageUrl: mapped, mapped: true, originalUrl: mapped, forced: true });
      }
    }

    while (attempt <= maxRetries) {
      try {
        const ai = createClient();
        const imageResp = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: [{ text: prompt }] },
          config: { responseModalities: [Modality.IMAGE] },
        });

        const candidate = imageResp.candidates?.[0];
        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData?.data) {
              const base64 = part.inlineData.data;
              const key = hashKey(dishName + '|' + (Array.isArray(ingredients) ? ingredients.join(',') : ''));
              await writeImageFiles(key, base64);
              const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
              return res.json({ imageBase64: base64, imageUrl: `${baseUrl}/images/${key}.png`, forced: true });
            }
          }
        }
        // No inline data returned
        attempt += 1;
        await sleep(backoff);
        backoff *= 2;
      } catch (err) {
        const msg = err?.message || JSON.stringify(err || 'unknown');
        const isQuota = /Quota exceeded|RESOURCE_EXHAUSTED|quota/i.test(msg);
        console.warn(`Force generate attempt ${attempt} failed for ${dishName}:`, msg);
        if (isQuota) {
          // If quota, wait longer before retrying
          await sleep(5000);
        } else {
          await sleep(backoff);
          backoff *= 2;
        }
        attempt += 1;
      }
    }
    return res.status(502).json({ error: 'Failed to generate image after force attempts' });
  } catch (err) {
    console.error('Error in generate-image-force:', err);
    return res.status(500).json({ error: err?.message || 'unknown' });
  }
});

// Simple Edamam-only test endpoint: returns Edamam image URL and base64 when available
app.get('/api/edamam-image', async (req, res) => {
  try {
    const q = (req.query.q || req.query.q || '').toString();
    if (!q) return res.status(400).json({ error: 'Missing query param q' });
    const info = await fetchEdamamImageInfo(q);
    if (!info) return res.status(404).json({ error: 'No image found via Edamam for query' });
    // Cache locally for convenience
    const key = hashKey('edamam|' + q);
    try {
      if (info.base64) {
        await writeImageFiles(key, info.base64);
      } else {
        // If no base64 but we have imageUrl, try to fetch and cache
        await fetchAndCacheExternalImage(info.imageUrl, key, q).catch(() => {});
      }
    } catch (e) {
      // ignore caching errors
    }
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    return res.json({ imageUrl: info.imageUrl, imageBase64: info.base64 || null, localUrl: `${baseUrl}/images/${key}.png` });
  } catch (e) {
    console.error('Error in /api/edamam-image:', e);
    return res.status(500).json({ error: e?.message || 'failed' });
  }
});

app.post('/api/nearby-stores', async (req, res) => {
  const { latitude, longitude, q } = req.body;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return res.status(400).json({ error: 'Missing lat/lng' });
  // Prefer TomTom Search API if an API key is provided (most accurate for POIs in many regions)
  const tomtomKey = process.env.TOMTOM_API_KEY || process.env.TOMTOM_KEY || process.env.TO_TOM_API_KEY || process.env.TOM_TOM_API_KEY || process.env.Tom_Tom_API_KEY || process.env.TomTom_API_KEY;
  if (tomtomKey) {
    try {
      const ttRadius = parseInt(process.env.NEARBY_RADIUS_METERS || '5000', 10);
      const userQuery = (typeof q === 'string' && q.trim()) ? q.trim() : null;
      const queries = userQuery ? [userQuery] : ['supermarket', 'grocery', 'convenience store', 'market'];
      let ttResults = [];
      for (const q of queries) {
        const ttUrl = `https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json?key=${encodeURIComponent(tomtomKey)}&lat=${latitude}&lon=${longitude}&radius=${ttRadius}&limit=10`;
        try {
          const ttResp = await fetch(ttUrl, { redirect: 'follow' });
          if (!ttResp.ok) continue;
          const ttJson = await ttResp.json();
          const items = ttJson.results || ttJson.results || ttJson.results || ttJson.items || ttJson.results || [];
          if (Array.isArray(items) && items.length) {
            for (const it of items) {
              // TomTom may return name in 'poi' or top-level 'name'; coordinates in 'position' or 'location'
              const name = (it.poi && it.poi.name) || it.name || (it.address && it.address.freeformAddress) || null;
              const lat = (it.position && it.position.lat) || (it.geometry && it.geometry.coordinates && it.geometry.coordinates[1]) || null;
              const lon = (it.position && it.position.lon) || (it.geometry && it.geometry.coordinates && it.geometry.coordinates[0]) || null;
              if (name && lat && lon) {
                ttResults.push({ name: String(name), lat: Number(lat), lon: Number(lon) });
              }
            }
          }
        } catch (e) {
          // ignore per-query errors and continue to next
        }
        if (ttResults.length >= 5) break;
      }

      if (ttResults.length > 0) {
        // dedupe by name+coords
        const seen = new Map();
        const stores = ttResults.map(s => ({ key: `${s.name}|${s.lat}|${s.lon}`, s })).filter(({ key, s }) => {
          if (seen.has(key)) return false; seen.set(key, true); return true;
        }).map(({ s }) => ({ name: s.name, uri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.name)}&query=${s.lat},${s.lon}` }));
        return res.json(stores.slice(0, 5));
      }
    } catch (e) {
      console.warn('TomTom lookup failed, falling back to Overpass/AI:', e?.message || e);
    }
  }

  // Prefer a deterministic, reliable lookup using OpenStreetMap's Overpass API.
  // This avoids unpredictable AI grounding and returns actual nearby shops using lat/lng.
  try {
    const radius = parseInt(process.env.NEARBY_RADIUS_METERS || '5000', 10); // default 5km
    const overpassQuery = `
      [out:json][timeout:25];
      (
        node(around:${radius},${latitude},${longitude})[shop~"supermarket|convenience|grocery|greengrocer|bakery|marketplace"];
        way(around:${radius},${latitude},${longitude})[shop~"supermarket|convenience|grocery|greengrocer|bakery|marketplace"];
        relation(around:${radius},${latitude},${longitude})[shop~"supermarket|convenience|grocery|greengrocer|bakery|marketplace"];
      );
      out center;`;

    const overpassUrl = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
    const overResp = await fetch(overpassUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(overpassQuery)}`,
      redirect: 'follow'
    });

    if (overResp.ok) {
      const json = await overResp.json();
      const elements = Array.isArray(json.elements) ? json.elements : [];

      // Extract name and coordinates (node: lat/lon; way/relation: center)
      const candidates = elements
        .map(el => {
          const name = (el.tags && el.tags.name) || el.tags && (el.tags['shop'] || el.tags['amenity']) || null;
          const lat = el.lat || (el.center && el.center.lat) || null;
          const lon = el.lon || (el.center && el.center.lon) || null;
          return name && lat && lon ? { name: String(name), lat: Number(lat), lon: Number(lon) } : null;
        })
        .filter(Boolean);

      // Compute distance and sort
      const toMeters = (aLat, aLon, bLat, bLon) => {
        const R = 6371000; // meters
        const toRad = v => (v * Math.PI) / 180;
        const dLat = toRad(bLat - aLat);
        const dLon = toRad(bLon - aLon);
        const lat1 = toRad(aLat);
        const lat2 = toRad(bLat);
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
      };

      const sorted = candidates
        .map(c => ({ ...c, distance: toMeters(latitude, longitude, c.lat, c.lon) }))
        .sort((x, y) => x.distance - y.distance)
        .slice(0, 10);

      const stores = sorted.map(s => ({
        name: s.name,
        // Use a Google Maps query that centers on the found coordinates for convenience
        uri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.name)}&query=${s.lat},${s.lon}`
      }));

      if (stores.length > 0) return res.json(stores.slice(0, 5));
    }
  } catch (e) {
    console.warn('Overpass lookup failed for nearby stores:', e?.message || e);
    // fall through to AI-based fallback below
  }

  // Fallback: use the AI grounding approach if Overpass fails or returns no results.
  const ai = createClient();
  try {
    const prompt = 'Find nearby grocery stores or supermarkets where I can buy ingredients.';
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: { retrievalConfig: { latLng: { latitude, longitude } } },
      },
    });

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const stores = chunks
      .map((chunk) => chunk.maps)
      .filter((m) => m && m.title && m.uri)
      .map((m) => ({ name: m.title, uri: m.uri }));

    const unique = Array.from(new Map(stores.map(s => [s.uri, s])).values());
    return res.json(unique.slice(0, 5));
  } catch (err) {
    console.error('Error in /api/nearby-stores (AI fallback):', err);
    return res.status(500).json({ error: err.message || 'Failed to find stores' });
  }
});

// Simple chat endpoint: proxy user message history to the text model
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: 'Missing messages' });

    // Build a simple prompt from message history
    const promptParts = [];
    for (const m of messages) {
      const role = (m.role || 'user').toString();
      const text = (m.text || '').toString();
      promptParts.push(`${role.toUpperCase()}: ${text}`);
    }
    promptParts.push('ASSISTANT: Please reply helpfully and concisely.');
    const prompt = promptParts.join('\n');

    const ai = createClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const replyText = response.text?.trim() || (response.candidates?.[0]?.content?.[0]?.text || '');
    return res.json({ reply: replyText });
  } catch (err) {
    console.error('Error in /api/chat:', err);
    const msg = err?.message || JSON.stringify(err || 'unknown');
    const isQuota = /Quota exceeded|RESOURCE_EXHAUSTED|quota/i.test(msg);
    if (isQuota) return res.status(429).json({ error: 'quota_exhausted', message: msg });
    return res.status(500).json({ error: err?.message || 'failed' });
  }
});

// Bulk cache endpoint: fetch and cache all external mapped images from `foodImageMap.json`
app.post('/api/cache-mapped-images', async (req, res) => {
  try {
    const entries = Object.entries(FOOD_IMAGE_MAP || {});
    if (!entries.length) return res.json({ total: 0, success: 0, failed: [] });

    const concurrency = parseInt(process.env.CACHE_CONCURRENCY || '5', 10);
    const limiter = pLimit(concurrency);
    const results = [];

    await Promise.all(entries.map(([name, url]) => limiter(async () => {
      const key = hashKey('mapped|' + url);
      let ok = false;
      try {
        ok = await fetchAndCacheExternalImage(url, key, name);
      } catch (e) {
        ok = false;
      }
      // If fetching the mapped URL failed, try a picsum seeded fallback for this name
      if (!ok) {
        try {
          const fallback = picsumFor(name || url);
          const fallbackOk = await fetchAndCacheExternalImage(fallback, key, name);
          if (fallbackOk) {
            ok = true;
            // replace the mapping with the stable picsum URL so future runs prefer it
            FOOD_IMAGE_MAP[name] = fallback;
          }
        } catch (e) {
          // ignore
        }
      }
      // If still not ok, write placeholder so frontend has an image file to use
      if (!ok) {
        try {
          await writeImageFiles(key, PLACEHOLDER_BASE64);
          ok = true;
        } catch (e) {
          // leave ok = false
        }
      }
      results.push({ name, url, key, ok });
    })));

    const success = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).map(r => ({ name: r.name, url: r.url }));
    return res.json({ total: entries.length, success, failed });
  } catch (e) {
    console.error('Error in /api/cache-mapped-images:', e);
    return res.status(500).json({ error: e?.message || 'Failed to cache mapped images' });
  }
});

// Bulk cache images for recipe names listed in recipe_names.csv (project root or server folder)
app.post('/api/cache-recipe-names', async (req, res) => {
  try {
    const csvCandidates = [
      path.resolve(process.cwd(), 'recipe_names.csv'),
      path.resolve(process.cwd(), 'server', 'recipe_names.csv')
    ];
    let foundPath = null;
    for (const p of csvCandidates) {
      if (fs.existsSync(p)) { foundPath = p; break; }
    }
    if (!foundPath) return res.status(404).json({ total: 0, success: 0, message: 'No recipe_names.csv found' });

    const raw = fs.readFileSync(foundPath, 'utf8');
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return res.json({ total: 0, success: 0, message: 'CSV empty' });

    // If file has a header, try to detect and skip it (simple heuristic)
    const names = lines.map((ln, idx) => {
      // handle simple CSV with single column or comma-separated; take first cell as name
      const cells = ln.split(/,|;|\t/).map(c => c.trim()).filter(Boolean);
      const first = cells[0] || '';
      return first;
    }).filter(Boolean);

    const limiter = pLimit(parseInt(process.env.CACHE_CONCURRENCY || '3', 10));
    const results = [];
    await Promise.all(names.map(name => limiter(async () => {
      try {
        const key = hashKey(name);
        // If already cached, skip generation
        const existing = await readCache(key);
        if (existing) {
          results.push({ name, key, ok: true, cached: true });
          return;
        }
        const prompt = `You are an expert food photographer. Generate a photorealistic image for: ${name}. Provide a high-quality, appetizing photo of the finished dish.`;
        const b64 = await generateImageWithRetries(prompt, key, 2);
        if (b64) {
          results.push({ name, key, ok: true, cached: false });
        } else {
          // try picsum fallback
          try {
            const fallback = picsumFor(name);
            const fallbackOk = await fetchAndCacheExternalImage(fallback, key, name);
            if (fallbackOk) {
              results.push({ name, key, ok: true, cached: false, fallback: 'picsum' });
              return;
            }
          } catch (e) {}
          // write placeholder
          try {
            await writeImageFiles(key, PLACEHOLDER_BASE64);
            results.push({ name, key, ok: true, cached: false, fallback: 'placeholder' });
          } catch (e) {
            results.push({ name, key, ok: false });
          }
        }
      } catch (e) {
        results.push({ name, ok: false, error: e?.message || String(e) });
      }
    })));

    const success = results.filter(r => r.ok).length;
    return res.json({ total: names.length, success, results });
  } catch (e) {
    console.error('Error in /api/cache-recipe-names:', e);
    return res.status(500).json({ error: e?.message || 'failed' });
  }
});

// Fix mapped URLs: validate and replace unstable/unreachable URLs with a stable placeholder (picsum)
app.post('/api/fix-mapped-urls', async (req, res) => {
  try {
    const entries = Object.entries(FOOD_IMAGE_MAP || {});
    if (!entries.length) return res.json({ total: 0, updated: 0, replaced: [] });

    const concurrency = parseInt(process.env.CACHE_CONCURRENCY || '5', 10);
    const limiter = pLimit(concurrency);
    const replaced = [];

    await Promise.all(entries.map(([name, url]) => limiter(async () => {
      try {
        if (!url || typeof url !== 'string') return;
        // If it's a source.unsplash dynamic URL, replace directly with picsum to avoid redirects
        if (/source\.unsplash\.com/i.test(url)) {
          const newUrl = picsumFor(name);
          if (newUrl !== url) {
            replaced.push({ name, oldUrl: url, newUrl });
            FOOD_IMAGE_MAP[name] = newUrl;
          }
          return;
        }

        // Try to see if URL is reachable and is an image
        const ok = await isImageUrlReachable(url, 5000);
        if (!ok) {
          // Replace unreachable URLs with picsum
          const newUrl = picsumFor(name);
          replaced.push({ name, oldUrl: url, newUrl });
          FOOD_IMAGE_MAP[name] = newUrl;
        }
      } catch (e) {
        // On error, replace with picsum
        const newUrl = picsumFor(name);
        replaced.push({ name, oldUrl: url, newUrl });
        FOOD_IMAGE_MAP[name] = newUrl;
      }
    })));

    // Persist updated map
    try {
      fs.writeFileSync(FOOD_IMAGE_MAP_PATH, JSON.stringify(FOOD_IMAGE_MAP, null, 2), 'utf8');
    } catch (e) {
      console.warn('Failed to persist fixed foodImageMap.json:', e?.message || e);
    }

    return res.json({ total: entries.length, updated: replaced.length, replaced });
  } catch (e) {
    console.error('Error in /api/fix-mapped-urls:', e);
    return res.status(500).json({ error: e?.message || 'failed' });
  }
});

// Admin: validate mapped URLs and replace unstable/failed ones with a stable fallback (picsum)
app.post('/api/fix-mapped-urls', async (req, res) => {
  try {
    const entries = Object.entries(FOOD_IMAGE_MAP || {});
    if (!entries.length) return res.json({ total: 0, updated: 0, skipped: 0 });

    const headers = {
      'User-Agent': process.env.FETCH_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': 'image/*,*/*;q=0.8'
    };

    let updated = 0, skipped = 0;
    for (const [name, url] of entries) {
      try {
        // Quick HEAD check
        let ok = false;
        try {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(url, { method: 'HEAD', headers, signal: controller.signal, redirect: 'follow' });
          clearTimeout(id);
          ok = resp.ok;
        } catch (e) {
          // HEAD may be blocked; try GET with small range
          try {
            const controller2 = new AbortController();
            const id2 = setTimeout(() => controller2.abort(), 7000);
            const resp2 = await fetch(url, { method: 'GET', headers, signal: controller2.signal, redirect: 'follow' });
            clearTimeout(id2);
            ok = resp2.ok;
          } catch (e2) {
            ok = false;
          }
        }

        if (!ok) {
          // Replace with stable fallback
          const fallback = normalizeMappedUrl(url, name) || normalizeMappedUrl(url, url);
          if (fallback && fallback !== url) {
            FOOD_IMAGE_MAP[name] = fallback;
            updated += 1;
          } else {
            skipped += 1;
          }
        } else {
          skipped += 1;
        }
      } catch (e) {
        skipped += 1;
      }
    }

    // persist changes if any
    if (updated > 0) {
      try {
        fs.writeFileSync(FOOD_IMAGE_MAP_PATH, JSON.stringify(FOOD_IMAGE_MAP, null, 2), 'utf8');
      } catch (e) {
        console.warn('Failed to persist fixed foodImageMap.json:', e?.message || e);
      }
    }

    return res.json({ total: entries.length, updated, skipped });
  } catch (e) {
    console.error('Error in /api/fix-mapped-urls:', e);
    return res.status(500).json({ error: e?.message || 'failed' });
  }
});


// Health route
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', backend: true });
});

// Check if a cached image exists for a given dish name (or mapped URL)
app.get('/api/has-image', async (req, res) => {
  try {
    const nameRaw = (req.query.name || req.query.q || '').toString();
    if (!nameRaw) return res.status(400).json({ error: 'Missing name query param' });
    const name = nameRaw.trim().toLowerCase();

    // First check generated hash for name (recipeKey)
    const recipeKey = hashKey(name);
    const pngPath = path.join(IMAGE_CACHE_DIR, `${recipeKey}.png`);
    if (fs.existsSync(pngPath)) {
      const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
      return res.json({ found: true, type: 'generated', localUrl: `${baseUrl}/images/${recipeKey}.png` });
    }

    // Next check mapped URL entry
    const mappedUrl = FOOD_IMAGE_MAP[name];
    if (mappedUrl) {
      const mappedKey = hashKey('mapped|' + mappedUrl);
      const mappedPng = path.join(IMAGE_CACHE_DIR, `${mappedKey}.png`);
      if (fs.existsSync(mappedPng)) {
        const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
        return res.json({ found: true, type: 'mapped', localUrl: `${baseUrl}/images/${mappedKey}.png`, originalUrl: mappedUrl });
      }
      // If mapped exists but not cached yet, return that we know the mapping but not cached
      return res.json({ found: false, type: 'mapped-known', originalUrl: mappedUrl });
    }

    // No known image
    return res.json({ found: false });
  } catch (e) {
    console.error('Error in /api/has-image:', e);
    return res.status(500).json({ error: e?.message || 'failed' });
  }
});

// Ensure and force caching of mapped image for a given dish name.
app.post('/api/ensure-mapped-image', async (req, res) => {
  try {
    const nameRaw = (req.body && req.body.name) || req.query.name || '';
    if (!nameRaw) return res.status(400).json({ error: 'Missing name in body or query' });
    const name = String(nameRaw).trim().toLowerCase();

    const mappedUrl = FOOD_IMAGE_MAP[name];
    if (!mappedUrl) return res.status(404).json({ error: 'No mapped URL for this name' });

    const mappedKey = hashKey('mapped|' + mappedUrl);
    const ok = await fetchAndCacheExternalImage(mappedUrl, mappedKey, name);
    if (ok) {
      const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
      return res.json({ ok: true, localUrl: `${baseUrl}/images/${mappedKey}.png`, mappedUrl });
    }

    // Try picsum fallback and cache it
    try {
      const fallback = picsumFor(name || mappedUrl);
      const fallbackOk = await fetchAndCacheExternalImage(fallback, mappedKey, name);
      if (fallbackOk) {
        const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
        // persist stable fallback in map
        FOOD_IMAGE_MAP[name] = fallback;
        try { fs.writeFileSync(FOOD_IMAGE_MAP_PATH, JSON.stringify(FOOD_IMAGE_MAP, null, 2), 'utf8'); } catch (e) {}
        return res.json({ ok: true, localUrl: `${baseUrl}/images/${mappedKey}.png`, mappedUrl: fallback, fallback: true });
      }
    } catch (e) {
      // ignore
    }

    // As last resort, write placeholder so UI has an image file
    await writeImageFiles(mappedKey, PLACEHOLDER_BASE64);
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    return res.json({ ok: true, localUrl: `${baseUrl}/images/${mappedKey}.png`, placeholder: true });
  } catch (e) {
    console.error('Error in /api/ensure-mapped-image:', e);
    return res.status(500).json({ error: e?.message || 'failed' });
  }
});

// Start server with retry if port is already in use (avoid immediate crash)
const startServer = (port, attemptsLeft = 5) => {
  try {
    const srv = app.listen(port, () => {
      PORT = port; // update runtime PORT so other code uses correct value
      console.log(`Backend proxy server listening on http://localhost:${port}`);
    });

    srv.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.warn(`Port ${port} in use. ${attemptsLeft - 1} attempts remaining.`);
        srv.close?.();
        if (attemptsLeft > 1) {
          // try next port
          startServer(port + 1, attemptsLeft - 1);
        } else {
          console.error(`Failed to bind to a port after multiple attempts. Please free port ${port} or set PORT env variable.`);
          process.exit(1);
        }
      } else {
        console.error('Server error:', err);
        process.exit(1);
      }
    });
  } catch (e) {
    if (attemptsLeft > 1) {
      console.warn(`Error starting server on port ${port}:`, e?.message || e, 'Trying next port...');
      startServer(port + 1, attemptsLeft - 1);
    } else {
      console.error('Could not start server:', e);
      process.exit(1);
    }
  }
};

startServer(PORT, 6);

// Auto-cache mapped external images on startup (best-effort, non-blocking)
// Default to enabled auto-cache on startup so mapped images are fetched and cached locally.
// Set AUTO_CACHE_ON_STARTUP=false to disable if desired.
const AUTO_CACHE_ON_STARTUP = (process.env.AUTO_CACHE_ON_STARTUP || 'true').toLowerCase() === 'true';
async function cacheAllMappedImages() {
  try {
    const entries = Object.entries(FOOD_IMAGE_MAP || {});
    if (!entries.length) {
      console.log('Auto-cache: no mapped images found to cache.');
      return;
    }
    // Cap the number of auto-cache items to avoid huge startup runs
    const AUTO_CACHE_MAX = Math.max(0, parseInt(process.env.AUTO_CACHE_MAX || '1000', 10));
    let toProcess = entries;
    if (AUTO_CACHE_MAX > 0 && entries.length > AUTO_CACHE_MAX) {
      console.log(`Auto-cache: entries count ${entries.length} exceeds AUTO_CACHE_MAX=${AUTO_CACHE_MAX}. Only processing first ${AUTO_CACHE_MAX}.`);
      toProcess = entries.slice(0, AUTO_CACHE_MAX);
    }
    const concurrency = parseInt(process.env.CACHE_CONCURRENCY || '5', 10);
    const limiter = pLimit(concurrency);
    console.log(`Auto-cache: starting to fetch ${toProcess.length} mapped images with concurrency=${concurrency}`);
    const results = [];
    await Promise.all(toProcess.map(([name, url]) => limiter(async () => {
      try {
        const key = hashKey('mapped|' + url);
        const ok = await fetchAndCacheExternalImage(url, key, name);
        results.push({ name, url, key, ok });
      } catch (e) {
        results.push({ name, url, ok: false, error: e?.message || e });
      }
    })));
    const success = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    console.log(`Auto-cache completed: ${success}/${results.length} succeeded, ${failed} failed.`);
    if (failed > 0) console.log('Auto-cache failed entries:', results.filter(r => !r.ok).map(r => ({ name: r.name, url: r.url })));
  } catch (e) {
    console.error('Auto-cache encountered an error:', e);
  }
}

if (AUTO_CACHE_ON_STARTUP) {
  // Run after a short delay to allow server to fully initialize
  setTimeout(() => {
    cacheAllMappedImages().catch((err) => console.error('Auto-cache failed:', err));
  }, 1000);
} else {
  console.log('Auto-cache on startup disabled (AUTO_CACHE_ON_STARTUP=false).');
}
