import {
  BASE_FEE,
  Config,
  FeeBumpTransaction,
  Transaction,
  TransactionBuilder,
  rpc,
} from '@stellar/stellar-sdk';
import type { TrustFlowClient } from '../client';
import { TrustFlowError } from '../errors';
import { retry } from '../utils/retry';
import { queueDepth, queueKey, runExclusive } from './queue';
import type {
  AssembleParams,
  FeeBumpOptions,
  PipelineResult,
  PipelineSubmission,
  PrepareOptions,
  RetryPolicy,
  RunPipelineParams,
  SubmitOptions,
  SubmittableTransaction,
} from './types';
import { logger } from '../utils/logger';

const DEFAULT_RETRY_POLICY: Required<RetryPolicy> = {
  maxAttempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 5000,
};

const DEFAULT_RESOURCE_FEE_MULTIPLIER = 1.1;
const DEFAULT_POLL_INTERVAL_MS = 1500;
const DEFAULT_POLL_ATTEMPTS = 10;

function ok<T>(data: T): PipelineResult<T> {
  return { ok: true, data };
}

function fail<T>(error: TrustFlowError): PipelineResult<T> {
  return { ok: false, error };
}

const FEE_RELATED_PATTERN = /TRY_AGAIN_LATER|insufficient.?fee|tx_insufficient_fee/i;

/**
 * Fee-related failures are the only ones worth escalating to a fee-bump
 * retry. `submit()` always surfaces a top-level `RETRY_EXHAUSTED` error, so
 * the fee-related detail (e.g. `TRY_AGAIN_LATER`) must be read off the
 * wrapped `cause`, not the outer message.
 */
function isFeeRelated(error: TrustFlowError): boolean {
  const cause = error.cause instanceof Error ? error.cause.message : '';
  return FEE_RELATED_PATTERN.test(`${error.message} ${cause}`);
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  policy: RetryPolicy | undefined,
  stage: string,
): Promise<PipelineResult<T>> {
  const { maxAttempts, baseDelayMs, maxDelayMs } = { ...DEFAULT_RETRY_POLICY, ...policy };

  try {
    const data = await retry(fn, {
      attempts: maxAttempts,
      delayMs: (attempt) => Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs),
    });
    logger.debug('Pipeline stage succeeded', { stage, attempts: maxAttempts });
    return ok(data);
  } catch (e) {
    logger.warn('Pipeline stage failed after retries', { stage, maxAttempts, error: e });
    return fail(TrustFlowError.retryExhausted(stage, maxAttempts, e));
  }
}

/**
 * Unified pipeline for assembling, simulating, fee-adjusting, fee-bumping,
 * and retrying Soroban transactions.
 *
 * Flow:
 *  1. `assemble` — builds an unsigned transaction envelope from a source
 *     account and one or more operations.
 *  2. `prepare` — simulates the transaction against Soroban RPC and folds
 *     the resulting footprint, auth entries, and resource fee back onto the
 *     transaction (with retry/backoff on transient RPC failures).
 *  3. `submit` — signs and broadcasts the transaction, polling for
 *     confirmation, optionally escalating to a fee-bump transaction when the
 *     network reports a fee-related rejection.
 *  4. `run` — convenience method chaining all of the above.
 *
 * `run` serializes runs per source account: a later run for the same account
 * (and network) waits until the earlier one has confirmed, failed or timed
 * out, then reads a fresh sequence number, so concurrent runs never build
 * transactions with the same sequence. Runs for different accounts proceed in
 * parallel. The queue is shared by every `TransactionPipeline` in the current
 * process; it does not coordinate across processes or machines, and the
 * low-level `assemble`/`submit` methods bypass it. Use `queueTimeoutMs` to fail
 * with a `TIMEOUT` error instead of waiting behind a stuck run. There is no
 * abort signal yet, so a run that has started keeps the queue until it reaches
 * a terminal state.
 *
 * Every method returns a {@link PipelineResult}, never throws for expected
 * failure modes, so callers get typed, actionable errors without try/catch.
 *
 * @example
 * ```typescript
 * const pipeline = new TransactionPipeline(client);
 * const result = await pipeline.run({
 *   sourceAccount: senderPublicKey,
 *   operations: [contract.call('release', ...args)],
 *   signers: [senderKeypair],
 *   submit: { feeBump: { feeSource: sponsorKeypair } },
 * });
 *
 * if (!result.ok) {
 *   console.error(result.error.code, result.error.message);
 *   return;
 * }
 * console.log('confirmed:', result.data.hash);
 * ```
 */
