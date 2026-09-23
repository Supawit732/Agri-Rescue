import {
  isAllowedGoogleMapsHost,
  isInThailandApprox,
  isShortGoogleMapsUrl,
  parseCoordsFromMapsUrl,
} from '../../src/domain/mapsLink';

describe('mapsLink parser', () => {
  it('parses @lat,lng fragments', () => {
    expect(
      parseCoordsFromMapsUrl(
        'https://www.google.com/maps/place/Foo/@13.7563,100.5018,17z/data=!3m1!4b1',
      ),
    ).toEqual({ lat: 13.7563, lng: 100.5018 });
  });

  it('parses ?q=lat,lng and + separators', () => {
    expect(parseCoordsFromMapsUrl('https://www.google.com/maps?q=13.75,100.50')).toEqual({
      lat: 13.75,
      lng: 100.5,
    });
    expect(parseCoordsFromMapsUrl('https://maps.google.com/?q=13.75+100.50')).toEqual({
      lat: 13.75,
      lng: 100.5,
    });
  });

  it('parses !3d..!4d.. place data', () => {
    expect(
      parseCoordsFromMapsUrl(
        'https://www.google.com/maps/place/Data/!3d13.736717!4d100.523186!16z',
      ),
    ).toEqual({ lat: 13.736717, lng: 100.523186 });
  });

  it('parses ll= and /maps/search/', () => {
    expect(parseCoordsFromMapsUrl('https://maps.google.com/maps?ll=14.1,100.2&z=12')).toEqual({
      lat: 14.1,
      lng: 100.2,
    });
    expect(parseCoordsFromMapsUrl('https://www.google.com/maps/search/15.2,100.3')).toEqual({
      lat: 15.2,
      lng: 100.3,
    });
  });

  it('returns null for empty or non-coordinate links', () => {
    expect(parseCoordsFromMapsUrl('')).toBeNull();
    expect(parseCoordsFromMapsUrl('https://www.google.com/maps/place/Bangkok')).toBeNull();
    expect(parseCoordsFromMapsUrl('https://example.com/@999,100')).toBeNull();
  });

  it('detects short Google Maps hosts and Thailand bounds', () => {
    expect(isShortGoogleMapsUrl('https://maps.app.goo.gl/abc123')).toBe(true);
    expect(isShortGoogleMapsUrl('https://goo.gl/maps/abc123')).toBe(true);
    expect(isShortGoogleMapsUrl('https://goo.gl/xyz')).toBe(false);
    expect(isShortGoogleMapsUrl('https://evil.com/x')).toBe(false);
    expect(isAllowedGoogleMapsHost('maps.app.goo.gl')).toBe(true);
    expect(isAllowedGoogleMapsHost('evil.example')).toBe(false);
    expect(isInThailandApprox(13.65, 100.62)).toBe(true);
    expect(isInThailandApprox(1, 100)).toBe(false);
    expect(isInThailandApprox(13, 110)).toBe(false);
  });
});
