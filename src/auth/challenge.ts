export interface AuthChallenge {
  challenge: string;
  expiresAt: number;
  address: string;
}

export async function requestChallenge(apiUrl: string, address: string): Promise<AuthChallenge> {
  const res = await fetch(`${apiUrl}/auth/challenge?address=${address}`);
  if (!res.ok) {
    throw new Error('Failed to get challenge');
  }
  const { challenge } = await res.json();
  return { challenge, expiresAt: Date.now() + 60_000, address };
}

export async function verifyAndGetToken(
  apiUrl: string,
  address: string,
  signature: string,
): Promise<string> {
  const res = await fetch(`${apiUrl}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, signature }),
  });
  if (!res.ok) {
    throw new Error('Signature verification failed');
  }
  const { token } = await res.json();
  return token;
}
