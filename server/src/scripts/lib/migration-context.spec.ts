import { describe, expect, it } from 'vitest';
import {
  assertSafeApplyTarget,
  createTargetFingerprint,
  databaseFromUri,
  parseMigrationArguments,
  resolveReportPath,
} from './migration-context.js';

describe('migration command safety', () => {
  it('requires explicit apply confirmation and an explicit migration target', () => {
    expect(() => parseMigrationArguments(['db:migrate:apply', '--migration', '001-example', '--database', 'gurach_test_01']))
      .toThrow(/requires --apply/);
    expect(() => parseMigrationArguments(['db:migrate:plan', '--migration', '001-example']))
      .toThrow(/--database is required/);
    expect(parseMigrationArguments([
      'db:migrate:apply', '--migration=001-example', '--database=gurach_test_01', '--apply', '--batch-size=25',
    ])).toMatchObject({ command: 'db:migrate:apply', migration: '001-example', database: 'gurach_test_01', batchSize: 25, apply: true });
  });

  it('defaults lifecycle rollback to a private-report dry-run and requires a reviewed fingerprint for apply', () => {
    const preview = parseMigrationArguments([
      'db:migrate:rollback', '--migration', '001-track-lifecycle', '--database', 'gurach_test_01',
      '--report', '.local/migration-private/rollback-preview.json',
    ]);
    expect(preview).toMatchObject({ command: 'db:migrate:rollback', dryRun: true, apply: false });
    expect(() => parseMigrationArguments([
      'db:migrate:rollback', '--migration', '001-track-lifecycle', '--database', 'gurach_test_01',
      '--report', '.local/migration-private/rollback.json', '--apply',
    ])).toThrow(/expected-fingerprint/);
    expect(parseMigrationArguments([
      'db:migrate:rollback', '--migration', '001-track-lifecycle', '--database', 'gurach_test_01',
      '--report', '.local/migration-private/rollback.json', '--apply', '--expected-fingerprint', 'a'.repeat(64),
    ])).toMatchObject({ dryRun: false, apply: true, expectedFingerprint: 'a'.repeat(64) });
  });

  it('requires private reports for the full comment-parent dry-run classification', () => {
    expect(() => parseMigrationArguments([
      'db:migrate:plan', '--migration', '002-comment-parents', '--database', 'gurach_test_01',
    ])).toThrow(/private --report/);
    expect(parseMigrationArguments([
      'db:migrate:plan', '--migration', '002-comment-parents', '--database', 'gurach_test_01',
      '--report', '.local/migration-private/comment-parent-plan.json',
    ])).toMatchObject({ command: 'db:migrate:plan', report: '.local/migration-private/comment-parent-plan.json' });
    expect(() => parseMigrationArguments([
      'db:migrate:apply', '--migration', '002-comment-parents', '--database', 'gurach_test_01', '--apply',
    ])).toThrow(/private --report/);
  });

  it.each([
    ['db:audit', '--unknown'],
    ['db:audit', '--database', 'admin'],
    ['db:migrate:plan', '--migration', '../unsafe', '--database', 'gurach_test_01'],
    ['db:migrate:plan', '--migration', '001-example', '--database', 'gurach_test_01', '--batch-size', '1001'],
  ])('rejects unsafe CLI arguments: %s %s', (...argv) => {
    expect(() => parseMigrationArguments(argv)).toThrow();
  });

  it('restricts mutation to isolated test databases and report paths to a private local directory', () => {
    expect(() => assertSafeApplyTarget('gurach')).toThrow(/gurach_test_/);
    expect(() => assertSafeApplyTarget('gurach_test_42')).not.toThrow();
    expect(resolveReportPath('.local/migration-private/audit.json')).toContain('/.local/migration-private/audit.json');
    expect(() => resolveReportPath('.local/execution/audit.json')).toThrow(/migration-private/);
    expect(() => resolveReportPath('docs/audit.json')).toThrow(/migration-private/);
  });

  it('derives a target name and a stable, target-specific fingerprint', () => {
    expect(databaseFromUri('mongodb://user:secret@localhost:27017/gurach_test_01?authSource=admin')).toBe('gurach_test_01');
    const left = createTargetFingerprint('gurach_test_01', { setName: 'rs0', hosts: ['b:27017', 'a:27017'], me: 'a:27017', primary: 'a:27017' });
    const reordered = createTargetFingerprint('gurach_test_01', { hosts: ['a:27017', 'b:27017'], setName: 'rs0', me: 'b:27017', primary: 'b:27017' });
    const other = createTargetFingerprint('gurach_test_02', { setName: 'rs0', hosts: ['a:27017', 'b:27017'] });
    expect(left).toBe(reordered);
    expect(left).not.toBe(other);
  });
});
