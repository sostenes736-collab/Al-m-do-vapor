/**
 * Além do Vapor - endpoint de envio institucional
 * Cloudflare Worker + Turnstile + Resend.
 * Não grava relatos em banco nem registra o conteúdo em logs.
 */
const MAX_BODY_BYTES = 8192;
const MAX_PLACE = 100;
const MAX_DETAILS = 600;

function corsHeaders(origin, allowedOrigin) {
  return {
    'Access-Control-Allow-Origin': origin === allowedOrigin ? allowedOrigin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors }
  });
}

function validDate(value) {
  return value === '' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
function validTime(value) {
  return value === '' || (typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value));
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.PUBLIC_SITE_ORIGIN || '';
    const cors = corsHeaders(origin, allowedOrigin);

    if (!allowedOrigin || origin !== allowedOrigin) return json({ ok: false, message: 'Origem não autorizada.' }, 403, cors);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/submit') {
      return json({ ok: false, message: 'Rota não encontrada.' }, 404, cors);
    }
    if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      return json({ ok: false, message: 'Formato inválido.' }, 415, cors);
    }
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > MAX_BODY_BYTES) return json({ ok: false, message: 'Conteúdo muito grande.' }, 413, cors);

    let body;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json({ ok: false, message: 'Conteúdo muito grande.' }, 413, cors);
      body = JSON.parse(raw);
    } catch (_) {
      return json({ ok: false, message: 'Solicitação inválida.' }, 400, cors);
    }

    const place = typeof body.place === 'string' ? body.place.trim() : '';
    const details = typeof body.details === 'string' ? body.details.trim() : '';
    const date = typeof body.date === 'string' ? body.date : '';
    const time = typeof body.time === 'string' ? body.time : '';
    const token = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
    if (!place || place.length > MAX_PLACE || !details || details.length > MAX_DETAILS ||
        !validDate(date) || !validTime(time) || !token ||
        Object.keys(body).some(k => !['place', 'details', 'date', 'time', 'turnstileToken'].includes(k))) {
      return json({ ok: false, message: 'Revise os campos do formulário.' }, 400, cors);
    }
    if (!env.TURNSTILE_SECRET_KEY || !env.RESEND_API_KEY || !env.RECIPIENT_EMAIL || !env.FROM_EMAIL) {
      return json({ ok: false, message: 'Canal institucional indisponível.' }, 503, cors);
    }

    // Verifica o desafio anti-bot. O token é de uso único e não é armazenado.
    let challenge;
    try {
      const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token })
      });
      challenge = await verify.json();
    } catch (_) {
      return json({ ok: false, message: 'Não foi possível validar a segurança.' }, 502, cors);
    }
    if (!challenge.success || (challenge.hostname && challenge.hostname !== 'sostenes736-collab.github.io')) {
      return json({ ok: false, message: 'Verificação de segurança inválida. Tente novamente.' }, 400, cors);
    }

    const plainText = [
      'NOVO RELATO — ALÉM DO VAPOR',
      '',
      `Local informado: ${place}`,
      `Data aproximada: ${date || 'Não informada'}`,
      `Horário aproximado: ${time || 'Não informado'}`,
      '',
      'Descrição enviada pelo formulário:',
      details,
      '',
      'Orientação: avaliar conforme o protocolo da instituição. Não responder ao estudante por este e-mail sem seguir o procedimento interno.'
    ].join('\n');

    // Destinatário e remetente são definidos somente no ambiente privado do Worker.
    try {
      const mail = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.FROM_EMAIL,
          to: [env.RECIPIENT_EMAIL],
          subject: 'Novo relato recebido pelo Além do Vapor',
          text: plainText
        })
      });
      if (!mail.ok) return json({ ok: false, message: 'O serviço de e-mail não confirmou o envio.' }, 502, cors);
    } catch (_) {
      return json({ ok: false, message: 'Não foi possível concluir o envio.' }, 502, cors);
    }

    return json({ ok: true }, 200, cors);
  }
};
