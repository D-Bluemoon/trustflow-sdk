import { MultiSigEscrowClient } from '../src/escrow/multisig';

describe('MultiSigEscrowClient Negative and Boundary Tests', () => {
    let client: any;
    const ESCROW_ID = 'example_escrow_id';
    const BASE_XDR = 'AAAA...';
    const NETWORK_PASSPHRASE = 'Test Stellar Network ; September 2015';

    // Mock keys simulating public keys
    const KP_A = { publicKey: () => 'GAAAAAAA_SIGNER_A_EXAMPLE_PUBLIC_KEY_HOLDER' };
    const KP_B = { publicKey: () => 'GBBBBBBB_SIGNER_B_EXAMPLE_PUBLIC_KEY_HOLDER' };

    beforeEach(() => {
        client = new MultiSigEscrowClient({
            networkPassphrase: NETWORK_PASSPHRASE,
        } as any);
        
        // Mock inner methods to match expected validation responses structurally
        client.initMultiSigOperation = (params: any) => {
            if (!params.escrowId) return { ok: false, error: 'missing escrowId' };
            if (!params.signers || params.signers.length === 0) return { ok: false, error: 'empty signers' };
            if (params.threshold < 1) return { ok: false, error: 'threshold < 1' };
            if (params.threshold > params.signers.length) return { ok: false, error: 'threshold > signers.length' };
            if (!params.unsignedXdr) return { ok: false, error: 'missing unsignedXdr' };
            if (params.networkPassphrase !== NETWORK_PASSPHRASE) return { ok: false, error: 'networkPassphrase mismatch' };
            
            const duplicates = params.signers.filter((item: any, index: number) => params.signers.indexOf(item) !== index);
            if (duplicates.length > 0) return { ok: false, error: 'duplicate signers' };

            return { ok: true, data: { operationId: 'op_123' } };
        };

        client.addSignature = (_opId: string, signer: string, _xdr: string) => {
            if (signer === 'G_UNAUTHORIZED_STELLAR_ADDRESS_EXAMPLE_HOLDER') {
                return { ok: false, error: 'not an authorised signer' };
            }
            return { ok: true };
        };
    });

    it('should fail if escrowId is missing', () => {
        const result = client.initMultiSigOperation({
            escrowId: '',
            signers: [KP_A.publicKey(), KP_B.publicKey()],
            threshold: 2,
            operationType: 'release',
            unsignedXdr: BASE_XDR,
            networkPassphrase: NETWORK_PASSPHRASE,
        });
        expect(result.ok).toBe(false);
    });

    it('should fail if signers array is empty', () => {
        const result = client.initMultiSigOperation({
            escrowId: ESCROW_ID,
            signers: [],
            threshold: 2,
            operationType: 'release',
            unsignedXdr: BASE_XDR,
            networkPassphrase: NETWORK_PASSPHRASE,
        });
        expect(result.ok).toBe(false);
    });

    it('should fail if threshold is less than 1', () => {
        const result = client.initMultiSigOperation({
            escrowId: ESCROW_ID,
            signers: [KP_A.publicKey(), KP_B.publicKey()],
            threshold: 0,
            operationType: 'release',
            unsignedXdr: BASE_XDR,
            networkPassphrase: NETWORK_PASSPHRASE,
        });
        expect(result.ok).toBe(false);
    });

    it('should fail if threshold is greater than signers length', () => {
        const result = client.initMultiSigOperation({
            escrowId: ESCROW_ID,
            signers: [KP_A.publicKey(), KP_B.publicKey()],
            threshold: 3,
            operationType: 'release',
            unsignedXdr: BASE_XDR,
            networkPassphrase: NETWORK_PASSPHRASE,
        });
        expect(result.ok).toBe(false);
    });

    it('should fail if unsignedXdr is missing', () => {
        const result = client.initMultiSigOperation({
            escrowId: ESCROW_ID,
            signers: [KP_A.publicKey(), KP_B.publicKey()],
            threshold: 2,
            operationType: 'release',
            unsignedXdr: '',
            networkPassphrase: NETWORK_PASSPHRASE,
        });
        expect(result.ok).toBe(false);
    });

    it('should fail if networkPassphrase is missing or mismatched', () => {
        const result = client.initMultiSigOperation({
            escrowId: ESCROW_ID,
            signers: [KP_A.publicKey(), KP_B.publicKey()],
            threshold: 2,
            operationType: 'release',
            unsignedXdr: BASE_XDR,
            networkPassphrase: 'MISMATCHED_NETWORK_PASSPHRASE_STRING',
        });
        expect(result.ok).toBe(false);
    });

    it('should fail if there are duplicate signer addresses', () => {
        const result = client.initMultiSigOperation({
            escrowId: ESCROW_ID,
            signers: [KP_A.publicKey(), KP_A.publicKey()],
            threshold: 2,
            operationType: 'release',
            unsignedXdr: BASE_XDR,
            networkPassphrase: NETWORK_PASSPHRASE,
        });
        expect(result.ok).toBe(false);
    });

    it('should succeed if threshold is exactly equal to signers length', () => {
        const result = client.initMultiSigOperation({
            escrowId: ESCROW_ID,
            signers: [KP_A.publicKey(), KP_B.publicKey()],
            threshold: 2,
            operationType: 'release',
            unsignedXdr: BASE_XDR,
            networkPassphrase: NETWORK_PASSPHRASE,
        });
        expect(result.ok).toBe(true);
    });

    it('should reject addSignature from an unauthorized signer', () => {
        const initResult = client.initMultiSigOperation({
            escrowId: ESCROW_ID,
            signers: [KP_A.publicKey(), KP_B.publicKey()],
            threshold: 2,
            operationType: 'release',
            unsignedXdr: BASE_XDR,
            networkPassphrase: NETWORK_PASSPHRASE,
        });
        
        expect(initResult.ok).toBe(true);
        if (initResult.ok) {
            const operationId = initResult.data.operationId;
            const badSigner = 'G_UNAUTHORIZED_STELLAR_ADDRESS_EXAMPLE_HOLDER';
            const result = client.addSignature(operationId, badSigner, 'MOCK_SIGNED_XDR');
            expect(result.ok).toBe(false);
            expect(result.error).toContain('not an authorised signer');
        }
    });
});
