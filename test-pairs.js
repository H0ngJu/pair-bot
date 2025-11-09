/**
 * 페어 매칭 테스트 스크립트
 * 9명이 있을 때 매칭이 어떻게 되는지 시뮬레이션
 */

function makePairs(usernames) {
  const users = [...usernames]; // 복사본 생성

  // 셔플
  for (let i = users.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [users[i], users[j]] = [users[j], users[i]];
  }

  // 2~3명씩 그룹화 (1명이 남지 않도록 스마트하게)
  const pairs = [];
  while (users.length > 0) {
    let size;

    if (users.length === 1) {
      // 1명 남으면 이전 그룹에 합치기
      if (pairs.length > 0) {
        pairs[pairs.length - 1].push(users[0]);
        break;
      } else {
        // 처음부터 1명이면 그대로
        pairs.push(users.splice(0, 1));
      }
    } else if (users.length === 2 || users.length === 3) {
      // 2~3명 남으면 한 그룹으로
      pairs.push(users.splice(0, users.length));
    } else if (users.length === 4) {
      // 4명 남으면 2+2로
      size = 2;
      pairs.push(users.splice(0, size));
    } else if (users.length === 5) {
      // 5명 남으면 2 또는 3 선택 (남은 3명 또는 2명)
      size = Math.random() < 0.5 ? 2 : 3;
      pairs.push(users.splice(0, size));
    } else {
      // 6명 이상: 다음 선택이 1명을 남기지 않는지 확인
      // 2명을 선택하면 남은 수가 1이 되는 경우 3명 선택
      if (users.length % 2 === 1) {
        // 홀수면 3명 선택 (남은 수를 짝수로)
        size = 3;
      } else {
        // 짝수면 랜덤
        size = Math.random() < 0.5 ? 2 : 3;
      }
      pairs.push(users.splice(0, size));
    }
  }
  return pairs;
}

// 다양한 인원 수 테스트
const testCases = [
  { count: 5, name: "5명" },
  { count: 6, name: "6명" },
  { count: 7, name: "7명" },
  { count: 8, name: "8명" },
  { count: 9, name: "9명" },
  { count: 10, name: "10명" },
  { count: 11, name: "11명" },
  { count: 12, name: "12명" },
  { count: 15, name: "15명" },
];

testCases.forEach(({ count, name }) => {
  const testUsers = Array.from({ length: count }, (_, i) => `사용자${i + 1}`);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`🧪 ${name} 페어 매칭 테스트`);
  console.log(`${"=".repeat(60)}\n`);

  // 패턴 분석을 위해 여러 번 시뮬레이션
  const patternCount = {};
  const simulations = 5;

  for (let i = 1; i <= simulations; i++) {
    const pairs = makePairs(testUsers);
    const sizes = pairs.map(p => p.length).sort((a, b) => b - a).join("+");

    // 패턴 카운트
    patternCount[sizes] = (patternCount[sizes] || 0) + 1;

    console.log(`[시뮬레이션 ${i}]`);
    pairs.forEach((group, idx) => {
      console.log(`  그룹 ${idx + 1} (${group.length}명): ${group.join(", ")}`);
    });
    console.log(`  → 패턴: ${sizes}\n`);
  }

  // 패턴 요약
  console.log(`📊 패턴 분포:`);
  Object.entries(patternCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([pattern, count]) => {
      console.log(`  ${pattern}: ${count}/${simulations}번`);
    });
});

console.log(`\n${"=".repeat(60)}`);
console.log("✅ 전체 테스트 완료!");
console.log("=".repeat(60));
