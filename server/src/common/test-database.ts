export function assertIsolatedTestDatabase(databaseName: string): void {
  if (!/^gurach_test_[a-zA-Z0-9_-]+$/.test(databaseName)) {
    throw new Error('Integration tests require a database named gurach_test_*');
  }
}
