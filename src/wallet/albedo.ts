export interface AlbedoWallet {
  publicKey(params?: { token?: string }): Promise<{ pubkey: string; token: string }>;
  tx(params: {
    xdr: string;
    network?: string;
  }): Promise<{ signed_envelope_xdr: string; tx_hash: string }>;
}

interface AlbedoWindow {
  albedo?: AlbedoWallet;
}

declare const window: AlbedoWindow | undefined;

export function getAlbedo(): AlbedoWallet | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window?.albedo ?? null;
}
