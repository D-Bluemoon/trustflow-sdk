import { Keypair } from '@stellar/stellar-sdk';
import { ProfileClient } from '../src/profile/client';

const ADDRESS = Keypair.random().publicKey();

const mockHttpGet = jest.fn();
const mockHttpPut = jest.fn();

jest.mock('../src/utils/http', () => ({
  createApiHttpClient: jest.fn(() => ({
    get: mockHttpGet,
    put: mockHttpPut,
  })),
  toApiErrorMessage: (error: unknown) =>
    error instanceof Error ? `Network error: ${error.message}` : `Network error: ${String(error)}`,
}));

describe('ProfileClient', () => {
  beforeEach(() => {
    mockHttpGet.mockReset();
    mockHttpPut.mockReset();
  });

  it('initialises with api url and token', () => {
    const client = new ProfileClient('http://api', 'tok');
    expect(client).toBeDefined();
  });

  describe('getProfile', () => {
    it('returns the profile for a valid address', async () => {
      mockHttpGet.mockResolvedValueOnce({
        data: { address: ADDRESS, displayName: 'Ada' },
      });

      const client = new ProfileClient('http://api', 'tok');
      const result = await client.getProfile(ADDRESS);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.displayName).toBe('Ada');
      }
      expect(mockHttpGet).toHaveBeenCalledWith(`/profiles/${ADDRESS}`);
    });

    it('rejects an invalid Stellar address without calling the API', async () => {
      const client = new ProfileClient('http://api', 'tok');
      const result = await client.getProfile('not-a-stellar-address');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/address/);
      }
      expect(mockHttpGet).not.toHaveBeenCalled();
    });

    it('returns an error result on network failure', async () => {
      mockHttpGet.mockRejectedValueOnce(new Error('connection reset'));

      const client = new ProfileClient('http://api', 'tok');
      const result = await client.getProfile(ADDRESS);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/Network error/);
      }
    });
  });

  describe('updateProfile', () => {
    it('updates the profile with the given fields', async () => {
      mockHttpPut.mockResolvedValueOnce({
        data: { address: ADDRESS, bio: 'Building on Stellar' },
      });

      const client = new ProfileClient('http://api', 'tok');
      const result = await client.updateProfile(ADDRESS, { bio: 'Building on Stellar' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.bio).toBe('Building on Stellar');
      }
      expect(mockHttpPut).toHaveBeenCalledWith(`/profiles/${ADDRESS}`, {
        bio: 'Building on Stellar',
      });
    });

    it('rejects an invalid Stellar address without calling the API', async () => {
      const client = new ProfileClient('http://api', 'tok');
      const result = await client.updateProfile('not-a-stellar-address', { bio: 'x' });

      expect(result.ok).toBe(false);
      expect(mockHttpPut).not.toHaveBeenCalled();
    });

    it('returns an error result on network failure', async () => {
      mockHttpPut.mockRejectedValueOnce(new Error('timeout'));

      const client = new ProfileClient('http://api', 'tok');
      const result = await client.updateProfile(ADDRESS, { bio: 'x' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/Network error/);
      }
    });
  });
});
