import { describe, it, expect } from "vitest";
import { calcPostFine, getDeadlines, calculateFines } from "./fineUtils.js";

describe("getDeadlines", () => {
  it("currentBiweek 월요일 23:59:59 KST가 정시 마감", () => {
    const { onTimeDeadline } = getDeadlines("2026-03-23");
    expect(onTimeDeadline.toISOString()).toBe("2026-03-23T14:59:59.000Z"); // 23:59:59 KST = 14:59:59 UTC
  });

  it("지각 마감은 정시 마감 + 1일 (화요일 23:59:59 KST)", () => {
    const { onTimeDeadline, lateDeadline } = getDeadlines("2026-03-23");
    const diff = lateDeadline.getTime() - onTimeDeadline.getTime();
    expect(diff).toBe(24 * 60 * 60 * 1000);
  });
});

describe("calcPostFine", () => {
  const { onTimeDeadline, lateDeadline } = getDeadlines("2026-03-23");

  it("미제출 → 5000원", () => {
    expect(calcPostFine(null, onTimeDeadline, lateDeadline)).toBe(5000);
  });

  it("월요일 오후 제출 (정시) → 0원", () => {
    const postTime = new Date("2026-03-23T15:00:00+09:00");
    expect(calcPostFine(postTime, onTimeDeadline, lateDeadline)).toBe(0);
  });

  it("월요일 23:59:59 KST 제출 (정시 마감 직전) → 0원", () => {
    const postTime = new Date("2026-03-23T23:59:59+09:00");
    expect(calcPostFine(postTime, onTimeDeadline, lateDeadline)).toBe(0);
  });

  it("화요일 00:00:01 KST 제출 (지각) → 1000원", () => {
    const postTime = new Date("2026-03-24T00:00:01+09:00");
    expect(calcPostFine(postTime, onTimeDeadline, lateDeadline)).toBe(1000);
  });

  it("화요일 오후 제출 (지각) → 1000원", () => {
    const postTime = new Date("2026-03-24T15:00:00+09:00");
    expect(calcPostFine(postTime, onTimeDeadline, lateDeadline)).toBe(1000);
  });

  it("화요일 23:59:59 KST 제출 (지각 마감 직전) → 1000원", () => {
    const postTime = new Date("2026-03-24T23:59:59+09:00");
    expect(calcPostFine(postTime, onTimeDeadline, lateDeadline)).toBe(1000);
  });

  it("수요일 제출 (마감 초과) → 5000원", () => {
    const postTime = new Date("2026-03-25T00:00:01+09:00");
    expect(calcPostFine(postTime, onTimeDeadline, lateDeadline)).toBe(5000);
  });

  it("2주 전 일찍 제출 → 0원", () => {
    const postTime = new Date("2026-03-12T10:00:00+09:00");
    expect(calcPostFine(postTime, onTimeDeadline, lateDeadline)).toBe(0);
  });
});

describe("calculateFines", () => {
  const { onTimeDeadline, lateDeadline } = getDeadlines("2026-03-23");

  const members = [["userA"], ["userB"], ["userC"], ["userD"], ["userE"]];

  it("댓글 + 포스팅 모두 완료 → 벌금 없음", () => {
    const commented = new Set(["userA"]);
    const postMap = new Map([["userA", new Date("2026-03-20T10:00:00+09:00")]]);
    const fines = calculateFines([["userA"]], commented, postMap, onTimeDeadline, lateDeadline);
    expect(fines).toEqual([]);
  });

  it("댓글 미작성 → 1000원", () => {
    const commented = new Set();
    const postMap = new Map([["userA", new Date("2026-03-20T10:00:00+09:00")]]);
    const fines = calculateFines([["userA"]], commented, postMap, onTimeDeadline, lateDeadline);
    expect(fines).toEqual([
      { userId: "userA", totalFine: 1000, reasons: ["댓글 미작성"] },
    ]);
  });

  it("포스팅 미제출 → 5000원", () => {
    const commented = new Set(["userA"]);
    const postMap = new Map();
    const fines = calculateFines([["userA"]], commented, postMap, onTimeDeadline, lateDeadline);
    expect(fines).toEqual([
      { userId: "userA", totalFine: 5000, reasons: ["꾸문 미작성"] },
    ]);
  });

  it("포스팅 지각 제출 → 1000원", () => {
    const commented = new Set(["userA"]);
    const postMap = new Map([["userA", new Date("2026-03-24T12:00:00+09:00")]]);
    const fines = calculateFines([["userA"]], commented, postMap, onTimeDeadline, lateDeadline);
    expect(fines).toEqual([
      { userId: "userA", totalFine: 1000, reasons: ["꾸문 지각"] },
    ]);
  });

  it("댓글 미작성 + 포스팅 미제출 → 6000원", () => {
    const commented = new Set();
    const postMap = new Map();
    const fines = calculateFines([["userA"]], commented, postMap, onTimeDeadline, lateDeadline);
    expect(fines).toEqual([
      { userId: "userA", totalFine: 6000, reasons: ["댓글 미작성", "꾸문 미작성"] },
    ]);
  });

  it("댓글 미작성 + 포스팅 지각 → 2000원", () => {
    const commented = new Set();
    const postMap = new Map([["userA", new Date("2026-03-24T10:00:00+09:00")]]);
    const fines = calculateFines([["userA"]], commented, postMap, onTimeDeadline, lateDeadline);
    expect(fines).toEqual([
      { userId: "userA", totalFine: 2000, reasons: ["댓글 미작성", "꾸문 지각"] },
    ]);
  });

  it("여러 멤버 복합 시나리오", () => {
    const commented = new Set(["userA", "userC", "userD"]);
    const postMap = new Map([
      ["userA", new Date("2026-03-20T10:00:00+09:00")], // 정시
      ["userB", new Date("2026-03-24T10:00:00+09:00")], // 지각
      // userC: 미제출
      ["userD", new Date("2026-03-23T23:00:00+09:00")], // 정시
      // userE: 미제출
    ]);

    const fines = calculateFines(members, commented, postMap, onTimeDeadline, lateDeadline);

    expect(fines).toEqual([
      { userId: "userB", totalFine: 2000, reasons: ["댓글 미작성", "꾸문 지각"] },
      { userId: "userC", totalFine: 5000, reasons: ["꾸문 미작성"] },
      { userId: "userE", totalFine: 6000, reasons: ["댓글 미작성", "꾸문 미작성"] },
    ]);
  });
});
