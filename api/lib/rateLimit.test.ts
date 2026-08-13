import { describe, expect, it, vi, afterEach } from "vitest";
import { checkRateLimit } from "./rateLimit";

describe("checkRateLimit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("يسمح بالمحاولات ضمن الحد ويرفض الزيادة", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(key, 10, 60_000)).toBe(true);
    }
    expect(checkRateLimit(key, 10, 60_000)).toBe(false);
  });

  it("يعيد السماح بعد انتهاء النافذة الزمنية", () => {
    vi.useFakeTimers();
    const key = `test:${Math.random()}`;
    expect(checkRateLimit(key, 1, 60_000)).toBe(true);
    expect(checkRateLimit(key, 1, 60_000)).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(checkRateLimit(key, 1, 60_000)).toBe(true);
  });

  it("المفاتيح المختلفة مستقلة عن بعضها", () => {
    const a = `test:a:${Math.random()}`;
    const b = `test:b:${Math.random()}`;
    expect(checkRateLimit(a, 1, 60_000)).toBe(true);
    expect(checkRateLimit(a, 1, 60_000)).toBe(false);
    expect(checkRateLimit(b, 1, 60_000)).toBe(true);
  });
});
