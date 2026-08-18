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

describe('Session management (environment detection)', () => {
  afterEach(() => {
    delete (global as any).localStorage;
    clearSession();
  });

  it('picks the in-memory adapter when localStorage is absent, and localStorage when present', () => {
    expect(typeof (global as any).localStorage).toBe('undefined');
    saveSession('node-tok', 'GNODE');
    expect(loadSession()?.token).toBe('node-tok');

    const backing: Record<string, string> = {};
    (global as any).localStorage = {
      getItem: (k: string) => backing[k] ?? null,
      setItem: (k: string, v: string) => {
        backing[k] = v;
      },
      removeItem: (k: string) => {
        delete backing[k];
      },
    };

    // A session saved after localStorage becomes available goes through it,
    // not the earlier in-memory fallback — detection happens per-call, not
    // once at import time, so this doesn't require re-importing the module.
    saveSession('browser-tok', 'GBROWSER');
    expect(backing['trustflow_token']).toBe('browser-tok');
    expect(loadSession()?.token).toBe('browser-tok');
  });
});
