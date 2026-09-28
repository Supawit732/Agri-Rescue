import Svg, { Rect } from 'react-native-svg';

// Deterministic, QR-shaped placeholder for the mock PromptPay flow — not a
// real, scannable payload. Renders three finder patterns + a seeded noise
// grid so every order looks like a distinct code without any QR library.
const GRID = 21;
const FINDER_SIZE = 7;
const FINDER_ORIGINS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [GRID - FINDER_SIZE, 0],
  [0, GRID - FINDER_SIZE],
];

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h >>> 0 || 1;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finderValue(x: number, y: number): boolean | null {
  for (const [ox, oy] of FINDER_ORIGINS) {
    const lx = x - ox;
    const ly = y - oy;
    if (lx >= 0 && lx < FINDER_SIZE && ly >= 0 && ly < FINDER_SIZE) {
      const onOuterRing = lx === 0 || lx === FINDER_SIZE - 1 || ly === 0 || ly === FINDER_SIZE - 1;
      const onInnerBlock = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4;
      return onOuterRing || onInnerBlock;
    }
  }
  return null;
}

export function MockQrCode({
  seed,
  size = 160,
}: {
  seed: string;
  size?: number;
}): React.ReactElement {
  const rand = mulberry32(hashSeed(seed));
  const cell = size / GRID;
  const rects: React.ReactElement[] = [];
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const finder = finderValue(x, y);
      const on = finder ?? rand() > 0.55;
      if (on) {
        rects.push(
          <Rect
            key={`${String(x)}-${String(y)}`}
            x={x * cell}
            y={y * cell}
            width={cell}
            height={cell}
            fill="#1A1A1A"
          />,
        );
      }
    }
  }
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${String(size)} ${String(size)}`}>
      <Rect x={0} y={0} width={size} height={size} fill="#FFFFFF" />
      {rects}
    </Svg>
  );
}
