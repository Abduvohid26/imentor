/**
 * Fan katalogi (admin course syllabuses) FastAPI smoke.
 *
 *   npx tsx scripts/smoke-syllabus-catalog.mts
 *   API=https://imentor.devflix.uz/api npx tsx scripts/smoke-syllabus-catalog.mts
 */
const API = (process.env.API || 'https://imentor.devflix.uz/api').replace(/\/$/, '');
const ADMIN_PHONE = process.env.PHONE || '998901110001';
const ADMIN_PASS = process.env.PASS || 'AdminDemo123';
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
      throw new Error(`${method} ${path} → ${res.status} expected ${JSON.stringify(opts.expect)}: ${text.slice(0, 400)}`);
    }
  }
  return { status: res.status, body };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function results(body: unknown): Json[] {
  if (Array.isArray(body)) return body as Json[];
  if (body && typeof body === 'object' && Array.isArray((body as Json).results)) {
    return (body as Json).results as Json[];
  }
  return [];
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
    body: { phone_digits: ADMIN_PHONE, password: ADMIN_PASS, role: 'admin' },
    expect: 200,
  });
  const token = String((login.body as Json).access || '');
  assert(token, 'admin token');

  const stats = await req('GET', '/v1/admin/course-syllabuses/stats/', { token, expect: 200 });
  assert(typeof (stats.body as Json).subjects_count === 'number', 'stats.subjects_count');
  console.log(
    `ok stats subjects=${(stats.body as Json).subjects_count} variants=${(stats.body as Json).variants_count}`,
  );

  const list = await req('GET', '/v1/admin/course-syllabuses/?page_size=1000', { token, expect: 200 });
  const count = Number((list.body as Json).count ?? results(list.body).length);
  const pageRows = results(list.body).length;
  assert(pageRows === count || pageRows >= Math.min(count, 1000), `list incomplete: got ${pageRows} of ${count}`);
  console.log(`ok admin list count=${count} returned=${pageRows}`);

  const tag = `smoke-${Date.now().toString(36)}`;
  const created = await req('POST', '/v1/admin/course-syllabuses/', {
    token,
    expect: 201,
    body: {
      subject_name: `Smoke Fan ${tag}`,
      description: 'smoke catalog',
      variants: [
        {
          label: 'XT',
          file_name: 'xt.pdf',
          topics: [{ title: 'Mavzu 1', type: 'lecture' }],
        },
      ],
    },
  });
  const id = Number((created.body as Json).id);
  assert(id > 0, 'created id');
  console.log(`ok create id=${id}`);

  const patched = await req('PATCH', `/v1/admin/course-syllabuses/${id}/`, {
    token,
    expect: 200,
    body: { subject_name: `Smoke Fan Edited ${tag}`, description: 'edited' },
  });
  assert(String((patched.body as Json).subject_name).includes('Edited'), 'name patched');
  console.log('ok patch');

  const appended = await req('PATCH', `/v1/admin/course-syllabuses/${id}/`, {
    token,
    expect: 200,
    body: {
      append_variants: true,
      variants: [
        {
          label: 'DT',
          file_name: 'dt.pdf',
          topics: [{ title: 'Amaliy 1', type: 'practical' }],
        },
      ],
    },
  });
  const variants = (appended.body as Json).variants as Json[];
  assert(Array.isArray(variants) && variants.length >= 2, 'append variants');
  console.log(`ok append_variants count=${variants.length}`);

  const assigned = await req('POST', '/v1/admin/staff-course-selections/', {
    token,
    expect: 201,
    body: { phone_digits: HODIM_PHONE, syllabus_id: id, variant_labels: ['XT'] },
  });
  assert(Array.isArray(assigned.body) && (assigned.body as Json[]).length >= 1, 'assign');
  const selId = Number((assigned.body as Json[])[0].id);
  console.log(`ok assign selection id=${selId}`);

  const hodimLogin = await req('POST', '/v1/auth/local-login/', {
    body: { phone_digits: HODIM_PHONE, password: HODIM_PASS, role: 'hodim' },
    expect: 200,
  });
  const hodimToken = String((hodimLogin.body as Json).access || '');

  const catalog = await req('GET', '/v1/course-syllabuses/catalog/?page_size=1000', {
    token: hodimToken,
    expect: 200,
  });
  const catCount = Number((catalog.body as Json).count ?? results(catalog.body).length);
  assert(catCount > 0, 'catalog empty');
  console.log(`ok hodim catalog count=${catCount}`);

  const mine = await req('GET', '/v1/course-syllabuses/my/', { token: hodimToken, expect: 200 });
  assert(Array.isArray(mine.body), 'my selections array');
  assert(
    (mine.body as Json[]).some((r) => Number((r.syllabus as Json)?.id) === id),
    'assigned fan my/ da yo‘q',
  );
  console.log(`ok hodim my selections=${(mine.body as Json[]).length}`);

  await req('DELETE', `/v1/admin/staff-course-selections/${selId}/`, { token, expect: 204 });
  console.log('ok delete selection');

  await req('DELETE', `/v1/admin/course-syllabuses/${id}/`, { token, expect: 204 });
  console.log('ok delete syllabus');

  const gone = await req('GET', `/v1/admin/course-syllabuses/?page_size=1000`, { token, expect: 200 });
  assert(!results(gone.body).some((r) => Number(r.id) === id), 'syllabus still listed');
  console.log('ok gone from list');

  console.log('\nPASS fan katalogi FastAPI smoke');
}

main().catch((err) => {
  console.error('\nFAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
