/* Korean public holidays (빨간날) incl. substitute holidays (대체공휴일).
 * Lunar holidays and one-off days (elections, 임시공휴일) cannot be computed
 * from the solar calendar, so they come from tables below — extend them yearly. */

// [설날, 부처님 오신 날, 추석] in solar dates.
const LUNAR = {
  2024: ["2024-02-10", "2024-05-15", "2024-09-17"],
  2025: ["2025-01-29", "2025-05-05", "2025-10-06"],
  2026: ["2026-02-17", "2026-05-24", "2026-09-25"],
  2027: ["2027-02-07", "2027-05-13", "2027-09-15"],
  2028: ["2028-01-27", "2028-05-02", "2028-10-03"],
  2029: ["2029-02-13", "2029-05-20", "2029-09-22"],
  2030: ["2030-02-03", "2030-05-09", "2030-09-12"]
};

const SPECIAL = {
  "2024-04-10": "국회의원 선거일",
  "2024-10-01": "국군의 날(임시공휴일)",
  "2025-01-27": "임시공휴일",
  "2025-06-03": "대통령 선거일",
  "2026-06-03": "지방선거일",
  "2028-04-12": "국회의원 선거일"
};

const pad = n => String(n).padStart(2, "0");
const isoOf = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parse = iso => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const shift = (iso, days) => { const d = parse(iso); d.setDate(d.getDate() + days); return isoOf(d); };
const weekday = iso => parse(iso).getDay();

const cache = new Map();

// Returns Map<iso, string[]> of holiday names for the given year.
export function holidaysOf(year) {
  if (cache.has(year)) return cache.get(year);
  const map = new Map();
  const add = (iso, name) => map.set(iso, [...(map.get(iso) || []), name]);
  // Substitute triggers: "weekend" = Sat/Sun or overlap, "sunday" = Sunday or overlap (설/추석).
  const rules = [];
  const fixed = (md, name, sub) => {
    const iso = `${year}-${md}`;
    add(iso, name);
    if (sub) rules.push({ days: [iso], sub });
  };
  fixed("01-01", "신정");
  fixed("03-01", "3·1절", "weekend");
  if (year >= 2026) fixed("05-01", "노동절", "weekend");
  fixed("05-05", "어린이날", "weekend");
  fixed("06-06", "현충일");
  if (year >= 2026) fixed("07-17", "제헌절", "weekend");
  fixed("08-15", "광복절", "weekend");
  fixed("10-03", "개천절", "weekend");
  fixed("10-09", "한글날", "weekend");
  fixed("12-25", "성탄절", "weekend");

  const lunar = LUNAR[year];
  if (lunar) {
    const [seollal, buddha, chuseok] = lunar;
    for (const [day, name] of [[seollal, "설날"], [chuseok, "추석"]]) {
      const days = [shift(day, -1), day, shift(day, 1)];
      days.forEach(d => add(d, name));
      rules.push({ days, sub: "sunday" });
    }
    add(buddha, "부처님 오신 날");
    rules.push({ days: [buddha], sub: "weekend" });
  }
  for (const [iso, name] of Object.entries(SPECIAL)) if (iso.startsWith(`${year}-`)) add(iso, name);

  // One substitute per cause: e.g. 어린이날 + 부처님 오신 날 on the same day gives one 대체공휴일.
  const used = new Set();
  rules.sort((a, b) => a.days[0].localeCompare(b.days[0]));
  for (const rule of rules) {
    const causes = rule.days.filter(d => {
      const w = weekday(d);
      const overlap = map.get(d).length > 1;
      return overlap || w === 0 || (rule.sub === "weekend" && w === 6);
    }).filter(d => !used.has(d));
    if (!causes.length) continue;
    causes.forEach(d => used.add(d));
    let next = shift(rule.days[rule.days.length - 1], 1);
    while (weekday(next) === 0 || weekday(next) === 6 || map.has(next)) next = shift(next, 1);
    add(next, "대체공휴일");
  }
  cache.set(year, map);
  return map;
}

export function holidayNames(iso) {
  return holidaysOf(Number(iso.slice(0, 4))).get(iso) || [];
}
