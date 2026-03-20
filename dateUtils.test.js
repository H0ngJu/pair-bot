import { describe, it, expect } from "vitest";
import { getBiweekStart, getBiweekCycle } from "./dateUtils.js";

describe("getBiweekStart", () => {
  describe("사이클 경계 (14일 주기)", () => {
    it("기준일 2/23 → 사이클 1", () => {
      expect(getBiweekStart(new Date("2026-02-23"))).toBe("2026-02-23");
    });

    it("2/23 + 13일 = 3/8 → 사이클 1 (마지막 날)", () => {
      expect(getBiweekStart(new Date("2026-03-08"))).toBe("2026-02-23");
    });

    it("2/23 + 14일 = 3/9 → 사이클 2 (첫날)", () => {
      expect(getBiweekStart(new Date("2026-03-09"))).toBe("2026-03-09");
    });

    it("3/22 → 사이클 2 (마지막 날)", () => {
      expect(getBiweekStart(new Date("2026-03-22"))).toBe("2026-03-09");
    });

    it("3/23 → 사이클 3 (첫날)", () => {
      expect(getBiweekStart(new Date("2026-03-23"))).toBe("2026-03-23");
    });

    it("4/5 → 사이클 3 (마지막 날)", () => {
      expect(getBiweekStart(new Date("2026-04-05"))).toBe("2026-03-23");
    });

    it("4/6 → 사이클 4 (첫날)", () => {
      expect(getBiweekStart(new Date("2026-04-06"))).toBe("2026-04-06");
    });
  });

  it("기준일 이전 → 사이클 1로 처리", () => {
    expect(getBiweekStart(new Date("2026-02-20"))).toBe("2026-02-23");
  });
});

describe("getBiweekCycle", () => {
  it("사이클 1 = 2026-02-23", () => {
    expect(getBiweekCycle("2026-02-23")).toBe(1);
  });

  it("사이클 2 = 2026-03-09", () => {
    expect(getBiweekCycle("2026-03-09")).toBe(2);
  });

  it("사이클 3 = 2026-03-23", () => {
    expect(getBiweekCycle("2026-03-23")).toBe(3);
  });

  it("사이클 4 = 2026-04-06", () => {
    expect(getBiweekCycle("2026-04-06")).toBe(4);
  });
});

describe("크론잡 사이클 변경 감지", () => {
  // 페어 매칭: getBiweekStart(now) !== getBiweekStart(now - 7일)
  function shouldRunPairMatching(date) {
    const current = getBiweekStart(date);
    const previous = getBiweekStart(new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000));
    return current !== previous;
  }

  // 벌금 정산: getBiweekStart(now) !== getBiweekStart(now - 7일)
  function shouldRunFineSettlement(date) {
    const current = getBiweekStart(date);
    const previous = getBiweekStart(new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000));
    return current !== previous;
  }

  // 벌금 정산 대상 사이클 계산
  function getLastBiweek(date) {
    const currentBiweek = getBiweekStart(date);
    const lastBiweekDate = new Date(`${currentBiweek}T00:00:00Z`);
    lastBiweekDate.setDate(lastBiweekDate.getDate() - 1);
    return getBiweekStart(lastBiweekDate);
  }

  describe("페어 매칭 (매주 월요일 10시)", () => {
    it("3/2 (월) → 스킵 (아직 사이클 1)", () => {
      expect(shouldRunPairMatching(new Date("2026-03-02T10:00:00+09:00"))).toBe(false);
    });

    it("3/9 (월) → 실행 (사이클 1→2)", () => {
      expect(shouldRunPairMatching(new Date("2026-03-09T10:00:00+09:00"))).toBe(true);
    });

    it("3/16 (월) → 스킵 (여전히 사이클 2)", () => {
      expect(shouldRunPairMatching(new Date("2026-03-16T10:00:00+09:00"))).toBe(false);
    });

    it("3/23 (월) → 실행 (사이클 2→3)", () => {
      expect(shouldRunPairMatching(new Date("2026-03-23T10:00:00+09:00"))).toBe(true);
    });

    it("3/30 (월) → 스킵 (여전히 사이클 3)", () => {
      expect(shouldRunPairMatching(new Date("2026-03-30T10:00:00+09:00"))).toBe(false);
    });

    it("4/6 (월) → 실행 (사이클 3→4)", () => {
      expect(shouldRunPairMatching(new Date("2026-04-06T10:00:00+09:00"))).toBe(true);
    });
  });

  describe("벌금 정산 (매주 화요일 23:59)", () => {
    it("3/3 (화) → 스킵", () => {
      expect(shouldRunFineSettlement(new Date("2026-03-03T23:59:00+09:00"))).toBe(false);
    });

    it("3/10 (화) → 실행 (사이클 1 정산)", () => {
      expect(shouldRunFineSettlement(new Date("2026-03-10T23:59:00+09:00"))).toBe(true);
    });

    it("3/17 (화) → 스킵", () => {
      expect(shouldRunFineSettlement(new Date("2026-03-17T23:59:00+09:00"))).toBe(false);
    });

    it("3/24 (화) → 실행 (사이클 2 정산)", () => {
      expect(shouldRunFineSettlement(new Date("2026-03-24T23:59:00+09:00"))).toBe(true);
    });

    it("3/31 (화) → 스킵", () => {
      expect(shouldRunFineSettlement(new Date("2026-03-31T23:59:00+09:00"))).toBe(false);
    });

    it("4/7 (화) → 실행 (사이클 3 정산)", () => {
      expect(shouldRunFineSettlement(new Date("2026-04-07T23:59:00+09:00"))).toBe(true);
    });
  });

  describe("벌금 정산 대상 사이클", () => {
    it("3/10 정산 → 사이클 1 (2/23) 대상", () => {
      expect(getLastBiweek(new Date("2026-03-10T23:59:00+09:00"))).toBe("2026-02-23");
    });

    it("3/24 정산 → 사이클 2 (3/9) 대상", () => {
      expect(getLastBiweek(new Date("2026-03-24T23:59:00+09:00"))).toBe("2026-03-09");
    });

    it("4/7 정산 → 사이클 3 (3/23) 대상", () => {
      expect(getLastBiweek(new Date("2026-04-07T23:59:00+09:00"))).toBe("2026-03-23");
    });
  });
});

describe("댓글 사이클 시프트 (1일 전 기준)", () => {
  function getCommentBiweek(date) {
    const yesterday = new Date(date.getTime() - 24 * 60 * 60 * 1000);
    return getBiweekStart(yesterday);
  }

  it("3/22 (일) 댓글 → 사이클 2 (N-1)", () => {
    expect(getCommentBiweek(new Date("2026-03-22"))).toBe("2026-03-09");
  });

  it("3/23 (월, 마감일) 댓글 → 사이클 2 (N-1)", () => {
    expect(getCommentBiweek(new Date("2026-03-23"))).toBe("2026-03-09");
  });

  it("3/24 (화) 댓글 → 사이클 3 (N)", () => {
    expect(getCommentBiweek(new Date("2026-03-24"))).toBe("2026-03-23");
  });

  it("3/25 (수) 댓글 → 사이클 3 (N)", () => {
    expect(getCommentBiweek(new Date("2026-03-25"))).toBe("2026-03-23");
  });

  it("4/5 (일) 댓글 → 사이클 3 (N)", () => {
    expect(getCommentBiweek(new Date("2026-04-05"))).toBe("2026-03-23");
  });

  it("4/6 (월, 마감일) 댓글 → 사이클 3 (N-1)", () => {
    expect(getCommentBiweek(new Date("2026-04-06"))).toBe("2026-03-23");
  });
});
