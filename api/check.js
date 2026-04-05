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

  const { key, machine_id } = req.body || {};
  if (!key || !machine_id) {
    return res.status(400).json({ valid: false, message: 'Thieu key hoac machine_id' });
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

    const maxMachines = keyData.max_machines || 1;
    let machines = keyData.machines || [];
    if (!machines.includes(machine_id)) {
      if (machines.length >= maxMachines) {
        return res.json({ valid: false, message: 'Key da dung tren ' + maxMachines + ' may khac' });
      }
      machines.push(machine_id);
      keyData.machines = machines;
      await redis.set('license:' + key, JSON.stringify(keyData));
    }

    const daysLeft = Math.ceil((expire - now) / 86400000);
    return res.json({ valid: true, message: 'OK', expire: keyData.expire, days_left: daysLeft });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ valid: false, message: 'Server error' });
  }
};
