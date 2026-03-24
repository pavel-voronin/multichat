import type { AgentConfig } from '../../types';

function mulberry32(seed: number): () => number {
  let currentSeed = seed >>> 0;
  return () => {
    currentSeed += 0x6d2b79f5;
    let t = currentSeed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function applyRandom(
  agents: AgentConfig[],
  sweepCount: number,
): AgentConfig[] {
  const shuffled = [...agents];
  const random = mulberry32(sweepCount);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex]!,
      shuffled[index]!,
    ];
  }
  return shuffled;
}
