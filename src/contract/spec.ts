import { Spec as StellarSpec } from '@stellar/stellar-sdk/contract';
import { xdr } from '@stellar/stellar-sdk';
import { TrustFlowError } from '../errors';

export type SorobanSpecInput =
  | xdr.ScSpecEntry
  | xdr.ScSpecEntry[]
  | string
  | Uint8Array;

export interface SorobanUnionValue {
  tag: string;
  values?: unknown[];
}

type SorobanResultValue = { ok: unknown } | { error: unknown };
type SpecEntry = xdr.ScSpecEntry;

/**
 * Converts contract spec types to and from Soroban XDR.
 *
 * Enums use their numeric discriminant (`u32`) as the decoded JS value; callers
 * may also encode a case name. Unions use `{ tag, values }`, with `values`
 * omitted for unit cases. Structs decode to field-name objects (tuple structs
 * decode to arrays), and maps decode to `Map` instances.
 */
export class SorobanSpec {
  private readonly stellarSpec: StellarSpec;
  private readonly functions = new Map<string, xdr.ScSpecFunctionV0>();
  private readonly udts = new Map<string, SpecEntry>();

  constructor(input: SorobanSpecInput) {
    const entries = this.readEntries(input);
    if (entries.length === 0) {
      throw this.invalid('Contract spec must contain at least one entry');
    }

    this.stellarSpec = new StellarSpec(entries);
    for (const entry of entries) {
      switch (entry.switch().name) {
        case 'scSpecEntryFunctionV0': {
          const fn = entry.functionV0();
          this.functions.set(fn.name().toString(), fn);
          break;
        }
        case 'scSpecEntryUdtStructV0':
          this.udts.set(entry.udtStructV0().name().toString(), entry);
          break;
        case 'scSpecEntryUdtEnumV0':
          this.udts.set(entry.udtEnumV0().name().toString(), entry);
          break;
        case 'scSpecEntryUdtUnionV0':
          this.udts.set(entry.udtUnionV0().name().toString(), entry);
          break;
        case 'scSpecEntryUdtErrorEnumV0':
          this.udts.set(entry.udtErrorEnumV0().name().toString(), entry);
          break;
        default:
          break;
      }
    }
  }

  getFunction(name: string): xdr.ScSpecFunctionV0 {
    const fn = this.functions.get(name);
    if (!fn) {
      throw this.invalid(`Unknown contract function: ${name}`);
    }
    return fn;
  }

  encodeArgs(
    methodName: string,
    args: unknown[] | Record<string, unknown>,
  ): xdr.ScVal[] {
    const fn = this.getFunction(methodName);
    const inputs = fn.inputs();

    if (Array.isArray(args)) {
      if (args.length !== inputs.length) {
        throw this.invalid(
          `${methodName} expects ${inputs.length} arguments, received ${args.length}`,
        );
      }
      return inputs.map((input, index) => this.valToScVal(args[index], input.type()));
    }

    if (args === null || typeof args !== 'object') {
      throw this.invalid(`${methodName} arguments must be an array or object`);
    }

    const names = inputs.map((input) => input.name().toString());
    const unexpected = Object.keys(args).filter((name) => !names.includes(name));
    if (unexpected.length > 0) {
      throw this.invalid(`Unknown argument for ${methodName}: ${unexpected.join(', ')}`);
    }
    return inputs.map((input) => {
      const name = input.name().toString();
      if (!Object.prototype.hasOwnProperty.call(args, name)) {
        throw this.invalid(`Missing argument for ${methodName}: ${name}`);
      }
      return this.valToScVal(args[name], input.type());
    });
  }

  valToScVal(value: unknown, typeDef: xdr.ScSpecTypeDef): xdr.ScVal {
    try {
      return this.encodeValue(value, typeDef);
    } catch (error) {
      if (error instanceof TrustFlowError) throw error;
      throw this.invalid(`Unable to encode ${typeDef.switch().name}: ${String(error)}`, error);
    }
  }

