import { Horizon } from '@stellar/stellar-sdk';
import { HORIZON_URLS, DEFAULT_NETWORK } from './constants';
import { TrustFlowError } from './errors';
import type { Network, ClientConfig } from './types';

export class TrustFlowClient {
  private server: Horizon.Server;
  readonly network: Network;
  readonly contractId: string;

  constructor(config: ClientConfig) {
    this.network = config.network ?? DEFAULT_NETWORK;
    this.contractId = config.contractId;
    this.server = new Horizon.Server(HORIZON_URLS[this.network]);
  }

  async connect(): Promise<void> {
    try {
      await this.server.serverInfo();
    } catch (e) {
      throw new TrustFlowError('Failed to connect to Stellar network', 'CONNECTION_ERROR', e);
    }
  }

  async getBalance(address: string): Promise<string> {
    const account = await this.server.loadAccount(address);
    const native = account.balances.find((b: any) => b.asset_type === 'native');
    return native?.balance ?? '0';
  }

  getServer(): Horizon.Server {
    return this.server;
  }
}
