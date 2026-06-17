import { isValidStellarAddress, isValidXLMAmount, xlmToStroops } from '../src/utils/validation';
import { stroopsToXLM } from '../src/utils/format';

describe('Stellar address validation', () => {
  it('accepts valid G... address', () => expect(isValidStellarAddress('G' + 'A'.repeat(55))).toBe(true));
  it('rejects short address', () => expect(isValidStellarAddress('GABC')).toBe(false));
  it('rejects non-G prefix', () => expect(isValidStellarAddress('S' + 'A'.repeat(55))).toBe(false));
});

describe('XLM amount validation', () => {
  it('accepts valid amount', () => expect(isValidXLMAmount('100')).toBe(true));
  it('accepts decimal amount', () => expect(isValidXLMAmount('0.5')).toBe(true));
  it('rejects zero', () => expect(isValidXLMAmount('0')).toBe(false));
  it('rejects negative', () => expect(isValidXLMAmount('-1')).toBe(false));
});

describe('XLM/stroops conversion', () => {
  it('converts 1 XLM to 10_000_000 stroops', () => expect(xlmToStroops('1')).toBe(10_000_000n));
  it('converts 0.5 XLM to 5_000_000 stroops', () => expect(xlmToStroops('0.5')).toBe(5_000_000n));
  it('converts stroops back to XLM', () => expect(stroopsToXLM(10_000_000n)).toBe('1'));
});
