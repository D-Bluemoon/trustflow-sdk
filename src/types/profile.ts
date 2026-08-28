import type { StellarAddress } from './index';

/** A user's profile as stored on the TrustFlow backend. */
export interface Profile {
  /** Stellar address that owns this profile. */
  address: StellarAddress;
  /** Display name shown across the marketplace. */
  displayName?: string;
  /** Free-text biography. */
  bio?: string;
  /** URL of the profile's avatar image. */
  avatarUrl?: string;
  /** ISO 8601 timestamp of the last update. */
  updatedAt?: string;
}

/** Fields accepted when updating a profile. All fields are optional partial updates. */
export interface UpdateProfileParams {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
}
