const { Redis } = require('@upstash/redis');
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'loha-admin-secret';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer ' + ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const { key, expire, phone, features } = req.body || {};
  if (!key || !expire) return res.status(400).json({ error: 'Thieu key hoac expire' });

  // features: array of enabled tools, e.g. ["veo3"], ["grok"], ["veo3","grok"]
  // Default to ["veo3"] for backward compatibility
  const enabledFeatures = Array.isArray(features) && features.length > 0
    ? features
    : ['veo3'];

  const keyData = {
    key,
    expire,
    phone: phone || '',
    features: enabledFeatures,
    created_at: new Date().toISOString(),
  };
  await redis.set('license:' + key, JSON.stringify(keyData));
  return res.json({ success: true, key: keyData });
};
