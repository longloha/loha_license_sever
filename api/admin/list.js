const { kv } = require('@vercel/kv');
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'loha-admin-secret';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer ' + ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const keys = await kv.keys('license:*');
    const allKeys = [];
    for (const k of keys) {
      const data = await kv.get(k);
      allKeys.push(data);
    }
    return res.json({ total: allKeys.length, keys: allKeys });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
