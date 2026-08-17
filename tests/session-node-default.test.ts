import { saveSession, loadSession, clearSession } from '../src/auth/session';

// Deliberately does NOT mock `localStorage` — this file verifies the Node
// fallback (in-memory adapter) that replaces the old silent no-op behavior.
describe('Session management (Node default, no localStorage)', () => {
  beforeAll(() => {
    expect(typeof (global as any).localStorage).toBe('undefined');
  });

  afterEach(() => clearSession());

  it('persists sessions in-memory for the lifetime of the process', () => {
    saveSession('node-tok', 'GNODE');
    const s = loadSession();
    expect(s?.token).toBe('node-tok');
    expect(s?.address).toBe('GNODE');
  });

  it('clears the in-memory session', () => {
    saveSession('node-tok', 'GNODE');
    clearSession();
    expect(loadSession()).toBeNull();
  });
});
