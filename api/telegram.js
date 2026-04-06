const { Redis } = require('@upstash/redis');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const ADMIN_IDS = (process.env.TELEGRAM_ADMIN_IDS || '').split(',').map(id => id.trim());
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'loha-admin-secret';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId, text, parseMode = 'HTML') {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
  });
}

function generateKey(phone) {
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  const rand2 = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `LOHA-${phone}-${rand}-${rand2}`;
}

function parseFeatures(input) {
  if (!input || input === 'all') return ['veo3', 'grok', 'sora'];
  return input.toLowerCase().split(',').map(f => f.trim()).filter(f => f);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');

  try {
    const { message } = req.body || {};
    if (!message || !message.text) return res.status(200).send('OK');

    const chatId = message.chat.id;
    const userId = String(message.from.id);
    const text = message.text.trim();

    // Auth check
    if (!ADMIN_IDS.includes(userId)) {
      await sendMessage(chatId, '⛔ Bạn không có quyền sử dụng bot này.');
      return res.status(200).send('OK');
    }

    // /start
    if (text === '/start') {
      await sendMessage(chatId,
        '🔑 <b>Loha License Bot</b>\n\n' +
        '📌 Tạo key:\n<code>/key [phone] [days] [features]</code>\n' +
        'VD: <code>/key 0868463198 30 veo3</code>\n' +
        'VD: <code>/key 0868463198 30 veo3,grok</code>\n' +
        'VD: <code>/key 0868463198 30 all</code>\n\n' +
        '📋 Xem keys:\n<code>/list</code> hoặc <code>/list 0868463198</code>\n\n' +
        '🗑 Xoá key:\n<code>/delete LOHA-xxx</code>\n\n' +
        '🔄 Reset device:\n<code>/reset LOHA-xxx</code>'
      );
      return res.status(200).send('OK');
    }

    // /key [phone] [days] [features]
    if (text.startsWith('/key')) {
      const parts = text.split(/\s+/);
      if (parts.length < 3) {
        await sendMessage(chatId, '❌ Sai cú pháp!\n<code>/key [phone] [days] [features]</code>\nVD: <code>/key 0868463198 30 veo3</code>');
        return res.status(200).send('OK');
      }

      const phone = parts[1];
      const days = parseInt(parts[2]) || 30;
      const featuresInput = parts[3] || 'veo3';
      const features = parseFeatures(featuresInput);

      await sendMessage(chatId, `⏳ Đang tạo key cho ${phone} (${days} ngày) — ${features.join(', ')}...`);

      const key = generateKey(phone);
      const expire = new Date();
      expire.setDate(expire.getDate() + days);
      const expireStr = expire.toISOString().split('T')[0];
      const expireDisplay = expire.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: '2-digit' });

      const keyData = {
        key,
        expire: expireStr,
        phone,
        features,
        created_at: new Date().toISOString(),
      };
      await redis.set('license:' + key, JSON.stringify(keyData));

      const featDisplay = features.map(f => f.charAt(0).toUpperCase() + f.slice(1)).join(', ');

      await sendMessage(chatId,
        '✅ Key đã tạo:\n\n' +
        `<code>${key}</code>\n\n` +
        `📞 SĐT: ${phone}\n` +
        `📅 Hết hạn: ${expireDisplay}\n` +
        `🔧 Models: ${featDisplay}`
      );
      return res.status(200).send('OK');
    }

    // /list or /list [phone]
    if (text.startsWith('/list')) {
      const searchPhone = text.split(/\s+/)[1] || '';
      const keys = [];
      let cursor = '0';

      do {
        const result = await redis.scan(cursor, { match: 'license:*', count: 100 });
        cursor = String(result[0]);
        for (const k of result[1]) {
          const raw = await redis.get(k);
          const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (data && data.key) {
            if (!searchPhone || (data.phone && data.phone.includes(searchPhone))) {
              keys.push(data);
            }
          }
        }
      } while (cursor !== '0');

      if (keys.length === 0) {
        await sendMessage(chatId, searchPhone ? `Không tìm thấy key cho SĐT ${searchPhone}` : 'Chưa có key nào.');
        return res.status(200).send('OK');
      }

      // Sort by created_at desc
      keys.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

      let msg = `📋 <b>${keys.length} key(s)</b>${searchPhone ? ' cho ' + searchPhone : ''}:\n\n`;
      for (const k of keys.slice(0, 20)) {
        const now = new Date();
        const exp = new Date(k.expire);
        const status = now > exp ? '🔴' : '🟢';
        const feats = Array.isArray(k.features) ? k.features.join(',') : 'veo3';
        const device = k.device_id ? '📱' : '—';
        msg += `${status} <code>${k.key}</code>\n   📞${k.phone || '-'} | ${feats} | ${k.expire} ${device}\n`;
      }
      if (keys.length > 20) msg += `\n... và ${keys.length - 20} key nữa`;

      await sendMessage(chatId, msg);
      return res.status(200).send('OK');
    }

    // /delete [key]
    if (text.startsWith('/delete')) {
      const keyToDelete = text.split(/\s+/)[1];
      if (!keyToDelete) {
        await sendMessage(chatId, '❌ <code>/delete LOHA-xxx</code>');
        return res.status(200).send('OK');
      }

      const existing = await redis.get('license:' + keyToDelete);
      if (!existing) {
        await sendMessage(chatId, `❌ Key không tồn tại: ${keyToDelete}`);
        return res.status(200).send('OK');
      }

      await redis.del('license:' + keyToDelete);
      await sendMessage(chatId, `🗑 Đã xoá key: <code>${keyToDelete}</code>`);
      return res.status(200).send('OK');
    }

    // /reset [key]
    if (text.startsWith('/reset')) {
      const keyToReset = text.split(/\s+/)[1];
      if (!keyToReset) {
        await sendMessage(chatId, '❌ <code>/reset LOHA-xxx</code>');
        return res.status(200).send('OK');
      }

      const raw = await redis.get('license:' + keyToReset);
      if (!raw) {
        await sendMessage(chatId, `❌ Key không tồn tại: ${keyToReset}`);
        return res.status(200).send('OK');
      }

      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      delete data.device_id;
      delete data.last_seen;
      await redis.set('license:' + keyToReset, JSON.stringify(data));
      await sendMessage(chatId, `🔄 Đã reset device cho: <code>${keyToReset}</code>`);
      return res.status(200).send('OK');
    }

    // Unknown command
    await sendMessage(chatId, '❓ Lệnh không hợp lệ. Gõ /start để xem hướng dẫn.');
    return res.status(200).send('OK');

  } catch (error) {
    console.error('Telegram bot error:', error);
    return res.status(200).send('OK');
  }
};
