// POST /api/admin/create
// Headers: { Authorization: "Bearer YOUR_ADMIN_SECRET" }
// Body: { key: "LOHA-XXXX", expire: "2026-12-31", max_machines: 1 }

import { kv } from '@vercel/kv';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'loha-admin-secret-change-me';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth check
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${ADMIN_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { key, expire, max_machines } = req.body || {};

  if (!key || !expire) {
    return res.status(400).json({ error: 'Thiếu key hoặc expire' });
  }

  const keyData = {
    key,
    expire,
    max_machines: max_machines || 1,
    machines: [],
    created_at: new Date().toISOString(),
  };

  await kv.set(`license:${key}`, keyData);

  return res.json({ success: true, key: keyData });
}
