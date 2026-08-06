/**
 * Hodim test create oqimi — FastAPI smoke (eski localStorage yo'li emas).
 *
 *   npx tsx scripts/smoke-test-create.mts
 *   API=https://imentor.devflix.uz/api npx tsx scripts/smoke-test-create.mts
 *   API=http://127.0.0.1:9050/api npx tsx scripts/smoke-test-create.mts
 */
const API = (process.env.API || 'https://imentor.devflix.uz/api').replace(/\/$/, '');
const HODIM_PHONE = process.env.HODIM_PHONE || '998901112233';
const HODIM_PASS = process.env.HODIM_PASS || 'TestHodim123';

type Json = Record<string, unknown>;

async function req(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; expect?: number | number[] } = {},
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (opts.expect !== undefined) {
    const ok = Array.isArray(opts.expect) ? opts.expect.includes(res.status) : res.status === opts.expect;
    if (!ok) {
      throw new Error(
        `${method} ${path} → ${res.status} expected ${JSON.stringify(opts.expect)}: ${text.slice(0, 400)}`,
      );
    }
  }
  return { status: res.status, body };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log(`API=${API}`);

  const bad = await req('POST', '/v1/auth/local-login/', {
    body: { phone_digits: '998', password: 'x' },
  });
  const fp = JSON.stringify(bad.body);
  if (fp.includes('Ensure this field') || fp.includes('Ushbu maydon')) {
    throw new Error('Host Django — FastAPI gateway kerak');
  }
  console.log('ok stack=FastAPI');

  const login = await req('POST', '/v1/auth/local-login/', {
    body: { phone_digits: HODIM_PHONE, password: HODIM_PASS, role: 'hodim' },
    expect: 200,
  });
  const token = String((login.body as Json).access || '');
  assert(token, 'hodim token');

  const mineBefore = await req('GET', '/v1/prepared-content/mine/?kind=test&page_size=5', {
    token,
    expect: 200,
  });
  assert(typeof (mineBefore.body as Json).count === 'number', 'mine.count');
  console.log(`ok mine count=${(mineBefore.body as Json).count}`);

  const br = await req('POST', '/v1/education-ai/book-references/', {
    token,
    body: { subject_code: 'fiziologiya', queries: ['membran potentsiali', 'yurak'], top_k: 2 },
    expect: 200,
  });
  assert(Array.isArray((br.body as Json).results), 'book-references.results');
  console.log(
    `ok book-references queries=${((br.body as Json).results as unknown[]).length}`,
  );

  const tag = `smoke-test-${Date.now().toString(36)}`;
  const payload = {
    kind: 'test',
    topic: tag,
    subject_name: 'Normal fiziologiya',
    subject_code: 'fiziologiya__normal-fiziologiya',
    payload: {
      topic: tag,
      primaryLanguage: 'uz',
      questions: [
        {
          question: 'Smoke savol?',
          options: ['a', 'b', 'c', 'd', 'e'],
          correctOptionIndex: 0,
          explanation: 'Asos',
          optionExplanations: ['1', '2', '3', '4', '5'],
        },
      ],
      translations: {
        ru: {
          topic: tag,
          questions: [
            {
              question: 'Smoke вопрос?',
              options: ['a', 'b', 'c', 'd', 'e'],
              correctOptionIndex: 0,
              explanation: 'Основание',
              optionExplanations: ['1', '2', '3', '4', '5'],
            },
          ],
        },
        en: {
          topic: tag,
          questions: [
            {
              question: 'Smoke question?',
              options: ['a', 'b', 'c', 'd', 'e'],
              correctOptionIndex: 0,
              explanation: 'Basis',
              optionExplanations: ['1', '2', '3', '4', '5'],
            },
          ],
        },
      },
    },
  };

  const created = await req('POST', '/v1/prepared-content/', {
    token,
    body: payload,
    expect: 201,
  });
  const id = Number((created.body as Json).id);
  assert(id > 0, 'prepared-content id');
  console.log(`ok prepared-content id=${id}`);

  const detail = await req('GET', `/v1/prepared-content/${id}/`, { token, expect: 200 });
  const detailPayload = (detail.body as Json).payload as Json;
  assert(detailPayload?.primaryLanguage === 'uz', 'primaryLanguage');
  assert(
    Boolean((detailPayload?.translations as Json)?.ru) && Boolean((detailPayload?.translations as Json)?.en),
    '3-lang translations saqlanmagan',
  );
  console.log('ok 3-lang payload (uz+ru+en)');

  const live = await req('POST', '/v1/live-tests/', {
    token,
    body: {
      topic: tag,
      questions: (detailPayload.questions as unknown[]) || [],
      created_at_ms: Date.now(),
    },
    expect: 200,
  });
  const sessionKey = String((live.body as Json).session_key || '');
  assert(sessionKey.startsWith('lts_') || sessionKey.length > 8, 'session_key');
  console.log(`ok live-tests session_key=${sessionKey}`);

  const pub = await req('GET', `/v1/live-tests/${encodeURIComponent(sessionKey)}/`, { expect: 200 });
  assert(String((pub.body as Json).topic || '') === tag, 'public topic');
  console.log('ok live-tests public get');

  await req('DELETE', `/v1/prepared-content/${id}/`, { token, expect: [204, 200] });
  console.log('ok cleanup prepared-content');

  console.log('\nPASS test create FastAPI smoke');
}

main().catch((err) => {
  console.error('\nFAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
