export function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function getBiweekStart(date = new Date()) {
  // 로컬 날짜를 ISO 문자열로 변환 (시간대 무시)
  const d = new Date(date);
  const dateString = d.toISOString().slice(0, 10);

  // 기준점: 2026-02-23 (월요일)을 기준으로 2주 주기 계산
  // 포스팅 마감 범위: 첫 사이클은 월요일부터 화요일까지 (16일), 이후 14일씩
  // daysDiff 0~15 → weekStart = 2/23
  // daysDiff 16~29 → weekStart = 3/9
  // daysDiff 30~43 → weekStart = 3/23, ...
  const baseDateString = '2026-02-23';

  const dDate = new Date(dateString);
  const bDate = new Date(baseDateString);
  const daysDiff = Math.floor((dDate - bDate) / (1000 * 60 * 60 * 24));

  let deadlineCount;
  if (daysDiff < 0) {
    deadlineCount = 0;
  } else if (daysDiff <= 15) {
    deadlineCount = 0;
  } else {
    deadlineCount = Math.floor((daysDiff - 16) / 14) + 1;
  }

  const biweekStart = new Date(baseDateString);
  biweekStart.setDate(biweekStart.getDate() + deadlineCount * 14);

  return biweekStart.toISOString().slice(0, 10);
}

export function getBiweekCycle(dateString) {
  // dateString: weekStart 형식 (예: "2026-02-23", "2026-03-09", "2026-03-23")
  // 각 weekStart의 14일마다 cycle이 증가
  const date = new Date(dateString + 'T00:00:00Z');
  const baseDate = new Date('2026-02-23T00:00:00Z');
  const daysDiff = Math.floor((date - baseDate) / (1000 * 60 * 60 * 24));

  // weekStart는 14일마다 변경 (2/23, 3/9, 3/23, 4/6, ...)
  // 따라서 cycle = floor(daysDiff / 14) + 1
  const cycle = Math.floor(daysDiff / 14) + 1;
  return cycle;
}
