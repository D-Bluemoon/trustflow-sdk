import * as SDK from '../src/index';

describe('SDK Barrel Public Export Surface Integration Tests', () => {
    // Maintained allowlist tracking expected exported public modules to catch accidental drop drift
    const expectedExports = [
        'MultiSigEscrowClient',
        'TrustFlowClient',
        'TrustFlowError'
    ];

    it('should assert all core modules and clients are correctly exported from the public entry point', () => {
        const actualExports = Object.keys(SDK);
        
        for (const exportName of expectedExports) {
            expect(actualExports).toContain(exportName);
        }
    });

    it('should explicitly guarantee TrustFlowError is exported from the entry barrel surface', () => {
        expect(SDK).toHaveProperty('TrustFlowError');
    });
});
