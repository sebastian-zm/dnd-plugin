import { vi, describe, it, expect, afterEach } from 'vitest';
import { elicit, setElicitBackend } from '../../src/lib/elicit.js';

afterEach(() => {
  setElicitBackend(null);
  delete global.window;
});

describe('elicit', () => {
  describe('window.prompt available', () => {
    it('returns the prompted value with available: true', async () => {
      global.window = { prompt: vi.fn().mockReturnValue('Gandalf') };
      const result = await elicit('Enter name');
      expect(result).toEqual({ value: 'Gandalf', available: true });
      expect(window.prompt).toHaveBeenCalledWith('Enter name');
    });

    it('returns null value when user cancels (prompt returns null)', async () => {
      global.window = { prompt: vi.fn().mockReturnValue(null) };
      const result = await elicit('Enter name');
      expect(result).toEqual({ value: null, available: true });
    });

    it('passes the message string to window.prompt', async () => {
      global.window = { prompt: vi.fn().mockReturnValue('') };
      await elicit('How much damage?');
      expect(window.prompt).toHaveBeenCalledWith('How much damage?');
    });
  });

  describe('custom backend set', () => {
    it('returns value from backend with available: true', async () => {
      setElicitBackend(vi.fn().mockResolvedValue('42'));
      const result = await elicit('Enter amount');
      expect(result).toEqual({ value: '42', available: true });
    });

    it('returns null value when backend resolves null', async () => {
      setElicitBackend(vi.fn().mockResolvedValue(null));
      const result = await elicit('Enter amount');
      expect(result).toEqual({ value: null, available: true });
    });

    it('passes the message to the backend', async () => {
      const backend = vi.fn().mockResolvedValue('yes');
      setElicitBackend(backend);
      await elicit('Confirm?');
      expect(backend).toHaveBeenCalledWith('Confirm?');
    });

    it('awaits an async backend', async () => {
      setElicitBackend(() => Promise.resolve('async-value'));
      const result = await elicit('anything');
      expect(result).toEqual({ value: 'async-value', available: true });
    });
  });

  describe('no mechanism available', () => {
    it('returns available: false and value: null', async () => {
      const result = await elicit('Enter value');
      expect(result).toEqual({ value: null, available: false });
    });
  });

  describe('precedence', () => {
    it('prefers custom backend over window.prompt when both present', async () => {
      global.window = { prompt: vi.fn().mockReturnValue('from-prompt') };
      const backend = vi.fn().mockResolvedValue('from-backend');
      setElicitBackend(backend);
      const result = await elicit('Which?');
      expect(result.value).toBe('from-backend');
      expect(window.prompt).not.toHaveBeenCalled();
    });
  });
});
