/**
 * Creative Brain Analyzer — Static Hosting & Local Proxy
 */

const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const path    = require('path');
const fetch   = require('node-fetch');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /jpeg|jpg|png|gif|webp|mp4|mov|avi|webm/.test(
      path.extname(file.originalname).toLowerCase()
    );
    cb(null, ok);
  },
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── TRIBEv2 API ────────────────────────────────────────────────────────────

const TRIBE_BASE   = 'https://janrudolph-tribe-v2-api.hf.space';
const API_TIMEOUT  = 28000;

async function callTribeAPI(text) {
  try {
    // Quick health check
    const hRes = await fetch(`${TRIBE_BASE}/health`, { timeout: 6000 });
    const health = await hRes.json().catch(() => ({}));
    if (!health.model_loaded) {
      if (health.status === 'loading') {
        await new Promise(r => setTimeout(r, 5000));
        const h2 = await (await fetch(`${TRIBE_BASE}/health`, { timeout: 6000 })).json().catch(() => ({}));
        if (!h2.model_loaded) return null;
      } else return null;
    }

    const pRes = await fetch(`${TRIBE_BASE}/predict`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text }),
      timeout: API_TIMEOUT,
    });

    if (!pRes.ok) return null;
    const data = await pRes.json();

    if (data.status === 'ok' && data.scores) {
      return {
        scores: {
          emotional_engagement:   data.scores.emotional_valence  / 100,
          visual_attention:       data.scores.visual_imagery     / 100,
          auditory_processing:    0.3 + (data.scores.attention_capture        / 100) * 0.5,
          memory_encoding:        0.3 + (data.scores.overall_brain_engagement / 100) * 0.5,
          reward_motivation:      data.scores.viral_potential     / 100,
          language_comprehension: data.scores.language_processing / 100,
          social_cognition:       0.3 + (data.scores.overall_brain_engagement / 100) * 0.4,
          overall_impact:         data.scores.overall_brain_engagement / 100,
        },
        timeline:    buildTimeline(data.scores.activation_timeline || []),
        n_timesteps: data.scores.n_timesteps || 8,
        source:      'tribev2_api',
      };
    }
    return null;
  } catch (e) {
    console.log('[TRIBEv2] API error:', e.message);
    return null;
  }
}

function buildTimeline(raw) {
  const keys = ['emotional_engagement','visual_attention','auditory_processing',
                 'memory_encoding','reward_motivation','language_comprehension','social_cognition'];
  const tl = {};
  keys.forEach((k, i) => {
    tl[k] = raw.map((v, t) => Math.min(0.95, Math.max(0.05, v + Math.sin(t * 0.5 + i * 0.7) * 0.15)));
  });
  return tl;
}

// ─── Local demo scoring (clearly labelled "demo") ────────────────────────────

function demoScores(seed, name = '') {
  function sr(s) {
    const h = crypto.createHash('md5').update(s).digest();
    return h.readUInt32BE(0) / 0xFFFFFFFF;
  }
  const n = name.toLowerCase();
  const s = {
    emotional_engagement:   0.45 + sr(seed + 'emo')  * 0.42,
    visual_attention:       0.40 + sr(seed + 'vis')  * 0.48,
    auditory_processing:    0.25 + sr(seed + 'aud')  * 0.38,
    memory_encoding:        0.35 + sr(seed + 'mem')  * 0.42,
    reward_motivation:      0.40 + sr(seed + 'rew')  * 0.43,
    language_comprehension: 0.30 + sr(seed + 'lang') * 0.43,
    social_cognition:       0.35 + sr(seed + 'soc')  * 0.48,
  };
  if (n.includes('video') || n.includes('motion'))   { s.visual_attention += 0.08; s.auditory_processing += 0.12; }
  if (n.includes('face')  || n.includes('people'))   { s.social_cognition  += 0.12; s.emotional_engagement += 0.08; }
  if (n.includes('text')  || n.includes('copy'))     { s.language_comprehension += 0.12; }
  Object.keys(s).forEach(k => { s[k] = Math.min(0.95, Math.max(0.10, s[k])); });
  s.overall_impact = Object.values(s).reduce((a, b) => a + b) / Object.values(s).length;

  const steps = 8 + Math.floor(sr(seed + 'n') * 5);
  const tl = {};
  Object.keys(s).forEach(k => {
    if (k === 'overall_impact') return;
    tl[k] = Array.from({ length: steps }, (_, t) =>
      Math.min(0.95, Math.max(0.05, s[k] + (sr(seed + k + t) - 0.5) * 0.28))
    );
  });
  return { scores: s, timeline: tl, n_timesteps: steps, source: 'demo' };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/analyze', upload.single('creative'), async (req, res) => {
  try {
    const description  = (req.body.description || '').trim();
    const creativeName = req.body.name || 'creative';
    const creativeId   = req.body.id  || crypto.randomUUID();

    console.log(`[Analyze] "${creativeName}" — desc: "${description.slice(0, 60)}"`);

    // Attempt real TRIBEv2 API if we have a meaningful description
    let result = null;
    if (description.length >= 5) {
      result = await callTribeAPI(description);
      if (result) console.log('[Analyze] TRIBEv2 API success');
    }

    // Honest local fallback — clearly tagged as demo in the source field
    if (!result) {
      console.log('[Analyze] TRIBEv2 unavailable — using local demo scoring');
      const seed = req.file
        ? crypto.createHash('md5').update(req.file.buffer).digest('hex')
        : crypto.createHash('md5').update(creativeName + description).digest('hex');
      result = demoScores(seed, creativeName);
    }

    res.json({ status: 'ok', id: creativeId, name: creativeName, ...result });
  } catch (e) {
    console.error('[Analyze] Error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => {
  console.log(`\n🧠  Creative Brain Analyzer → http://localhost:${PORT}\n`);
});
