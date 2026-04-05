// POST /api/check
// Body: { key: "LOHA-XXXX", machine_id: "abc123", version: "1.0.0" }
// Returns: { valid: true/false, message, expire, days_left }

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { key, machine_id, version } = req.body || {};

  if (!key || !machine_id) {
    return res.status(400).json({ valid: false, message: 'Thiếu key hoặc machine_id' });
  }

  try {
    // Get key data from KV
    const keyData = await kv.get(`license:${key}`);

    if (!keyData) {
      return res.json({ valid: false, message: 'Key không tồn tại' });
    }

    // Check expire
    const now = new Date();
    const expire = new Date(keyData.expire);
    if (now > expire) {
      return res.json({ valid: false, message: `Key đã hết hạn (${keyData.expire})` });
    }

    // Check machine binding
    const maxMachines = keyData.max_machines || 1;
    let machines = keyData.machines || [];

    if (!machines.includes(machine_id)) {
      if (machines.length >= maxMachines) {
        return res.json({
          valid: false,
          message: `Key đã được dùng trên ${maxMachines} máy khác`
        });
      }
      // Bind new machine
      machines.push(machine_id);
      keyData.machines = machines;
      await kv.set(`license:${key}`, keyData);
    }

    // Calculate days left
    const daysLeft = Math.ceil((expire - now) / (1000 * 60 * 60 * 24));

    return res.json({
      valid: true,
      message: 'OK',
      expire: keyData.expire,
      days_left: daysLeft,
    });

  } catch (error) {
    console.error('License check error:', error);
    return res.status(500).json({ valid: false, message: 'Server error' });
  }
}
