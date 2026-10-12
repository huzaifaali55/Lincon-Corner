/* ==================================================
   mailer.js — WhatsApp Cloud API Notification
   ================================================== */

// ⬅️ YAHAN: Render env vars se aayenge — kuch change nahi karna
const WHATSAPP_TOKEN    = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

// ⬅️ YAHAN: Admin numbers (country code ke saath, comma separated)
const ADMIN_NUMBERS = (process.env.WHATSAPP_ADMIN_NUMBERS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// ⬅️ YAHAN: Meta mein jo Template banaya uska naam aur language
const TEMPLATE_NAME = 'new_complaint_alert';
const TEMPLATE_LANG = 'en';

async function sendComplaintWhatsApp(complaint) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.warn('⚠️ WhatsApp credentials missing — notification skip ki gayi');
    return;
  }

  if (ADMIN_NUMBERS.length === 0) {
    console.warn('⚠️ Koi admin number set nahi hai');
    return;
  }

  for (const to of ADMIN_NUMBERS) {
    try {
      const url = `https://graph.facebook.com/v22.0/${WHATSAPP_PHONE_ID}/messages`;

      const body = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'template',
        template: {
          name: TEMPLATE_NAME,
          language: { code: TEMPLATE_LANG },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: String(complaint.id) },
                { type: 'text', text: complaint.corner || 'Unknown' },
                { type: 'text', text: complaint.item_name_raw || 'Unknown' },
                { type: 'text', text: (complaint.description || '').slice(0, 100) },
                { type: 'text', text: complaint.priority || 'Normal' }
              ]
            }
          ]
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('❌ WhatsApp error for', to, ':', JSON.stringify(data));
      } else {
        console.log('📱 WhatsApp sent to', to, '→', data.messages?.[0]?.id);
      }

    } catch (err) {
      console.error('❌ WhatsApp send failed to', to, ':', err.message);
    }
  }
}

module.exports = { sendComplaintWhatsApp };