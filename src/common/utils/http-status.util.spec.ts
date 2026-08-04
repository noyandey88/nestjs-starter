import { getHttpStatusName } from './http-status.util';

describe('getHttpStatusName', () => {
  it('converts a numeric status to its name', () => {
    expect(getHttpStatusName(200)).toBe('OK');
    expect(getHttpStatusName(404)).toBe('NOT_FOUND');
  });

  it('converts a numeric string to its name', () => {
    expect(getHttpStatusName('409')).toBe('CONFLICT');
  });

  it('passes through a non-numeric string', () => {
    expect(getHttpStatusName('OK')).toBe('OK');
  });

  it('returns UNKNOWN_STATUS for an unmapped number', () => {
    expect(getHttpStatusName(999)).toBe('UNKNOWN_STATUS');
  });
});
