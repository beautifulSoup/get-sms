export function matchesKeyword(body: string, keyword: string): boolean {
  return body.toLowerCase().includes(keyword.toLowerCase());
}

export function hasCodeIndicator(body: string, indicators: string[]): boolean {
  const lower = body.toLowerCase();
  return indicators.some((ind) => lower.includes(ind.toLowerCase()));
}

export function extractCode(body: string): string | null {
  // 4–8 digits not adjacent to another digit (avoids grabbing part of a long order number)
  const match = body.match(/(?<!\d)\d{4,8}(?!\d)/);
  return match ? match[0] : null;
}