export class TransactionPipeline {
  private readonly server: rpc.Server;
  private readonly pipelineLogger = logger;

  constructor(private readonly client: TrustFlowClient) {
    this.server = new rpc.Server(client.rpcUrl, { allowHttp: Config.isAllowHttp() });
  }

  /**
   * Builds an unsigned transaction envelope from a source account and one or
   * more operations. Does not contact Soroban RPC beyond fetching the
   * source account's current sequence number.
   *
   * @param params - Source account, operations, and optional memo/timeout/fee
   */
  async assemble(params: AssembleParams): Promise<PipelineResult<Transaction>> {
    this.pipelineLogger.debug('Assembling transaction', { sourceAccount: params.sourceAccount, operationsCount: params.operations.length });
    try {
      const account = await this.server.getAccount(params.sourceAccount);
      const builder = new TransactionBuilder(account, {
        fee: params.fee ?? BASE_FEE,
        networkPassphrase: this.client.getNetworkPassphrase(),
      }).setTimeout(params.timeoutSeconds ?? 30);

      for (const operation of params.operations) {
        builder.addOperation(operation);
      }
      if (params.memo) {
        builder.addMemo(params.memo);
      }

      this.pipelineLogger.debug('Transaction assembled', { sourceAccount: params.sourceAccount });
      return ok(builder.build());
    } catch (e) {
      this.pipelineLogger.error('Transaction assembly failed', { sourceAccount: params.sourceAccount, error: e });
      return fail(
        TrustFlowError.assemblyFailed(
          `could not assemble transaction for ${params.sourceAccount}`,
          e,
        ),
      );
    }
  }

