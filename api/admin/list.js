const { Redis } = require('@upstash/redis');
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'loha-admin-secret';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer ' + ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const keys = await redis.keys('license:*');
    const allKeys = [];
    for (const k of keys) {
      const raw = await redis.get(k);
      allKeys.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
    }
    return res.json({ total: allKeys.length, keys: allKeys });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
