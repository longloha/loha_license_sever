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

  const { key, device_id } = req.body || {};
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

    // Device binding: 1 key = 1 device
    if (device_id) {
      if (!keyData.device_id) {
        // First activation: bind this device
        keyData.device_id = device_id;
        keyData.last_seen = now.toISOString();
        await redis.set('license:' + key, JSON.stringify(keyData));
      } else if (keyData.device_id !== device_id) {
        // Different device: reject
        return res.json({ valid: false, message: 'Key da duoc kich hoat tren may khac' });
      } else {
        // Same device: update last_seen
        keyData.last_seen = now.toISOString();
        await redis.set('license:' + key, JSON.stringify(keyData));
      }
    }

    const daysLeft = Math.ceil((expire - now) / 86400000);

    // Return features (default ["veo3"] for old keys without features field)
    const features = Array.isArray(keyData.features) ? keyData.features : ['veo3'];

    return res.json({
      valid: true,
      message: 'OK',
      expire: keyData.expire,
      days_left: daysLeft,
      phone: keyData.phone || '',
      features: features,
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ valid: false, message: 'Server error' });
  }
};