  decodeReturnValue(methodName: string, value: xdr.ScVal | string): unknown {
    const fn = this.getFunction(methodName);
    const outputs = fn.outputs();
    const scVal = typeof value === 'string' ? this.parseXDRPayload(value) : value;
    try {
      if (outputs.length === 0) {
        if (scVal.switch().name !== 'scvVoid') {
          throw new Error(`Expected void return, received ${scVal.switch().name}`);
        }
        return null;
      }
      if (outputs.length !== 1) {
        throw new Error(`Multiple return values are not supported for ${methodName}`);
      }
      return this.decodeValue(scVal, outputs[0]);
    } catch (error) {
      if (error instanceof TrustFlowError) throw error;
      throw this.invalid(`Unable to decode return value from ${methodName}: ${String(error)}`, error);
    }
  }

  parseXDRPayload(payload: string | Uint8Array, encoding: 'base64' | 'hex' = 'base64'): xdr.ScVal {
    try {
      if (typeof payload !== 'string') {
        return xdr.ScVal.fromXDR(Buffer.from(payload));
      }
      return xdr.ScVal.fromXDR(payload, encoding);
    } catch (error) {
      throw this.invalid(`Invalid Soroban ScVal XDR payload: ${String(error)}`, error);
    }
  }

  private encodeValue(value: unknown, typeDef: xdr.ScSpecTypeDef): xdr.ScVal {
    const type = typeDef.switch().name;
    switch (type) {
      case 'scSpecTypeOption':
        return value === null || value === undefined
          ? xdr.ScVal.scvVoid()
          : this.encodeValue(value, typeDef.option().valueType());
      case 'scSpecTypeResult':
        return this.encodeResult(value, typeDef.result());
      case 'scSpecTypeVec': {
        if (!Array.isArray(value)) throw new TypeError('Vec values must be arrays');
        const elementType = typeDef.vec().elementType();
        return xdr.ScVal.scvVec(value.map((item) => this.encodeValue(item, elementType)));
      }
      case 'scSpecTypeTuple': {
        if (!Array.isArray(value)) throw new TypeError('Tuple values must be arrays');
        const types = typeDef.tuple().valueTypes();
        if (value.length !== types.length) {
          throw new TypeError(`Tuple expects ${types.length} values, received ${value.length}`);
        }
        return xdr.ScVal.scvVec(value.map((item, index) => this.encodeValue(item, types[index])));
      }
      case 'scSpecTypeMap':
        return this.encodeMap(value, typeDef.map());
      case 'scSpecTypeUdt':
        return this.encodeUdt(value, typeDef.udt().name().toString());
      case 'scSpecTypeMuxedAddress':
      case 'scSpecTypeError':
      case 'scSpecTypeVal':
        throw this.invalid(`Unsupported contract spec type: ${type}`);
      default:
        return this.stellarSpec.nativeToScVal(value, typeDef);
    }
  }

  private encodeMap(
    value: unknown,
    mapType: xdr.ScSpecTypeMap,
  ): xdr.ScVal {
    const entries =
      value instanceof Map
        ? Array.from(value.entries())
        : Array.isArray(value)
          ? value
          : null;
    if (!entries || entries.some((entry) => !Array.isArray(entry) || entry.length !== 2)) {
      throw new TypeError('Map values must be a Map or an array of key/value pairs');
    }

    const encoded = entries.map(([key, item]) =>
      new xdr.ScMapEntry({
        key: this.encodeValue(key, mapType.keyType()),
        val: this.encodeValue(item, mapType.valueType()),
      }),
    );
    encoded.sort((left, right) => Buffer.compare(left.key().toXDR(), right.key().toXDR()));
    return xdr.ScVal.scvMap(encoded);
  }

  private encodeUdt(value: unknown, name: string): xdr.ScVal {
    const entry = this.udts.get(name);
    if (!entry) throw new TypeError(`Unknown user-defined type: ${name}`);

    switch (entry.switch().name) {
      case 'scSpecEntryUdtEnumV0':
        return this.encodeEnum(value, entry.udtEnumV0());
      case 'scSpecEntryUdtErrorEnumV0':
        return this.encodeEnum(value, entry.udtErrorEnumV0(), true);
      case 'scSpecEntryUdtUnionV0':
        return this.encodeUnion(value, entry.udtUnionV0());
      case 'scSpecEntryUdtStructV0':
        return this.encodeStruct(value, entry.udtStructV0());
      default:
        throw new TypeError(`Unsupported user-defined type: ${name}`);
    }
  }

