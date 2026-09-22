import fs from 'fs';
import path from 'path';

describe('price formulas stay in src/domain', () => {
  const routeDir = path.resolve(__dirname, '../../src/routes');

  it('calls domain helpers from market, lots, and orders', () => {
    const market = fs.readFileSync(path.join(routeDir, 'market.ts'), 'utf8');
    const lots = fs.readFileSync(path.join(routeDir, 'lots.ts'), 'utf8');
    const orders = fs.readFileSync(path.join(routeDir, 'orders.ts'), 'utf8');
    for (const source of [market, lots, orders]) {
      expect(source).toContain('urgentPricePerKg');
      expect(source).not.toContain('0.18');
      expect(source).not.toContain('0.3 + 0.7');
    }
    expect(lots).toContain('predictShelfHours');
    expect(market).toContain('expires_at > UTC_TIMESTAMP()');
  });
});
