import { findContactInfoInDescription, hasContactInfo } from '../../src/domain/lotDescriptionGuard';

describe('lot description contact-info guard', () => {
  it('allows plain produce descriptions', () => {
    expect(hasContactInfo('ผิวมีรอยเล็กน้อย รสหวาน เหมาะทำน้ำผลไม้')).toBe(false);
    expect(hasContactInfo('Slightly bruised skin, sweet, great for juicing')).toBe(false);
  });

  it('flags a Thai mobile phone number without separators', () => {
    expect(findContactInfoInDescription('โทร 0812345678 นะครับ')).toBe('phone');
  });

  it('flags a Thai phone number with dashes', () => {
    expect(findContactInfoInDescription('ติดต่อ 081-234-5678')).toBe('phone');
  });

  it('flags a Thai phone number with spaces', () => {
    expect(findContactInfoInDescription('เบอร์ 081 234 5678 ครับ')).toBe('phone');
  });

  it('flags a landline-style 9-digit number', () => {
    expect(findContactInfoInDescription('โทร 021234567')).toBe('phone');
  });

  it('flags a +66 phone number', () => {
    expect(findContactInfoInDescription('call +66812345678')).toBe('phone');
  });

  it('flags a URL with scheme', () => {
    expect(findContactInfoInDescription('ดูเพิ่มที่ https://example.com/farm')).toBe('url');
  });

  it('flags a www URL', () => {
    expect(findContactInfoInDescription('www.example.com')).toBe('url');
  });

  it('flags a bare domain', () => {
    expect(findContactInfoInDescription('เพจ myfarm.com นะ')).toBe('url');
  });

  it('flags an email address', () => {
    expect(findContactInfoInDescription('ติดต่อ farmer@example.com')).toBe('email');
  });

  it('flags the word line', () => {
    expect(findContactInfoInDescription('แอด LINE ได้เลย')).toBe('line');
  });

  it('flags the Thai word ไลน์', () => {
    expect(findContactInfoInDescription('ทักไลน์มาคุยกันได้')).toBe('line');
  });

  it('flags an @id-style handle', () => {
    expect(findContactInfoInDescription('ไอดี @somefarm')).toBe('line');
  });
});
