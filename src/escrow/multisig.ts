import { Transaction, xdr } from '@stellar/stellar-sdk';
import type { ContractConfig } from '../types/contract';
import type {
  InitMultiSigParams,
  AddSignatureParams,
  MultiSigOperation,
  MultiSigStatus,
  SignatureEntry,
  InitMultiSigResult,
  AddSignatureResult,
  GetStatusResult,
  SubmitMultiSigResult,
  GetXdrResult,
} from '../types/multisig';
import { submitTransaction } from '../stellar/transaction';

/**
 * Client for collecting M-of-N signatures on shared backend Escrow operations.
 *
 * Flow:
 *  1. Call `initMultiSigOperation` with the base unsigned XDR and signer list.
 *  2. Each authorised signer calls `addSignature` with their signed XDR.
 *  3. Poll `getMultiSigStatus` to check progress.
 *  4. Once `isReady` is true, call `submitWhenReady` to broadcast the transaction.
 */
export class MultiSigEscrowClient {
  /** In-memory store of pending multi-sig operations, keyed by operationId. */
  private readonly operations = new Map<string, MultiSigOperation>();
  private _opCounter = 0;

  constructor(private readonly config: ContractConfig) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Initialises a new multi-sig operation for an escrow action.
   *
   * @param params - Configuration including signers list, threshold, XDR and network passphrase
   * @returns operationId used to reference this operation in subsequent calls
   */
  initMultiSigOperation(params: InitMultiSigParams): InitMultiSigResult {
    const validation = this._validateInitParams(params);
    if (!validation.ok) {
      return validation;
    }

    const operationId = `msig-${params.escrowId}-${Date.now()}-${++this._opCounter}`;
    const operation: MultiSigOperation = {
      operationId,
      escrowId: params.escrowId,
      operationType: params.operationType,
      unsignedXdr: params.unsignedXdr,
      networkPassphrase: params.networkPassphrase,
      collectedSignatures: [],
      threshold: params.threshold,
      signers: [...params.signers],
      status: 'pending',
      createdAt: Date.now(),
      expiresAt: params.expiresAt,
    };

    this.operations.set(operationId, operation);
    return { ok: true, data: { operationId } };
  }

  /**
   * Adds a signer's contribution to a pending multi-sig operation.
   * Extracts the `DecoratedSignature` from the provided XDR envelope and merges
   * it into the accumulated transaction without duplicating existing signatures.
   *
   * @param params - operationId, signerAddress, and the signer's signed XDR
   * @returns Updated status snapshot after the signature is recorded
   */
  addSignature(params: AddSignatureParams): AddSignatureResult {
    const operation = this.operations.get(params.operationId);
    if (!operation) {
      return { ok: false, error: `Operation ${params.operationId} not found` };
    }

    if (operation.status === 'submitted') {
      return { ok: false, error: 'Operation already submitted' };
    }
    if (operation.status === 'expired') {
      return { ok: false, error: 'Operation has expired' };
    }

    if (this._isExpired(operation)) {
      operation.status = 'expired';
      return { ok: false, error: 'Operation has expired' };
    }

    if (!operation.signers.includes(params.signerAddress)) {
      return {
        ok: false,
        error: `${params.signerAddress} is not an authorised signer for this operation`,
      };
    }

    const alreadySigned = operation.collectedSignatures.some(
      (s) => s.signerAddress === params.signerAddress,
    );
    if (alreadySigned) {
      return { ok: false, error: `${params.signerAddress} has already signed this operation` };
    }

    const xdrValidation = this._validateSignedXdr(params.signedXdr, operation.networkPassphrase);
    if (!xdrValidation.ok) {
      return xdrValidation;
    }

    const entry: SignatureEntry = {
      signerAddress: params.signerAddress,
      signedXdr: params.signedXdr,
      addedAt: Date.now(),
    };
    operation.collectedSignatures.push(entry);

    if (operation.collectedSignatures.length >= operation.threshold) {
      operation.status = 'ready';
    }

    return { ok: true, data: this._buildStatus(operation) };
  }

