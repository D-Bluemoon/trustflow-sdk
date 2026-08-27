import { xdr } from '@stellar/stellar-sdk';

/**
 * Custom Jest matcher asserting a value is a structurally valid Stellar
 * `ScVal` — i.e. it round-trips through XDR encode/decode without throwing.
 * Used across the wrapper test suites to validate the contract call
 * arguments produced by `contract/build.ts`.
 */
function toBeValidScVal(received: unknown): jest.CustomMatcherResult {
  let encoded: Buffer;
  try {
    encoded = (received as xdr.ScVal).toXDR();
    xdr.ScVal.fromXDR(encoded);
  } catch (err) {
    return {
      pass: false,
      message: () =>
        `expected value to be a structurally valid Stellar ScVal, but XDR round-trip failed: ${String(err)}`,
    };
  }

  return {
    pass: true,
    message: () => 'expected value not to be a structurally valid Stellar ScVal',
  };
}

expect.extend({ toBeValidScVal });

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      /** Asserts the value is a structurally valid Stellar ScVal (round-trips through XDR). */
      toBeValidScVal(): R;
    }
  }
}

export {};
