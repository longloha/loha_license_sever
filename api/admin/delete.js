const { kv } = require('@vercel/kv');
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'loha-admin-secret';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer ' + ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { key } = req.body || {};
  if (!key) return res.status(400).json({ error: 'Thieu key' });

  await kv.del('license:' + key);
  return res.json({ success: true, deleted: key });
};
