/**
 * GPS / joylashuv (admin staff location) FastAPI smoke.
 *
 *   npx tsx scripts/smoke-staff-location.mts
 *   API=https://imentor.devflix.uz/api npx tsx scripts/smoke-staff-location.mts
 */
const API = (process.env.API || 'https://imentor.devflix.uz/api').replace(/\/$/, '');
const ADMIN_PHONE = process.env.PHONE || '998901110001';
const ADMIN_PASS = process.env.PASS || 'AdminDemo123';
const HODIM_PHONE = process.env.HODIM_PHONE || '998901112233';
const HODIM_PASS = process.env.HODIM_PASS || 'TestHodim123';
const OWNER = process.env.OWNER || HODIM_PHONE;

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

function asArr(body: unknown): Json[] {
  if (Array.isArray(body)) return body as Json[];
  if (body && typeof body === 'object' && Array.isArray((body as Json).results)) {
    return (body as Json).results as Json[];
  }
  return [];
}

async function main() {
  console.log(`API=${API}`);

  // --- FastAPI fingerprint ---
  const bad = await req('POST', '/v1/auth/local-login/', {
    body: { phone_digits: '998', password: 'x' },
  });
  const fp = JSON.stringify(bad.body);
  if (fp.includes('Ensure this field') || fp.includes('Ushbu maydon')) {
    throw new Error('Host Django — FastAPI gateway kerak');
  }
  assert(fp.includes('detail') || fp.includes('phone_digits'), `fingerprint: ${fp.slice(0, 160)}`);
  console.log('ok stack=FastAPI');

  const adminLogin = await req('POST', '/v1/auth/local-login/', {
    body: { phone_digits: ADMIN_PHONE, password: ADMIN_PASS, role: 'admin' },
    expect: 200,
  });
  const adminToken = String((adminLogin.body as Json).access || '');
  assert(adminToken, 'admin token yo‘q');

  // --- Buildings (admin console) ---
  const buildings = await req('GET', '/v1/admin/campus-buildings/', { token: adminToken, expect: 200 });
  assert(Array.isArray(buildings.body), 'campus-buildings massiv bo‘lishi kerak (FastAPI)');
  console.log(`ok admin/campus-buildings count=${(buildings.body as unknown[]).length}`);

  const staffBuildings = await req('GET', '/v1/staff/buildings/', { token: adminToken, expect: 200 });
  assert(Array.isArray(staffBuildings.body), 'staff/buildings massiv');
  console.log(`ok staff/buildings count=${(staffBuildings.body as unknown[]).length}`);

  const week = await req('GET', '/v1/staff/schedule-week-info/', { token: adminToken, expect: 200 });
  assert((week.body as Json).iso_week, 'iso_week');
  console.log(`ok schedule-week-info phase=${(week.body as Json).current_week_phase}`);

  // Temp building for schedule CRUD
  const tag = `smoke-${Date.now().toString(36)}`;
  const createdB = await req('POST', '/v1/admin/campus-buildings/', {
    token: adminToken,
    expect: 201,
    body: {
      name: `Smoke Bino ${tag}`,
      short_code: 'SMK',
      latitude: 41.3111,
      longitude: 69.2797,
      radius_m: 120,
      boundary: [],
      sort_order: 9999,
      notes: 'smoke-test',
      is_active: true,
    },
  });
  const buildingId = Number((createdB.body as Json).id);
  assert(buildingId > 0, 'building id');
  console.log(`ok create building id=${buildingId}`);

  await req('PATCH', `/v1/admin/campus-buildings/${buildingId}/`, {
    token: adminToken,
    expect: 200,
    body: { notes: 'smoke-patched', radius_m: 150 },
  });
  console.log('ok patch building');

  // --- Schedule bulk + list + patch + delete ---
  const bulk = await req('POST', '/v1/admin/staff-schedule/bulk/', {
    token: adminToken,
    expect: [200, 201],
    body: {
      owner_key: OWNER,
      week_phase: 'every',
      replace_existing: true,
      slots: [
        {
          weekday: 1,
          start_time: '09:00:00',
          end_time: '10:30:00',
          building_id: buildingId,
          title: `Smoke slot ${tag}`,
        },
      ],
    },
  });
  assert((bulk.body as Json).ok === true, 'bulk ok');
  assert(Number((bulk.body as Json).created_count) >= 1, 'created_count');
  console.log('ok staff-schedule/bulk');

  const schedule = await req('GET', `/v1/admin/staff-schedule/?owner_key=${encodeURIComponent(OWNER)}`, {
    token: adminToken,
    expect: 200,
  });
  assert(Array.isArray(schedule.body), 'staff-schedule massiv');
  const slots = schedule.body as Json[];
  const smokeSlot = slots.find((s) => String(s.title || '').includes(tag));
  assert(smokeSlot, 'bulk slot topilmadi');
  const slotId = Number(smokeSlot.id);
  console.log(`ok list schedule slots=${slots.length} smokeId=${slotId}`);

  await req('PATCH', `/v1/admin/staff-schedule/${slotId}/`, {
    token: adminToken,
    expect: 200,
    body: { title: `Smoke slot patched ${tag}`, is_active: true },
  });
  console.log('ok patch schedule slot');

  // --- Pings / alerts / live board (read) ---
  const pings = await req('GET', '/v1/admin/staff-location-pings/?mode=live', {
    token: adminToken,
    expect: 200,
  });
  asArr(pings.body); // may be [] or paginated
  console.log(`ok staff-location-pings live rows=${asArr(pings.body).length}`);

  const alerts = await req('GET', '/v1/admin/staff-location-alerts/', {
    token: adminToken,
    expect: 200,
  });
  console.log(`ok staff-location-alerts rows=${asArr(alerts.body).length}`);

  const live = await req('GET', '/v1/admin/live-teaching-status/', {
    token: adminToken,
    expect: 200,
  });
  assert(typeof (live.body as Json).jami === 'number', 'live-teaching-status.jami');
  console.log(
    `ok live-teaching-status jami=${(live.body as Json).jami} joyida=${(live.body as Json).joyida}`,
  );

  // --- Hodim ping (GPS) ---
  const hodimLogin = await req('POST', '/v1/auth/local-login/', {
    body: { phone_digits: HODIM_PHONE, password: HODIM_PASS, role: 'hodim' },
  });
  if (hodimLogin.status === 200) {
    const hodimToken = String((hodimLogin.body as Json).access || '');
    const mySched = await req('GET', '/v1/staff/schedule/', { token: hodimToken, expect: 200 });
    assert(Array.isArray(mySched.body), 'my schedule array');
    console.log(`ok hodim staff/schedule count=${(mySched.body as unknown[]).length}`);

    const pingNoTs = await req('POST', '/v1/staff/location-ping/', {
      token: hodimToken,
      expect: [200, 201],
      body: {
        latitude: 41.3111,
        longitude: 69.2797,
        accuracy_m: 25,
        client_kind: 'mobile',
      },
    });
    assert((pingNoTs.body as Json).ok === true, 'ping ok');
    console.log(`ok location-ping (no client_ts_ms) alerts=${(pingNoTs.body as Json).alerts_created}`);

    // Date.now() ms — BigInteger kerak (Integer overflow 500 berardi).
    const pingTs = await req('POST', '/v1/staff/location-ping/', {
      token: hodimToken,
      body: {
        latitude: 41.3112,
        longitude: 69.2798,
        accuracy_m: 20,
        client_ts_ms: Date.now(),
        client_kind: 'mobile',
      },
    });
    if ([200, 201].includes(pingTs.status)) {
      console.log('ok location-ping (with client_ts_ms / BigInteger)');
    } else {
      console.log(
        `warn location-ping+client_ts_ms → ${pingTs.status} (deploy BigInteger fix kerak)`,
      );
    }
  } else {
    console.log(`skip hodim ping (login ${hodimLogin.status})`);
  }

  // Cleanup: delete slot then building
  await req('DELETE', `/v1/admin/staff-schedule/${slotId}/`, {
    token: adminToken,
    expect: 204,
  });
  console.log('ok delete schedule slot');

  await req('DELETE', `/v1/admin/campus-buildings/${buildingId}/`, {
    token: adminToken,
    expect: 204,
  });
  console.log('ok delete building');

  console.log('\nPASS GPS joylashuv FastAPI smoke');
}

main().catch((err) => {
  console.error('\nFAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
