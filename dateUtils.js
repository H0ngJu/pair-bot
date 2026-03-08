export function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function getBiweekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);

  // 기준점: 2026-03-09 (월요일)을 기준으로 2주 주기 계산
  const baseDate = new Date('2026-03-09');
  const daysDiff = Math.floor((d - baseDate) / (1000 * 60 * 60 * 24));
  const biweeksDiff = Math.floor(daysDiff / 14) * 14;

  const biweekStart = new Date(baseDate);
  biweekStart.setDate(biweekStart.getDate() + biweeksDiff);

  return biweekStart.toISOString().slice(0, 10);
}

export function getBiweekCycle(dateString) {
  // dateString: "2026-03-09" 형식
  const date = new Date(dateString + 'T00:00:00Z');
  const baseDate = new Date('2026-03-09T00:00:00Z');
  const daysDiff = Math.floor((date - baseDate) / (1000 * 60 * 60 * 24));
  const cycle = Math.floor(daysDiff / 14) + 1;
  return cycle;
}
