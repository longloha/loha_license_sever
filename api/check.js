const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { key } = req.body || {};
  if (!key) {
    return res.status(400).json({ valid: false, message: 'Thieu key' });
  }

  try {
    const raw = await redis.get('license:' + key);
    if (!raw) return res.json({ valid: false, message: 'Key khong ton tai' });

    const keyData = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const now = new Date();
    const expire = new Date(keyData.expire);

    if (now > expire) {
      return res.json({ valid: false, message: 'Key da het han (' + keyData.expire + ')' });
    }

    const daysLeft = Math.ceil((expire - now) / 86400000);
    return res.json({ valid: true, message: 'OK', expire: keyData.expire, days_left: daysLeft, phone: keyData.phone || '' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ valid: false, message: 'Server error' });
  }
};
