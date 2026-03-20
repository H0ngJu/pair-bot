/**
 * 포스팅 벌금 계산
 * @param {Date|null} postTime - 가장 빠른 포스트 제출 시각 (없으면 null)
 * @param {Date} onTimeDeadline - 정시 마감 (월요일 23:59:59 KST)
 * @param {Date} lateDeadline - 지각 마감 (화요일 23:59:59 KST)
 * @returns {number} 벌금 (0, 1000, 5000)
 */
export function calcPostFine(postTime, onTimeDeadline, lateDeadline) {
  if (!postTime) return 5000;
  if (postTime <= onTimeDeadline) return 0;
  if (postTime <= lateDeadline) return 1000;
  return 5000;
}

/**
 * 마감일 계산
 * @param {string} currentBiweek - 현재 사이클 시작일 (YYYY-MM-DD)
 * @returns {{ onTimeDeadline: Date, lateDeadline: Date }}
 */
export function getDeadlines(currentBiweek) {
  const onTimeDeadline = new Date(`${currentBiweek}T23:59:59+09:00`);
  const lateDeadline = new Date(onTimeDeadline);
  lateDeadline.setDate(lateDeadline.getDate() + 1);
  return { onTimeDeadline, lateDeadline };
}

/**
 * 사용자별 벌금 계산
 * @param {string[][]} members - [[userId], ...] 멤버 목록
 * @param {Set<string>} commented - 댓글 작성한 userId Set
 * @param {Map<string, Date>} postMap - userId -> 가장 빠른 포스트 시각
 * @param {Date} onTimeDeadline
 * @param {Date} lateDeadline
 * @returns {{ userId: string, totalFine: number, reasons: string[] }[]}
 */
export function calculateFines(members, commented, postMap, onTimeDeadline, lateDeadline) {
  const fines = [];

  for (const [userId] of members) {
    let totalFine = 0;
    const reasons = [];

    if (!commented.has(userId)) {
      totalFine += 1000;
      reasons.push("댓글 미작성");
    }

    const postTime = postMap.get(userId);
    const postFine = calcPostFine(postTime, onTimeDeadline, lateDeadline);

    if (postFine > 0) {
      totalFine += postFine;
      reasons.push(postFine === 5000 ? "꾸문 미작성" : "꾸문 지각");
    }

    if (totalFine > 0) {
      fines.push({ userId, totalFine, reasons });
    }
  }

  return fines;
}