  private encodeEnum(
    value: unknown,
    definition: xdr.ScSpecUdtEnumV0 | xdr.ScSpecUdtErrorEnumV0,
    asError = false,
  ): xdr.ScVal {
    const cases = definition.cases();
    const enumCase =
      typeof value === 'string'
        ? cases.find((item) => item.name().toString() === value)
        : typeof value === 'number' && Number.isInteger(value)
          ? cases.find((item) => item.value() === value)
          : undefined;
    if (!enumCase) throw new TypeError(`Unknown enum case or discriminant: ${String(value)}`);
    return asError
      ? xdr.ScVal.scvError(xdr.ScError.sceContract(enumCase.value()))
      : xdr.ScVal.scvU32(enumCase.value());
  }

  private encodeUnion(value: unknown, definition: xdr.ScSpecUdtUnionV0): xdr.ScVal {
    if (!value || typeof value !== 'object' || !('tag' in value)) {
      throw new TypeError('Union value must have a tag');
    }
    const unionValue = value as SorobanUnionValue;
    const unionCase = definition.cases().find((item) => {
      const caseValue =
        item.switch().name === 'scSpecUdtUnionCaseVoidV0' ? item.voidCase() : item.tupleCase();
      return caseValue.name().toString() === unionValue.tag;
    });
    if (!unionCase) throw new TypeError(`Unknown union case: ${unionValue.tag}`);

    const values: unknown[] = unionValue.values ?? [];
    const encoded = [xdr.ScVal.scvSymbol(unionValue.tag)];
    if (unionCase.switch().name === 'scSpecUdtUnionCaseVoidV0') {
      if (values.length !== 0) throw new TypeError(`Union case ${unionValue.tag} takes no values`);
    } else {
      const types = unionCase.tupleCase().type();
      if (values.length !== types.length) {
        throw new TypeError(`Union case ${unionValue.tag} expects ${types.length} values`);
      }
      encoded.push(...values.map((item, index) => this.encodeValue(item, types[index])));
    }
    return xdr.ScVal.scvVec(encoded);
  }

