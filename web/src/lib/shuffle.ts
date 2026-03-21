/**
 * Local-only randomness (e.g. review queue order). Not for LinkedIn automation.
 */
export function shuffleInPlace<T>(arr: T[], random: () => number = Math.random): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function shuffledCopy<T>(arr: readonly T[], random: () => number = Math.random): T[] {
  const out = [...arr];
  shuffleInPlace(out, random);
  return out;
}
