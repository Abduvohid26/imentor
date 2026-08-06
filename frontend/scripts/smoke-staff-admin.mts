/**
 * Xodimlar (admin staff) oqimini FastAPI bo'yicha smoke-test.
 *
 *   npx tsx scripts/smoke-staff-admin.mts
 *   API=https://imentor.devflix.uz/api PHONE=998901110001 PASS=AdminDemo123 npx tsx scripts/smoke-staff-admin.mts
 */
const API = (process.env.API || 'https://imentor.devflix.uz/api').replace(/\/$/, '');
const ADMIN_PHONE = process.env.PHONE || '998901110001';
const ADMIN_PASS = process.env.PASS || 'AdminDemo123';
const TEST_PHONE = process.env.TEST_PHONE || `99890${String(Date.now()).slice(-7)}`;

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
  const expect = opts.expect;
  if (expect !== undefined) {
    const ok = Array.isArray(expect) ? expect.includes(res.status) : res.status === expect;
    if (!ok) {
      throw new Error(`${method} ${path} → ${res.status}, expected ${JSON.stringify(expect)}: ${text.slice(0, 300)}`);
    }
  }
  return { status: res.status, body };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log(`API=${API}`);
  console.log(`TEST_PHONE=${TEST_PHONE}`);

  const login = await req('POST', '/v1/auth/local-login/', {
    body: { phone_digits: ADMIN_PHONE, password: ADMIN_PASS, role: 'admin' },
    expect: 200,
  });
  const token = String((login.body as Json).access || '');
  assert(token, 'admin access token yo‘q');

  // Fingerprint: FastAPI (Pydantic) vs Django (DRF)
  const bad = await req('POST', '/v1/auth/local-login/', {
    body: { phone_digits: '998', password: 'x' },
  });
  const fingerprint = JSON.stringify(bad.body);
  assert(
    fingerprint.includes('phone_digits') || fingerprint.includes('detail'),
    `kutilmagan login xato formati: ${fingerprint.slice(0, 200)}`,
  );
  if (fingerprint.includes('Ensure this field') || fingerprint.includes('Ushbu maydon')) {
    throw new Error('Bu host hali Django — FastAPI gateway kerak');
  }
  console.log('ok stack=FastAPI');

  const list0 = await req('GET', '/v1/admin/staff/?page_size=200', { token, expect: 200 });
  const rows0 = ((list0.body as Json).results as Json[]) || [];
  console.log(`ok list count=${(list0.body as Json).count ?? rows0.length}`);

  const catalog = await req('GET', '/v1/academic-catalog/', { token, expect: 200 });
  const kaf = ((catalog.body as Json).kafedralar as unknown[]) || [];
  console.log(`ok academic-catalog kafedralar=${kaf.length}`);

  const create = await req('POST', '/v1/auth/admin-provision-staff/', {
    token,
    expect: [200, 201],
    body: {
      phone_digits: TEST_PHONE,
      password: 'TestPass123',
      role: 'hodim',
      first_name: 'Smoke',
      last_name: 'Teacher',
      faculty: '',
      department: 'Test Kafedra',
      direction: '',
    },
  });
  assert((create.body as Json).created === true, 'created=true kutilgan');
  assert((create.body as Json).role === 'hodim', 'role=hodim kutilgan');
  console.log('ok create');

  const edit = await req('POST', '/v1/auth/admin-provision-staff/', {
    token,
    expect: 200,
    body: {
      phone_digits: TEST_PHONE,
      password: '',
      role: 'hodim',
      first_name: 'SmokeEdited',
      last_name: 'Teacher',
      department: 'Test Kafedra 2',
    },
  });
  assert((edit.body as Json).created === false, 'created=false kutilgan');
  console.log('ok edit (empty password)');

  const list1 = await req('GET', '/v1/admin/staff/?page_size=500', { token, expect: 200 });
  const rows1 = ((list1.body as Json).results as Json[]) || [];
  const found = rows1.find((r) => r.phone_digits === TEST_PHONE);
  assert(found, 'yaratilgan xodim ro‘yxatda yo‘q');
  assert(found.first_name === 'SmokeEdited', `first_name=${found.first_name}`);
  assert(found.department === 'Test Kafedra 2', `department=${found.department}`);
  assert(found.role === 'hodim', `role=${found.role}`);
  console.log('ok list reflects edit');

  const staffLogin = await req('POST', '/v1/auth/local-login/', {
    body: { phone_digits: TEST_PHONE, password: 'TestPass123', role: 'hodim' },
    expect: 200,
  });
  assert((staffLogin.body as Json).role === 'hodim', 'login role=hodim');
  console.log('ok login after edit (password unchanged)');

  await req('POST', '/v1/auth/admin-deprovision-staff/', {
    token,
    expect: 204,
    body: { phone_digits: TEST_PHONE },
  });
  console.log('ok delete');

  const list2 = await req('GET', '/v1/admin/staff/?page_size=500', { token, expect: 200 });
  const rows2 = ((list2.body as Json).results as Json[]) || [];
  assert(!rows2.some((r) => r.phone_digits === TEST_PHONE), 'o‘chirilgan xodim hali ro‘yxatda');
  console.log('ok gone from list');

  console.log('\nPASS staff admin FastAPI smoke');
}

main().catch((err) => {
  console.error('\nFAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
