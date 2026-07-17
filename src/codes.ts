export function matchesKeyword(body: string, keyword: string): boolean {
  return body.toLowerCase().includes(keyword.toLowerCase());
}

export function hasCodeIndicator(body: string, indicators: string[]): boolean {
  const lower = body.toLowerCase();
  return indicators.some((ind) => lower.includes(ind.toLowerCase()));
}

export function extractCode(body: string, indicators: string[]): string | null {
  const codeRun = /(?<!\d)\d{4,8}(?!\d)/g;
  const lower = body.toLowerCase();

  // Find the earliest position of any code-indicator term. The verification
  // code follows the indicator ("验证码是123456"); the sender's numeric brand
  // (e.g. 【12306】) precedes it, so we must not return the brand.
  let indicatorPos = -1;
  for (const ind of indicators) {
    const p = lower.indexOf(ind.toLowerCase());
    if (p !== -1 && (indicatorPos === -1 || p < indicatorPos)) {
      indicatorPos = p;
    }
  }

  // Prefer the first 4–8 digit run appearing at/after the indicator.
  if (indicatorPos !== -1) {
    codeRun.lastIndex = indicatorPos;
    const after = codeRun.exec(body);
    if (after) return after[0];
  }

  // Fallback: first 4–8 digit run anywhere in the body.
  codeRun.lastIndex = 0;
  const any = codeRun.exec(body);
  return any ? any[0] : null;
}