  private encodeStruct(value: unknown, definition: xdr.ScSpecUdtStructV0): xdr.ScVal {
    if (!value || typeof value !== 'object') throw new TypeError('Struct value must be an object or array');
    const fields = definition.fields();
    const tupleStruct = fields.every((field) => /^\d+$/.test(field.name().toString()));
    if (tupleStruct) {
      if (!Array.isArray(value) || value.length !== fields.length) {
        throw new TypeError(`Tuple struct expects ${fields.length} values`);
      }
      return xdr.ScVal.scvVec(
        fields.map((field, index) => this.encodeValue(value[index], field.type())),
      );
    }

    if (Array.isArray(value)) throw new TypeError('Named struct values must be objects');
    const objectValue = value as Record<string, unknown>;
    const fieldNames = fields.map((field) => field.name().toString());
    const unexpected = Object.keys(objectValue).filter((name) => !fieldNames.includes(name));
    if (unexpected.length > 0) throw new TypeError(`Unknown struct fields: ${unexpected.join(', ')}`);

    const entries = fields.map((field) => {
      const name = field.name().toString();
      if (!Object.prototype.hasOwnProperty.call(objectValue, name)) {
        throw new TypeError(`Missing struct field: ${name}`);
      }
      return new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol(name),
        val: this.encodeValue(objectValue[name], field.type()),
      });
    });
    entries.sort((left, right) => left.key().sym().toString().localeCompare(right.key().sym().toString()));
    return xdr.ScVal.scvMap(entries);
  }

  private encodeResult(value: unknown, resultType: xdr.ScSpecTypeResult): xdr.ScVal {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('Result value must be { ok: value } or { error: case }');
    }
    if (Object.prototype.hasOwnProperty.call(value, 'ok') && Object.keys(value).length === 1) {
      return this.encodeValue((value as { ok: unknown }).ok, resultType.okType());
    }
    if (
      Object.prototype.hasOwnProperty.call(value, 'error') &&
      Object.keys(value).length === 1 &&
      resultType.errorType().switch().name === 'scSpecTypeUdt'
    ) {
      const errorName = resultType.errorType().udt().name().toString();
      const errorEntry = this.udts.get(errorName);
      if (errorEntry?.switch().name === 'scSpecEntryUdtErrorEnumV0') {
        return this.encodeEnum((value as { error: unknown }).error, errorEntry.udtErrorEnumV0(), true);
      }
      if (errorEntry?.switch().name === 'scSpecEntryUdtEnumV0') {
        return this.encodeEnum((value as { error: unknown }).error, errorEntry.udtEnumV0(), true);
      }
      throw new TypeError(`Unsupported Result error type: ${errorName}`);
    }
    throw new TypeError('Result value must have exactly one of the ok or error properties');
  }

  private decodeValue(value: xdr.ScVal, typeDef: xdr.ScSpecTypeDef): unknown {
    const type = typeDef.switch().name;
    switch (type) {
      case 'scSpecTypeOption':
        return value.switch().name === 'scvVoid'
          ? null
          : this.decodeValue(value, typeDef.option().valueType());
      case 'scSpecTypeResult':
        return this.decodeResult(value, typeDef.result());
      case 'scSpecTypeVec': {
        if (value.switch().name !== 'scvVec') throw new TypeError('Expected ScVal vector');
        return (value.vec() ?? []).map((item) => this.decodeValue(item, typeDef.vec().elementType()));
      }
      case 'scSpecTypeTuple': {
        if (value.switch().name !== 'scvVec') throw new TypeError('Expected ScVal tuple vector');
        const types = typeDef.tuple().valueTypes();
        const items = value.vec() ?? [];
        if (items.length !== types.length) throw new TypeError('Tuple return has the wrong length');
        return items.map((item, index) => this.decodeValue(item, types[index]));
      }
      case 'scSpecTypeMap': {
        if (value.switch().name !== 'scvMap') throw new TypeError('Expected ScVal map');
        const mapType = typeDef.map();
        return new Map(
          (value.map() ?? []).map((entry) => [
            this.decodeValue(entry.key(), mapType.keyType()),
            this.decodeValue(entry.val(), mapType.valueType()),
          ]),
        );
      }
      case 'scSpecTypeUdt':
        return this.decodeUdt(value, typeDef.udt().name().toString());
      case 'scSpecTypeMuxedAddress':
      case 'scSpecTypeError':
      case 'scSpecTypeVal':
        throw this.invalid(`Unsupported contract spec type: ${type}`);
      default:
        return this.stellarSpec.scValToNative(value, typeDef);
    }
  }

  private decodeUdt(value: xdr.ScVal, name: string): unknown {
    const entry = this.udts.get(name);
    if (!entry) throw new TypeError(`Unknown user-defined type: ${name}`);

    switch (entry.switch().name) {
      case 'scSpecEntryUdtEnumV0':
        return this.decodeEnum(value, entry.udtEnumV0());
      case 'scSpecEntryUdtErrorEnumV0':
        return this.decodeEnum(value, entry.udtErrorEnumV0());
      case 'scSpecEntryUdtUnionV0':
        return this.decodeUnion(value, entry.udtUnionV0());
      case 'scSpecEntryUdtStructV0':
        return this.decodeStruct(value, entry.udtStructV0());
      default:
        throw new TypeError(`Unsupported user-defined type: ${name}`);
    }
  }

  private decodeEnum(
    value: xdr.ScVal,
    definition: xdr.ScSpecUdtEnumV0 | xdr.ScSpecUdtErrorEnumV0,
  ): number {
    if (value.switch().name !== 'scvU32') throw new TypeError('Enum return must be a u32');
    const discriminant = value.u32();
    if (!definition.cases().some((item) => item.value() === discriminant)) {
      throw new TypeError(`Unknown enum discriminant: ${discriminant}`);
    }
    return discriminant;
  }

  private decodeUnion(value: xdr.ScVal, definition: xdr.ScSpecUdtUnionV0): SorobanUnionValue {
    if (value.switch().name !== 'scvVec') throw new TypeError('Union return must be a vector');
    const items = value.vec() ?? [];
    if (items.length === 0 || items[0].switch().name !== 'scvSymbol') {
      throw new TypeError('Union return must start with a case symbol');
    }
    const tag = items[0].sym().toString();
    const unionCase = definition.cases().find((item) => {
      const caseValue =
        item.switch().name === 'scSpecUdtUnionCaseVoidV0' ? item.voidCase() : item.tupleCase();
      return caseValue.name().toString() === tag;
    });
    if (!unionCase) throw new TypeError(`Unknown union case: ${tag}`);
    if (unionCase.switch().name === 'scSpecUdtUnionCaseVoidV0') {
      if (items.length !== 1) throw new TypeError(`Unit union case ${tag} has payload values`);
      return { tag };
    }

    const types = unionCase.tupleCase().type();
    if (items.length !== types.length + 1) {
      throw new TypeError(`Union case ${tag} has the wrong payload arity`);
    }
    return {
      tag,
      values: types.map((type, index) => this.decodeValue(items[index + 1], type)),
    };
  }

  private decodeStruct(value: xdr.ScVal, definition: xdr.ScSpecUdtStructV0): unknown {
    const fields = definition.fields();
    const tupleStruct = fields.every((field) => /^\d+$/.test(field.name().toString()));
    if (tupleStruct) {
      if (value.switch().name !== 'scvVec') throw new TypeError('Tuple struct return must be a vector');
      const items = value.vec() ?? [];
      if (items.length !== fields.length) throw new TypeError('Tuple struct return has the wrong length');
      return items.map((item, index) => this.decodeValue(item, fields[index].type()));
    }

    if (value.switch().name !== 'scvMap') throw new TypeError('Struct return must be a map');
    const entries = value.map() ?? [];
    const result: Record<string, unknown> = {};
    for (const field of fields) {
      const name = field.name().toString();
      const entry = entries.find(
        (item) => item.key().switch().name === 'scvSymbol' && item.key().sym().toString() === name,
      );
      if (!entry) throw new TypeError(`Missing struct field in return: ${name}`);
      result[name] = this.decodeValue(entry.val(), field.type());
    }
    if (entries.length !== fields.length) throw new TypeError('Struct return has unknown fields');
    return result;
  }

  private decodeResult(value: xdr.ScVal, resultType: xdr.ScSpecTypeResult): SorobanResultValue {
    if (value.switch().name !== 'scvError') {
      return { ok: this.decodeValue(value, resultType.okType()) };
    }
    const error = value.error();
    if (error.switch().name !== 'sceContract') {
      return { error };
    }
    const code = error.contractCode();
    const errorType = resultType.errorType();
    if (errorType.switch().name === 'scSpecTypeUdt') {
      const entry = this.udts.get(errorType.udt().name().toString());
      if (entry?.switch().name === 'scSpecEntryUdtErrorEnumV0') {
        const errorCase = entry.udtErrorEnumV0().cases().find((item) => item.value() === code);
        if (!errorCase) throw new TypeError(`Unknown contract error discriminant: ${code}`);
        return { error: errorCase.name().toString() };
      }
    }
    return { error: code };
  }

  private readEntries(input: SorobanSpecInput): xdr.ScSpecEntry[] {
    if (input instanceof xdr.ScSpecEntry) return [input];
    if (Array.isArray(input)) {
      return input.map((entry) =>
        typeof entry === 'string' ? this.parseSpecEntryString(entry) : entry,
      );
    }
    if (typeof input === 'string') {
      return [this.parseSpecEntryString(input)];
    }
    if (input instanceof Uint8Array) {
      return new StellarSpec(Buffer.from(input)).entries;
    }
    throw this.invalid('Unsupported contract spec input');
  }

  private parseSpecEntryString(input: string): xdr.ScSpecEntry {
    const isHex = /^[\da-f]+$/i.test(input) && input.length % 2 === 0;
    if (isHex && xdr.ScSpecEntry.validateXDR(input, 'hex')) {
      return xdr.ScSpecEntry.fromXDR(input, 'hex');
    }
    return xdr.ScSpecEntry.fromXDR(input, 'base64');
  }

  private invalid(message: string, cause?: unknown): TrustFlowError {
    return new TrustFlowError(message, 'INVALID_CONTRACT_CALL', cause);
  }
}
