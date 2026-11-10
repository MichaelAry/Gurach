import { describe, expect, it } from 'vitest';
import { assertIsolatedTestDatabase } from './test-database.js';

describe('isolated integration database guard', () => {
  it('accepts explicit isolated test database names', () => {
    expect(() => assertIsolatedTestDatabase('gurach_test_tracks_01')).not.toThrow();
  });

  it.each(['gurach', 'nest', 'gurach_staging', 'gurach_test_', '../gurach_test_x']) (
    'rejects unsafe database name %s',
    (name) => expect(() => assertIsolatedTestDatabase(name)).toThrow(/gurach_test_/),
  );
});
