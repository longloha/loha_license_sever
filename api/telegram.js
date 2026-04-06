const { Redis } = require('@upstash/redis');
const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const ADMIN_IDS = (process.env.TELEGRAM_ADMIN_IDS || '').split(',').map(id => id.trim());

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

function sendTg(chatId, text) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: '/bot' + BOT_TOKEN + '/sendMessage',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    };
    const req = https.request(options, (r) => {
      let d = '';
      r.on('data', (c) => { d += c; });
      r.on('end', () => { resolve(d); });
    });
    req.on('error', (e) => { console.error('sendTg error:', e); resolve(''); });
    req.write(payload);
    req.end();
  });
}

function genKey(phone) {
  const r1 = Math.random().toString(36).substring(2, 8).toUpperCase();
  const r2 = Math.random().toString(36).substring(2, 7).toUpperCase();
  return 'LOHA-' + phone + '-' + r1 + '-' + r2;
}

function parseFeats(input) {
  if (!input || input === 'all') return ['veo3', 'grok', 'sora'];
  return input.toLowerCase().split(',').map(function(f) { return f.trim(); }).filter(function(f) { return f; });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');

  var body = req.body || {};
  var message = body.message;
  if (!message || !message.text) return res.status(200).send('OK');

  var chatId = message.chat.id;
  var userId = String(message.from.id);
  var text = (message.text || '').trim();

  // Auth
  if (!ADMIN_IDS.includes(userId)) {
    await sendTg(chatId, '⛔ Ban khong co quyen su dung bot nay.');
    return res.status(200).send('OK');
  }

  try {
    // /start
    if (text === '/start') {
      await sendTg(chatId,
        '🔑 <b>Loha License Bot</b>\n\n' +
        '📌 Tao key:\n<code>/key [phone] [days] [features]</code>\n' +
        'VD: <code>/key 0868463198 30 veo3</code>\n' +
        'VD: <code>/key 0868463198 30 veo3,grok</code>\n' +
        'VD: <code>/key 0868463198 30 all</code>\n\n' +
        '📋 Xem keys: <code>/list</code> hoac <code>/list 0868463198</code>\n' +
        '🗑 Xoa key: <code>/delete LOHA-xxx</code>\n' +
        '🔄 Reset device: <code>/reset LOHA-xxx</code>'
      );
      return res.status(200).send('OK');
    }

    // /key [phone] [days] [features]
    if (text.startsWith('/key')) {
      var parts = text.split(/\s+/);
      if (parts.length < 3) {
        await sendTg(chatId, '❌ Sai cu phap!\n<code>/key [phone] [days] [features]</code>\nVD: <code>/key 0868463198 30 veo3</code>');
        return res.status(200).send('OK');
      }

      var phone = parts[1];
      var days = parseInt(parts[2]) || 30;
      var featInput = parts[3] || 'veo3';
      var features = parseFeats(featInput);

      await sendTg(chatId, '⏳ Dang tao key cho ' + phone + ' (' + days + ' ngay) — ' + features.join(', ') + '...');

      var key = genKey(phone);
      var expire = new Date();
      expire.setDate(expire.getDate() + days);
      var expireStr = expire.toISOString().split('T')[0];
      var expireDisplay = expire.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: '2-digit' });

      var keyData = { key: key, expire: expireStr, phone: phone, features: features, created_at: new Date().toISOString() };
      await redis.set('license:' + key, JSON.stringify(keyData));

      var featDisplay = features.map(function(f) { return f.charAt(0).toUpperCase() + f.slice(1); }).join(', ');

      await sendTg(chatId,
        '✅ Key da tao:\n\n' +
        '<code>' + key + '</code>\n\n' +
        '📞 SDT: ' + phone + '\n' +
        '📅 Het han: ' + expireDisplay + '\n' +
        '🔧 Models: ' + featDisplay
      );
      return res.status(200).send('OK');
    }

    // /list or /list [phone]
    if (text.startsWith('/list')) {
      var searchPhone = (text.split(/\s+/)[1]) || '';
      var keys = [];
      var cursor = '0';

      do {
        var result = await redis.scan(cursor, { match: 'license:*', count: 100 });
        cursor = String(result[0]);
        for (var i = 0; i < result[1].length; i++) {
          var raw = await redis.get(result[1][i]);
          var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (data && data.key) {
            if (!searchPhone || (data.phone && data.phone.includes(searchPhone))) {
              keys.push(data);
            }
          }
        }
      } while (cursor !== '0');

      if (keys.length === 0) {
        await sendTg(chatId, searchPhone ? 'Khong tim thay key cho SDT ' + searchPhone : 'Chua co key nao.');
        return res.status(200).send('OK');
      }

      keys.sort(function(a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); });

      var msg = '📋 <b>' + keys.length + ' key(s)</b>' + (searchPhone ? ' cho ' + searchPhone : '') + ':\n\n';
      var show = keys.slice(0, 20);
      for (var i = 0; i < show.length; i++) {
        var k = show[i];
        var now = new Date();
        var exp = new Date(k.expire);
        var status = now > exp ? '🔴' : '🟢';
        var feats = Array.isArray(k.features) ? k.features.join(',') : 'veo3';
        var device = k.device_id ? '📱' : '—';
        msg += status + ' <code>' + k.key + '</code>\n   📞' + (k.phone || '-') + ' | ' + feats + ' | ' + k.expire + ' ' + device + '\n';
      }
      if (keys.length > 20) msg += '\n... va ' + (keys.length - 20) + ' key nua';

      await sendTg(chatId, msg);
      return res.status(200).send('OK');
    }

    // /delete [key]
    if (text.startsWith('/delete')) {
      var keyToDel = (text.split(/\s+/)[1]) || '';
      if (!keyToDel) {
        await sendTg(chatId, '❌ <code>/delete LOHA-xxx</code>');
        return res.status(200).send('OK');
      }
      var existing = await redis.get('license:' + keyToDel);
      if (!existing) {
        await sendTg(chatId, '❌ Key khong ton tai: ' + keyToDel);
        return res.status(200).send('OK');
      }
      await redis.del('license:' + keyToDel);
      await sendTg(chatId, '🗑 Da xoa key: <code>' + keyToDel + '</code>');
      return res.status(200).send('OK');
    }

    // /reset [key]
    if (text.startsWith('/reset')) {
      var keyToReset = (text.split(/\s+/)[1]) || '';
      if (!keyToReset) {
        await sendTg(chatId, '❌ <code>/reset LOHA-xxx</code>');
        return res.status(200).send('OK');
      }
      var raw2 = await redis.get('license:' + keyToReset);
      if (!raw2) {
        await sendTg(chatId, '❌ Key khong ton tai: ' + keyToReset);
        return res.status(200).send('OK');
      }
      var data2 = typeof raw2 === 'string' ? JSON.parse(raw2) : raw2;
      delete data2.device_id;
      delete data2.last_seen;
      await redis.set('license:' + keyToReset, JSON.stringify(data2));
      await sendTg(chatId, '🔄 Da reset device cho: <code>' + keyToReset + '</code>');
      return res.status(200).send('OK');
    }

    await sendTg(chatId, '❓ Lenh khong hop le. Go /start de xem huong dan.');
    return res.status(200).send('OK');

  } catch (err) {
    console.error('Bot error:', err);
    await sendTg(chatId, '❌ Loi server: ' + (err.message || err));
    return res.status(200).send('OK');
  }
};
