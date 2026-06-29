import { Keypair, xdr } from '@stellar/stellar-sdk';
import { buildCreateEscrowArgs, buildReleaseArgs, buildDisputeArgs } from '../src/contract/build';

const ADDR_A = Keypair.random().publicKey();
const ADDR_B = Keypair.random().publicKey();

function expectValidScValPayload(value: unknown): void {
    const scVal = value as xdr.ScVal;
    const encoded = scVal.toXDR();
    expect(() => xdr.ScVal.fromXDR(encoded)).not.toThrow();
}

describe('contract argument XDR payloads', () => {
    it('buildCreateEscrowArgs returns XDR-decodable ScVal values', () => {
        const args = buildCreateEscrowArgs({
            sender: ADDR_A,
            recipient: ADDR_B,
            amountStroops: 1_000_000n,
            durationBlocks: 42,
        });

        expect(args).toHaveLength(4);
        args.forEach(expectValidScValPayload);
    });

    it('buildReleaseArgs returns XDR-decodable ScVal values', () => {
        const args = buildReleaseArgs('escrow-1', ADDR_A);

        expect(args).toHaveLength(2);
        args.forEach(expectValidScValPayload);
    });

    it('buildDisputeArgs returns XDR-decodable ScVal values', () => {
        const args = buildDisputeArgs('escrow-1', 'work quality dispute');

        expect(args).toHaveLength(2);
        args.forEach(expectValidScValPayload);
    });
});
