import { contentDisposition } from '../../src/http/contentDisposition';

describe('contentDisposition', () => {
  it('keeps plain ASCII names', () => {
    expect(contentDisposition('proof.png')).toBe(
      `inline; filename="proof.png"; filename*=UTF-8''proof.png`,
    );
  });

  it('emits an ASCII-only fallback plus UTF-8 filename* for Thai names', () => {
    const v = contentDisposition('รูปสินค้า.jpg');
    expect(v).toBe(`inline; filename="file.jpg"; filename*=UTF-8''${encodeURIComponent('รูปสินค้า.jpg')}`);
    expect(v).toMatch(/^[\x20-\x7e]+$/);
  });

  it('neutralises quotes, CRLF and defaults empty names', () => {
    const v = contentDisposition('a"b\r\nc.pdf', 'attachment');
    expect(v).toMatch(/^[\x20-\x7e]+$/);
    expect(v).not.toContain('\n');
    expect(v.startsWith('attachment; filename="a_b__c.pdf"')).toBe(true);
    expect(contentDisposition(null)).toContain('filename="file"');
  });
});
