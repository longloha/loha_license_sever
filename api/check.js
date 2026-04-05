const { kv } = require('@vercel/kv');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { key, machine_id, version } = req.body || {};
  if (!key || !machine_id) {
    return res.status(400).json({ valid: false, message: 'Thieu key hoac machine_id' });
  }

  try {
    const keyData = await kv.get('license:' + key);
    if (!keyData) {
      return res.json({ valid: false, message: 'Key khong ton tai' });
    }

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
      await kv.set('license:' + key, keyData);
    }

    const daysLeft = Math.ceil((expire - now) / (1000 * 60 * 60 * 24));
    return res.json({ valid: true, message: 'OK', expire: keyData.expire, days_left: daysLeft });
  } catch (error) {
    console.error('License check error:', error);
    return res.status(500).json({ valid: false, message: 'Server error' });
  }
};
