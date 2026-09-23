import fs from 'fs';
import path from 'path';
import {
  clearMocProductCacheForTests,
  getCachedMocProducts,
  getMocProductCacheFilePathForTests,
  useTempMocProductCacheForTests,
} from '../../src/pricing/mocProductCache';
import * as mocClient from '../../src/pricing/mocClient';

const PRODUCTION_CACHE = path.resolve(__dirname, '../../.cache/moc-products.json');

describe('mocProductCache isolation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    clearMocProductCacheForTests();
  });

  it('writes only to temp dir and never deletes production server/.cache', async () => {
    const beforeExists = fs.existsSync(PRODUCTION_CACHE);
    const beforeMtime = beforeExists ? fs.statSync(PRODUCTION_CACHE).mtimeMs : null;
    const beforeBody = beforeExists ? fs.readFileSync(PRODUCTION_CACHE, 'utf8') : null;

    const tempDir = useTempMocProductCacheForTests();
    const tempFile = getMocProductCacheFilePathForTests();
    expect(tempFile.startsWith(tempDir)).toBe(true);
    expect(tempFile).not.toBe(PRODUCTION_CACHE);

    jest.spyOn(mocClient, 'fetchMocProducts').mockResolvedValue([
      {
        product_id: 'W-FAKE-TEST',
        product_name: 'สินค้าทดสอบแคช',
        category_name: 'ผลไม้',
        sell_type: 'ขายส่ง',
      },
    ]);

    await getCachedMocProducts({ forceRefresh: true, allowNetwork: true });
    expect(fs.existsSync(tempFile)).toBe(true);
    expect(fs.readFileSync(tempFile, 'utf8')).toContain('W-FAKE-TEST');

    clearMocProductCacheForTests();
    expect(fs.existsSync(tempFile)).toBe(false);

    if (beforeExists && beforeBody !== null && beforeMtime !== null) {
      expect(fs.existsSync(PRODUCTION_CACHE)).toBe(true);
      expect(fs.readFileSync(PRODUCTION_CACHE, 'utf8')).toBe(beforeBody);
      expect(fs.statSync(PRODUCTION_CACHE).mtimeMs).toBe(beforeMtime);
    } else {
      expect(fs.existsSync(PRODUCTION_CACHE)).toBe(false);
    }
  });
});
