// Minimal shim for mocha TDD globals (suite/test) so the test file can be
// compiled with the project's tsc setup without adding @types/mocha.
declare function suite(name: string, fn: () => void): void;
declare function test(name: string, fn: () => void): void;
