import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../utils/dateConverter.js';
import * as spa from '../../react-app/src/utils/dateConverters.js';

const iso = (ms) => {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

test('known Umm al-Qura dates', () => {
  assert.equal(api.hijriToGregorian(1, 1, 1446), '2024-07-07'); // 1 Muharram 1446
  assert.equal(api.hijriToGregorian(1, 9, 1445), '2024-03-11'); // 1 Ramadan 1445
  assert.deepEqual(api.gregorianToHijri('2024-07-07'), { day: 1, month: 1, year: 1446 });
});

test('Hijri -> Gregorian round-trips for every day of 1350-1500 AH', () => {
  const start = Date.UTC(1931, 0, 1);
  const end = Date.UTC(2077, 11, 31);
  let checked = 0;
  for (let ms = start; ms <= end; ms += 86400000) {
    const g = iso(ms);
    const h = api.gregorianToHijri(g);
    const back = api.hijriToGregorian(h.day, h.month, h.year);
    if (back !== g) assert.fail(`round trip failed for ${g}: ${JSON.stringify(h)} -> ${back}`);
    checked += 1;
  }
  assert.ok(checked > 50000);
});

test('a day that does not exist in the month is rejected, not shifted', () => {
  // Umm al-Qura months have 29 or 30 days; find a 29-day month and check day 30 is refused
  let found = 0;
  for (let m = 1; m <= 12; m++) {
    const day29 = api.hijriToGregorian(29, m, 1446);
    assert.ok(day29, `29/${m}/1446 must exist`);
    const day30 = api.hijriToGregorian(30, m, 1446);
    if (day30 === null) found += 1;
    else assert.equal(api.gregorianToHijri(day30).month, m, '30th must stay in the same month');
  }
  assert.ok(found > 0, 'at least one 29-day month expected in a year');
});

test('API and SPA converters agree', () => {
  for (let y = 1400; y <= 1480; y += 7) {
    for (let m = 1; m <= 12; m++) {
      for (const d of [1, 15, 29]) {
        assert.equal(api.hijriToGregorian(d, m, y), spa.hijriToGregorian(d, m, y), `${d}/${m}/${y}`);
      }
    }
  }
  assert.deepEqual(api.gregorianToHijri('1990-05-17'), spa.gregorianToHijri('1990-05-17'));
});

test('Gregorian conversion does not depend on the machine time zone', () => {
  // A Date at local midnight and the matching ISO string must give the same Hijri date
  const fromString = api.gregorianToHijri('2025-03-01');
  const fromDate = api.gregorianToHijri(new Date(2025, 2, 1));
  assert.deepEqual(fromString, fromDate);
});
