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
  | 'BALANCE_FETCH_ERROR';

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
}
