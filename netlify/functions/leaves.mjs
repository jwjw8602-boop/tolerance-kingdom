import { getStore } from '@netlify/blobs';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const reply = (statusCode, value) => ({ statusCode, headers: HEADERS, body: JSON.stringify(value) });
const storeName = 'tolerance-leaves-v1';

export async function handler(event) {
  try {
    const store = getStore({ name: storeName, consistency: 'strong' });
    if (event.httpMethod === 'GET') {
      const entries = [];
      let cursor;
      do {
        const page = await store.list({ prefix: 'leaf-', ...(cursor ? { cursor } : {}) });
        const batch = await Promise.all(page.blobs.map(item => store.get(item.key, { type: 'json' })));
        for (const value of batch) if (value && typeof value.name === 'string') entries.push(value);
        cursor = page.paginate ? page.cursor : undefined;
      } while (cursor && entries.length < 1000);
      entries.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      return reply(200, { entries });
    }
    if (event.httpMethod !== 'POST') return reply(405, { error: 'طريقة الطلب غير مدعومة' });
    if ((event.body || '').length > 4000) return reply(413, { error: 'الرسالة طويلة جدًا' });
    let data;
    try { data = JSON.parse(event.body || '{}'); } catch { return reply(400, { error: 'بيانات غير صحيحة' }); }
    const name = String(data.name || '').trim().replace(/\s+/g, ' ');
    const message = String(data.message || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 60 || message.length < 5 || message.length > 400) {
      return reply(400, { error: 'اكتبي اسمًا من 2 إلى 60 حرفًا ورسالة من 5 إلى 400 حرف' });
    }
    const entry = { name, message, createdAt: new Date().toISOString() };
    const id = `leaf-${Date.now()}-${crypto.randomUUID()}`;
    await store.setJSON(id, entry);
    return reply(201, { entry });
  } catch (error) {
    console.error('Tolerance leaves function failed:', error);
    return reply(500, { error: 'تعذر حفظ المشاركة على الخادم. تأكدي من إعداد Netlify Blobs.' });
  }
}
