export type TrustFlowErrorCode =
  | 'CONNECTION_ERROR'
  | 'CONTRACT_ERROR'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'SIMULATION_ERROR'
  | 'SIGNING_ERROR'
  | 'INVALID_CONFIG'
  | 'NOT_CONNECTED'
  | 'BALANCE_FETCH_ERROR'
  | 'MULTISIG_ERROR'
  | 'MULTISIG_THRESHOLD_NOT_MET'
  | 'MULTISIG_ALREADY_SIGNED'
  | 'MULTISIG_EXPIRED'
  | 'MULTISIG_INVALID_SIGNER'
  | 'MULTISIG_XDR_ERROR';

export class TrustFlowError extends Error {
  readonly code: TrustFlowErrorCode;
  readonly cause?: unknown;

  constructor(message: string, code: TrustFlowErrorCode, cause?: unknown) {
    super(message);
    this.name = 'TrustFlowError';
    this.code = code;
    this.cause = cause;
  }

  static notFound(resource: string): TrustFlowError {
    return new TrustFlowError(`${resource} not found`, 'NOT_FOUND');
  }

  static unauthorized(action: string): TrustFlowError {
    return new TrustFlowError(`Unauthorized to perform: ${action}`, 'UNAUTHORIZED');
  }

  static validation(field: string, message: string): TrustFlowError {
    return new TrustFlowError(`Validation failed for ${field}: ${message}`, 'VALIDATION_ERROR');
  }

  static multiSigThresholdNotMet(collected: number, required: number): TrustFlowError {
    return new TrustFlowError(
      `Multi-sig threshold not met: ${collected}/${required} signatures collected`,
      'MULTISIG_THRESHOLD_NOT_MET',
    );
  }

  static multiSigExpired(operationId: string): TrustFlowError {
    return new TrustFlowError(`Multi-sig operation ${operationId} has expired`, 'MULTISIG_EXPIRED');
  }

  static multiSigInvalidSigner(address: string): TrustFlowError {
    return new TrustFlowError(
      `${address} is not an authorised signer for this operation`,
      'MULTISIG_INVALID_SIGNER',
    );
  }

  static multiSigXdrError(detail: string): TrustFlowError {
    return new TrustFlowError(`Multi-sig XDR error: ${detail}`, 'MULTISIG_XDR_ERROR');
  }
}