  /**
   * Simulates a transaction against Soroban RPC without mutating it.
   * Useful for inspecting cost/return value before committing to `prepare`.
   *
   * @param tx - The transaction to simulate
   */
  async simulate(tx: Transaction): Promise<PipelineResult<rpc.Api.SimulateTransactionResponse>> {
    this.pipelineLogger.debug('Simulating transaction');
    try {
      const response = await this.server.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(response)) {
        this.pipelineLogger.warn('Transaction simulation error', { error: response.error });
        return fail(TrustFlowError.simulationFailed(response.error));
      }
      this.pipelineLogger.debug('Transaction simulated successfully');
      return ok(response);
    } catch (e) {
      this.pipelineLogger.error('Transaction simulation request failed', { error: e });
      return fail(TrustFlowError.simulationFailed('simulateTransaction request failed', e));
    }
  }

  /**
   * Simulates the transaction and folds the resulting footprint, auth
   * entries, and resource fee back onto a new copy of it, applying a safety
   * multiplier on top of the RPC-reported minimum resource fee. Retries on
   * transient RPC failures using exponential backoff.
   *
   * @param tx - The assembled, unsigned transaction to prepare
   * @param options - Resource fee multiplier and retry policy
   */
  async prepare(tx: Transaction, options?: PrepareOptions): Promise<PipelineResult<Transaction>> {
    const multiplier = options?.resourceFeeMultiplier ?? DEFAULT_RESOURCE_FEE_MULTIPLIER;

    this.pipelineLogger.debug('Preparing transaction', { resourceFeeMultiplier: multiplier });
    return withRetry(
      async () => {
        const simulation = await this.server.simulateTransaction(tx);
        if (rpc.Api.isSimulationError(simulation)) {
          throw TrustFlowError.simulationFailed(simulation.error);
        }

        // `assembleTransaction` reads the resource fee off `transactionData`
        // itself (not `minResourceFee`), so the headroom must be written
        // onto the SorobanTransactionData builder for it to take effect.
        const paddedFee = Math.ceil(Number(simulation.minResourceFee) * multiplier).toString();
        simulation.transactionData.setResourceFee(paddedFee);
        this.pipelineLogger.debug('Transaction prepared', { paddedFee, minResourceFee: simulation.minResourceFee });

        return rpc.assembleTransaction(tx, { ...simulation, minResourceFee: paddedFee }).build();
      },
      options,
      'prepare',
    );
  }

  /**
   * Wraps an already-signed (or to-be-signed) inner transaction in a
   * fee-bump envelope, paid for by `options.feeSource`.
   *
   * @param innerTx - The inner transaction to wrap
   * @param options - Fee source and base fee for the fee-bump envelope
   */
  buildFeeBump(innerTx: Transaction, options: FeeBumpOptions): PipelineResult<FeeBumpTransaction> {
    this.pipelineLogger.debug('Building fee-bump transaction', { feeSource: options.feeSource });
    try {
      const baseFee = options.baseFee ?? String(Number(BASE_FEE) * 10);
      const feeBump = TransactionBuilder.buildFeeBumpTransaction(
        options.feeSource,
        baseFee,
        innerTx,
        this.client.getNetworkPassphrase(),
      );
      this.pipelineLogger.debug('Fee-bump transaction built', { baseFee });
      return ok(feeBump);
    } catch (e) {
      this.pipelineLogger.error('Fee-bump transaction build failed', { error: e });
      return fail(TrustFlowError.feeBumpFailed('could not build fee-bump transaction', e));
    }
  }

  /**
   * Broadcasts a signed transaction and polls until it is confirmed on
   * ledger. Retries transient submission failures with exponential backoff.
   *
   * @param tx - A fully signed transaction or fee-bump transaction
   * @param options - Poll interval/attempts and retry policy
   */
  async submit(
    tx: SubmittableTransaction,
    options?: SubmitOptions,
  ): Promise<PipelineResult<PipelineSubmission>> {
    this.pipelineLogger.debug('Submitting transaction', { isFeeBump: tx instanceof FeeBumpTransaction });
    return withRetry(
      async (attempt) => {
        this.pipelineLogger.debug('Sending transaction to network', { attempt, hash: tx.hash?.toString() });
        const sendResult = await this.server.sendTransaction(tx);

        if (sendResult.status === 'ERROR') {
          this.pipelineLogger.error('Transaction rejected by node', { hash: sendResult.hash, errorResult: sendResult.errorResult });
          throw TrustFlowError.submissionFailed(
            `node rejected transaction (${sendResult.hash})`,
            sendResult.errorResult,
          );
        }
        if (sendResult.status === 'TRY_AGAIN_LATER') {
          this.pipelineLogger.warn('Node reported TRY_AGAIN_LATER', { hash: sendResult.hash });
          throw TrustFlowError.submissionFailed('node reported TRY_AGAIN_LATER');
        }

        const ledger = await this.pollForConfirmation(sendResult.hash, options);

        return {
          hash: sendResult.hash,
          ledger,
          feeBumped: tx instanceof FeeBumpTransaction,
          attempts: attempt,
          feeCharged: tx.fee,
        };
      },
      options,
      'submit',
    );
  }

  /**
   * Runs the full pipeline: assemble, prepare (simulate + auto-adjust
   * resource fee), sign, and submit. If the initial submission fails for a
   * fee-related reason and `submit.feeBump` is configured, automatically
   * builds and resubmits a fee-bump transaction before giving up.
   *
   * @param params - Assembly, signing, prepare, and submit configuration
   */
  async run(params: RunPipelineParams): Promise<PipelineResult<PipelineSubmission>> {
    this.pipelineLogger.info('Running transaction pipeline', { sourceAccount: params.sourceAccount, serialize: params.serialize });
    if (params.serialize === false) {
      return this.execute(params);
    }

    try {
      return await runExclusive(
        queueKey(this.client.getNetworkPassphrase(), params.sourceAccount),
        () => this.execute(params),
        params.queueTimeoutMs,
      );
    } catch (e) {
      // Only the queue wait raises a TrustFlowError here; `execute` reports
      // expected failures through its result, so anything else is unexpected.
      if (e instanceof TrustFlowError && e.code === 'TIMEOUT') {
        this.pipelineLogger.error('Pipeline queue timeout', { sourceAccount: params.sourceAccount });
        return fail(e);
      }
      throw e;
    }
  }

  /**
   * Number of `run()` calls for `sourceAccount` on this pipeline's network
   * that are currently executing or waiting in the queue (in this process).
   *
   * @param sourceAccount - Public key (G...) of the source account
   */
  queueDepth(sourceAccount: string): number {
    return queueDepth(queueKey(this.client.getNetworkPassphrase(), sourceAccount));
  }

  private async execute(params: RunPipelineParams): Promise<PipelineResult<PipelineSubmission>> {
    this.pipelineLogger.debug('Executing pipeline', { sourceAccount: params.sourceAccount });
    const assembled = await this.assemble(params);
    if (!assembled.ok) {
      return assembled;
    }

    const prepared = await this.prepare(assembled.data, params.prepare);
    if (!prepared.ok) {
      return prepared;
    }

    this.pipelineLogger.debug('Signing transaction', { signersCount: params.signers.length });
    prepared.data.sign(...params.signers);

    const submitted = await this.submit(prepared.data, params.submit);
    if (submitted.ok) {
      this.pipelineLogger.info('Transaction confirmed', { hash: submitted.data.hash, ledger: submitted.data.ledger });
      return submitted;
    }

    this.pipelineLogger.warn('Transaction submission failed', { error: submitted.error.message });

    const feeBumpOptions = params.submit?.feeBump;
    if (!feeBumpOptions || !isFeeRelated(submitted.error)) {
      return submitted;
    }

    this.pipelineLogger.info('Attempting fee-bump retry', { feeSource: feeBumpOptions.feeSource });
    const feeBumped = this.buildFeeBump(prepared.data, feeBumpOptions);
    if (!feeBumped.ok) {
      return feeBumped;
    }

    feeBumped.data.sign(feeBumpOptions.feeSource);

    const escalatedSubmission = await this.submit(feeBumped.data, {
      ...params.submit,
      feeBump: undefined,
    });
    if (!escalatedSubmission.ok) {
      return escalatedSubmission;
    }

    this.pipelineLogger.info('Fee-bump transaction confirmed', { hash: escalatedSubmission.data.hash });
    return ok({ ...escalatedSubmission.data, feeBumped: true });
  }

  private async pollForConfirmation(
    hash: string,
    options?: SubmitOptions,
  ): Promise<number | undefined> {
    const attempts = options?.pollAttempts ?? DEFAULT_POLL_ATTEMPTS;
    const intervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

    this.pipelineLogger.debug('Polling for transaction confirmation', { hash, maxAttempts: attempts, intervalMs });
    for (let i = 0; i < attempts; i++) {
      const result = await this.server.getTransaction(hash);

      if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        this.pipelineLogger.debug('Transaction confirmed on ledger', { hash, ledger: result.ledger });
        return result.ledger;
      }
      if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
        this.pipelineLogger.error('Transaction failed on-chain', { hash });
        throw TrustFlowError.submissionFailed(`transaction ${hash} failed on-chain`);
      }

      if (i < attempts - 1) {
        await sleep(intervalMs);
      }
    }

    this.pipelineLogger.error('Transaction confirmation timed out', { hash, attempts });
    throw TrustFlowError.submissionFailed(`timed out waiting for transaction ${hash} to confirm`);
  }
}