  /**
   * Returns the current signature-collection status for an operation.
   *
   * @param operationId - ID returned by `initMultiSigOperation`
   */
  getMultiSigStatus(operationId: string): GetStatusResult {
    const operation = this.operations.get(operationId);
    if (!operation) {
      return { ok: false, error: `Operation ${operationId} not found` };
    }

    if (this._isExpired(operation) && operation.status === 'pending') {
      operation.status = 'expired';
    }

    return { ok: true, data: this._buildStatus(operation) };
  }

  /**
   * Submits the assembled transaction to Horizon once the signature threshold is met.
   * All collected `DecoratedSignature` entries are merged into a single XDR envelope
   * before broadcast.
   *
   * @param operationId - ID returned by `initMultiSigOperation`
   * @param horizonUrl - Horizon server base URL (e.g. https://horizon-testnet.stellar.org)
   * @returns Transaction hash on success
   */
  async submitWhenReady(operationId: string, horizonUrl: string): Promise<SubmitMultiSigResult> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      return { ok: false, error: `Operation ${operationId} not found` };
    }

    if (this._isExpired(operation)) {
      operation.status = 'expired';
      return { ok: false, error: 'Operation has expired' };
    }

    if (operation.collectedSignatures.length < operation.threshold) {
      const needed = operation.threshold - operation.collectedSignatures.length;
      return {
        ok: false,
        error: `Threshold not met: need ${needed} more signature(s) before submission`,
      };
    }

    const assembledResult = this.getAssembledXdr(operationId);
    if (!assembledResult.ok) {
      return assembledResult;
    }

    try {
      const submitted = await submitTransaction(assembledResult.data.xdr, horizonUrl);
      operation.status = 'submitted';
      return {
        ok: true,
        data: {
          txHash: submitted.hash,
          operationId,
          escrowId: operation.escrowId,
        },
      };
    } catch (e) {
      return { ok: false, error: `Submission failed: ${String(e)}` };
    }
  }

  /**
   * Merges all collected signatures into the base XDR envelope and returns the
   * assembled envelope ready for broadcast.
   * Can be called at any point — useful for offline verification before submission.
   *
   * @param operationId - ID returned by `initMultiSigOperation`
   * @returns Base-64 XDR string of the assembled transaction envelope
   */
  getAssembledXdr(operationId: string): GetXdrResult {
    const operation = this.operations.get(operationId);
    if (!operation) {
      return { ok: false, error: `Operation ${operationId} not found` };
    }

    if (operation.collectedSignatures.length === 0) {
      return { ok: false, error: 'No signatures collected yet' };
    }

    try {
      const xdrResult = this._mergeSignatures(
        operation.unsignedXdr,
        operation.collectedSignatures.map((s) => s.signedXdr),
      );
      return { ok: true, data: { xdr: xdrResult } };
    } catch (e) {
      return { ok: false, error: `XDR assembly failed: ${String(e)}` };
    }
  }

  /**
   * Returns all operations associated with a given escrow, regardless of status.
   *
   * @param escrowId - Escrow identifier
   */
  listOperations(escrowId: string): MultiSigOperation[] {
    return Array.from(this.operations.values()).filter((op) => op.escrowId === escrowId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _validateInitParams(params: InitMultiSigParams): InitMultiSigResult | { ok: true } {
    if (!params.escrowId) {
      return { ok: false, error: 'escrowId is required' };
    }
    if (!params.signers || params.signers.length === 0) {
      return { ok: false, error: 'At least one signer is required' };
    }
    if (params.threshold < 1) {
      return { ok: false, error: 'threshold must be at least 1' };
    }
    if (params.threshold > params.signers.length) {
      return {
        ok: false,
        error: `threshold (${params.threshold}) cannot exceed the number of signers (${params.signers.length})`,
      };
    }
    if (!params.unsignedXdr) {
      return { ok: false, error: 'unsignedXdr is required' };
    }
    if (!params.networkPassphrase) {
      return { ok: false, error: 'networkPassphrase is required' };
    }
    if (params.networkPassphrase !== this.config.networkPassphrase) {
      return {
        ok: false,
        error: `networkPassphrase mismatch: expected "${this.config.networkPassphrase}"`,
      };
    }

    const uniqueSigners = new Set(params.signers);
    if (uniqueSigners.size !== params.signers.length) {
      return { ok: false, error: 'Duplicate signer addresses are not allowed' };
    }

    return { ok: true };
  }

  /**
   * Validates that a provided XDR is a parseable Stellar transaction envelope.
   * Returns ok:false with a descriptive error on any parse failure.
   */
  private _validateSignedXdr(
    signedXdr: string,
    networkPassphrase: string,
  ): { ok: true } | { ok: false; error: string } {
    try {
      new Transaction(signedXdr, networkPassphrase);
      return { ok: true };
    } catch {
      try {
        // FeeBump transactions are also valid envelopes
        xdr.TransactionEnvelope.fromXDR(signedXdr, 'base64');
        return { ok: true };
      } catch {
        return { ok: false, error: 'signedXdr is not a valid Stellar transaction envelope' };
      }
    }
  }

  /**
   * Merges `DecoratedSignature` entries from all `signedXdrs` into the base envelope.
   * Deduplicates by signature hint to prevent double-counting the same signer.
   */
  private _mergeSignatures(baseXdr: string, signedXdrs: string[]): string {
    const baseEnvelope = xdr.TransactionEnvelope.fromXDR(baseXdr, 'base64');

    // Collect all unique decorated signatures from contributor envelopes
    const seen = new Set<string>();
    const merged: xdr.DecoratedSignature[] = [];

    // Preserve any signatures already on the base envelope
    const baseSignatures = this._extractSignatures(baseEnvelope);
    for (const sig of baseSignatures) {
      const key = `${sig.hint().toString('hex')}:${sig.signature().toString('hex')}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(sig);
      }
    }

    // Add new signatures from each contributor
    for (const signedXdr of signedXdrs) {
      const envelope = xdr.TransactionEnvelope.fromXDR(signedXdr, 'base64');
      const sigs = this._extractSignatures(envelope);
      for (const sig of sigs) {
        const key = `${sig.hint().toString('hex')}:${sig.signature().toString('hex')}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(sig);
        }
      }
    }

    // Write merged signatures back onto the base envelope
    this._setSignatures(baseEnvelope, merged);
    return baseEnvelope.toXDR('base64');
  }

  /** Extracts `DecoratedSignature[]` from any TransactionEnvelope variant. */
  private _extractSignatures(envelope: xdr.TransactionEnvelope): xdr.DecoratedSignature[] {
    const type = envelope.switch();
    if (type === xdr.EnvelopeType.envelopeTypeTx()) {
      return envelope.v1().signatures();
    }
    if (type === xdr.EnvelopeType.envelopeTypeTxFeeBump()) {
      return envelope.feeBump().signatures();
    }
    // Legacy v0 envelope
    return (envelope as any).v0?.().signatures?.() ?? [];
  }

  /** Replaces the signatures array on an envelope in-place. */
  private _setSignatures(
    envelope: xdr.TransactionEnvelope,
    signatures: xdr.DecoratedSignature[],
  ): void {
    const type = envelope.switch();
    if (type === xdr.EnvelopeType.envelopeTypeTx()) {
      envelope.v1().signatures(signatures);
    } else if (type === xdr.EnvelopeType.envelopeTypeTxFeeBump()) {
      envelope.feeBump().signatures(signatures);
    } else {
      (envelope as any).v0?.().signatures?.(signatures);
    }
  }

  private _isExpired(operation: MultiSigOperation): boolean {
    return operation.expiresAt !== undefined && Date.now() > operation.expiresAt;
  }

  private _buildStatus(operation: MultiSigOperation): MultiSigStatus {
    const signersSigned = operation.collectedSignatures.map((s) => s.signerAddress);
    const signersRemaining = operation.signers.filter((s) => !signersSigned.includes(s));

    return {
      operationId: operation.operationId,
      escrowId: operation.escrowId,
      operationType: operation.operationType,
      signaturesCollected: operation.collectedSignatures.length,
      threshold: operation.threshold,
      signersAuthorised: [...operation.signers],
      signersSigned,
      signersRemaining,
      isReady: operation.collectedSignatures.length >= operation.threshold,
      status: operation.status,
      createdAt: operation.createdAt,
      expiresAt: operation.expiresAt,
    };
  }
}
