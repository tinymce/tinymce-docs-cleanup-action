import { expect, test, describe } from '@jest/globals';
import { extractVersion, compareVersions, Version } from './version';

describe('extractVersion', () => {
  test('extracts valid version from string', () => {
    const result = extractVersion('run-123-4');
    expect(result).toEqual({
      version: 'run-123-4',
      run: 123,
      attempt: 4
    });
  });

  test('extracts version with single digit run and attempt', () => {
    const result = extractVersion('run-1-2');
    expect(result).toEqual({
      version: 'run-1-2',
      run: 1,
      attempt: 2
    });
  });

  test('extracts version with large numbers', () => {
    const result = extractVersion('run-999999-888888');
    expect(result).toEqual({
      version: 'run-999999-888888',
      run: 999999,
      attempt: 888888
    });
  });

  test('returns undefined for invalid format - missing prefix', () => {
    const result = extractVersion('123-4');
    expect(result).toBeUndefined();
  });

  test('returns undefined for invalid format - wrong separator', () => {
    const result = extractVersion('run_123_4');
    expect(result).toBeUndefined();
  });

  test('returns undefined for invalid format - extra parts', () => {
    const result = extractVersion('run-123-4-5');
    expect(result).toBeUndefined();
  });

  test('returns undefined for invalid format - non-numeric run', () => {
    const result = extractVersion('run-abc-4');
    expect(result).toBeUndefined();
  });

  test('returns undefined for invalid format - non-numeric attempt', () => {
    const result = extractVersion('run-123-xyz');
    expect(result).toBeUndefined();
  });

  test('returns undefined for invalid format - negative numbers', () => {
    const result = extractVersion('run--123-4');
    expect(result).toBeUndefined();
  });

  test('returns undefined for invalid format - decimal numbers', () => {
    const result = extractVersion('run-123.5-4');
    expect(result).toBeUndefined();
  });

  test('returns undefined for empty string', () => {
    const result = extractVersion('');
    expect(result).toBeUndefined();
  });

  test('returns undefined for non-string input - number', () => {
    const result = extractVersion(123);
    expect(result).toBeUndefined();
  });

  test('returns undefined for non-string input - null', () => {
    const result = extractVersion(null);
    expect(result).toBeUndefined();
  });

  test('returns undefined for non-string input - undefined', () => {
    const result = extractVersion(undefined);
    expect(result).toBeUndefined();
  });

  test('returns undefined for non-string input - object', () => {
    const result = extractVersion({ version: 'run-123-4' });
    expect(result).toBeUndefined();
  });

  test('returns undefined for non-string input - array', () => {
    const result = extractVersion([ 'run-123-4' ]);
    expect(result).toBeUndefined();
  });
});

describe('compareVersions', () => {
  test('returns 0 for identical versions', () => {
    const v1: Version = { version: 'run-123-4', run: 123, attempt: 4 };
    const v2: Version = { version: 'run-123-4', run: 123, attempt: 4 };
    expect(compareVersions(v1, v2)).toBe(0);
  });

  test('returns negative when first run is lower', () => {
    const v1: Version = { version: 'run-122-4', run: 122, attempt: 4 };
    const v2: Version = { version: 'run-123-4', run: 123, attempt: 4 };
    expect(compareVersions(v1, v2)).toBeLessThan(0);
  });

  test('returns positive when first run is higher', () => {
    const v1: Version = { version: 'run-124-4', run: 124, attempt: 4 };
    const v2: Version = { version: 'run-123-4', run: 123, attempt: 4 };
    expect(compareVersions(v1, v2)).toBeGreaterThan(0);
  });

  test('returns negative when runs equal but first attempt is lower', () => {
    const v1: Version = { version: 'run-123-3', run: 123, attempt: 3 };
    const v2: Version = { version: 'run-123-4', run: 123, attempt: 4 };
    expect(compareVersions(v1, v2)).toBeLessThan(0);
  });

  test('returns positive when runs equal but first attempt is higher', () => {
    const v1: Version = { version: 'run-123-5', run: 123, attempt: 5 };
    const v2: Version = { version: 'run-123-4', run: 123, attempt: 4 };
    expect(compareVersions(v1, v2)).toBeGreaterThan(0);
  });

  test('compares correctly with large run number difference', () => {
    const v1: Version = { version: 'run-1-100', run: 1, attempt: 100 };
    const v2: Version = { version: 'run-1000-1', run: 1000, attempt: 1 };
    expect(compareVersions(v1, v2)).toBeLessThan(0);
  });

  test('run number takes precedence over attempt', () => {
    const v1: Version = { version: 'run-100-1', run: 100, attempt: 1 };
    const v2: Version = { version: 'run-99-999', run: 99, attempt: 999 };
    expect(compareVersions(v1, v2)).toBeGreaterThan(0);
  });

  test('handles minimum values', () => {
    const v1: Version = { version: 'run-0-0', run: 0, attempt: 0 };
    const v2: Version = { version: 'run-0-0', run: 0, attempt: 0 };
    expect(compareVersions(v1, v2)).toBe(0);
  });

  test('can be used for sorting - ascending', () => {
    const versions: Version[] = [
      { version: 'run-123-2', run: 123, attempt: 2 },
      { version: 'run-122-1', run: 122, attempt: 1 },
      { version: 'run-123-1', run: 123, attempt: 1 },
      { version: 'run-124-1', run: 124, attempt: 1 }
    ];
    versions.sort(compareVersions);
    expect(versions.map((v) => v.version)).toEqual([
      'run-122-1',
      'run-123-1',
      'run-123-2',
      'run-124-1'
    ]);
  });
});
