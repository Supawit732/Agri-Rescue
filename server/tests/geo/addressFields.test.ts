import { pickDistrict, pickSubdistrict } from '../../src/geo/nominatim';

describe('nominatim address field selection', () => {
  it('Bangkok EN: khwaeng from quarter, khet from suburb', () => {
    const address = {
      suburb: 'Bang Na District',
      quarter: 'Bang Na Tai Subdistrict',
      city: 'Bangkok',
    };
    expect(pickSubdistrict(address)).toBe('Bang Na Tai Subdistrict');
    expect(pickDistrict(address, 'Bang Na Tai Subdistrict')).toBe('Bang Na District');
  });

  it('Bangkok TH: แขวง from quarter, เขต from suburb', () => {
    const address = {
      suburb: 'เขตบางนา',
      quarter: 'แขวงบางนาใต้',
      city: 'กรุงเทพมหานคร',
    };
    expect(pickSubdistrict(address)).toBe('แขวงบางนาใต้');
    expect(pickDistrict(address, 'แขวงบางนาใต้')).toBe('เขตบางนา');
  });

  it('province: ตำบล from city_district, อำเภอ from county (skip municipality town)', () => {
    const address = {
      town: 'เทศบาลตำบลด่านสำโรง',
      city_district: 'ตำบลสำโรงเหนือ',
      county: 'อำเภอเมืองสมุทรปราการ',
      province: 'จังหวัดสมุทรปราการ',
    };
    expect(pickSubdistrict(address)).toBe('ตำบลสำโรงเหนือ');
    expect(pickDistrict(address, 'ตำบลสำโรงเหนือ')).toBe('อำเภอเมืองสมุทรปราการ');
  });

  it('province EN: Subdistrict from city_district, District from county', () => {
    const address = {
      town: 'Dan Samrong Subdistrict Municipality',
      city_district: 'Samrong Nuea Subdistrict',
      county: 'Mueang Samut Prakan District',
      province: 'Samut Prakan Province',
    };
    expect(pickSubdistrict(address)).toBe('Samrong Nuea Subdistrict');
    expect(pickDistrict(address, 'Samrong Nuea Subdistrict')).toBe('Mueang Samut Prakan District');
  });

  it('test fixture without prefixes still fills both levels', () => {
    const address = {
      suburb: 'คลองเตย',
      city_district: 'คลองเตย',
      city: 'กรุงเทพมหานคร',
    };
    expect(pickSubdistrict(address)).toBe('คลองเตย');
    expect(pickDistrict(address, 'คลองเตย')).toBe('คลองเตย');
  });

  it('never uses province-like city as district when suburb is the khet', () => {
    const address = {
      suburb: 'เขตบางนา',
      quarter: 'แขวงบางนาใต้',
      city: 'กรุงเทพมหานคร',
    };
    expect(pickDistrict(address, 'แขวงบางนาใต้')).not.toBe('กรุงเทพมหานคร');
  });
});
