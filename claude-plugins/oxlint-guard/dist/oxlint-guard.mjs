import * as ChildProcess from "node:child_process";
import * as Crypto from "node:crypto";
import * as NFS from "node:fs";
import * as OS from "node:os";
import * as Path$2 from "node:path";
import * as NodeUrl from "node:url";
import * as readline from "node:readline";
import { Workflow } from "@systemfsoftware/effect-cell-types";
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Function.js
/**
* Tests if a value is a `function`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isFunction } from "effect/Predicate"
*
* assert.deepStrictEqual(isFunction(isFunction), true)
* assert.deepStrictEqual(isFunction("function"), false)
* ```
*
* @category guards
* @since 2.0.0
*/
const isFunction$1 = (input) => typeof input === "function";
/**
* Creates a function that can be used in a data-last (aka `pipe`able) or
* data-first style.
*
* The first parameter to `dual` is either the arity of the uncurried function
* or a predicate that determines if the function is being used in a data-first
* or data-last style.
*
* Using the arity is the most common use case, but there are some cases where
* you may want to use a predicate. For example, if you have a function that
* takes an optional argument, you can use a predicate to determine if the
* function is being used in a data-first or data-last style.
*
* You can pass either the arity of the uncurried function or a predicate
* which determines if the function is being used in a data-first or
* data-last style.
*
* **Example** (Using arity to determine data-first or data-last style)
*
* ```ts
* import { dual, pipe } from "effect/Function"
*
* const sum = dual<
*   (that: number) => (self: number) => number,
*   (self: number, that: number) => number
* >(2, (self, that) => self + that)
*
* console.log(sum(2, 3)) // 5
* console.log(pipe(2, sum(3))) // 5
* ```
*
* **Example** (Using call signatures to define the overloads)
*
* ```ts
* import { dual, pipe } from "effect/Function"
*
* const sum: {
*   (that: number): (self: number) => number
*   (self: number, that: number): number
* } = dual(2, (self: number, that: number): number => self + that)
*
* console.log(sum(2, 3)) // 5
* console.log(pipe(2, sum(3))) // 5
* ```
*
* **Example** (Using a predicate to determine data-first or data-last style)
*
* ```ts
* import { dual, pipe } from "effect/Function"
*
* const sum = dual<
*   (that: number) => (self: number) => number,
*   (self: number, that: number) => number
* >(
*   (args) => args.length === 2,
*   (self, that) => self + that
* )
*
* console.log(sum(2, 3)) // 5
* console.log(pipe(2, sum(3))) // 5
* ```
*
* @since 2.0.0
*/
const dual = function(arity, body) {
	if (typeof arity === "function") return function() {
		if (arity(arguments)) return body.apply(this, arguments);
		return (self) => body(self, ...arguments);
	};
	switch (arity) {
		case 0:
		case 1: throw new RangeError(`Invalid arity ${arity}`);
		case 2: return function(a, b) {
			if (arguments.length >= 2) return body(a, b);
			return function(self) {
				return body(self, a);
			};
		};
		case 3: return function(a, b, c) {
			if (arguments.length >= 3) return body(a, b, c);
			return function(self) {
				return body(self, a, b);
			};
		};
		case 4: return function(a, b, c, d) {
			if (arguments.length >= 4) return body(a, b, c, d);
			return function(self) {
				return body(self, a, b, c);
			};
		};
		case 5: return function(a, b, c, d, e) {
			if (arguments.length >= 5) return body(a, b, c, d, e);
			return function(self) {
				return body(self, a, b, c, d);
			};
		};
		default: return function() {
			if (arguments.length >= arity) return body.apply(this, arguments);
			const args = arguments;
			return function(self) {
				return body(self, ...args);
			};
		};
	}
};
/**
* The identity function, i.e. A function that returns its input argument.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { identity } from "effect/Function"
*
* assert.deepStrictEqual(identity(5), 5)
* ```
*
* @since 2.0.0
*/
const identity = (a) => a;
/**
* Creates a constant value that never changes.
*
* This is useful when you want to pass a value to a higher-order function (a function that takes another function as its argument)
* and want that inner function to always use the same value, no matter how many times it is called.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { constant } from "effect/Function"
*
* const constNull = constant(null)
*
* assert.deepStrictEqual(constNull(), null)
* assert.deepStrictEqual(constNull(), null)
* ```
*
* @since 2.0.0
*/
const constant = (value) => () => value;
/**
* A thunk that returns always `true`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { constTrue } from "effect/Function"
*
* assert.deepStrictEqual(constTrue(), true)
* ```
*
* @since 2.0.0
*/
const constTrue = /*#__PURE__*/ constant(true);
/**
* A thunk that returns always `false`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { constFalse } from "effect/Function"
*
* assert.deepStrictEqual(constFalse(), false)
* ```
*
* @since 2.0.0
*/
const constFalse = /*#__PURE__*/ constant(false);
/**
* A thunk that returns always `undefined`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { constUndefined } from "effect/Function"
*
* assert.deepStrictEqual(constUndefined(), undefined)
* ```
*
* @since 2.0.0
*/
const constUndefined = /*#__PURE__*/ constant(void 0);
/**
* A thunk that returns always `void`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { constVoid } from "effect/Function"
*
* assert.deepStrictEqual(constVoid(), undefined)
* ```
*
* @since 2.0.0
*/
const constVoid = constUndefined;
function pipe(a, ab, bc, cd, de, ef, fg, gh, hi) {
	switch (arguments.length) {
		case 1: return a;
		case 2: return ab(a);
		case 3: return bc(ab(a));
		case 4: return cd(bc(ab(a)));
		case 5: return de(cd(bc(ab(a))));
		case 6: return ef(de(cd(bc(ab(a)))));
		case 7: return fg(ef(de(cd(bc(ab(a))))));
		case 8: return gh(fg(ef(de(cd(bc(ab(a)))))));
		case 9: return hi(gh(fg(ef(de(cd(bc(ab(a))))))));
		default: {
			let ret = arguments[0];
			for (let i = 1; i < arguments.length; i++) ret = arguments[i](ret);
			return ret;
		}
	}
}
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/GlobalValue.js
/**
* The `GlobalValue` module ensures that a single instance of a value is created globally,
* even when modules are imported multiple times (e.g., due to mixing CommonJS and ESM builds)
* or during hot-reloading in development environments like Next.js or Remix.
*
* It achieves this by using a versioned global store, identified by a unique `Symbol` tied to
* the current version of the `effect` library. The store holds values that are keyed by an identifier,
* allowing the reuse of previously computed instances across imports or reloads.
*
* This pattern is particularly useful in scenarios where frequent reloading can cause services or
* single-instance objects to be recreated unnecessarily, such as in development environments with hot-reloading.
*
* @since 2.0.0
*/
const globalStoreId = `effect/GlobalValue`;
let globalStore;
/**
* Retrieves or computes a global value associated with the given `id`. If the value for this `id`
* has already been computed, it will be returned from the global store. If it does not exist yet,
* the provided `compute` function will be executed to compute the value, store it, and then return it.
*
* This ensures that even in cases where the module is imported multiple times (e.g., in mixed environments
* like CommonJS and ESM, or during hot-reloading in development), the value is computed only once and reused
* thereafter.
*
* @example
* ```ts
* import { globalValue } from "effect/GlobalValue"
*
* // This cache will persist as long as the module is running,
* // even if reloaded or imported elsewhere
* const myCache = globalValue(
*   Symbol.for("myCache"),
*   () => new WeakMap<object, number>()
* )
* ```
*
* @since 2.0.0
*/
const globalValue = (id, compute) => {
	if (!globalStore) {
		globalThis[globalStoreId] ??= /* @__PURE__ */ new Map();
		globalStore = globalThis[globalStoreId];
	}
	if (!globalStore.has(id)) globalStore.set(id, compute());
	return globalStore.get(id);
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Predicate.js
/**
* This module provides a collection of functions for working with predicates and refinements.
*
* A `Predicate<A>` is a function that takes a value of type `A` and returns a boolean.
* It is used to check if a value satisfies a certain condition.
*
* A `Refinement<A, B>` is a special type of predicate that not only checks a condition
* but also provides a type guard, allowing TypeScript to narrow the type of the input
* value from `A` to a more specific type `B` within a conditional block.
*
* The module includes:
* - Basic predicates and refinements for common types (e.g., `isString`, `isNumber`).
* - Combinators to create new predicates from existing ones (e.g., `and`, `or`, `not`).
* - Advanced combinators for working with data structures (e.g., `tuple`, `struct`).
* - Type-level utilities for inspecting predicate and refinement types.
*
* @since 2.0.0
*/
/**
* A predicate that checks if a value is "truthy" in JavaScript.
* Fails for `false`, `0`, `-0`, `0n`, `""`, `null`, `undefined`, and `NaN`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isTruthy } from "effect/Predicate"
*
* assert.strictEqual(isTruthy(1), true)
* assert.strictEqual(isTruthy("hello"), true)
* assert.strictEqual(isTruthy({}), true)
*
* assert.strictEqual(isTruthy(0), false)
* assert.strictEqual(isTruthy(""), false)
* assert.strictEqual(isTruthy(null), false)
* assert.strictEqual(isTruthy(undefined), false)
* ```
*
* @category guards
* @since 2.0.0
*/
const isTruthy = (input) => !!input;
/**
* A refinement that checks if a value is a `string`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isString } from "effect/Predicate"
*
* assert.strictEqual(isString("hello"), true)
* assert.strictEqual(isString(""), true)
*
* assert.strictEqual(isString(123), false)
* assert.strictEqual(isString(null), false)
* ```
*
* @category guards
* @since 2.0.0
*/
const isString = (input) => typeof input === "string";
/**
* A refinement that checks if a value is a `number`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isNumber } from "effect/Predicate"
*
* assert.strictEqual(isNumber(123), true)
* assert.strictEqual(isNumber(0), true)
* assert.strictEqual(isNumber(-1.5), true)
* assert.strictEqual(isNumber(NaN), true)
*
* assert.strictEqual(isNumber("123"), false)
* ```
*
* @category guards
* @since 2.0.0
*/
const isNumber = (input) => typeof input === "number";
/**
* A refinement that checks if a value is a `boolean`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isBoolean } from "effect/Predicate"
*
* assert.strictEqual(isBoolean(true), true)
* assert.strictEqual(isBoolean(false), true)
*
* assert.strictEqual(isBoolean("true"), false)
* assert.strictEqual(isBoolean(0), false)
* ```
*
* @category guards
* @since 2.0.0
*/
const isBoolean = (input) => typeof input === "boolean";
/**
* A refinement that checks if a value is a `bigint`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isBigInt } from "effect/Predicate"
*
* assert.strictEqual(isBigInt(1n), true)
*
* assert.strictEqual(isBigInt(1), false)
* assert.strictEqual(isBigInt("1"), false)
* ```
*
* @category guards
* @since 2.0.0
*/
const isBigInt = (input) => typeof input === "bigint";
/**
* A refinement that checks if a value is a `symbol`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isSymbol } from "effect/Predicate"
*
* assert.strictEqual(isSymbol(Symbol.for("a")), true)
*
* assert.strictEqual(isSymbol("a"), false)
* ```
*
* @category guards
* @since 2.0.0
*/
const isSymbol = (input) => typeof input === "symbol";
/**
* A refinement that checks if a value is a `Function`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isFunction } from "effect/Predicate"
*
* assert.strictEqual(isFunction(() => {}), true)
* assert.strictEqual(isFunction(isFunction), true)
*
* assert.strictEqual(isFunction("function"), false)
* ```
*
* @category guards
* @since 2.0.0
*/
const isFunction = isFunction$1;
/**
* A refinement that checks if a value is `undefined`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isUndefined } from "effect/Predicate"
*
* assert.strictEqual(isUndefined(undefined), true)
*
* assert.strictEqual(isUndefined(null), false)
* assert.strictEqual(isUndefined("undefined"), false)
* ```
*
* @category guards
* @since 2.0.0
*/
const isUndefined = (input) => input === void 0;
/**
* A refinement that always returns `false`. The type is narrowed to `never`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isNever } from "effect/Predicate"
*
* assert.strictEqual(isNever(1), false)
* assert.strictEqual(isNever(null), false)
* assert.strictEqual(isNever({}), false)
* ```
*
* @category guards
* @since 2.0.0
*/
const isNever = (_) => false;
/**
* Checks if the input is an object or an array.
* @internal
*/
const isRecordOrArray = (input) => typeof input === "object" && input !== null;
/**
* A refinement that checks if a value is an `object`. Note that in JavaScript,
* arrays and functions are also considered objects.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isObject } from "effect/Predicate"
*
* assert.strictEqual(isObject({}), true)
* assert.strictEqual(isObject([]), true)
* assert.strictEqual(isObject(() => {}), true)
*
* assert.strictEqual(isObject(null), false)
* assert.strictEqual(isObject("hello"), false)
* ```
*
* @category guards
* @since 2.0.0
* @see isRecord to check for plain objects (excluding arrays and functions).
*/
const isObject = (input) => isRecordOrArray(input) || isFunction(input);
/**
* A refinement that checks if a value is an object-like value and has a specific property key.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { hasProperty } from "effect/Predicate"
*
* assert.strictEqual(hasProperty({ a: 1 }, "a"), true)
* assert.strictEqual(hasProperty({ a: 1 }, "b"), false)
*
* const value: unknown = { name: "Alice" };
* if (hasProperty(value, "name")) {
*   // The type of `value` is narrowed to `{ name: unknown }`
*   // and we can safely access `value.name`
*   console.log(value.name)
* }
* ```
*
* @category guards
* @since 2.0.0
*/
const hasProperty = /*#__PURE__*/ dual(2, (self, property) => isObject(self) && property in self);
/**
* A refinement that checks if a value is an object with a `_tag` property
* that matches the given tag. This is a powerful tool for working with
* discriminated union types.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isTagged } from "effect/Predicate"
*
* type Shape = { _tag: "circle"; radius: number } | { _tag: "square"; side: number }
*
* const isCircle = isTagged("circle")
*
* const shape1: Shape = { _tag: "circle", radius: 10 }
* const shape2: Shape = { _tag: "square", side: 5 }
*
* assert.strictEqual(isCircle(shape1), true)
* assert.strictEqual(isCircle(shape2), false)
*
* if (isCircle(shape1)) {
*   // shape1 is now narrowed to { _tag: "circle"; radius: number }
*   assert.strictEqual(shape1.radius, 10)
* }
* ```
*
* @category guards
* @since 2.0.0
*/
const isTagged = /*#__PURE__*/ dual(2, (self, tag) => hasProperty(self, "_tag") && self["_tag"] === tag);
/**
* A refinement that checks if a value is either `null` or `undefined`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isNullable } from "effect/Predicate"
*
* assert.strictEqual(isNullable(null), true)
* assert.strictEqual(isNullable(undefined), true)
*
* assert.strictEqual(isNullable(0), false)
* assert.strictEqual(isNullable(""), false)
* ```
*
* @category guards
* @since 2.0.0
* @see isNotNullable
*/
const isNullable = (input) => input === null || input === void 0;
/**
* A refinement that checks if a value is neither `null` nor `undefined`.
* The type is narrowed to `NonNullable<A>`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isNotNullable } from "effect/Predicate"
*
* assert.strictEqual(isNotNullable(0), true)
* assert.strictEqual(isNotNullable("hello"), true)
*
* assert.strictEqual(isNotNullable(null), false)
* assert.strictEqual(isNotNullable(undefined), false)
* ```
*
* @category guards
* @since 2.0.0
* @see isNullable
*/
const isNotNullable = (input) => input !== null && input !== void 0;
/**
* A refinement that checks if a value is a `Uint8Array`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isUint8Array } from "effect/Predicate"
*
* assert.strictEqual(isUint8Array(new Uint8Array()), true)
*
* assert.strictEqual(isUint8Array(new Uint16Array()), false)
* assert.strictEqual(isUint8Array([1, 2, 3]), false)
* ```
*
* @category guards
* @since 2.0.0
*/
const isUint8Array = (input) => input instanceof Uint8Array;
/**
* A refinement that checks if a value is a `Date` object.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isDate } from "effect/Predicate"
*
* assert.strictEqual(isDate(new Date()), true)
*
* assert.strictEqual(isDate(Date.now()), false) // `Date.now()` returns a number
* assert.strictEqual(isDate("2023-01-01"), false)
* ```
*
* @category guards
* @since 2.0.0
*/
const isDate = (input) => input instanceof Date;
/**
* A refinement that checks if a value is an `Iterable`.
* Many built-in types are iterable, such as `Array`, `string`, `Map`, and `Set`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isIterable } from "effect/Predicate"
*
* assert.strictEqual(isIterable([]), true)
* assert.strictEqual(isIterable("hello"), true)
* assert.strictEqual(isIterable(new Set()), true)
*
* assert.strictEqual(isIterable({}), false)
* assert.strictEqual(isIterable(123), false)
* ```
*
* @category guards
* @since 2.0.0
*/
const isIterable = (input) => typeof input === "string" || hasProperty(input, Symbol.iterator);
/**
* A refinement that checks if a value is a record (i.e., a plain object).
* This check returns `false` for arrays, `null`, and functions.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isRecord } from "effect/Predicate"
*
* assert.strictEqual(isRecord({}), true)
* assert.strictEqual(isRecord({ a: 1 }), true)
*
* assert.strictEqual(isRecord([]), false)
* assert.strictEqual(isRecord(new Date()), false)
* assert.strictEqual(isRecord(null), false)
* assert.strictEqual(isRecord(() => null), false)
* ```
*
* @category guards
* @since 2.0.0
* @see isObject
*/
const isRecord = (input) => isRecordOrArray(input) && !Array.isArray(input);
/**
* A refinement that checks if a value is `PromiseLike`. It performs a duck-typing
* check for a `.then` method.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isPromiseLike } from "effect/Predicate"
*
* assert.strictEqual(isPromiseLike(Promise.resolve(1)), true)
* assert.strictEqual(isPromiseLike({ then: () => {} }), true)
*
* assert.strictEqual(isPromiseLike({}), false)
* ```
*
* @category guards
* @since 2.0.0
* @see isPromise
*/
const isPromiseLike = (input) => hasProperty(input, "then") && isFunction(input.then);
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/errors.js
/**
* @since 2.0.0
*/
/** @internal */
const getBugErrorMessage = (message) => `BUG: ${message} - please report an issue at https://github.com/Effect-TS/effect/issues`;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Utils.js
/**
* @category constructors
* @since 2.0.0
*/
var SingleShotGen$1 = class SingleShotGen$1 {
	self;
	called = false;
	constructor(self) {
		this.self = self;
	}
	/**
	* @since 2.0.0
	*/
	next(a) {
		return this.called ? {
			value: a,
			done: true
		} : (this.called = true, {
			value: this.self,
			done: false
		});
	}
	/**
	* @since 2.0.0
	*/
	return(a) {
		return {
			value: a,
			done: true
		};
	}
	/**
	* @since 2.0.0
	*/
	throw(e) {
		throw e;
	}
	/**
	* @since 2.0.0
	*/
	[Symbol.iterator]() {
		return new SingleShotGen$1(this.self);
	}
};
const defaultIncHi = 335903614;
const defaultIncLo = 4150755663;
const MUL_HI = 1481765933;
const MUL_LO = 1284865837;
const BIT_53 = 9007199254740992;
const BIT_27 = 134217728;
/**
* PCG is a family of simple fast space-efficient statistically good algorithms
* for random number generation. Unlike many general-purpose RNGs, they are also
* hard to predict.
*
* @category model
* @since 2.0.0
*/
var PCGRandom = class {
	_state;
	constructor(seedHi, seedLo, incHi, incLo) {
		if (isNullable(seedLo) && isNullable(seedHi)) {
			seedLo = Math.random() * 4294967295 >>> 0;
			seedHi = 0;
		} else if (isNullable(seedLo)) {
			seedLo = seedHi;
			seedHi = 0;
		}
		if (isNullable(incLo) && isNullable(incHi)) {
			incLo = this._state ? this._state[3] : defaultIncLo;
			incHi = this._state ? this._state[2] : defaultIncHi;
		} else if (isNullable(incLo)) {
			incLo = incHi;
			incHi = 0;
		}
		this._state = new Int32Array([
			0,
			0,
			incHi >>> 0,
			((incLo || 0) | 1) >>> 0
		]);
		this._next();
		add64(this._state, this._state[0], this._state[1], seedHi >>> 0, seedLo >>> 0);
		this._next();
		return this;
	}
	/**
	* Returns a copy of the internal state of this random number generator as a
	* JavaScript Array.
	*
	* @category getters
	* @since 2.0.0
	*/
	getState() {
		return [
			this._state[0],
			this._state[1],
			this._state[2],
			this._state[3]
		];
	}
	/**
	* Restore state previously retrieved using `getState()`.
	*
	* @since 2.0.0
	*/
	setState(state) {
		this._state[0] = state[0];
		this._state[1] = state[1];
		this._state[2] = state[2];
		this._state[3] = state[3] | 1;
	}
	/**
	* Get a uniformly distributed 32 bit integer between [0, max).
	*
	* @category getter
	* @since 2.0.0
	*/
	integer(max) {
		return Math.round(this.number() * Number.MAX_SAFE_INTEGER) % max;
	}
	/**
	* Get a uniformly distributed IEEE-754 double between 0.0 and 1.0, with
	* 53 bits of precision (every bit of the mantissa is randomized).
	*
	* @category getters
	* @since 2.0.0
	*/
	number() {
		const hi = (this._next() & 67108863) * 1;
		const lo = (this._next() & 134217727) * 1;
		return (hi * BIT_27 + lo) / BIT_53;
	}
	/** @internal */
	_next() {
		const oldHi = this._state[0] >>> 0;
		const oldLo = this._state[1] >>> 0;
		mul64(this._state, oldHi, oldLo, MUL_HI, MUL_LO);
		add64(this._state, this._state[0], this._state[1], this._state[2], this._state[3]);
		let xsHi = oldHi >>> 18;
		let xsLo = (oldLo >>> 18 | oldHi << 14) >>> 0;
		xsHi = (xsHi ^ oldHi) >>> 0;
		xsLo = (xsLo ^ oldLo) >>> 0;
		const xorshifted = (xsLo >>> 27 | xsHi << 5) >>> 0;
		const rot = oldHi >>> 27;
		const rot2 = (-rot >>> 0 & 31) >>> 0;
		return (xorshifted >>> rot | xorshifted << rot2) >>> 0;
	}
};
function mul64(out, aHi, aLo, bHi, bLo) {
	let c1 = (aLo >>> 16) * (bLo & 65535) >>> 0;
	let c0 = (aLo & 65535) * (bLo >>> 16) >>> 0;
	let lo = (aLo & 65535) * (bLo & 65535) >>> 0;
	let hi = (aLo >>> 16) * (bLo >>> 16) + ((c0 >>> 16) + (c1 >>> 16)) >>> 0;
	c0 = c0 << 16 >>> 0;
	lo = lo + c0 >>> 0;
	if (lo >>> 0 < c0 >>> 0) hi = hi + 1 >>> 0;
	c1 = c1 << 16 >>> 0;
	lo = lo + c1 >>> 0;
	if (lo >>> 0 < c1 >>> 0) hi = hi + 1 >>> 0;
	hi = hi + Math.imul(aLo, bHi) >>> 0;
	hi = hi + Math.imul(aHi, bLo) >>> 0;
	out[0] = hi;
	out[1] = lo;
}
function add64(out, aHi, aLo, bHi, bLo) {
	let hi = aHi + bHi >>> 0;
	const lo = aLo + bLo >>> 0;
	if (lo >>> 0 < aLo >>> 0) hi = hi + 1 | 0;
	out[0] = hi;
	out[1] = lo;
}
/**
* @since 3.0.6
*/
const YieldWrapTypeId = /*#__PURE__*/ Symbol.for("effect/Utils/YieldWrap");
/**
* @since 3.0.6
*/
var YieldWrap = class {
	/**
	* @since 3.0.6
	*/
	#value;
	constructor(value) {
		this.#value = value;
	}
	/**
	* @since 3.0.6
	*/
	[YieldWrapTypeId]() {
		return this.#value;
	}
};
/**
* @since 3.0.6
*/
function yieldWrapGet(self) {
	if (typeof self === "object" && self !== null && YieldWrapTypeId in self) return self[YieldWrapTypeId]();
	throw new Error(getBugErrorMessage("yieldWrapGet"));
}
/**
* Note: this is an experimental feature made available to allow custom matchers in tests, not to be directly used yet in user code
*
* @since 3.1.1
* @status experimental
* @category modifiers
*/
const structuralRegionState = /*#__PURE__*/ globalValue("effect/Utils/isStructuralRegion", () => ({
	enabled: false,
	tester: void 0
}));
const standard = { effect_internal_function: (body) => {
	return body();
} };
/**
* @since 3.2.2
* @status experimental
* @category tracing
*/
const internalCall = /*#__PURE__*/ standard.effect_internal_function(() => (/* @__PURE__ */ new Error()).stack)?.includes("effect_internal_function") === true ? standard.effect_internal_function : { effect_internal_function: (body) => {
	try {
		return body();
	} finally {}
} }.effect_internal_function;
(function* () {}).constructor;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Hash.js
/**
* @since 2.0.0
*/
/** @internal */
const randomHashCache = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/Hash/randomHashCache"), () => /* @__PURE__ */ new WeakMap());
/**
* @since 2.0.0
* @category symbols
*/
const symbol$1 = /*#__PURE__*/ Symbol.for("effect/Hash");
/**
* @since 2.0.0
* @category hashing
*/
const hash = (self) => {
	if (structuralRegionState.enabled === true) return 0;
	switch (typeof self) {
		case "number": return number$2(self);
		case "bigint": return string(self.toString(10));
		case "boolean": return string(String(self));
		case "symbol": return string(String(self));
		case "string": return string(self);
		case "undefined": return string("undefined");
		case "function":
		case "object": if (self === null) return string("null");
		else if (self instanceof Date) {
			if (Number.isNaN(self.getTime())) return string("Invalid Date");
			return hash(self.toISOString());
		} else if (self instanceof URL) return hash(self.href);
		else if (isHash(self)) return self[symbol$1]();
		else return random(self);
		default: throw new Error(`BUG: unhandled typeof ${typeof self} - please report an issue at https://github.com/Effect-TS/effect/issues`);
	}
};
/**
* @since 2.0.0
* @category hashing
*/
const random = (self) => {
	if (!randomHashCache.has(self)) randomHashCache.set(self, number$2(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)));
	return randomHashCache.get(self);
};
/**
* @since 2.0.0
* @category hashing
*/
const combine$7 = (b) => (self) => self * 53 ^ b;
/**
* @since 2.0.0
* @category hashing
*/
const optimize = (n) => n & 3221225471 | n >>> 1 & 1073741824;
/**
* @since 2.0.0
* @category guards
*/
const isHash = (u) => hasProperty(u, symbol$1);
/**
* @since 2.0.0
* @category hashing
*/
const number$2 = (n) => {
	if (n !== n || n === Infinity) return 0;
	let h = n | 0;
	if (h !== n) h ^= n * 4294967295;
	while (n > 4294967295) h ^= n /= 4294967295;
	return optimize(h);
};
/**
* @since 2.0.0
* @category hashing
*/
const string = (str) => {
	let h = 5381, i = str.length;
	while (i) h = h * 33 ^ str.charCodeAt(--i);
	return optimize(h);
};
/**
* @since 2.0.0
* @category hashing
*/
const structureKeys = (o, keys) => {
	let h = 12289;
	for (let i = 0; i < keys.length; i++) h ^= pipe(string(keys[i]), combine$7(hash(o[keys[i]])));
	return optimize(h);
};
/**
* @since 2.0.0
* @category hashing
*/
const structure = (o) => structureKeys(o, Object.keys(o));
/**
* @since 2.0.0
* @category hashing
*/
const array$1 = (arr) => {
	let h = 6151;
	for (let i = 0; i < arr.length; i++) h = pipe(h, combine$7(hash(arr[i])));
	return optimize(h);
};
/**
* @since 2.0.0
* @category hashing
*/
const cached = function() {
	if (arguments.length === 1) {
		const self = arguments[0];
		return function(hash) {
			Object.defineProperty(self, symbol$1, {
				value() {
					return hash;
				},
				enumerable: false
			});
			return hash;
		};
	}
	const self = arguments[0];
	const hash = arguments[1];
	Object.defineProperty(self, symbol$1, {
		value() {
			return hash;
		},
		enumerable: false
	});
	return hash;
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Equal.js
/**
* @since 2.0.0
* @category symbols
*/
const symbol = /*#__PURE__*/ Symbol.for("effect/Equal");
function equals$2() {
	if (arguments.length === 1) return (self) => compareBoth(self, arguments[0]);
	return compareBoth(arguments[0], arguments[1]);
}
function compareBoth(self, that) {
	if (self === that) return true;
	const selfType = typeof self;
	if (selfType !== typeof that) return false;
	if (selfType === "object" || selfType === "function") {
		if (self !== null && that !== null) {
			if (isEqual(self) && isEqual(that)) {
				if (hash(self) === hash(that) && self[symbol](that)) return true;
				else return structuralRegionState.enabled && structuralRegionState.tester ? structuralRegionState.tester(self, that) : false;
			} else if (self instanceof Date && that instanceof Date) {
				const t1 = self.getTime();
				const t2 = that.getTime();
				return t1 === t2 || Number.isNaN(t1) && Number.isNaN(t2);
			} else if (self instanceof URL && that instanceof URL) return self.href === that.href;
		}
		if (structuralRegionState.enabled) {
			if (self === null || that === null) return false;
			if (Array.isArray(self) && Array.isArray(that)) return self.length === that.length && self.every((v, i) => compareBoth(v, that[i]));
			if (Object.getPrototypeOf(self) === Object.prototype && Object.getPrototypeOf(that) === Object.prototype) {
				const keysSelf = Object.keys(self);
				const keysThat = Object.keys(that);
				if (keysSelf.length === keysThat.length) {
					for (const key of keysSelf) if (!(key in that && compareBoth(self[key], that[key]))) return structuralRegionState.tester ? structuralRegionState.tester(self, that) : false;
					return true;
				}
			}
			return structuralRegionState.tester ? structuralRegionState.tester(self, that) : false;
		}
	}
	return structuralRegionState.enabled && structuralRegionState.tester ? structuralRegionState.tester(self, that) : false;
}
/**
* @since 2.0.0
* @category guards
*/
const isEqual = (u) => hasProperty(u, symbol);
/**
* @since 2.0.0
* @category instances
*/
const equivalence = () => equals$2;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Inspectable.js
/**
* @since 2.0.0
* @category symbols
*/
const NodeInspectSymbol = /*#__PURE__*/ Symbol.for("nodejs.util.inspect.custom");
/**
* @since 2.0.0
*/
const toJSON = (x) => {
	try {
		if (hasProperty(x, "toJSON") && isFunction(x["toJSON"]) && x["toJSON"].length === 0) return x.toJSON();
		else if (Array.isArray(x)) return x.map(toJSON);
	} catch {
		return {};
	}
	return redact(x);
};
const CIRCULAR = "[Circular]";
/** @internal */
function formatDate(date) {
	try {
		return date.toISOString();
	} catch {
		return "Invalid Date";
	}
}
function safeToString(input) {
	try {
		const s = input.toString();
		return typeof s === "string" ? s : String(s);
	} catch {
		return "[toString threw]";
	}
}
/** @internal */
function formatPropertyKey$1(name) {
	return isString(name) ? JSON.stringify(name) : String(name);
}
/** @internal */
function formatUnknown(input, options) {
	const space = options?.space ?? 0;
	const seen = /* @__PURE__ */ new WeakSet();
	const gap = !space ? "" : isNumber(space) ? " ".repeat(space) : space;
	const ind = (d) => gap.repeat(d);
	const wrap = (v, body) => {
		const ctor = v?.constructor;
		return ctor && ctor !== Object.prototype.constructor && ctor.name ? `${ctor.name}(${body})` : body;
	};
	const ownKeys = (o) => {
		try {
			return Reflect.ownKeys(o);
		} catch {
			return ["[ownKeys threw]"];
		}
	};
	function go(v, d = 0) {
		if (Array.isArray(v)) {
			if (seen.has(v)) return CIRCULAR;
			seen.add(v);
			if (!gap || v.length <= 1) return `[${v.map((x) => go(x, d)).join(",")}]`;
			const inner = v.map((x) => go(x, d + 1)).join(",\n" + ind(d + 1));
			return `[\n${ind(d + 1)}${inner}\n${ind(d)}]`;
		}
		if (isDate(v)) return formatDate(v);
		if (!options?.ignoreToString && hasProperty(v, "toString") && isFunction(v["toString"]) && v["toString"] !== Object.prototype.toString && v["toString"] !== Array.prototype.toString) {
			const s = safeToString(v);
			if (v instanceof Error && v.cause) return `${s} (cause: ${go(v.cause, d)})`;
			return s;
		}
		if (isString(v)) return JSON.stringify(v);
		if (isNumber(v) || v == null || isBoolean(v) || isSymbol(v)) return String(v);
		if (isBigInt(v)) return String(v) + "n";
		if (v instanceof Set || v instanceof Map) {
			if (seen.has(v)) return CIRCULAR;
			seen.add(v);
			return `${v.constructor.name}(${go(Array.from(v), d)})`;
		}
		if (isObject(v)) {
			if (seen.has(v)) return CIRCULAR;
			seen.add(v);
			const keys = ownKeys(v);
			if (!gap || keys.length <= 1) {
				const body = `{${keys.map((k) => `${formatPropertyKey$1(k)}:${go(v[k], d)}`).join(",")}}`;
				return wrap(v, body);
			}
			const body = `{\n${keys.map((k) => `${ind(d + 1)}${formatPropertyKey$1(k)}: ${go(v[k], d + 1)}`).join(",\n")}\n${ind(d)}}`;
			return wrap(v, body);
		}
		return String(v);
	}
	return go(input, 0);
}
/**
* @since 2.0.0
*/
const format$4 = (x) => JSON.stringify(x, null, 2);
/**
* @since 2.0.0
*/
const BaseProto = {
	toJSON() {
		return toJSON(this);
	},
	[NodeInspectSymbol]() {
		return this.toJSON();
	},
	toString() {
		return format$4(this.toJSON());
	}
};
/**
* @since 2.0.0
*/
const toStringUnknown = (u, whitespace = 2) => {
	if (typeof u === "string") return u;
	try {
		return typeof u === "object" ? stringifyCircular(u, whitespace) : String(u);
	} catch {
		return String(u);
	}
};
/**
* @since 2.0.0
*/
const stringifyCircular = (obj, whitespace) => {
	let cache = [];
	const retVal = JSON.stringify(obj, (_key, value) => typeof value === "object" && value !== null ? cache.includes(value) ? void 0 : cache.push(value) && (redactableState.fiberRefs !== void 0 && isRedactable(value) ? value[symbolRedactable](redactableState.fiberRefs) : value) : value, whitespace);
	cache = void 0;
	return retVal;
};
/**
* @since 3.10.0
* @category redactable
*/
const symbolRedactable = /*#__PURE__*/ Symbol.for("effect/Inspectable/Redactable");
/**
* @since 3.10.0
* @category redactable
*/
const isRedactable = (u) => typeof u === "object" && u !== null && symbolRedactable in u;
const redactableState = /*#__PURE__*/ globalValue("effect/Inspectable/redactableState", () => ({ fiberRefs: void 0 }));
/**
* @since 3.10.0
* @category redactable
*/
const withRedactableContext = (context, f) => {
	const prev = redactableState.fiberRefs;
	redactableState.fiberRefs = context;
	try {
		return f();
	} finally {
		redactableState.fiberRefs = prev;
	}
};
/**
* @since 3.10.0
* @category redactable
*/
const redact = (u) => {
	if (isRedactable(u) && redactableState.fiberRefs !== void 0) return u[symbolRedactable](redactableState.fiberRefs);
	return u;
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Pipeable.js
/**
* @since 2.0.0
*/
/**
* @since 2.0.0
*/
const pipeArguments = (self, args) => {
	switch (args.length) {
		case 0: return self;
		case 1: return args[0](self);
		case 2: return args[1](args[0](self));
		case 3: return args[2](args[1](args[0](self)));
		case 4: return args[3](args[2](args[1](args[0](self))));
		case 5: return args[4](args[3](args[2](args[1](args[0](self)))));
		case 6: return args[5](args[4](args[3](args[2](args[1](args[0](self))))));
		case 7: return args[6](args[5](args[4](args[3](args[2](args[1](args[0](self)))))));
		case 8: return args[7](args[6](args[5](args[4](args[3](args[2](args[1](args[0](self))))))));
		case 9: return args[8](args[7](args[6](args[5](args[4](args[3](args[2](args[1](args[0](self)))))))));
		default: {
			let ret = self;
			for (let i = 0, len = args.length; i < len; i++) ret = args[i](ret);
			return ret;
		}
	}
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/opCodes/effect.js
/** @internal */
const OP_ASYNC = "Async";
/** @internal */
const OP_COMMIT = "Commit";
/** @internal */
const OP_FAILURE = "Failure";
/** @internal */
const OP_ON_FAILURE = "OnFailure";
/** @internal */
const OP_ON_SUCCESS = "OnSuccess";
/** @internal */
const OP_ON_SUCCESS_AND_FAILURE = "OnSuccessAndFailure";
/** @internal */
const OP_SUCCESS = "Success";
/** @internal */
const OP_SYNC = "Sync";
/** @internal */
const OP_UPDATE_RUNTIME_FLAGS = "UpdateRuntimeFlags";
/** @internal */
const OP_WHILE = "While";
/** @internal */
const OP_ITERATOR = "Iterator";
/** @internal */
const OP_WITH_RUNTIME = "WithRuntime";
/** @internal */
const OP_YIELD$1 = "Yield";
/** @internal */
const OP_REVERT_FLAGS = "RevertFlags";
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/version.js
let moduleVersion = "3.22.1";
const getCurrentVersion = () => moduleVersion;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/effectable.js
/** @internal */
const EffectTypeId$1 = /*#__PURE__*/ Symbol.for("effect/Effect");
/** @internal */
const StreamTypeId$1 = /*#__PURE__*/ Symbol.for("effect/Stream");
/** @internal */
const SinkTypeId$1 = /*#__PURE__*/ Symbol.for("effect/Sink");
/** @internal */
const ChannelTypeId$1 = /*#__PURE__*/ Symbol.for("effect/Channel");
/** @internal */
const effectVariance = {
	/* c8 ignore next */
	_R: (_) => _,
	/* c8 ignore next */
	_E: (_) => _,
	/* c8 ignore next */
	_A: (_) => _,
	_V: /*#__PURE__*/ getCurrentVersion()
};
const sinkVariance$1 = {
	/* c8 ignore next */
	_A: (_) => _,
	/* c8 ignore next */
	_In: (_) => _,
	/* c8 ignore next */
	_L: (_) => _,
	/* c8 ignore next */
	_E: (_) => _,
	/* c8 ignore next */
	_R: (_) => _
};
const channelVariance$1 = {
	/* c8 ignore next */
	_Env: (_) => _,
	/* c8 ignore next */
	_InErr: (_) => _,
	/* c8 ignore next */
	_InElem: (_) => _,
	/* c8 ignore next */
	_InDone: (_) => _,
	/* c8 ignore next */
	_OutErr: (_) => _,
	/* c8 ignore next */
	_OutElem: (_) => _,
	/* c8 ignore next */
	_OutDone: (_) => _
};
/** @internal */
const EffectPrototype$1 = {
	[EffectTypeId$1]: effectVariance,
	[StreamTypeId$1]: effectVariance,
	[SinkTypeId$1]: sinkVariance$1,
	[ChannelTypeId$1]: channelVariance$1,
	[symbol](that) {
		return this === that;
	},
	[symbol$1]() {
		return cached(this, random(this));
	},
	[Symbol.iterator]() {
		return new SingleShotGen$1(new YieldWrap(this));
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const StructuralPrototype = {
	[symbol$1]() {
		return cached(this, structure(this));
	},
	[symbol](that) {
		const selfKeys = Object.keys(this);
		const thatKeys = Object.keys(that);
		if (selfKeys.length !== thatKeys.length) return false;
		for (const key of selfKeys) if (!(key in that && equals$2(this[key], that[key]))) return false;
		return true;
	}
};
/** @internal */
const CommitPrototype = {
	...EffectPrototype$1,
	_op: OP_COMMIT
};
/** @internal */
const StructuralCommitPrototype = {
	...CommitPrototype,
	...StructuralPrototype
};
/** @internal */
const Base$1 = /*#__PURE__*/ function() {
	function Base() {}
	Base.prototype = CommitPrototype;
	return Base;
}();
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/option.js
/**
* @since 2.0.0
*/
const TypeId$25 = /*#__PURE__*/ Symbol.for("effect/Option");
const CommonProto$1 = {
	...EffectPrototype$1,
	[TypeId$25]: { _A: (_) => _ },
	[NodeInspectSymbol]() {
		return this.toJSON();
	},
	toString() {
		return format$4(this.toJSON());
	}
};
const SomeProto = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(CommonProto$1), {
	_tag: "Some",
	_op: "Some",
	[symbol](that) {
		return isOption$1(that) && isSome$1(that) && equals$2(this.value, that.value);
	},
	[symbol$1]() {
		return cached(this, combine$7(hash(this._tag))(hash(this.value)));
	},
	toJSON() {
		return {
			_id: "Option",
			_tag: this._tag,
			value: toJSON(this.value)
		};
	}
});
const NoneHash = /*#__PURE__*/ hash("None");
const NoneProto = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(CommonProto$1), {
	_tag: "None",
	_op: "None",
	[symbol](that) {
		return isOption$1(that) && isNone$1(that);
	},
	[symbol$1]() {
		return NoneHash;
	},
	toJSON() {
		return {
			_id: "Option",
			_tag: this._tag
		};
	}
});
/** @internal */
const isOption$1 = (input) => hasProperty(input, TypeId$25);
/** @internal */
const isNone$1 = (fa) => fa._tag === "None";
/** @internal */
const isSome$1 = (fa) => fa._tag === "Some";
/** @internal */
const none$5 = /*#__PURE__*/ Object.create(NoneProto);
/** @internal */
const some$1 = (value) => {
	const a = Object.create(SomeProto);
	a.value = value;
	return a;
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/context.js
/** @internal */
const TagTypeId = /*#__PURE__*/ Symbol.for("effect/Context/Tag");
/** @internal */
const ReferenceTypeId = /*#__PURE__*/ Symbol.for("effect/Context/Reference");
/** @internal */
const STMTypeId = /*#__PURE__*/ Symbol.for("effect/STM");
/** @internal */
const TagProto = {
	...EffectPrototype$1,
	_op: "Tag",
	[STMTypeId]: effectVariance,
	[TagTypeId]: {
		_Service: (_) => _,
		_Identifier: (_) => _
	},
	toString() {
		return format$4(this.toJSON());
	},
	toJSON() {
		return {
			_id: "Tag",
			key: this.key,
			stack: this.stack
		};
	},
	[NodeInspectSymbol]() {
		return this.toJSON();
	},
	of(self) {
		return self;
	},
	context(self) {
		return make$49(this, self);
	}
};
const ReferenceProto = {
	...TagProto,
	[ReferenceTypeId]: ReferenceTypeId
};
/** @internal */
const makeGenericTag = (key) => {
	const limit = Error.stackTraceLimit;
	Error.stackTraceLimit = 2;
	const creationError = /* @__PURE__ */ new Error();
	Error.stackTraceLimit = limit;
	const tag = Object.create(TagProto);
	Object.defineProperty(tag, "stack", { get() {
		return creationError.stack;
	} });
	tag.key = key;
	return tag;
};
/** @internal */
const Tag$1 = (id) => () => {
	const limit = Error.stackTraceLimit;
	Error.stackTraceLimit = 2;
	const creationError = /* @__PURE__ */ new Error();
	Error.stackTraceLimit = limit;
	function TagClass() {}
	Object.setPrototypeOf(TagClass, TagProto);
	TagClass.key = id;
	Object.defineProperty(TagClass, "stack", { get() {
		return creationError.stack;
	} });
	return TagClass;
};
/** @internal */
const Reference$1 = () => (id, options) => {
	const limit = Error.stackTraceLimit;
	Error.stackTraceLimit = 2;
	const creationError = /* @__PURE__ */ new Error();
	Error.stackTraceLimit = limit;
	function ReferenceClass() {}
	Object.setPrototypeOf(ReferenceClass, ReferenceProto);
	ReferenceClass.key = id;
	ReferenceClass.defaultValue = options.defaultValue;
	Object.defineProperty(ReferenceClass, "stack", { get() {
		return creationError.stack;
	} });
	return ReferenceClass;
};
/** @internal */
const TypeId$24 = /*#__PURE__*/ Symbol.for("effect/Context");
/** @internal */
const ContextProto = {
	[TypeId$24]: { _Services: (_) => _ },
	[symbol](that) {
		if (isContext$1(that)) {
			if (this.unsafeMap.size === that.unsafeMap.size) {
				for (const k of this.unsafeMap.keys()) if (!that.unsafeMap.has(k) || !equals$2(this.unsafeMap.get(k), that.unsafeMap.get(k))) return false;
				return true;
			}
		}
		return false;
	},
	[symbol$1]() {
		return cached(this, number$2(this.unsafeMap.size));
	},
	pipe() {
		return pipeArguments(this, arguments);
	},
	toString() {
		return format$4(this.toJSON());
	},
	toJSON() {
		return {
			_id: "Context",
			services: Array.from(this.unsafeMap).map(toJSON)
		};
	},
	[NodeInspectSymbol]() {
		return this.toJSON();
	}
};
/** @internal */
const makeContext = (unsafeMap) => {
	const context = Object.create(ContextProto);
	context.unsafeMap = unsafeMap;
	return context;
};
const serviceNotFoundError = (tag) => {
	const error = /* @__PURE__ */ new Error(`Service not found${tag.key ? `: ${String(tag.key)}` : ""}`);
	if (tag.stack) {
		const lines = tag.stack.split("\n");
		if (lines.length > 2) {
			const afterAt = lines[2].match(/at (.*)/);
			if (afterAt) error.message = error.message + ` (defined at ${afterAt[1]})`;
		}
	}
	if (error.stack) {
		const lines = error.stack.split("\n");
		lines.splice(1, 3);
		error.stack = lines.join("\n");
	}
	return error;
};
/** @internal */
const isContext$1 = (u) => hasProperty(u, TypeId$24);
/** @internal */
const isTag$1 = (u) => hasProperty(u, TagTypeId);
/** @internal */
const isReference = (u) => hasProperty(u, ReferenceTypeId);
const _empty$6 = /*#__PURE__*/ makeContext(/*#__PURE__*/ new Map());
/** @internal */
const empty$26 = () => _empty$6;
/** @internal */
const make$49 = (tag, service) => makeContext(/* @__PURE__ */ new Map([[tag.key, service]]));
/** @internal */
const add$3 = /*#__PURE__*/ dual(3, (self, tag, service) => {
	const map = new Map(self.unsafeMap);
	map.set(tag.key, service);
	return makeContext(map);
});
const defaultValueCache = /*#__PURE__*/ globalValue("effect/Context/defaultValueCache", () => /* @__PURE__ */ new Map());
const getDefaultValue = (tag) => {
	if (defaultValueCache.has(tag.key)) return defaultValueCache.get(tag.key);
	const value = tag.defaultValue();
	defaultValueCache.set(tag.key, value);
	return value;
};
/** @internal */
const unsafeGetReference = (self, tag) => {
	return self.unsafeMap.has(tag.key) ? self.unsafeMap.get(tag.key) : getDefaultValue(tag);
};
/** @internal */
const unsafeGet$3 = /*#__PURE__*/ dual(2, (self, tag) => {
	if (!self.unsafeMap.has(tag.key)) {
		if (ReferenceTypeId in tag) return getDefaultValue(tag);
		throw serviceNotFoundError(tag);
	}
	return self.unsafeMap.get(tag.key);
});
/** @internal */
const get$12 = unsafeGet$3;
/** @internal */
const getOption$1 = /*#__PURE__*/ dual(2, (self, tag) => {
	if (!self.unsafeMap.has(tag.key)) return isReference(tag) ? some$1(getDefaultValue(tag)) : none$5;
	return some$1(self.unsafeMap.get(tag.key));
});
/** @internal */
const merge$5 = /*#__PURE__*/ dual(2, (self, that) => {
	const map = new Map(self.unsafeMap);
	for (const [tag, s] of that.unsafeMap) map.set(tag, s);
	return makeContext(map);
});
/** @internal */
const mergeAll$4 = (...ctxs) => {
	const map = /* @__PURE__ */ new Map();
	for (let i = 0; i < ctxs.length; i++) ctxs[i].unsafeMap.forEach((value, key) => {
		map.set(key, value);
	});
	return makeContext(map);
};
/** @internal */
const omit$2 = (...tags) => (self) => {
	const newEnv = new Map(self.unsafeMap);
	for (const tag of tags) newEnv.delete(tag.key);
	return makeContext(newEnv);
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Context.js
/**
* Creates a new `Tag` instance with the specified key.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Context } from "effect"
*
* assert.strictEqual(Context.GenericTag("PORT").key === Context.GenericTag("PORT").key, true)
* ```
*
* @since 2.0.0
* @category constructors
*/
const GenericTag = makeGenericTag;
/**
* Checks if the provided argument is a `Context`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Context } from "effect"
*
* assert.strictEqual(Context.isContext(Context.empty()), true)
* ```
*
* @since 2.0.0
* @category guards
*/
const isContext = isContext$1;
/**
* Checks if the provided argument is a `Tag`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Context } from "effect"
*
* assert.strictEqual(Context.isTag(Context.GenericTag("Tag")), true)
* ```
*
* @since 2.0.0
* @category guards
*/
const isTag = isTag$1;
/**
* Returns an empty `Context`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Context } from "effect"
*
* assert.strictEqual(Context.isContext(Context.empty()), true)
* ```
*
* @since 2.0.0
* @category constructors
*/
const empty$25 = empty$26;
/**
* Creates a new `Context` with a single service associated to the tag.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Context } from "effect"
*
* const Port = Context.GenericTag<{ PORT: number }>("Port")
*
* const Services = Context.make(Port, { PORT: 8080 })
*
* assert.deepStrictEqual(Context.get(Services, Port), { PORT: 8080 })
* ```
*
* @since 2.0.0
* @category constructors
*/
const make$48 = make$49;
/**
* Adds a service to a given `Context`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Context, pipe } from "effect"
*
* const Port = Context.GenericTag<{ PORT: number }>("Port")
* const Timeout = Context.GenericTag<{ TIMEOUT: number }>("Timeout")
*
* const someContext = Context.make(Port, { PORT: 8080 })
*
* const Services = pipe(
*   someContext,
*   Context.add(Timeout, { TIMEOUT: 5000 })
* )
*
* assert.deepStrictEqual(Context.get(Services, Port), { PORT: 8080 })
* assert.deepStrictEqual(Context.get(Services, Timeout), { TIMEOUT: 5000 })
* ```
*
* @since 2.0.0
*/
const add$2 = add$3;
/**
* Get a service from the context that corresponds to the given tag.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { pipe, Context } from "effect"
*
* const Port = Context.GenericTag<{ PORT: number }>("Port")
* const Timeout = Context.GenericTag<{ TIMEOUT: number }>("Timeout")
*
* const Services = pipe(
*   Context.make(Port, { PORT: 8080 }),
*   Context.add(Timeout, { TIMEOUT: 5000 })
* )
*
* assert.deepStrictEqual(Context.get(Services, Timeout), { TIMEOUT: 5000 })
* ```
*
* @since 2.0.0
* @category getters
*/
const get$11 = get$12;
/**
* Get a service from the context that corresponds to the given tag.
* This function is unsafe because if the tag is not present in the context, a runtime error will be thrown.
*
* For a safer version see {@link getOption}.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Context } from "effect"
*
* const Port = Context.GenericTag<{ PORT: number }>("Port")
* const Timeout = Context.GenericTag<{ TIMEOUT: number }>("Timeout")
*
* const Services = Context.make(Port, { PORT: 8080 })
*
* assert.deepStrictEqual(Context.unsafeGet(Services, Port), { PORT: 8080 })
* assert.throws(() => Context.unsafeGet(Services, Timeout))
* ```
*
* @since 2.0.0
* @category unsafe
*/
const unsafeGet$2 = unsafeGet$3;
/**
* Get the value associated with the specified tag from the context wrapped in an `Option` object. If the tag is not
* found, the `Option` object will be `None`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Context, Option } from "effect"
*
* const Port = Context.GenericTag<{ PORT: number }>("Port")
* const Timeout = Context.GenericTag<{ TIMEOUT: number }>("Timeout")
*
* const Services = Context.make(Port, { PORT: 8080 })
*
* assert.deepStrictEqual(Context.getOption(Services, Port), Option.some({ PORT: 8080 }))
* assert.deepStrictEqual(Context.getOption(Services, Timeout), Option.none())
* ```
*
* @since 2.0.0
* @category getters
*/
const getOption = getOption$1;
/**
* Merges two `Context`s, returning a new `Context` containing the services of both.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Context } from "effect"
*
* const Port = Context.GenericTag<{ PORT: number }>("Port")
* const Timeout = Context.GenericTag<{ TIMEOUT: number }>("Timeout")
*
* const firstContext = Context.make(Port, { PORT: 8080 })
* const secondContext = Context.make(Timeout, { TIMEOUT: 5000 })
*
* const Services = Context.merge(firstContext, secondContext)
*
* assert.deepStrictEqual(Context.get(Services, Port), { PORT: 8080 })
* assert.deepStrictEqual(Context.get(Services, Timeout), { TIMEOUT: 5000 })
* ```
*
* @since 2.0.0
*/
const merge$4 = merge$5;
/**
* Merges any number of `Context`s, returning a new `Context` containing the services of all.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Context } from "effect"
*
* const Port = Context.GenericTag<{ PORT: number }>("Port")
* const Timeout = Context.GenericTag<{ TIMEOUT: number }>("Timeout")
* const Host = Context.GenericTag<{ HOST: string }>("Host")
*
* const firstContext = Context.make(Port, { PORT: 8080 })
* const secondContext = Context.make(Timeout, { TIMEOUT: 5000 })
* const thirdContext = Context.make(Host, { HOST: "localhost" })
*
* const Services = Context.mergeAll(firstContext, secondContext, thirdContext)
*
* assert.deepStrictEqual(Context.get(Services, Port), { PORT: 8080 })
* assert.deepStrictEqual(Context.get(Services, Timeout), { TIMEOUT: 5000 })
* assert.deepStrictEqual(Context.get(Services, Host), { HOST: "localhost" })
* ```
*
* @since 3.12.0
*/
const mergeAll$3 = mergeAll$4;
/**
* @since 2.0.0
*/
const omit$1 = omit$2;
/**
* @example
* ```ts
* import * as assert from "node:assert"
* import { Context, Layer } from "effect"
*
* class MyTag extends Context.Tag("MyTag")<
*  MyTag,
*  { readonly myNum: number }
* >() {
*  static Live = Layer.succeed(this, { myNum: 108 })
* }
* ```
*
* @since 2.0.0
* @category constructors
*/
const Tag = Tag$1;
/**
* Creates a context tag with a default value.
*
* **Details**
*
* `Context.Reference` allows you to create a tag that can hold a value. You can
* provide a default value for the service, which will automatically be used
* when the context is accessed, or override it with a custom implementation
* when needed.
*
* **Example** (Declaring a Tag with a default value)
*
* ```ts
* import * as assert from "node:assert"
* import { Context, Effect } from "effect"
*
* class SpecialNumber extends Context.Reference<SpecialNumber>()(
*   "SpecialNumber",
*   { defaultValue: () => 2048 }
* ) {}
*
* //      ┌─── Effect<void, never, never>
* //      ▼
* const program = Effect.gen(function* () {
*   const specialNumber = yield* SpecialNumber
*   console.log(`The special number is ${specialNumber}`)
* })
*
* // No need to provide the SpecialNumber implementation
* Effect.runPromise(program)
* // Output: The special number is 2048
* ```
*
* **Example** (Overriding the default value)
*
* ```ts
* import { Context, Effect } from "effect"
*
* class SpecialNumber extends Context.Reference<SpecialNumber>()(
*   "SpecialNumber",
*   { defaultValue: () => 2048 }
* ) {}
*
* const program = Effect.gen(function* () {
*   const specialNumber = yield* SpecialNumber
*   console.log(`The special number is ${specialNumber}`)
* })
*
* Effect.runPromise(program.pipe(Effect.provideService(SpecialNumber, -1)))
* // Output: The special number is -1
* ```
*
* @since 3.11.0
* @category constructors
* @experimental
*/
const Reference = Reference$1;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Equivalence.js
/**
* This module provides an implementation of the `Equivalence` type class, which defines a binary relation
* that is reflexive, symmetric, and transitive. In other words, it defines a notion of equivalence between values of a certain type.
* These properties are also known in mathematics as an "equivalence relation".
*
* @since 2.0.0
*/
/**
* @category constructors
* @since 2.0.0
*/
const make$47 = (isEquivalent) => (self, that) => self === that || isEquivalent(self, that);
const isStrictEquivalent = (x, y) => x === y;
/**
* Return an `Equivalence` that uses strict equality (===) to compare values.
*
* @since 2.0.0
* @category constructors
*/
const strict = () => isStrictEquivalent;
/**
* @category instances
* @since 2.0.0
*/
const number$1 = /*#__PURE__*/ strict();
/**
* @category mapping
* @since 2.0.0
*/
const mapInput$1 = /*#__PURE__*/ dual(2, (self, f) => make$47((x, y) => self(f(x), f(y))));
/**
* @category instances
* @since 2.0.0
*/
const Date$1 = /*#__PURE__*/ mapInput$1(number$1, (date) => date.getTime());
/**
* Creates a new `Equivalence` for an array of values based on a given `Equivalence` for the elements of the array.
*
* @category combinators
* @since 2.0.0
*/
const array = (item) => make$47((self, that) => {
	if (self.length !== that.length) return false;
	for (let i = 0; i < self.length; i++) if (!item(self[i], that[i])) return false;
	return true;
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/doNotation.js
/** @internal */
const bindTo$1 = (map) => dual(2, (self, name) => map(self, (a) => ({ [name]: a })));
/** @internal */
const bind$1 = (map, flatMap) => dual(3, (self, name, f) => flatMap(self, (a) => map(f(a), (b) => ({
	...a,
	[name]: b
}))));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/either.js
/**
* @since 2.0.0
*/
/**
* @internal
*/
const TypeId$23 = /*#__PURE__*/ Symbol.for("effect/Either");
const CommonProto = {
	...EffectPrototype$1,
	[TypeId$23]: { _R: (_) => _ },
	[NodeInspectSymbol]() {
		return this.toJSON();
	},
	toString() {
		return format$4(this.toJSON());
	}
};
const RightProto = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(CommonProto), {
	_tag: "Right",
	_op: "Right",
	[symbol](that) {
		return isEither$2(that) && isRight$1(that) && equals$2(this.right, that.right);
	},
	[symbol$1]() {
		return combine$7(hash(this._tag))(hash(this.right));
	},
	toJSON() {
		return {
			_id: "Either",
			_tag: this._tag,
			right: toJSON(this.right)
		};
	}
});
const LeftProto = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(CommonProto), {
	_tag: "Left",
	_op: "Left",
	[symbol](that) {
		return isEither$2(that) && isLeft$1(that) && equals$2(this.left, that.left);
	},
	[symbol$1]() {
		return combine$7(hash(this._tag))(hash(this.left));
	},
	toJSON() {
		return {
			_id: "Either",
			_tag: this._tag,
			left: toJSON(this.left)
		};
	}
});
/** @internal */
const isEither$2 = (input) => hasProperty(input, TypeId$23);
/** @internal */
const isLeft$1 = (ma) => ma._tag === "Left";
/** @internal */
const isRight$1 = (ma) => ma._tag === "Right";
/** @internal */
const left$1 = (left) => {
	const a = Object.create(LeftProto);
	a.left = left;
	return a;
};
/** @internal */
const right$1 = (right) => {
	const a = Object.create(RightProto);
	a.right = right;
	return a;
};
/** @internal */
const fromOption$2 = /*#__PURE__*/ dual(2, (self, onNone) => isNone$1(self) ? left$1(onNone()) : right$1(self.value));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Order.js
/**
* This module provides an implementation of the `Order` type class which is used to define a total ordering on some type `A`.
* An order is defined by a relation `<=`, which obeys the following laws:
*
* - either `x <= y` or `y <= x` (totality)
* - if `x <= y` and `y <= x`, then `x == y` (antisymmetry)
* - if `x <= y` and `y <= z`, then `x <= z` (transitivity)
*
* The truth table for compare is defined as follows:
*
* | `x <= y` | `x >= y` | Ordering |                       |
* | -------- | -------- | -------- | --------------------- |
* | `true`   | `true`   | `0`      | corresponds to x == y |
* | `true`   | `false`  | `< 0`    | corresponds to x < y  |
* | `false`  | `true`   | `> 0`    | corresponds to x > y  |
*
* @since 2.0.0
*/
/**
* @category constructors
* @since 2.0.0
*/
const make$46 = (compare) => (self, that) => self === that ? 0 : compare(self, that);
/**
* @category instances
* @since 2.0.0
*/
const number = /*#__PURE__*/ make$46((self, that) => self < that ? -1 : 1);
/**
* @category mapping
* @since 2.0.0
*/
const mapInput = /*#__PURE__*/ dual(2, (self, f) => make$46((b1, b2) => self(f(b1), f(b2))));
/**
* Test whether one value is _strictly greater than_ another.
*
* @since 2.0.0
*/
const greaterThan$2 = (O) => dual(2, (self, that) => O(self, that) === 1);
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Option.js
/**
* Represents the absence of a value by creating an empty `Option`.
*
* `Option.none` returns an `Option<never>`, which is a subtype of `Option<A>`.
* This means you can use it in place of any `Option<A>` regardless of the type
* `A`.
*
* **Example** (Creating an Option with No Value)
*
* ```ts
* import { Option } from "effect"
*
* // An Option holding no value
* //
* //      ┌─── Option<never>
* //      ▼
* const noValue = Option.none()
*
* console.log(noValue)
* // Output: { _id: 'Option', _tag: 'None' }
* ```
*
* @see {@link some} for the opposite operation.
*
* @category Constructors
* @since 2.0.0
*/
const none$4 = () => none$5;
/**
* Wraps the given value into an `Option` to represent its presence.
*
* **Example** (Creating an Option with a Value)
*
* ```ts
* import { Option } from "effect"
*
* // An Option holding the number 1
* //
* //      ┌─── Option<number>
* //      ▼
* const value = Option.some(1)
*
* console.log(value)
* // Output: { _id: 'Option', _tag: 'Some', value: 1 }
* ```
*
* @see {@link none} for the opposite operation.
*
* @category Constructors
* @since 2.0.0
*/
const some = some$1;
/**
* Determines whether the given value is an `Option`.
*
* **Details**
*
* This function checks if a value is an instance of `Option`. It returns `true`
* if the value is either `Option.some` or `Option.none`, and `false` otherwise.
* This is particularly useful when working with unknown values or when you need
* to ensure type safety in your code.
*
* @example
* ```ts
* import { Option } from "effect"
*
* console.log(Option.isOption(Option.some(1)))
* // Output: true
*
* console.log(Option.isOption(Option.none()))
* // Output: true
*
* console.log(Option.isOption({}))
* // Output: false
* ```
*
* @category Guards
* @since 2.0.0
*/
const isOption = isOption$1;
/**
* Checks whether an `Option` represents the absence of a value (`None`).
*
* @example
* ```ts
* import { Option } from "effect"
*
* console.log(Option.isNone(Option.some(1)))
* // Output: false
*
* console.log(Option.isNone(Option.none()))
* // Output: true
* ```
*
* @see {@link isSome} for the opposite check.
*
* @category Guards
* @since 2.0.0
*/
const isNone = isNone$1;
/**
* Checks whether an `Option` contains a value (`Some`).
*
* @example
* ```ts
* import { Option } from "effect"
*
* console.log(Option.isSome(Option.some(1)))
* // Output: true
*
* console.log(Option.isSome(Option.none()))
* // Output: false
* ```
*
* @see {@link isNone} for the opposite check.
*
* @category Guards
* @since 2.0.0
*/
const isSome = isSome$1;
/**
* Performs pattern matching on an `Option` to handle both `Some` and `None`
* cases.
*
* **Details**
*
* This function allows you to match against an `Option` and handle both
* scenarios: when the `Option` is `None` (i.e., contains no value), and when
* the `Option` is `Some` (i.e., contains a value). It executes one of the
* provided functions based on the case:
*
* - If the `Option` is `None`, the `onNone` function is executed and its result
*   is returned.
* - If the `Option` is `Some`, the `onSome` function is executed with the
*   contained value, and its result is returned.
*
* This function provides a concise and functional way to handle optional values
* without resorting to `if` or manual checks, making your code more declarative
* and readable.
*
* **Example** (Pattern Matching with Option)
*
* ```ts
* import { Option } from "effect"
*
* const foo = Option.some(1)
*
* const message = Option.match(foo, {
*   onNone: () => "Option is empty",
*   onSome: (value) => `Option has a value: ${value}`
* })
*
* console.log(message)
* // Output: "Option has a value: 1"
* ```
*
* @category Pattern matching
* @since 2.0.0
*/
const match$9 = /*#__PURE__*/ dual(2, (self, { onNone, onSome }) => isNone(self) ? onNone() : onSome(self.value));
/**
* Returns the value contained in the `Option` if it is `Some`, otherwise
* evaluates and returns the result of `onNone`.
*
* **Details**
*
* This function allows you to provide a fallback value or computation for when
* an `Option` is `None`. If the `Option` contains a value (`Some`), that value
* is returned. If it is empty (`None`), the `onNone` function is executed, and
* its result is returned instead.
*
* This utility is helpful for safely handling `Option` values by ensuring you
* always receive a meaningful result, whether or not the `Option` contains a
* value. It is particularly useful for providing default values or alternative
* logic when working with optional values.
*
* @example
* ```ts
* import { Option } from "effect"
*
* console.log(Option.some(1).pipe(Option.getOrElse(() => 0)))
* // Output: 1
*
* console.log(Option.none().pipe(Option.getOrElse(() => 0)))
* // Output: 0
* ```
*
* @see {@link getOrNull} for a version that returns `null` instead of executing a function.
* @see {@link getOrUndefined} for a version that returns `undefined` instead of executing a function.
*
* @category Getters
* @since 2.0.0
*/
const getOrElse = /*#__PURE__*/ dual(2, (self, onNone) => isNone(self) ? onNone() : self.value);
/**
* Returns the provided `Option` `that` if the current `Option` (`self`) is
* `None`; otherwise, it returns `self`.
*
* **Details**
*
* This function provides a fallback mechanism for `Option` values. If the
* current `Option` is `None` (i.e., it contains no value), the `that` function
* is evaluated, and its resulting `Option` is returned. If the current `Option`
* is `Some` (i.e., it contains a value), the original `Option` is returned
* unchanged.
*
* This is particularly useful for chaining fallback values or computations,
* allowing you to provide alternative `Option` values when the first one is
* empty.
*
* @example
* ```ts
* import { Option } from "effect"
*
* console.log(Option.none().pipe(Option.orElse(() => Option.none())))
* // Output: { _id: 'Option', _tag: 'None' }
*
* console.log(Option.some("a").pipe(Option.orElse(() => Option.none())))
* // Output: { _id: 'Option', _tag: 'Some', value: 'a' }
*
* console.log(Option.none().pipe(Option.orElse(() => Option.some("b"))))
* // Output: { _id: 'Option', _tag: 'Some', value: 'b' }
*
* console.log(Option.some("a").pipe(Option.orElse(() => Option.some("b"))))
* // Output: { _id: 'Option', _tag: 'Some', value: 'a' }
* ```
*
* @category Error handling
* @since 2.0.0
*/
const orElse$5 = /*#__PURE__*/ dual(2, (self, that) => isNone(self) ? that() : self);
/**
* Returns the provided default value wrapped in `Some` if the current `Option`
* (`self`) is `None`; otherwise, returns `self`.
*
* **Details**
*
* This function provides a way to supply a default value for cases where an
* `Option` is `None`. If the current `Option` is empty (`None`), the `onNone`
* function is executed to compute the default value, which is then wrapped in a
* `Some`. If the current `Option` contains a value (`Some`), it is returned as
* is.
*
* This is particularly useful for handling optional values where a fallback
* default needs to be provided explicitly in case of absence.
*
* @example
* ```ts
* import { Option } from "effect"
*
* console.log(Option.none().pipe(Option.orElseSome(() => "b")))
* // Output: { _id: 'Option', _tag: 'Some', value: 'b' }
*
* console.log(Option.some("a").pipe(Option.orElseSome(() => "b")))
* // Output: { _id: 'Option', _tag: 'Some', value: 'a' }
* ```
*
* @category Error handling
* @since 2.0.0
*/
const orElseSome = /*#__PURE__*/ dual(2, (self, onNone) => isNone(self) ? some(onNone()) : self);
/**
* Converts a nullable value into an `Option`. Returns `None` if the value is
* `null` or `undefined`, otherwise wraps the value in a `Some`.
*
* @example
* ```ts
* import { Option } from "effect"
*
* console.log(Option.fromNullable(undefined))
* // Output: { _id: 'Option', _tag: 'None' }
*
* console.log(Option.fromNullable(null))
* // Output: { _id: 'Option', _tag: 'None' }
*
* console.log(Option.fromNullable(1))
* // Output: { _id: 'Option', _tag: 'Some', value: 1 }
* ```
*
* @category Conversions
* @since 2.0.0
*/
const fromNullable = (nullableValue) => nullableValue == null ? none$4() : some(nullableValue);
/**
* Returns the value contained in the `Option` if it is `Some`; otherwise,
* returns `undefined`.
*
* **Details**
*
* This function provides a way to extract the value of an `Option` while
* falling back to `undefined` if the `Option` is `None`.
*
* It is particularly useful in scenarios where `undefined` is an acceptable
* placeholder for the absence of a value, such as when interacting with APIs or
* systems that use `undefined` as a default for missing values.
*
* @example
* ```ts
* import { Option } from "effect"
*
* console.log(Option.getOrUndefined(Option.some(1)))
* // Output: 1
*
* console.log(Option.getOrUndefined(Option.none()))
* // Output: undefined
* ```
*
* @category Getters
* @since 2.0.0
*/
const getOrUndefined = /*#__PURE__*/ getOrElse(constUndefined);
/**
* Lifts a function that throws exceptions into a function that returns an
* `Option`.
*
* **Details**
*
* This utility function takes a function `f` that might throw an exception and
* transforms it into a safer function that returns an `Option`. If the original
* function executes successfully, the result is wrapped in a `Some`. If an
* exception is thrown, the result is `None`, allowing the developer to handle
* errors in a functional, type-safe way.
*
* @example
* ```ts
* import { Option } from "effect"
*
* const parse = Option.liftThrowable(JSON.parse)
*
* console.log(parse("1"))
* // Output: { _id: 'Option', _tag: 'Some', value: 1 }
*
* console.log(parse(""))
* // Output: { _id: 'Option', _tag: 'None' }
* ```
*
* @category Conversions
* @since 2.0.0
*/
const liftThrowable = (f) => (...a) => {
	try {
		return some(f(...a));
	} catch {
		return none$4();
	}
};
/**
* Extracts the value of an `Option` or throws an error if the `Option` is
* `None`, using a custom error factory.
*
* **Details**
*
* This function allows you to extract the value of an `Option` when it is
* `Some`. If the `Option` is `None`, it throws an error generated by the
* provided `onNone` function. This utility is particularly useful when you need
* a fail-fast behavior for empty `Option` values and want to provide a custom
* error message or object.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Option } from "effect"
*
* assert.deepStrictEqual(
*   Option.getOrThrowWith(Option.some(1), () => new Error('Unexpected None')),
*   1
* )
* assert.throws(() => Option.getOrThrowWith(Option.none(), () => new Error('Unexpected None')))
* ```
*
* @see {@link getOrThrow} for a version that throws a default error.
*
* @category Conversions
* @since 2.0.0
*/
const getOrThrowWith$1 = /*#__PURE__*/ dual(2, (self, onNone) => {
	if (isSome(self)) return self.value;
	throw onNone();
});
/**
* Extracts the value of an `Option` or throws a default error if the `Option`
* is `None`.
*
* **Details**
*
* This function extracts the value from an `Option` if it is `Some`. If the
* `Option` is `None`, it throws a default error. It is useful for fail-fast
* scenarios where the absence of a value is treated as an exceptional case and
* a default error is sufficient.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Option } from "effect"
*
* assert.deepStrictEqual(Option.getOrThrow(Option.some(1)), 1)
* assert.throws(() => Option.getOrThrow(Option.none()))
* ```
*
* @see {@link getOrThrowWith} for a version that allows you to provide a custom error.
*
* @category Conversions
* @since 2.0.0
*/
const getOrThrow$1 = /*#__PURE__*/ getOrThrowWith$1(() => /* @__PURE__ */ new Error("getOrThrow called on a None"));
/**
* Transforms the value inside a `Some` to a new value using the provided
* function, while leaving `None` unchanged.
*
* **Details**
*
* This function applies a mapping function `f` to the value inside an `Option`
* if it is a `Some`. If the `Option` is `None`, it remains unchanged. The
* result is a new `Option` with the transformed value (if it was a `Some`) or
* still `None`.
*
* This utility is particularly useful for chaining transformations in a
* functional way without needing to manually handle `None` cases.
*
* @example
* ```ts
* import { Option } from "effect"
*
* // Mapping over a `Some`
* const someValue = Option.some(2)
*
* console.log(Option.map(someValue, (n) => n * 2))
* // Output: { _id: 'Option', _tag: 'Some', value: 4 }
*
* // Mapping over a `None`
* const noneValue = Option.none<number>()
*
* console.log(Option.map(noneValue, (n) => n * 2))
* // Output: { _id: 'Option', _tag: 'None' }
* ```
*
* @category Mapping
* @since 2.0.0
*/
const map$13 = /*#__PURE__*/ dual(2, (self, f) => isNone(self) ? none$4() : some(f(self.value)));
/**
* Applies a function to the value of a `Some` and flattens the resulting
* `Option`. If the input is `None`, it remains `None`.
*
* **Details**
*
* This function allows you to chain computations that return `Option` values.
* If the input `Option` is `Some`, the provided function `f` is applied to the
* contained value, and the resulting `Option` is returned. If the input is
* `None`, the function is not applied, and the result remains `None`.
*
* This utility is particularly useful for sequencing operations that may fail
* or produce optional results, enabling clean and concise workflows for
* handling such cases.
*
* @example
* ```ts
* import { Option } from "effect"
*
* interface Address {
*   readonly city: string
*   readonly street: Option.Option<string>
* }
*
* interface User {
*   readonly id: number
*   readonly username: string
*   readonly email: Option.Option<string>
*   readonly address: Option.Option<Address>
* }
*
* const user: User = {
*   id: 1,
*   username: "john_doe",
*   email: Option.some("john.doe@example.com"),
*   address: Option.some({
*     city: "New York",
*     street: Option.some("123 Main St")
*   })
* }
*
* // Use flatMap to extract the street value
* const street = user.address.pipe(
*   Option.flatMap((address) => address.street)
* )
*
* console.log(street)
* // Output: { _id: 'Option', _tag: 'Some', value: '123 Main St' }
* ```
*
* @category Sequencing
* @since 2.0.0
*/
const flatMap$9 = /*#__PURE__*/ dual(2, (self, f) => isNone(self) ? none$4() : f(self.value));
/**
* Combines `flatMap` and `fromNullable`, transforming the value inside a `Some`
* using a function that may return `null` or `undefined`.
*
* **Details**
*
* This function applies a transformation function `f` to the value inside a
* `Some`. The function `f` may return a value, `null`, or `undefined`. If `f`
* returns a value, it is wrapped in a `Some`. If `f` returns `null` or
* `undefined`, the result is `None`. If the input `Option` is `None`, the
* function is not applied, and `None` is returned.
*
* This utility is particularly useful when working with deeply nested optional
* values or chaining computations that may result in `null` or `undefined` at
* some point.
*
* @example
* ```ts
* import { Option } from "effect"
*
* interface Employee {
*   company?: {
*     address?: {
*       street?: {
*         name?: string
*       }
*     }
*   }
* }
*
* const employee1: Employee = { company: { address: { street: { name: "high street" } } } }
*
* // Extracting a deeply nested property
* console.log(
*   Option.some(employee1)
*     .pipe(Option.flatMapNullable((employee) => employee.company?.address?.street?.name))
* )
* // Output: { _id: 'Option', _tag: 'Some', value: 'high street' }
*
* const employee2: Employee = { company: { address: { street: {} } } }
*
* // Property does not exist
* console.log(
*   Option.some(employee2)
*     .pipe(Option.flatMapNullable((employee) => employee.company?.address?.street?.name))
* )
* // Output: { _id: 'Option', _tag: 'None' }
* ```
*
* @category Sequencing
* @since 2.0.0
*/
const flatMapNullable = /*#__PURE__*/ dual(2, (self, f) => isNone(self) ? none$4() : fromNullable(f(self.value)));
/**
* Alias of {@link flatMap}.
*
* @example
* ```ts
* import { Option } from "effect"
*
* // Transform and filter numbers
* const transformEven = (n: Option.Option<number>): Option.Option<string> =>
*   Option.filterMap(n, (n) => (n % 2 === 0 ? Option.some(`Even: ${n}`) : Option.none()))
*
* console.log(transformEven(Option.none()))
* // Output: { _id: 'Option', _tag: 'None' }
*
* console.log(transformEven(Option.some(1)))
* // Output: { _id: 'Option', _tag: 'None' }
*
* console.log(transformEven(Option.some(2)))
* // Output: { _id: 'Option', _tag: 'Some', value: 'Even: 2' }
* ```
*
* @category Filtering
* @since 2.0.0
*/
const filterMap$1 = flatMap$9;
/**
* Filters an `Option` using a predicate. If the predicate is not satisfied or the `Option` is `None` returns `None`.
*
* If you need to change the type of the `Option` in addition to filtering, see `filterMap`.
*
* @example
* ```ts
* import { Option } from "effect"
*
* const removeEmptyString = (input: Option.Option<string>) =>
*   Option.filter(input, (value) => value !== "")
*
* console.log(removeEmptyString(Option.none()))
* // Output: { _id: 'Option', _tag: 'None' }
*
* console.log(removeEmptyString(Option.some("")))
* // Output: { _id: 'Option', _tag: 'None' }
*
* console.log(removeEmptyString(Option.some("a")))
* // Output: { _id: 'Option', _tag: 'Some', value: 'a' }
* ```
*
* @category Filtering
* @since 2.0.0
*/
const filter$3 = /*#__PURE__*/ dual(2, (self, predicate) => filterMap$1(self, (b) => predicate(b) ? some$1(b) : none$5));
/**
* Creates an `Equivalence` instance for comparing `Option` values, using a
* provided `Equivalence` for the inner type.
*
* **Details**
*
* This function takes an `Equivalence` instance for a specific type `A` and
* produces an `Equivalence` instance for `Option<A>`. The resulting
* `Equivalence` determines whether two `Option` values are equivalent:
*
* - Two `None`s are considered equivalent.
* - A `Some` and a `None` are not equivalent.
* - Two `Some` values are equivalent if their inner values are equivalent
*   according to the provided `Equivalence`.
*
* **Example** (Comparing Optional Numbers for Equivalence)
*
* ```ts
* import { Number, Option } from "effect"
*
* const isEquivalent = Option.getEquivalence(Number.Equivalence)
*
* console.log(isEquivalent(Option.none(), Option.none()))
* // Output: true
*
* console.log(isEquivalent(Option.none(), Option.some(1)))
* // Output: false
*
* console.log(isEquivalent(Option.some(1), Option.none()))
* // Output: false
*
* console.log(isEquivalent(Option.some(1), Option.some(2)))
* // Output: false
*
* console.log(isEquivalent(Option.some(1), Option.some(1)))
* // Output: true
* ```
*
* @category Equivalence
* @since 2.0.0
*/
const getEquivalence$3 = (isEquivalent) => make$47((x, y) => isNone(x) ? isNone(y) : isNone(y) ? false : isEquivalent(x.value, y.value));
/**
* Returns a function that checks if an `Option` contains a specified value,
* using a provided equivalence function.
*
* **Details**
*
* This function allows you to check whether an `Option` contains a specific
* value. It uses an equivalence function `isEquivalent` to compare the value
* inside the `Option` to the provided value. If the `Option` is `Some` and the
* equivalence function returns `true`, the result is `true`. If the `Option` is
* `None` or the values are not equivalent, the result is `false`.
*
* @example
* ```ts
* import { Number, Option } from "effect"
*
* const contains = Option.containsWith(Number.Equivalence)
*
* console.log(Option.some(2).pipe(contains(2)))
* // Output: true
*
* console.log(Option.some(1).pipe(contains(2)))
* // Output: false
*
* console.log(Option.none().pipe(contains(2)))
* // Output: false
* ```
*
* @see {@link contains} for a version that uses the default `Equivalence`.
*
* @category Elements
* @since 2.0.0
*/
const containsWith = (isEquivalent) => dual(2, (self, a) => isNone(self) ? false : isEquivalent(self.value, a));
/**
* Returns a function that checks if an `Option` contains a specified value
* using the default `Equivalence`.
*
* **Details**
*
* This function allows you to check whether an `Option` contains a specific
* value. It uses the default `Equivalence` for equality comparison. If the
* `Option` is `Some` and its value is equivalent to the provided value, the
* result is `true`. If the `Option` is `None` or the values are not equivalent,
* the result is `false`.
*
* @example
* ```ts
* import { Option } from "effect"
*
* console.log(Option.some(2).pipe(Option.contains(2)))
* // Output: true
*
* console.log(Option.some(1).pipe(Option.contains(2)))
* // Output: false
*
* console.log(Option.none().pipe(Option.contains(2)))
* // Output: false
* ```
*
* @see {@link containsWith} for a version that allows you to specify a custom equivalence function.
*
* @category Elements
* @since 2.0.0
*/
const contains = /*#__PURE__*/ containsWith(/* @__PURE__ */ equivalence());
/**
* Checks if a value in an `Option` satisfies a given predicate or refinement.
*
* **Details**
*
* This function allows you to check if a value inside a `Some` meets a
* specified condition. If the `Option` is `None`, the result is `false`. If the
* `Option` is `Some`, the provided predicate or refinement is applied to the
* value:
*
* - If the condition is met, the result is `true`.
* - If the condition is not met, the result is `false`.
*
* @example
* ```ts
* import { Option } from "effect"
*
* const isEven = (n: number) => n % 2 === 0
*
* console.log(Option.some(2).pipe(Option.exists(isEven)))
* // Output: true
*
* console.log(Option.some(1).pipe(Option.exists(isEven)))
* // Output: false
*
* console.log(Option.none().pipe(Option.exists(isEven)))
* // Output: false
* ```
*
* @category Elements
* @since 2.0.0
*/
const exists = /*#__PURE__*/ dual(2, (self, refinement) => isNone(self) ? false : refinement(self.value));
/**
* Merges two optional values, applying a function if both exist.
* Unlike {@link zipWith}, this function returns `None` only if both inputs are `None`.
*
* @internal
*/
const mergeWith$1 = (f) => (o1, o2) => {
	if (isNone(o1)) return o2;
	else if (isNone(o2)) return o1;
	return some(f(o1.value, o2.value));
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Duration.js
/**
* @since 2.0.0
*/
const TypeId$22 = /*#__PURE__*/ Symbol.for("effect/Duration");
const bigint0$2 = /*#__PURE__*/ BigInt(0);
const bigint24 = /*#__PURE__*/ BigInt(24);
const bigint60 = /*#__PURE__*/ BigInt(60);
const bigint1e3 = /*#__PURE__*/ BigInt(1e3);
const bigint1e6 = /*#__PURE__*/ BigInt(1e6);
const bigint1e9 = /*#__PURE__*/ BigInt(1e9);
const DURATION_REGEX = /^(-?\d+(?:\.\d+)?)\s+(nanos?|micros?|millis?|seconds?|minutes?|hours?|days?|weeks?)$/;
/**
* @since 2.0.0
*/
const decode = (input) => {
	if (isDuration(input)) return input;
	else if (isNumber(input)) return millis(input);
	else if (isBigInt(input)) return nanos(input);
	else if (Array.isArray(input) && input.length === 2 && input.every(isNumber)) {
		if (input[0] === -Infinity || input[1] === -Infinity || Number.isNaN(input[0]) || Number.isNaN(input[1])) return zero$1;
		if (input[0] === Infinity || input[1] === Infinity) return infinity;
		return nanos(BigInt(Math.round(input[0] * 1e9)) + BigInt(Math.round(input[1])));
	} else if (isString(input)) {
		const match = DURATION_REGEX.exec(input);
		if (match) {
			const [_, valueStr, unit] = match;
			const value = Number(valueStr);
			switch (unit) {
				case "nano":
				case "nanos": return nanos(BigInt(valueStr));
				case "micro":
				case "micros": return micros(BigInt(valueStr));
				case "milli":
				case "millis": return millis(value);
				case "second":
				case "seconds": return seconds(value);
				case "minute":
				case "minutes": return minutes(value);
				case "hour":
				case "hours": return hours(value);
				case "day":
				case "days": return days(value);
				case "week":
				case "weeks": return weeks(value);
			}
		}
	}
	throw new Error("Invalid DurationInput");
};
const zeroValue = {
	_tag: "Millis",
	millis: 0
};
const infinityValue = { _tag: "Infinity" };
const DurationProto = {
	[TypeId$22]: TypeId$22,
	[symbol$1]() {
		return cached(this, structure(this.value));
	},
	[symbol](that) {
		return isDuration(that) && equals$1(this, that);
	},
	toString() {
		return `Duration(${format$3(this)})`;
	},
	toJSON() {
		switch (this.value._tag) {
			case "Millis": return {
				_id: "Duration",
				_tag: "Millis",
				millis: this.value.millis
			};
			case "Nanos": return {
				_id: "Duration",
				_tag: "Nanos",
				hrtime: toHrTime(this)
			};
			case "Infinity": return {
				_id: "Duration",
				_tag: "Infinity"
			};
		}
	},
	[NodeInspectSymbol]() {
		return this.toJSON();
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
const make$45 = (input) => {
	const duration = Object.create(DurationProto);
	if (isNumber(input)) {
		if (isNaN(input) || input <= 0) duration.value = zeroValue;
		else if (!Number.isFinite(input)) duration.value = infinityValue;
		else if (!Number.isInteger(input)) duration.value = {
			_tag: "Nanos",
			nanos: BigInt(Math.round(input * 1e6))
		};
		else duration.value = {
			_tag: "Millis",
			millis: input
		};
	} else if (input <= bigint0$2) duration.value = zeroValue;
	else duration.value = {
		_tag: "Nanos",
		nanos: input
	};
	return duration;
};
/**
* @since 2.0.0
* @category guards
*/
const isDuration = (u) => hasProperty(u, TypeId$22);
/**
* @since 2.0.0
* @category guards
*/
const isFinite = (self) => self.value._tag !== "Infinity";
/**
* @since 3.5.0
* @category guards
*/
const isZero$1 = (self) => {
	switch (self.value._tag) {
		case "Millis": return self.value.millis === 0;
		case "Nanos": return self.value.nanos === bigint0$2;
		case "Infinity": return false;
	}
};
/**
* @since 2.0.0
* @category constructors
*/
const zero$1 = /*#__PURE__*/ make$45(0);
/**
* @since 2.0.0
* @category constructors
*/
const infinity = /*#__PURE__*/ make$45(Infinity);
/**
* @since 2.0.0
* @category constructors
*/
const nanos = (nanos) => make$45(nanos);
/**
* @since 2.0.0
* @category constructors
*/
const micros = (micros) => make$45(micros * bigint1e3);
/**
* @since 2.0.0
* @category constructors
*/
const millis = (millis) => make$45(millis);
/**
* @since 2.0.0
* @category constructors
*/
const seconds = (seconds) => make$45(seconds * 1e3);
/**
* @since 2.0.0
* @category constructors
*/
const minutes = (minutes) => make$45(minutes * 6e4);
/**
* @since 2.0.0
* @category constructors
*/
const hours = (hours) => make$45(hours * 36e5);
/**
* @since 2.0.0
* @category constructors
*/
const days = (days) => make$45(days * 864e5);
/**
* @since 2.0.0
* @category constructors
*/
const weeks = (weeks) => make$45(weeks * 6048e5);
/**
* @since 2.0.0
* @category getters
*/
const toMillis = (self) => match$8(self, {
	onMillis: (millis) => millis,
	onNanos: (nanos) => Number(nanos) / 1e6
});
/**
* Get the duration in nanoseconds as a bigint.
*
* If the duration is infinite, returns `Option.none()`
*
* @since 2.0.0
* @category getters
*/
const toNanos = (self) => {
	const _self = decode(self);
	switch (_self.value._tag) {
		case "Infinity": return none$4();
		case "Nanos": return some(_self.value.nanos);
		case "Millis": return some(BigInt(Math.round(_self.value.millis * 1e6)));
	}
};
/**
* Get the duration in nanoseconds as a bigint.
*
* If the duration is infinite, it throws an error.
*
* @since 2.0.0
* @category getters
*/
const unsafeToNanos = (self) => {
	const _self = decode(self);
	switch (_self.value._tag) {
		case "Infinity": throw new Error("Cannot convert infinite duration to nanos");
		case "Nanos": return _self.value.nanos;
		case "Millis": return BigInt(Math.round(_self.value.millis * 1e6));
	}
};
/**
* @since 2.0.0
* @category getters
*/
const toHrTime = (self) => {
	const _self = decode(self);
	switch (_self.value._tag) {
		case "Infinity": return [Infinity, 0];
		case "Nanos": return [Number(_self.value.nanos / bigint1e9), Number(_self.value.nanos % bigint1e9)];
		case "Millis": return [Math.floor(_self.value.millis / 1e3), Math.round(_self.value.millis % 1e3 * 1e6)];
	}
};
/**
* @since 2.0.0
* @category pattern matching
*/
const match$8 = /*#__PURE__*/ dual(2, (self, options) => {
	const _self = decode(self);
	switch (_self.value._tag) {
		case "Nanos": return options.onNanos(_self.value.nanos);
		case "Infinity": return options.onMillis(Infinity);
		case "Millis": return options.onMillis(_self.value.millis);
	}
});
/**
* @since 2.0.0
* @category pattern matching
*/
const matchWith = /*#__PURE__*/ dual(3, (self, that, options) => {
	const _self = decode(self);
	const _that = decode(that);
	if (_self.value._tag === "Infinity" || _that.value._tag === "Infinity") return options.onMillis(toMillis(_self), toMillis(_that));
	else if (_self.value._tag === "Nanos" || _that.value._tag === "Nanos") {
		const selfNanos = _self.value._tag === "Nanos" ? _self.value.nanos : BigInt(Math.round(_self.value.millis * 1e6));
		const thatNanos = _that.value._tag === "Nanos" ? _that.value.nanos : BigInt(Math.round(_that.value.millis * 1e6));
		return options.onNanos(selfNanos, thatNanos);
	}
	return options.onMillis(_self.value.millis, _that.value.millis);
});
/**
* @category instances
* @since 2.0.0
*/
const Equivalence$3 = (self, that) => matchWith(self, that, {
	onMillis: (self, that) => self === that,
	onNanos: (self, that) => self === that
});
/**
* @since 2.0.0
* @category math
*/
const sum = /*#__PURE__*/ dual(2, (self, that) => matchWith(self, that, {
	onMillis: (self, that) => make$45(self + that),
	onNanos: (self, that) => make$45(self + that)
}));
/**
* @since 2.0.0
* @category predicates
*/
const lessThanOrEqualTo$1 = /*#__PURE__*/ dual(2, (self, that) => matchWith(self, that, {
	onMillis: (self, that) => self <= that,
	onNanos: (self, that) => self <= that
}));
/**
* @since 2.0.0
* @category predicates
*/
const greaterThanOrEqualTo$1 = /*#__PURE__*/ dual(2, (self, that) => matchWith(self, that, {
	onMillis: (self, that) => self >= that,
	onNanos: (self, that) => self >= that
}));
/**
* @since 2.0.0
* @category predicates
*/
const equals$1 = /*#__PURE__*/ dual(2, (self, that) => Equivalence$3(decode(self), decode(that)));
/**
* Converts a `Duration` to its parts.
*
* @since 3.8.0
* @category conversions
*/
const parts = (self) => {
	const duration = decode(self);
	if (duration.value._tag === "Infinity") return {
		days: Infinity,
		hours: Infinity,
		minutes: Infinity,
		seconds: Infinity,
		millis: Infinity,
		nanos: Infinity
	};
	const nanos = unsafeToNanos(duration);
	const ms = nanos / bigint1e6;
	const sec = ms / bigint1e3;
	const min = sec / bigint60;
	const hr = min / bigint60;
	const days = hr / bigint24;
	return {
		days: Number(days),
		hours: Number(hr % bigint24),
		minutes: Number(min % bigint60),
		seconds: Number(sec % bigint60),
		millis: Number(ms % bigint1e3),
		nanos: Number(nanos % bigint1e6)
	};
};
/**
* Converts a `Duration` to a human readable string.
*
* @since 2.0.0
* @category conversions
* @example
* ```ts
* import { Duration } from "effect"
*
* Duration.format(Duration.millis(1000)) // "1s"
* Duration.format(Duration.millis(1001)) // "1s 1ms"
* ```
*/
const format$3 = (self) => {
	const duration = decode(self);
	if (duration.value._tag === "Infinity") return "Infinity";
	if (isZero$1(duration)) return "0";
	const fragments = parts(duration);
	const pieces = [];
	if (fragments.days !== 0) pieces.push(`${fragments.days}d`);
	if (fragments.hours !== 0) pieces.push(`${fragments.hours}h`);
	if (fragments.minutes !== 0) pieces.push(`${fragments.minutes}m`);
	if (fragments.seconds !== 0) pieces.push(`${fragments.seconds}s`);
	if (fragments.millis !== 0) pieces.push(`${fragments.millis}ms`);
	if (fragments.nanos !== 0) pieces.push(`${fragments.nanos}ns`);
	return pieces.join(" ");
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Either.js
/**
* Constructs a new `Either` holding a `Right` value. This usually represents a successful value due to the right bias
* of this structure.
*
* @category constructors
* @since 2.0.0
*/
const right = right$1;
/**
* Constructs a new `Either` holding a `Left` value. This usually represents a failure, due to the right-bias of this
* structure.
*
* @category constructors
* @since 2.0.0
*/
const left = left$1;
/**
* @example
* ```ts
* import * as assert from "node:assert"
* import { Either, Option } from "effect"
*
* assert.deepStrictEqual(Either.fromOption(Option.some(1), () => 'error'), Either.right(1))
* assert.deepStrictEqual(Either.fromOption(Option.none(), () => 'error'), Either.left('error'))
* ```
*
* @category constructors
* @since 2.0.0
*/
const fromOption$1 = fromOption$2;
const try_$2 = (evaluate) => {
	if (isFunction(evaluate)) try {
		return right(evaluate());
	} catch (e) {
		return left(e);
	}
	else try {
		return right(evaluate.try());
	} catch (e) {
		return left(evaluate.catch(e));
	}
};
/**
* Tests if a value is a `Either`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Either } from "effect"
*
* assert.deepStrictEqual(Either.isEither(Either.right(1)), true)
* assert.deepStrictEqual(Either.isEither(Either.left("a")), true)
* assert.deepStrictEqual(Either.isEither({ right: 1 }), false)
* ```
*
* @category guards
* @since 2.0.0
*/
const isEither$1 = isEither$2;
/**
* Determine if a `Either` is a `Left`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Either } from "effect"
*
* assert.deepStrictEqual(Either.isLeft(Either.right(1)), false)
* assert.deepStrictEqual(Either.isLeft(Either.left("a")), true)
* ```
*
* @category guards
* @since 2.0.0
*/
const isLeft = isLeft$1;
/**
* Determine if a `Either` is a `Right`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Either } from "effect"
*
* assert.deepStrictEqual(Either.isRight(Either.right(1)), true)
* assert.deepStrictEqual(Either.isRight(Either.left("a")), false)
* ```
*
* @category guards
* @since 2.0.0
*/
const isRight = isRight$1;
/**
* @category mapping
* @since 2.0.0
*/
const mapBoth$4 = /*#__PURE__*/ dual(2, (self, { onLeft, onRight }) => isLeft(self) ? left(onLeft(self.left)) : right(onRight(self.right)));
/**
* Maps the `Left` side of an `Either` value to a new `Either` value.
*
* @category mapping
* @since 2.0.0
*/
const mapLeft = /*#__PURE__*/ dual(2, (self, f) => isLeft(self) ? left(f(self.left)) : right(self.right));
/**
* Maps the `Right` side of an `Either` value to a new `Either` value.
*
* @category mapping
* @since 2.0.0
*/
const map$12 = /*#__PURE__*/ dual(2, (self, f) => isRight(self) ? right(f(self.right)) : left(self.left));
/**
* Takes two functions and an `Either` value, if the value is a `Left` the inner value is applied to the `onLeft function,
* if the value is a `Right` the inner value is applied to the `onRight` function.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { pipe, Either } from "effect"
*
* const onLeft  = (strings: ReadonlyArray<string>): string => `strings: ${strings.join(', ')}`
*
* const onRight = (value: number): string => `Ok: ${value}`
*
* assert.deepStrictEqual(pipe(Either.right(1), Either.match({ onLeft, onRight })), 'Ok: 1')
* assert.deepStrictEqual(
*   pipe(Either.left(['string 1', 'string 2']), Either.match({ onLeft, onRight })),
*   'strings: string 1, string 2'
* )
* ```
*
* @category pattern matching
* @since 2.0.0
*/
const match$7 = /*#__PURE__*/ dual(2, (self, { onLeft, onRight }) => isLeft(self) ? onLeft(self.left) : onRight(self.right));
/**
* @category getters
* @since 2.0.0
*/
const merge$3 = /*#__PURE__*/ match$7({
	onLeft: identity,
	onRight: identity
});
/**
* Extracts the value of an `Either` or throws if the `Either` is `Left`.
*
* If a default error is sufficient for your use case and you don't need to configure the thrown error, see {@link getOrThrow}.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Either } from "effect"
*
* assert.deepStrictEqual(
*   Either.getOrThrowWith(Either.right(1), () => new Error('Unexpected Left')),
*   1
* )
* assert.throws(() => Either.getOrThrowWith(Either.left("error"), () => new Error('Unexpected Left')))
* ```
*
* @category getters
* @since 2.0.0
*/
const getOrThrowWith = /*#__PURE__*/ dual(2, (self, onLeft) => {
	if (isRight(self)) return self.right;
	throw onLeft(self.left);
});
/**
* Extracts the value of an `Either` or throws if the `Either` is `Left`.
*
* The thrown error is a default error. To configure the error thrown, see  {@link getOrThrowWith}.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Either } from "effect"
*
* assert.deepStrictEqual(Either.getOrThrow(Either.right(1)), 1)
* assert.throws(() => Either.getOrThrow(Either.left("error")))
* ```
*
* @throws `Error("getOrThrow called on a Left")`
*
* @category getters
* @since 2.0.0
*/
const getOrThrow = /*#__PURE__*/ getOrThrowWith(() => /* @__PURE__ */ new Error("getOrThrow called on a Left"));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/array.js
/**
* @since 2.0.0
*/
/** @internal */
const isNonEmptyArray$1 = (self) => self.length > 0;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Tuple.js
/**
* Constructs a new tuple from the provided values.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { make } from "effect/Tuple"
*
* assert.deepStrictEqual(make(1, 'hello', true), [1, 'hello', true])
* ```
*
* @category constructors
* @since 2.0.0
*/
const make$44 = (...elements) => elements;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Iterable.js
const constEmpty = { [Symbol.iterator]() {
	return constEmptyIterator;
} };
const constEmptyIterator = { next() {
	return {
		done: true,
		value: void 0
	};
} };
/**
* @category constructors
* @since 2.0.0
*/
const empty$24 = () => constEmpty;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Array.js
/**
* Creates a new `Array` of the specified length.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const result = Array.allocate<number>(3)
* console.log(result) // [ <3 empty items> ]
* ```
*
* @category constructors
* @since 2.0.0
*/
const allocate = (n) => new Array(n);
/**
* Return a `NonEmptyArray` of length `n` with element `i` initialized with `f(i)`.
*
* **Note**. `n` is normalized to an integer >= 1.
*
* **Example**
*
* ```ts
* import { makeBy } from "effect/Array"
*
* const result = makeBy(5, n => n * 2)
* console.log(result) // [0, 2, 4, 6, 8]
* ```
*
* @category constructors
* @since 2.0.0
*/
const makeBy = /*#__PURE__*/ dual(2, (n, f) => {
	const max = Math.max(1, Math.floor(n));
	const out = new Array(max);
	for (let i = 0; i < max; i++) out[i] = f(i);
	return out;
});
/**
* Creates a new `Array` from an iterable collection of values.
* If the input is already an array, it returns the input as-is.
* Otherwise, it converts the iterable collection to an array.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const result = Array.fromIterable(new Set([1, 2, 3]))
* console.log(result) // [1, 2, 3]
* ```
*
* @category constructors
* @since 2.0.0
*/
const fromIterable$6 = (collection) => Array.isArray(collection) ? collection : Array.from(collection);
/**
* Creates a new `Array` from a value that might not be an iterable.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* console.log(Array.ensure("a")) // ["a"]
* console.log(Array.ensure(["a"])) // ["a"]
* console.log(Array.ensure(["a", "b", "c"])) // ["a", "b", "c"]
* ```
*
* @category constructors
* @since 3.3.0
*/
const ensure = (self) => Array.isArray(self) ? self : [self];
/**
* Matches the elements of an array from the left, applying functions to cases of empty and non-empty arrays.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const matchLeft = Array.matchLeft({
*   onEmpty: () => "empty",
*   onNonEmpty: (head, tail) => `head: ${head}, tail: ${tail.length}`
* })
* console.log(matchLeft([])) // "empty"
* console.log(matchLeft([1, 2, 3])) // "head: 1, tail: 2"
* ```
*
* @category pattern matching
* @since 2.0.0
*/
const matchLeft = /*#__PURE__*/ dual(2, (self, { onEmpty, onNonEmpty }) => isNonEmptyReadonlyArray(self) ? onNonEmpty(headNonEmpty$1(self), tailNonEmpty$1(self)) : onEmpty());
/**
* Prepend an element to the front of an `Iterable`, creating a new `NonEmptyArray`.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const result = Array.prepend([2, 3, 4], 1)
* console.log(result) // [1, 2, 3, 4]
* ```
*
* @category concatenating
* @since 2.0.0
*/
const prepend$2 = /*#__PURE__*/ dual(2, (self, head) => [head, ...self]);
/**
* Append an element to the end of an `Iterable`, creating a new `NonEmptyArray`.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const result = Array.append([1, 2, 3], 4);
* console.log(result) // [1, 2, 3, 4]
* ```
*
* @category concatenating
* @since 2.0.0
*/
const append$2 = /*#__PURE__*/ dual(2, (self, last) => [...self, last]);
/**
* Concatenates two arrays (or iterables), combining their elements.
* If either array is non-empty, the result is also a non-empty array.
*
* @category concatenating
* @since 2.0.0
*/
const appendAll$2 = /*#__PURE__*/ dual(2, (self, that) => fromIterable$6(self).concat(fromIterable$6(that)));
/**
* Determine if `unknown` is an Array.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* console.log(Array.isArray(null)) // false
* console.log(Array.isArray([1, 2, 3])) // true
* ```
*
* @category guards
* @since 2.0.0
*/
const isArray = Array.isArray;
/**
* Determine if an `Array` is empty narrowing down the type to `[]`.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* console.log(Array.isEmptyArray([])) // true
* console.log(Array.isEmptyArray([1, 2, 3])) // false
* ```
*
* @category guards
* @since 2.0.0
*/
const isEmptyArray = (self) => self.length === 0;
/**
* Determine if a `ReadonlyArray` is empty narrowing down the type to `readonly []`.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* console.log(Array.isEmptyReadonlyArray([])) // true
* console.log(Array.isEmptyReadonlyArray([1, 2, 3])) // false
* ```
*
* @category guards
* @since 2.0.0
*/
const isEmptyReadonlyArray = isEmptyArray;
/**
* Determine if an `Array` is non empty narrowing down the type to `NonEmptyArray`.
*
* An `Array` is considered to be a `NonEmptyArray` if it contains at least one element.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* console.log(Array.isNonEmptyArray([])) // false
* console.log(Array.isNonEmptyArray([1, 2, 3])) // true
* ```
*
* @category guards
* @since 2.0.0
*/
const isNonEmptyArray = isNonEmptyArray$1;
/**
* Determine if a `ReadonlyArray` is non empty narrowing down the type to `NonEmptyReadonlyArray`.
*
* A `ReadonlyArray` is considered to be a `NonEmptyReadonlyArray` if it contains at least one element.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* console.log(Array.isNonEmptyReadonlyArray([])) // false
* console.log(Array.isNonEmptyReadonlyArray([1, 2, 3])) // true
* ```
*
* @category guards
* @since 2.0.0
*/
const isNonEmptyReadonlyArray = isNonEmptyArray$1;
const isOutOfBounds = (i, as) => i < 0 || i >= as.length;
const clamp = (i, as) => Math.floor(Math.min(Math.max(0, i), as.length));
/**
* This function provides a safe way to read a value at a particular index from a `ReadonlyArray`.
*
* @category getters
* @since 2.0.0
*/
const get$10 = /*#__PURE__*/ dual(2, (self, index) => {
	const i = Math.floor(index);
	return isOutOfBounds(i, self) ? none$4() : some(self[i]);
});
/**
* Gets an element unsafely, will throw on out of bounds.
*
* @since 2.0.0
* @category unsafe
*/
const unsafeGet$1 = /*#__PURE__*/ dual(2, (self, index) => {
	const i = Math.floor(index);
	if (isOutOfBounds(i, self)) throw new Error(`Index ${i} out of bounds`);
	return self[i];
});
/**
* Get the first element of a `ReadonlyArray`, or `None` if the `ReadonlyArray` is empty.
*
* @category getters
* @since 2.0.0
*/
const head$1 = /*#__PURE__*/ get$10(0);
/**
* Get the first element of a non empty array.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const result = Array.headNonEmpty([1, 2, 3, 4])
* console.log(result) // 1
* ```
*
* @category getters
* @since 2.0.0
*/
const headNonEmpty$1 = /*#__PURE__*/ unsafeGet$1(0);
/**
* Get the last element in a `ReadonlyArray`, or `None` if the `ReadonlyArray` is empty.
*
* @category getters
* @since 2.0.0
*/
const last = (self) => isNonEmptyReadonlyArray(self) ? some(lastNonEmpty(self)) : none$4();
/**
* Get the last element of a non empty array.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const result = Array.lastNonEmpty([1, 2, 3, 4])
* console.log(result) // 4
* ```
*
* @category getters
* @since 2.0.0
*/
const lastNonEmpty = (self) => self[self.length - 1];
/**
* Get all but the first element of a `NonEmptyReadonlyArray`.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const result = Array.tailNonEmpty([1, 2, 3, 4])
* console.log(result) // [2, 3, 4]
* ```
*
* @category getters
* @since 2.0.0
*/
const tailNonEmpty$1 = (self) => self.slice(1);
const spanIndex = (self, predicate) => {
	let i = 0;
	for (const a of self) {
		if (!predicate(a, i)) break;
		i++;
	}
	return i;
};
/**
* Split an `Iterable` into two parts:
*
* 1. the longest initial subarray for which all elements satisfy the specified predicate
* 2. the remaining elements
*
* @category splitting
* @since 2.0.0
*/
const span = /*#__PURE__*/ dual(2, (self, predicate) => splitAt(self, spanIndex(self, predicate)));
/**
* Drop a max number of elements from the start of an `Iterable`, creating a new `Array`.
*
* **Note**. `n` is normalized to a non negative integer.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const result = Array.drop([1, 2, 3, 4, 5], 2)
* console.log(result) // [3, 4, 5]
* ```
*
* @category getters
* @since 2.0.0
*/
const drop$1 = /*#__PURE__*/ dual(2, (self, n) => {
	const input = fromIterable$6(self);
	return input.slice(clamp(n, input), input.length);
});
/**
* Reverse an `Iterable`, creating a new `Array`.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const result = Array.reverse([1, 2, 3, 4])
* console.log(result) // [4, 3, 2, 1]
* ```
*
* @category elements
* @since 2.0.0
*/
const reverse$2 = (self) => Array.from(self).reverse();
/**
* Create a new array with elements sorted in increasing order based on the specified comparator.
* If the input is a `NonEmptyReadonlyArray`, the output will also be a `NonEmptyReadonlyArray`.
*
* @category sorting
* @since 2.0.0
*/
const sort = /*#__PURE__*/ dual(2, (self, O) => {
	const out = Array.from(self);
	out.sort(O);
	return out;
});
/**
* Takes two `Iterable`s and returns an `Array` of corresponding pairs.
* If one input `Iterable` is short, excess elements of the
* longer `Iterable` are discarded.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const result = Array.zip([1, 2, 3], ['a', 'b'])
* console.log(result) // [[1, 'a'], [2, 'b']]
* ```
*
* @category zipping
* @since 2.0.0
*/
const zip$4 = /*#__PURE__*/ dual(2, (self, that) => zipWith$3(self, that, make$44));
/**
* Apply a function to pairs of elements at the same index in two `Iterable`s, collecting the results in a new `Array`. If one
* input `Iterable` is short, excess elements of the longer `Iterable` are discarded.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const result = Array.zipWith([1, 2, 3], [4, 5, 6], (a, b) => a + b)
* console.log(result) // [5, 7, 9]
* ```
*
* @category zipping
* @since 2.0.0
*/
const zipWith$3 = /*#__PURE__*/ dual(3, (self, that, f) => {
	const as = fromIterable$6(self);
	const bs = fromIterable$6(that);
	if (isNonEmptyReadonlyArray(as) && isNonEmptyReadonlyArray(bs)) {
		const out = [f(headNonEmpty$1(as), headNonEmpty$1(bs))];
		const len = Math.min(as.length, bs.length);
		for (let i = 1; i < len; i++) out[i] = f(as[i], bs[i]);
		return out;
	}
	return [];
});
const _equivalence$2 = /*#__PURE__*/ equivalence();
/**
* Splits an `Iterable` into two segments, with the first segment containing a maximum of `n` elements.
* The value of `n` can be `0`.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const result = Array.splitAt([1, 2, 3, 4, 5], 3)
* console.log(result) // [[1, 2, 3], [4, 5]]
* ```
*
* @category splitting
* @since 2.0.0
*/
const splitAt = /*#__PURE__*/ dual(2, (self, n) => {
	const input = Array.from(self);
	const _n = Math.floor(n);
	if (isNonEmptyReadonlyArray(input)) {
		if (_n >= 1) return splitNonEmptyAt(input, _n);
		return [[], input];
	}
	return [input, []];
});
/**
* Splits a `NonEmptyReadonlyArray` into two segments, with the first segment containing a maximum of `n` elements.
* The value of `n` must be `>= 1`.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const result = Array.splitNonEmptyAt(["a", "b", "c", "d", "e"], 3)
* console.log(result) // [["a", "b", "c"], ["d", "e"]]
* ```
*
* @category splitting
* @since 2.0.0
*/
const splitNonEmptyAt = /*#__PURE__*/ dual(2, (self, n) => {
	const _n = Math.max(1, Math.floor(n));
	return _n >= self.length ? [copy$2(self), []] : [prepend$2(self.slice(1, _n), headNonEmpty$1(self)), self.slice(_n)];
});
/**
* Copies an array.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const result = Array.copy([1, 2, 3])
* console.log(result) // [1, 2, 3]
* ```
*
* @since 2.0.0
*/
const copy$2 = (self) => self.slice();
/**
* Calculates the union of two arrays using the provided equivalence relation.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const union = Array.unionWith([1, 2], [2, 3], (a, b) => a === b)
* console.log(union) // [1, 2, 3]
* ```
*
* @since 2.0.0
*/
const unionWith = /*#__PURE__*/ dual(3, (self, that, isEquivalent) => {
	const a = fromIterable$6(self);
	const b = fromIterable$6(that);
	if (isNonEmptyReadonlyArray(a)) {
		if (isNonEmptyReadonlyArray(b)) return dedupeWith(isEquivalent)(appendAll$2(a, b));
		return a;
	}
	return b;
});
/**
* Creates a union of two arrays, removing duplicates.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const result = Array.union([1, 2], [2, 3])
* console.log(result) // [1, 2, 3]
* ```
*
* @since 2.0.0
*/
const union$4 = /*#__PURE__*/ dual(2, (self, that) => unionWith(self, that, _equivalence$2));
/**
* @category constructors
* @since 2.0.0
*/
const empty$23 = () => [];
/**
* Constructs a new `NonEmptyArray<A>` from the specified value.
*
* @category constructors
* @since 2.0.0
*/
const of$2 = (a) => [a];
/**
* @category mapping
* @since 2.0.0
*/
const map$11 = /*#__PURE__*/ dual(2, (self, f) => self.map(f));
/**
* Applies a function to each element in an array and returns a new array containing the concatenated mapped elements.
*
* @category sequencing
* @since 2.0.0
*/
const flatMap$8 = /*#__PURE__*/ dual(2, (self, f) => {
	if (isEmptyReadonlyArray(self)) return [];
	const out = [];
	for (let i = 0; i < self.length; i++) {
		const inner = f(self[i], i);
		for (let j = 0; j < inner.length; j++) out.push(inner[j]);
	}
	return out;
});
/**
* Combines multiple arrays into a single array by concatenating all elements
* from each nested array. This function ensures that the structure of nested
* arrays is collapsed into a single, flat array.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const result = Array.flatten([[1, 2], [], [3, 4], [], [5, 6]])
* console.log(result) // [1, 2, 3, 4, 5, 6]
* ```
*
* @category sequencing
* @since 2.0.0
*/
const flatten$8 = /*#__PURE__*/ flatMap$8(identity);
/**
* Applies a function to each element of the `Iterable` and filters based on the result, keeping the transformed values where the function returns `Some`.
* This method combines filtering and mapping functionalities, allowing transformations and filtering of elements based on a single function pass.
*
* **Example**
*
* ```ts
* import { Array, Option } from "effect"
*
* const evenSquares = (x: number) => x % 2 === 0 ? Option.some(x * x) : Option.none()
*
* const result = Array.filterMap([1, 2, 3, 4, 5], evenSquares);
* console.log(result) // [4, 16]
* ```
*
* @category filtering
* @since 2.0.0
*/
const filterMap = /*#__PURE__*/ dual(2, (self, f) => {
	const as = fromIterable$6(self);
	const out = [];
	for (let i = 0; i < as.length; i++) {
		const o = f(as[i], i);
		if (isSome(o)) out.push(o.value);
	}
	return out;
});
/**
* @category filtering
* @since 2.0.0
*/
const filter$2 = /*#__PURE__*/ dual(2, (self, predicate) => {
	const as = fromIterable$6(self);
	const out = [];
	for (let i = 0; i < as.length; i++) if (predicate(as[i], i)) out.push(as[i]);
	return out;
});
/**
* Reduces an array from the left.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const result = Array.reduce([1, 2, 3], 0, (acc, n) => acc + n)
* console.log(result) // 6
* ```
*
* @category folding
* @since 2.0.0
*/
const reduce$9 = /*#__PURE__*/ dual(3, (self, b, f) => fromIterable$6(self).reduce((b, a, i) => f(b, a, i), b));
/**
* @category constructors
* @since 2.0.0
*/
const unfold$1 = (b, f) => {
	const out = [];
	let next = b;
	let o;
	while (isSome(o = f(next))) {
		const [a, b] = o.value;
		out.push(a);
		next = b;
	}
	return out;
};
/**
* Creates an equivalence relation for arrays.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const eq = Array.getEquivalence<number>((a, b) => a === b)
* console.log(eq([1, 2, 3], [1, 2, 3])) // true
* ```
*
* @category instances
* @since 2.0.0
*/
const getEquivalence$2 = array;
/**
* Remove duplicates from an `Iterable` using the provided `isEquivalent` function,
* preserving the order of the first occurrence of each element.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const result = Array.dedupeWith([1, 2, 2, 3, 3, 3], (a, b) => a === b)
* console.log(result) // [1, 2, 3]
* ```
*
* @since 2.0.0
*/
const dedupeWith = /*#__PURE__*/ dual(2, (self, isEquivalent) => {
	const input = fromIterable$6(self);
	if (isNonEmptyReadonlyArray(input)) {
		const out = [headNonEmpty$1(input)];
		const rest = tailNonEmpty$1(input);
		for (const r of rest) if (out.every((a) => !isEquivalent(r, a))) out.push(r);
		return out;
	}
	return [];
});
/**
* Remove duplicates from an `Iterable`, preserving the order of the first occurrence of each element.
* The equivalence used to compare elements is provided by `Equal.equivalence()` from the `Equal` module.
*
* @since 2.0.0
*/
const dedupe = (self) => dedupeWith(self, equivalence());
/**
* Joins the elements together with "sep" in the middle.
*
* **Example**
*
* ```ts
* import { Array } from "effect"
*
* const strings = ["a", "b", "c"]
* const joined = Array.join(strings, "-")
* console.log(joined) // "a-b-c"
* ```
*
* @since 2.0.0
* @category folding
*/
const join$3 = /*#__PURE__*/ dual(2, (self, sep) => fromIterable$6(self).join(sep));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Chunk.js
/**
* @since 2.0.0
*/
const TypeId$21 = /*#__PURE__*/ Symbol.for("effect/Chunk");
function copy$1(src, srcPos, dest, destPos, len) {
	for (let i = srcPos; i < Math.min(src.length, srcPos + len); i++) dest[destPos + i - srcPos] = src[i];
	return dest;
}
const emptyArray = [];
/**
* Compares the two chunks of equal length using the specified function
*
* @category equivalence
* @since 2.0.0
*/
const getEquivalence$1 = (isEquivalent) => make$47((self, that) => self.length === that.length && toReadonlyArray(self).every((value, i) => isEquivalent(value, unsafeGet(that, i))));
const _equivalence$1 = /*#__PURE__*/ getEquivalence$1(equals$2);
const ChunkProto = {
	[TypeId$21]: { _A: (_) => _ },
	toString() {
		return format$4(this.toJSON());
	},
	toJSON() {
		return {
			_id: "Chunk",
			values: toReadonlyArray(this).map(toJSON)
		};
	},
	[NodeInspectSymbol]() {
		return this.toJSON();
	},
	[symbol](that) {
		return isChunk(that) && _equivalence$1(this, that);
	},
	[symbol$1]() {
		return cached(this, array$1(toReadonlyArray(this)));
	},
	[Symbol.iterator]() {
		switch (this.backing._tag) {
			case "IArray": return this.backing.array[Symbol.iterator]();
			case "IEmpty": return emptyArray[Symbol.iterator]();
			default: return toReadonlyArray(this)[Symbol.iterator]();
		}
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
const makeChunk = (backing) => {
	const chunk = Object.create(ChunkProto);
	chunk.backing = backing;
	switch (backing._tag) {
		case "IEmpty":
			chunk.length = 0;
			chunk.depth = 0;
			chunk.left = chunk;
			chunk.right = chunk;
			break;
		case "IConcat":
			chunk.length = backing.left.length + backing.right.length;
			chunk.depth = 1 + Math.max(backing.left.depth, backing.right.depth);
			chunk.left = backing.left;
			chunk.right = backing.right;
			break;
		case "IArray":
			chunk.length = backing.array.length;
			chunk.depth = 0;
			chunk.left = _empty$5;
			chunk.right = _empty$5;
			break;
		case "ISingleton":
			chunk.length = 1;
			chunk.depth = 0;
			chunk.left = _empty$5;
			chunk.right = _empty$5;
			break;
		case "ISlice":
			chunk.length = backing.length;
			chunk.depth = backing.chunk.depth + 1;
			chunk.left = _empty$5;
			chunk.right = _empty$5;
	}
	return chunk;
};
/**
* Checks if `u` is a `Chunk<unknown>`
*
* @category constructors
* @since 2.0.0
*/
const isChunk = (u) => hasProperty(u, TypeId$21);
const _empty$5 = /*#__PURE__*/ makeChunk({ _tag: "IEmpty" });
/**
* @category constructors
* @since 2.0.0
*/
const empty$22 = () => _empty$5;
/**
* Builds a `NonEmptyChunk` from an non-empty collection of elements.
*
* @category constructors
* @since 2.0.0
*/
const make$43 = (...as) => unsafeFromNonEmptyArray(as);
/**
* Builds a `NonEmptyChunk` from a single element.
*
* @category constructors
* @since 2.0.0
*/
const of$1 = (a) => makeChunk({
	_tag: "ISingleton",
	a
});
/**
* Creates a new `Chunk` from an iterable collection of values.
*
* @category constructors
* @since 2.0.0
*/
const fromIterable$5 = (self) => isChunk(self) ? self : unsafeFromArray(fromIterable$6(self));
const copyToArray = (self, array, initial) => {
	switch (self.backing._tag) {
		case "IArray":
			copy$1(self.backing.array, 0, array, initial, self.length);
			break;
		case "IConcat":
			copyToArray(self.left, array, initial);
			copyToArray(self.right, array, initial + self.left.length);
			break;
		case "ISingleton":
			array[initial] = self.backing.a;
			break;
		case "ISlice": {
			let i = 0;
			let j = initial;
			while (i < self.length) {
				array[j] = unsafeGet(self, i);
				i += 1;
				j += 1;
			}
			break;
		}
	}
};
const toArray_ = (self) => toReadonlyArray(self).slice();
/**
* Converts a `Chunk` into an `Array`. If the provided `Chunk` is non-empty
* (`NonEmptyChunk`), the function will return a `NonEmptyArray`, ensuring the
* non-empty property is preserved.
*
* @category conversions
* @since 2.0.0
*/
const toArray$1 = toArray_;
const toReadonlyArray_ = (self) => {
	switch (self.backing._tag) {
		case "IEmpty": return emptyArray;
		case "IArray": return self.backing.array;
		default: {
			const arr = new Array(self.length);
			copyToArray(self, arr, 0);
			self.backing = {
				_tag: "IArray",
				array: arr
			};
			self.left = _empty$5;
			self.right = _empty$5;
			self.depth = 0;
			return arr;
		}
	}
};
/**
* Converts a `Chunk` into a `ReadonlyArray`. If the provided `Chunk` is
* non-empty (`NonEmptyChunk`), the function will return a
* `NonEmptyReadonlyArray`, ensuring the non-empty property is preserved.
*
* @category conversions
* @since 2.0.0
*/
const toReadonlyArray = toReadonlyArray_;
const reverseChunk = (self) => {
	switch (self.backing._tag) {
		case "IEmpty":
		case "ISingleton": return self;
		case "IArray": return makeChunk({
			_tag: "IArray",
			array: reverse$2(self.backing.array)
		});
		case "IConcat": return makeChunk({
			_tag: "IConcat",
			left: reverse$1(self.backing.right),
			right: reverse$1(self.backing.left)
		});
		case "ISlice": return unsafeFromArray(reverse$2(toReadonlyArray(self)));
	}
};
/**
* Reverses the order of elements in a `Chunk`.
* Importantly, if the input chunk is a `NonEmptyChunk`, the reversed chunk will also be a `NonEmptyChunk`.
*
* **Example**
*
* ```ts
* import { Chunk } from "effect"
*
* const chunk = Chunk.make(1, 2, 3)
* const result = Chunk.reverse(chunk)
*
* console.log(result)
* // { _id: 'Chunk', values: [ 3, 2, 1 ] }
* ```
*
* @since 2.0.0
* @category elements
*/
const reverse$1 = reverseChunk;
/**
* This function provides a safe way to read a value at a particular index from a `Chunk`.
*
* @category elements
* @since 2.0.0
*/
const get$9 = /*#__PURE__*/ dual(2, (self, index) => index < 0 || index >= self.length ? none$4() : some(unsafeGet(self, index)));
/**
* Wraps an array into a chunk without copying, unsafe on mutable arrays
*
* @since 2.0.0
* @category unsafe
*/
const unsafeFromArray = (self) => self.length === 0 ? empty$22() : self.length === 1 ? of$1(self[0]) : makeChunk({
	_tag: "IArray",
	array: self
});
/**
* Wraps an array into a chunk without copying, unsafe on mutable arrays
*
* @since 2.0.0
* @category unsafe
*/
const unsafeFromNonEmptyArray = (self) => unsafeFromArray(self);
/**
* Gets an element unsafely, will throw on out of bounds
*
* @since 2.0.0
* @category unsafe
*/
const unsafeGet = /*#__PURE__*/ dual(2, (self, index) => {
	switch (self.backing._tag) {
		case "IEmpty": throw new Error(`Index out of bounds`);
		case "ISingleton":
			if (index !== 0) throw new Error(`Index out of bounds`);
			return self.backing.a;
		case "IArray":
			if (index >= self.length || index < 0) throw new Error(`Index out of bounds`);
			return self.backing.array[index];
		case "IConcat": return index < self.left.length ? unsafeGet(self.left, index) : unsafeGet(self.right, index - self.left.length);
		case "ISlice": return unsafeGet(self.backing.chunk, index + self.backing.offset);
	}
});
/**
* Appends the specified element to the end of the `Chunk`.
*
* @category concatenating
* @since 2.0.0
*/
const append$1 = /*#__PURE__*/ dual(2, (self, a) => appendAll$1(self, of$1(a)));
/**
* Prepend an element to the front of a `Chunk`, creating a new `NonEmptyChunk`.
*
* @category concatenating
* @since 2.0.0
*/
const prepend$1 = /*#__PURE__*/ dual(2, (self, elem) => appendAll$1(of$1(elem), self));
/**
* Takes the first up to `n` elements from the chunk
*
* @since 2.0.0
*/
const take$4 = /*#__PURE__*/ dual(2, (self, n) => {
	if (n <= 0) return _empty$5;
	else if (n >= self.length) return self;
	else switch (self.backing._tag) {
		case "ISlice": return makeChunk({
			_tag: "ISlice",
			chunk: self.backing.chunk,
			length: n,
			offset: self.backing.offset
		});
		case "IConcat":
			if (n > self.left.length) return makeChunk({
				_tag: "IConcat",
				left: self.left,
				right: take$4(self.right, n - self.left.length)
			});
			return take$4(self.left, n);
		default: return makeChunk({
			_tag: "ISlice",
			chunk: self,
			offset: 0,
			length: n
		});
	}
});
/**
* Drops the first up to `n` elements from the chunk
*
* @since 2.0.0
*/
const drop = /*#__PURE__*/ dual(2, (self, n) => {
	if (n <= 0) return self;
	else if (n >= self.length) return _empty$5;
	else switch (self.backing._tag) {
		case "ISlice": return makeChunk({
			_tag: "ISlice",
			chunk: self.backing.chunk,
			offset: self.backing.offset + n,
			length: self.backing.length - n
		});
		case "IConcat":
			if (n > self.left.length) return drop(self.right, n - self.left.length);
			return makeChunk({
				_tag: "IConcat",
				left: drop(self.left, n),
				right: self.right
			});
		default: return makeChunk({
			_tag: "ISlice",
			chunk: self,
			offset: n,
			length: self.length - n
		});
	}
});
/**
* Concatenates two chunks, combining their elements.
* If either chunk is non-empty, the result is also a non-empty chunk.
*
* **Example**
*
* ```ts
* import { Chunk } from "effect"
*
* const result = Chunk.make(1, 2).pipe(Chunk.appendAll(Chunk.make("a", "b")), Chunk.toArray)
*
* console.log(result)
* // [ 1, 2, "a", "b" ]
* ```
*
* @category concatenating
* @since 2.0.0
*/
const appendAll$1 = /*#__PURE__*/ dual(2, (self, that) => {
	if (self.backing._tag === "IEmpty") return that;
	if (that.backing._tag === "IEmpty") return self;
	const diff = that.depth - self.depth;
	if (Math.abs(diff) <= 1) return makeChunk({
		_tag: "IConcat",
		left: self,
		right: that
	});
	else if (diff < -1) {
		if (self.left.depth >= self.right.depth) {
			const nr = appendAll$1(self.right, that);
			return makeChunk({
				_tag: "IConcat",
				left: self.left,
				right: nr
			});
		} else {
			const nrr = appendAll$1(self.right.right, that);
			if (nrr.depth === self.depth - 3) {
				const nr = makeChunk({
					_tag: "IConcat",
					left: self.right.left,
					right: nrr
				});
				return makeChunk({
					_tag: "IConcat",
					left: self.left,
					right: nr
				});
			} else {
				const nl = makeChunk({
					_tag: "IConcat",
					left: self.left,
					right: self.right.left
				});
				return makeChunk({
					_tag: "IConcat",
					left: nl,
					right: nrr
				});
			}
		}
	} else if (that.right.depth >= that.left.depth) {
		const nl = appendAll$1(self, that.left);
		return makeChunk({
			_tag: "IConcat",
			left: nl,
			right: that.right
		});
	} else {
		const nll = appendAll$1(self, that.left.left);
		if (nll.depth === that.depth - 3) {
			const nl = makeChunk({
				_tag: "IConcat",
				left: nll,
				right: that.left.right
			});
			return makeChunk({
				_tag: "IConcat",
				left: nl,
				right: that.right
			});
		} else {
			const nr = makeChunk({
				_tag: "IConcat",
				left: that.left.right,
				right: that.right
			});
			return makeChunk({
				_tag: "IConcat",
				left: nll,
				right: nr
			});
		}
	}
});
/**
* Returns a filtered and mapped subset of the elements.
*
* @since 2.0.0
* @category filtering
*/
const filter$1 = /*#__PURE__*/ dual(2, (self, predicate) => unsafeFromArray(filter$2(self, predicate)));
/**
* Determines if the chunk is empty.
*
* @since 2.0.0
* @category elements
*/
const isEmpty$7 = (self) => self.length === 0;
/**
* Determines if the chunk is not empty.
*
* @since 2.0.0
* @category elements
*/
const isNonEmpty$4 = (self) => self.length > 0;
/**
* Returns the first element of this chunk if it exists.
*
* @since 2.0.0
* @category elements
*/
const head = /*#__PURE__*/ get$9(0);
/**
* Returns the first element of this chunk.
*
* It will throw an error if the chunk is empty.
*
* @since 2.0.0
* @category unsafe
*/
const unsafeHead = (self) => unsafeGet(self, 0);
/**
* Returns the first element of this non empty chunk.
*
* @since 2.0.0
* @category elements
*/
const headNonEmpty = unsafeHead;
/**
* Transforms the elements of a chunk using the specified mapping function.
* If the input chunk is non-empty, the resulting chunk will also be non-empty.
*
* **Example**
*
* ```ts
* import { Chunk } from "effect"
*
* const result = Chunk.map(Chunk.make(1, 2), (n) => n + 1)
*
* console.log(result)
* // { _id: 'Chunk', values: [ 2, 3 ] }
* ```
*
* @since 2.0.0
* @category mapping
*/
const map$10 = /*#__PURE__*/ dual(2, (self, f) => self.backing._tag === "ISingleton" ? of$1(f(self.backing.a, 0)) : unsafeFromArray(pipe(toReadonlyArray(self), map$11((a, i) => f(a, i)))));
/**
* Returns every elements after the first.
*
* @since 2.0.0
* @category elements
*/
const tailNonEmpty = (self) => drop(self, 1);
/**
* Takes the last `n` elements.
*
* @since 2.0.0
* @category elements
*/
const takeRight = /*#__PURE__*/ dual(2, (self, n) => drop(self, self.length - n));
/**
* @category folding
* @since 2.0.0
*/
const reduce$8 = reduce$9;
/** @internal */
const BUCKET_SIZE = /*#__PURE__*/ Math.pow(2, 5);
/** @internal */
const MASK = BUCKET_SIZE - 1;
/** @internal */
const MAX_INDEX_NODE = BUCKET_SIZE / 2;
/** @internal */
const MIN_ARRAY_NODE = BUCKET_SIZE / 4;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/hashMap/bitwise.js
/**
* Hamming weight.
*
* Taken from: http://jsperf.com/hamming-weight
*
* @internal
*/
function popcount(x) {
	x -= x >> 1 & 1431655765;
	x = (x & 858993459) + (x >> 2 & 858993459);
	x = x + (x >> 4) & 252645135;
	x += x >> 8;
	x += x >> 16;
	return x & 127;
}
/** @internal */
function hashFragment(shift, h) {
	return h >>> shift & MASK;
}
/** @internal */
function toBitmap(x) {
	return 1 << x;
}
/** @internal */
function fromBitmap(bitmap, bit) {
	return popcount(bitmap & bit - 1);
}
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/stack.js
const make$42 = (value, previous) => ({
	value,
	previous
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/hashMap/array.js
/** @internal */
function arrayUpdate(mutate, at, v, arr) {
	let out = arr;
	if (!mutate) {
		const len = arr.length;
		out = new Array(len);
		for (let i = 0; i < len; ++i) out[i] = arr[i];
	}
	out[at] = v;
	return out;
}
/** @internal */
function arraySpliceOut(mutate, at, arr) {
	const newLen = arr.length - 1;
	let i = 0;
	let g = 0;
	let out = arr;
	if (mutate) i = g = at;
	else {
		out = new Array(newLen);
		while (i < at) out[g++] = arr[i++];
	}
	++i;
	while (i <= newLen) out[g++] = arr[i++];
	if (mutate) out.length = newLen;
	return out;
}
/** @internal */
function arraySpliceIn(mutate, at, v, arr) {
	const len = arr.length;
	if (mutate) {
		let i = len;
		while (i >= at) arr[i--] = arr[i];
		arr[at] = v;
		return arr;
	}
	let i = 0, g = 0;
	const out = new Array(len + 1);
	while (i < at) out[g++] = arr[i++];
	out[at] = v;
	while (i < len) out[++g] = arr[i++];
	return out;
}
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/hashMap/node.js
/** @internal */
var EmptyNode = class EmptyNode {
	_tag = "EmptyNode";
	modify(edit, _shift, f, hash, key, size) {
		const v = f(none$4());
		if (isNone(v)) return new EmptyNode();
		++size.value;
		return new LeafNode(edit, hash, key, v);
	}
};
/** @internal */
function isEmptyNode(a) {
	return isTagged(a, "EmptyNode");
}
/** @internal */
function isLeafNode(node) {
	return isEmptyNode(node) || node._tag === "LeafNode" || node._tag === "CollisionNode";
}
/** @internal */
function canEditNode(node, edit) {
	return isEmptyNode(node) ? false : edit === node.edit;
}
/** @internal */
var LeafNode = class LeafNode {
	edit;
	hash;
	key;
	value;
	_tag = "LeafNode";
	constructor(edit, hash, key, value) {
		this.edit = edit;
		this.hash = hash;
		this.key = key;
		this.value = value;
	}
	modify(edit, shift, f, hash, key, size) {
		if (equals$2(key, this.key)) {
			const v = f(this.value);
			if (v === this.value) return this;
			else if (isNone(v)) {
				--size.value;
				return new EmptyNode();
			}
			if (canEditNode(this, edit)) {
				this.value = v;
				return this;
			}
			return new LeafNode(edit, hash, key, v);
		}
		const v = f(none$4());
		if (isNone(v)) return this;
		++size.value;
		return mergeLeaves(edit, shift, this.hash, this, hash, new LeafNode(edit, hash, key, v));
	}
};
/** @internal */
var CollisionNode = class CollisionNode {
	edit;
	hash;
	children;
	_tag = "CollisionNode";
	constructor(edit, hash, children) {
		this.edit = edit;
		this.hash = hash;
		this.children = children;
	}
	modify(edit, shift, f, hash, key, size) {
		if (hash === this.hash) {
			const canEdit = canEditNode(this, edit);
			const list = this.updateCollisionList(canEdit, edit, this.hash, this.children, f, key, size);
			if (list === this.children) return this;
			return list.length > 1 ? new CollisionNode(edit, this.hash, list) : list[0];
		}
		const v = f(none$4());
		if (isNone(v)) return this;
		++size.value;
		return mergeLeaves(edit, shift, this.hash, this, hash, new LeafNode(edit, hash, key, v));
	}
	updateCollisionList(mutate, edit, hash, list, f, key, size) {
		const len = list.length;
		for (let i = 0; i < len; ++i) {
			const child = list[i];
			if ("key" in child && equals$2(key, child.key)) {
				const value = child.value;
				const newValue = f(value);
				if (newValue === value) return list;
				if (isNone(newValue)) {
					--size.value;
					return arraySpliceOut(mutate, i, list);
				}
				return arrayUpdate(mutate, i, new LeafNode(edit, hash, key, newValue), list);
			}
		}
		const newValue = f(none$4());
		if (isNone(newValue)) return list;
		++size.value;
		return arrayUpdate(mutate, len, new LeafNode(edit, hash, key, newValue), list);
	}
};
/** @internal */
var IndexedNode = class IndexedNode {
	edit;
	mask;
	children;
	_tag = "IndexedNode";
	constructor(edit, mask, children) {
		this.edit = edit;
		this.mask = mask;
		this.children = children;
	}
	modify(edit, shift, f, hash, key, size) {
		const mask = this.mask;
		const children = this.children;
		const frag = hashFragment(shift, hash);
		const bit = toBitmap(frag);
		const indx = fromBitmap(mask, bit);
		const exists = mask & bit;
		const canEdit = canEditNode(this, edit);
		if (!exists) {
			const _newChild = new EmptyNode().modify(edit, shift + 5, f, hash, key, size);
			if (!_newChild) return this;
			return children.length >= MAX_INDEX_NODE ? expand(edit, frag, _newChild, mask, children) : new IndexedNode(edit, mask | bit, arraySpliceIn(canEdit, indx, _newChild, children));
		}
		const current = children[indx];
		const child = current.modify(edit, shift + 5, f, hash, key, size);
		if (current === child) return this;
		let bitmap = mask;
		let newChildren;
		if (isEmptyNode(child)) {
			bitmap &= ~bit;
			if (!bitmap) return new EmptyNode();
			if (children.length <= 2 && isLeafNode(children[indx ^ 1])) return children[indx ^ 1];
			newChildren = arraySpliceOut(canEdit, indx, children);
		} else newChildren = arrayUpdate(canEdit, indx, child, children);
		if (canEdit) {
			this.mask = bitmap;
			this.children = newChildren;
			return this;
		}
		return new IndexedNode(edit, bitmap, newChildren);
	}
};
/** @internal */
var ArrayNode = class ArrayNode {
	edit;
	size;
	children;
	_tag = "ArrayNode";
	constructor(edit, size, children) {
		this.edit = edit;
		this.size = size;
		this.children = children;
	}
	modify(edit, shift, f, hash, key, size) {
		let count = this.size;
		const children = this.children;
		const frag = hashFragment(shift, hash);
		const child = children[frag];
		const newChild = (child || new EmptyNode()).modify(edit, shift + 5, f, hash, key, size);
		if (child === newChild) return this;
		const canEdit = canEditNode(this, edit);
		let newChildren;
		if (isEmptyNode(child) && !isEmptyNode(newChild)) {
			++count;
			newChildren = arrayUpdate(canEdit, frag, newChild, children);
		} else if (!isEmptyNode(child) && isEmptyNode(newChild)) {
			--count;
			if (count <= MIN_ARRAY_NODE) return pack(edit, count, frag, children);
			newChildren = arrayUpdate(canEdit, frag, new EmptyNode(), children);
		} else newChildren = arrayUpdate(canEdit, frag, newChild, children);
		if (canEdit) {
			this.size = count;
			this.children = newChildren;
			return this;
		}
		return new ArrayNode(edit, count, newChildren);
	}
};
function pack(edit, count, removed, elements) {
	const children = new Array(count - 1);
	let g = 0;
	let bitmap = 0;
	for (let i = 0, len = elements.length; i < len; ++i) if (i !== removed) {
		const elem = elements[i];
		if (elem && !isEmptyNode(elem)) {
			children[g++] = elem;
			bitmap |= 1 << i;
		}
	}
	return new IndexedNode(edit, bitmap, children);
}
function expand(edit, frag, child, bitmap, subNodes) {
	const arr = [];
	let bit = bitmap;
	let count = 0;
	for (let i = 0; bit; ++i) {
		if (bit & 1) arr[i] = subNodes[count++];
		bit >>>= 1;
	}
	arr[frag] = child;
	return new ArrayNode(edit, count + 1, arr);
}
function mergeLeavesInner(edit, shift, h1, n1, h2, n2) {
	if (h1 === h2) return new CollisionNode(edit, h1, [n2, n1]);
	const subH1 = hashFragment(shift, h1);
	const subH2 = hashFragment(shift, h2);
	if (subH1 === subH2) return (child) => new IndexedNode(edit, toBitmap(subH1) | toBitmap(subH2), [child]);
	else {
		const children = subH1 < subH2 ? [n1, n2] : [n2, n1];
		return new IndexedNode(edit, toBitmap(subH1) | toBitmap(subH2), children);
	}
}
function mergeLeaves(edit, shift, h1, n1, h2, n2) {
	let stack = void 0;
	let currentShift = shift;
	while (true) {
		const res = mergeLeavesInner(edit, currentShift, h1, n1, h2, n2);
		if (typeof res === "function") {
			stack = make$42(res, stack);
			currentShift = currentShift + 5;
		} else {
			let final = res;
			while (stack != null) {
				final = stack.value(final);
				stack = stack.previous;
			}
			return final;
		}
	}
}
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/hashMap.js
const HashMapSymbolKey = "effect/HashMap";
/** @internal */
const HashMapTypeId = /*#__PURE__*/ Symbol.for(HashMapSymbolKey);
const HashMapProto = {
	[HashMapTypeId]: HashMapTypeId,
	[Symbol.iterator]() {
		return new HashMapIterator(this, (k, v) => [k, v]);
	},
	[symbol$1]() {
		let hash$1 = hash(HashMapSymbolKey);
		for (const item of this) hash$1 ^= pipe(hash(item[0]), combine$7(hash(item[1])));
		return cached(this, hash$1);
	},
	[symbol](that) {
		if (isHashMap(that)) {
			if (that._size !== this._size) return false;
			for (const item of this) {
				const elem = pipe(that, getHash(item[0], hash(item[0])));
				if (isNone(elem)) return false;
				else if (!equals$2(item[1], elem.value)) return false;
			}
			return true;
		}
		return false;
	},
	toString() {
		return format$4(this.toJSON());
	},
	toJSON() {
		return {
			_id: "HashMap",
			values: Array.from(this).map(toJSON)
		};
	},
	[NodeInspectSymbol]() {
		return this.toJSON();
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
const makeImpl$1 = (editable, edit, root, size) => {
	const map = Object.create(HashMapProto);
	map._editable = editable;
	map._edit = edit;
	map._root = root;
	map._size = size;
	return map;
};
var HashMapIterator = class HashMapIterator {
	map;
	f;
	v;
	constructor(map, f) {
		this.map = map;
		this.f = f;
		this.v = visitLazy(this.map._root, this.f, void 0);
	}
	next() {
		if (isNone(this.v)) return {
			done: true,
			value: void 0
		};
		const v0 = this.v.value;
		this.v = applyCont(v0.cont);
		return {
			done: false,
			value: v0.value
		};
	}
	[Symbol.iterator]() {
		return new HashMapIterator(this.map, this.f);
	}
};
const applyCont = (cont) => cont ? visitLazyChildren(cont[0], cont[1], cont[2], cont[3], cont[4]) : none$4();
const visitLazy = (node, f, cont = void 0) => {
	switch (node._tag) {
		case "LeafNode":
			if (isSome(node.value)) return some({
				value: f(node.key, node.value.value),
				cont
			});
			return applyCont(cont);
		case "CollisionNode":
		case "ArrayNode":
		case "IndexedNode": {
			const children = node.children;
			return visitLazyChildren(children.length, children, 0, f, cont);
		}
		default: return applyCont(cont);
	}
};
const visitLazyChildren = (len, children, i, f, cont) => {
	while (i < len) {
		const child = children[i++];
		if (child && !isEmptyNode(child)) return visitLazy(child, f, [
			len,
			children,
			i,
			f,
			cont
		]);
	}
	return applyCont(cont);
};
const _empty$4 = /*#__PURE__*/ makeImpl$1(false, 0, /*#__PURE__*/ new EmptyNode(), 0);
/** @internal */
const empty$21 = () => _empty$4;
/** @internal */
const fromIterable$4 = (entries) => {
	const map = beginMutation$1(empty$21());
	for (const entry of entries) set$5(map, entry[0], entry[1]);
	return endMutation$1(map);
};
/** @internal */
const isHashMap = (u) => hasProperty(u, HashMapTypeId);
/** @internal */
const isEmpty$6 = (self) => self && isEmptyNode(self._root);
/** @internal */
const get$8 = /*#__PURE__*/ dual(2, (self, key) => getHash(self, key, hash(key)));
/** @internal */
const getHash = /*#__PURE__*/ dual(3, (self, key, hash) => {
	let node = self._root;
	let shift = 0;
	while (true) switch (node._tag) {
		case "LeafNode": return equals$2(key, node.key) ? node.value : none$4();
		case "CollisionNode":
			if (hash === node.hash) {
				const children = node.children;
				for (let i = 0, len = children.length; i < len; ++i) {
					const child = children[i];
					if ("key" in child && equals$2(key, child.key)) return child.value;
				}
			}
			return none$4();
		case "IndexedNode": {
			const bit = toBitmap(hashFragment(shift, hash));
			if (node.mask & bit) {
				node = node.children[fromBitmap(node.mask, bit)];
				shift += 5;
				break;
			}
			return none$4();
		}
		case "ArrayNode":
			node = node.children[hashFragment(shift, hash)];
			if (node) {
				shift += 5;
				break;
			}
			return none$4();
		default: return none$4();
	}
});
/** @internal */
const has$3 = /*#__PURE__*/ dual(2, (self, key) => isSome(getHash(self, key, hash(key))));
/** @internal */
const set$5 = /*#__PURE__*/ dual(3, (self, key, value) => modifyAt$1(self, key, () => some(value)));
/** @internal */
const setTree = /*#__PURE__*/ dual(3, (self, newRoot, newSize) => {
	if (self._editable) {
		self._root = newRoot;
		self._size = newSize;
		return self;
	}
	return newRoot === self._root ? self : makeImpl$1(self._editable, self._edit, newRoot, newSize);
});
/** @internal */
const keys$1 = (self) => new HashMapIterator(self, (key) => key);
/** @internal */
const size$7 = (self) => self._size;
/** @internal */
const beginMutation$1 = (self) => makeImpl$1(true, self._edit + 1, self._root, self._size);
/** @internal */
const endMutation$1 = (self) => {
	self._editable = false;
	return self;
};
/** @internal */
const modifyAt$1 = /*#__PURE__*/ dual(3, (self, key, f) => modifyHash(self, key, hash(key), f));
/** @internal */
const modifyHash = /*#__PURE__*/ dual(4, (self, key, hash, f) => {
	const size = { value: self._size };
	const newRoot = self._root.modify(self._editable ? self._edit : NaN, 0, f, hash, key, size);
	return pipe(self, setTree(newRoot, size.value));
});
/** @internal */
const union$3 = /*#__PURE__*/ dual(2, (self, that) => {
	const result = beginMutation$1(self);
	forEach$5(that, (v, k) => set$5(result, k, v));
	return endMutation$1(result);
});
/** @internal */
const remove$4 = /*#__PURE__*/ dual(2, (self, key) => modifyAt$1(self, key, none$4));
/**
* Maps over the entries of the `HashMap` using the specified function.
*
* @since 2.0.0
* @category mapping
*/
const map$9 = /*#__PURE__*/ dual(2, (self, f) => reduce$7(self, empty$21(), (map, value, key) => set$5(map, key, f(value, key))));
/** @internal */
const forEach$5 = /*#__PURE__*/ dual(2, (self, f) => reduce$7(self, void 0, (_, value, key) => f(value, key)));
/** @internal */
const reduce$7 = /*#__PURE__*/ dual(3, (self, zero, f) => {
	const root = self._root;
	if (root._tag === "LeafNode") return isSome(root.value) ? f(zero, root.value.value, root.key) : zero;
	if (root._tag === "EmptyNode") return zero;
	const toVisit = [root.children];
	let children;
	while (children = toVisit.pop()) for (let i = 0, len = children.length; i < len;) {
		const child = children[i++];
		if (child && !isEmptyNode(child)) {
			if (child._tag === "LeafNode") {
				if (isSome(child.value)) zero = f(zero, child.value.value, child.key);
			} else toVisit.push(child.children);
		}
	}
	return zero;
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/hashSet.js
const HashSetSymbolKey = "effect/HashSet";
/** @internal */
const HashSetTypeId = /*#__PURE__*/ Symbol.for(HashSetSymbolKey);
const HashSetProto = {
	[HashSetTypeId]: HashSetTypeId,
	[Symbol.iterator]() {
		return keys$1(this._keyMap);
	},
	[symbol$1]() {
		return cached(this, combine$7(hash(this._keyMap))(hash(HashSetSymbolKey)));
	},
	[symbol](that) {
		if (isHashSet(that)) return size$7(this._keyMap) === size$7(that._keyMap) && equals$2(this._keyMap, that._keyMap);
		return false;
	},
	toString() {
		return format$4(this.toJSON());
	},
	toJSON() {
		return {
			_id: "HashSet",
			values: Array.from(this).map(toJSON)
		};
	},
	[NodeInspectSymbol]() {
		return this.toJSON();
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const makeImpl = (keyMap) => {
	const set = Object.create(HashSetProto);
	set._keyMap = keyMap;
	return set;
};
/** @internal */
const isHashSet = (u) => hasProperty(u, HashSetTypeId);
const _empty$3 = /*#__PURE__*/ makeImpl(/*#__PURE__*/ empty$21());
/** @internal */
const empty$20 = () => _empty$3;
/** @internal */
const fromIterable$3 = (elements) => {
	const set = beginMutation(empty$20());
	for (const value of elements) add$1(set, value);
	return endMutation(set);
};
/** @internal */
const make$41 = (...elements) => {
	const set = beginMutation(empty$20());
	for (const value of elements) add$1(set, value);
	return endMutation(set);
};
/** @internal */
const has$2 = /*#__PURE__*/ dual(2, (self, value) => has$3(self._keyMap, value));
/** @internal */
const size$6 = (self) => size$7(self._keyMap);
/** @internal */
const beginMutation = (self) => makeImpl(beginMutation$1(self._keyMap));
/** @internal */
const endMutation = (self) => {
	self._keyMap._editable = false;
	return self;
};
/** @internal */
const mutate = /*#__PURE__*/ dual(2, (self, f) => {
	const transient = beginMutation(self);
	f(transient);
	return endMutation(transient);
});
/** @internal */
const add$1 = /*#__PURE__*/ dual(2, (self, value) => self._keyMap._editable ? (set$5(value, true)(self._keyMap), self) : makeImpl(set$5(value, true)(self._keyMap)));
/** @internal */
const remove$3 = /*#__PURE__*/ dual(2, (self, value) => self._keyMap._editable ? (remove$4(value)(self._keyMap), self) : makeImpl(remove$4(value)(self._keyMap)));
/** @internal */
const difference$1 = /*#__PURE__*/ dual(2, (self, that) => mutate(self, (set) => {
	for (const value of that) remove$3(set, value);
}));
/** @internal */
const union$2 = /*#__PURE__*/ dual(2, (self, that) => mutate(empty$20(), (set) => {
	forEach$4(self, (value) => add$1(set, value));
	for (const value of that) add$1(set, value);
}));
/** @internal */
const forEach$4 = /*#__PURE__*/ dual(2, (self, f) => forEach$5(self._keyMap, (_, k) => f(k)));
/** @internal */
const reduce$6 = /*#__PURE__*/ dual(3, (self, zero, f) => reduce$7(self._keyMap, zero, (z, _, a) => f(z, a)));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/HashSet.js
/**
* # HashSet
*
* An immutable `HashSet` provides a collection of unique values with efficient
* lookup, insertion and removal. Once created, a `HashSet` cannot be modified;
* any operation that would alter the set instead returns a new `HashSet` with
* the changes. This immutability offers benefits like predictable state
* management and easier reasoning about your code.
*
* ## What Problem Does It Solve?
*
* `HashSet` solves the problem of maintaining an unsorted collection where each
* value appears exactly once, with fast operations for checking membership and
* adding/removing values.
*
* ## When to Use
*
* Use `HashSet` when you need:
*
* - A collection with no duplicate values
* - Efficient membership testing (**`O(1)`** average complexity)
* - Set operations like union, intersection, and difference
* - An immutable data structure that preserves functional programming patterns
*
* ## Advanced Features
*
* HashSet provides operations for:
*
* - Transforming sets with map and flatMap
* - Filtering elements with filter
* - Combining sets with union, intersection and difference
* - Performance optimizations via mutable operations in controlled contexts
*
* ## Performance Characteristics
*
* - **Lookup** operations ({@link module:HashSet.has}): **`O(1)`** average time
*   complexity
* - **Insertion** operations ({@link module:HashSet.add}): **`O(1)`** average time
*   complexity
* - **Removal** operations ({@link module:HashSet.remove}): **`O(1)`** average
*   time complexity
* - **Set** operations ({@link module:HashSet.union},
*   {@link module:HashSet.intersection}): **`O(n)`** where n is the size of the
*   smaller set
* - **Iteration**: **`O(n)`** where n is the size of the set
*
* The HashSet data structure implements the following traits:
*
* - {@link Iterable}: allows iterating over the values in the set
* - {@link Equal}: allows comparing two sets for value-based equality
* - {@link Pipeable}: allows chaining operations with the pipe operator
* - {@link Inspectable}: allows inspecting the contents of the set
*
* ## Operations Reference
*
* | Category     | Operation                           | Description                                 | Complexity |
* | ------------ | ----------------------------------- | ------------------------------------------- | ---------- |
* | constructors | {@link module:HashSet.empty}        | Creates an empty HashSet                    | O(1)       |
* | constructors | {@link module:HashSet.fromIterable} | Creates a HashSet from an iterable          | O(n)       |
* | constructors | {@link module:HashSet.make}         | Creates a HashSet from multiple values      | O(n)       |
* |              |                                     |                                             |            |
* | elements     | {@link module:HashSet.has}          | Checks if a value exists in the set         | O(1) avg   |
* | elements     | {@link module:HashSet.some}         | Checks if any element satisfies a predicate | O(n)       |
* | elements     | {@link module:HashSet.every}        | Checks if all elements satisfy a predicate  | O(n)       |
* | elements     | {@link module:HashSet.isSubset}     | Checks if a set is a subset of another      | O(n)       |
* |              |                                     |                                             |            |
* | getters      | {@link module:HashSet.values}       | Gets an iterator of all values              | O(1)       |
* | getters      | {@link module:HashSet.toValues}     | Gets an array of all values                 | O(n)       |
* | getters      | {@link module:HashSet.size}         | Gets the number of elements                 | O(1)       |
* |              |                                     |                                             |            |
* | mutations    | {@link module:HashSet.add}          | Adds a value to the set                     | O(1) avg   |
* | mutations    | {@link module:HashSet.remove}       | Removes a value from the set                | O(1) avg   |
* | mutations    | {@link module:HashSet.toggle}       | Toggles a value's presence                  | O(1) avg   |
* |              |                                     |                                             |            |
* | operations   | {@link module:HashSet.difference}   | Computes set difference (A - B)             | O(n)       |
* | operations   | {@link module:HashSet.intersection} | Computes set intersection (A ∩ B)           | O(n)       |
* | operations   | {@link module:HashSet.union}        | Computes set union (A ∪ B)                  | O(n)       |
* |              |                                     |                                             |            |
* | mapping      | {@link module:HashSet.map}          | Transforms each element                     | O(n)       |
* |              |                                     |                                             |            |
* | sequencing   | {@link module:HashSet.flatMap}      | Transforms and flattens elements            | O(n)       |
* |              |                                     |                                             |            |
* | traversing   | {@link module:HashSet.forEach}      | Applies a function to each element          | O(n)       |
* |              |                                     |                                             |            |
* | folding      | {@link module:HashSet.reduce}       | Reduces the set to a single value           | O(n)       |
* |              |                                     |                                             |            |
* | filtering    | {@link module:HashSet.filter}       | Keeps elements that satisfy a predicate     | O(n)       |
* |              |                                     |                                             |            |
* | partitioning | {@link module:HashSet.partition}    | Splits into two sets by a predicate         | O(n)       |
*
* ## Notes
*
* ### Composability with the Effect Ecosystem:
*
* This `HashSet` is designed to work seamlessly within the Effect ecosystem. It
* implements the {@link Iterable}, {@link Equal}, {@link Pipeable}, and
* {@link Inspectable} traits from Effect. This ensures compatibility with other
* Effect data structures and functionalities. For example, you can easily use
* Effect's `pipe` method to chain operations on the `HashSet`.
*
* **Equality of Elements with Effect's {@link Equal `Equal`} Trait:**
*
* This `HashSet` relies on Effect's {@link Equal} trait to determine the
* uniqueness of elements within the set. The way equality is checked depends on
* the type of the elements:
*
* - **Primitive Values:** For primitive JavaScript values like strings, numbers,
*   booleans, `null`, and `undefined`, equality is determined by their value
*   (similar to the `===` operator).
* - **Objects and Custom Types:** For objects and other custom types, equality is
*   determined by whether those types implement the {@link Equal} interface
*   themselves. If an element type implements `Equal`, the `HashSet` will
*   delegate to that implementation to perform the equality check. This allows
*   you to define custom logic for determining when two instances of your
*   objects should be considered equal based on their properties, rather than
*   just their object identity.
*
* ```ts
* import { Equal, Hash, HashSet } from "effect"
*
* class Person implements Equal.Equal {
*   constructor(
*     readonly id: number, // Unique identifier
*     readonly name: string,
*     readonly age: number
*   ) {}
*
*   // Define equality based on id, name, and age
*   [Equal.symbol](that: Equal.Equal): boolean {
*     if (that instanceof Person) {
*       return (
*         Equal.equals(this.id, that.id) &&
*         Equal.equals(this.name, that.name) &&
*         Equal.equals(this.age, that.age)
*       )
*     }
*     return false
*   }
*
*   // Generate a hash code based on the unique id
*   [Hash.symbol](): number {
*     return Hash.hash(this.id)
*   }
* }
*
* // Creating a HashSet with objects that implement the Equal interface
* const set = HashSet.empty().pipe(
*   HashSet.add(new Person(1, "Alice", 30)),
*   HashSet.add(new Person(1, "Alice", 30))
* )
*
* // HashSet recognizes them as equal, so only one element is stored
* console.log(HashSet.size(set))
* // Output: 1
* ```
*
* **Simplifying Equality and Hashing with `Data` and `Schema`:**
*
* Effect's {@link Data} and {@link Schema `Schema.Data`} modules offer powerful
* ways to automatically handle the implementation of both the {@link Equal} and
* {@link Hash} traits for your custom data structures.
*
* - **`Data` Module:** By using constructors like `Data.struct`, `Data.tuple`,
*   `Data.array`, or `Data.case` to define your data types, Effect
*   automatically generates the necessary implementations for value-based
*   equality and consistent hashing. This significantly reduces boilerplate and
*   ensures correctness.
*
* ```ts
* import { HashSet, Data, Equal } from "effect"
* import assert from "node:assert/strict"
*
* // Data.* implements the `Equal` traits for us
* const person1 = Data.struct({ id: 1, name: "Alice", age: 30 })
* const person2 = Data.struct({ id: 1, name: "Alice", age: 30 })
*
* assert(Equal.equals(person1, person2))
*
* const set = HashSet.empty().pipe(
*   HashSet.add(person1),
*   HashSet.add(person2)
* )
*
* // HashSet recognizes them as equal, so only one element is stored
* console.log(HashSet.size(set)) // Output: 1
* ```
*
* - **`Schema` Module:** When defining data schemas using the {@link Schema}
*   module, you can use `Schema.Data` to automatically include the `Equal` and
*   `Hash` traits in the decoded objects. This is particularly important when
*   working with `HashSet`. **For decoded objects to be correctly recognized as
*   equal within a `HashSet`, ensure that the schema for those objects is
*   defined using `Schema.Data`.**
*
* ```ts
* import { Equal, HashSet, Schema } from "effect"
* import assert from "node:assert/strict"
*
* // Schema.Data implements the `Equal` traits for us
* const PersonSchema = Schema.Data(
*   Schema.Struct({
*     id: Schema.Number,
*     name: Schema.String,
*     age: Schema.Number
*   })
* )
*
* const Person = Schema.decode(PersonSchema)
*
* const person1 = Person({ id: 1, name: "Alice", age: 30 })
* const person2 = Person({ id: 1, name: "Alice", age: 30 })
*
* assert(Equal.equals(person1, person2)) // Output: true
*
* const set = HashSet.empty().pipe(
*   HashSet.add(person1),
*   HashSet.add(person2)
* )
*
* // HashSet thanks to Schema.Data implementation of the `Equal` trait, recognizes the two Person as equal, so only one element is stored
* console.log(HashSet.size(set)) // Output: 1
* ```
*
* ### Interoperability with the JavaScript Runtime:
*
* To interoperate with the regular JavaScript runtime, Effect's `HashSet`
* provides methods to access its elements in formats readily usable by
* JavaScript APIs: {@link values `HashSet.values`},
* {@link toValues `HashSet.toValues`}
*
* ```ts
* import { HashSet } from "effect"
*
* const hashSet: HashSet.HashSet<number> = HashSet.make(1, 2, 3)
*
* // Using HashSet.values to convert HashSet.HashSet<A> to IterableIterator<A>
* const iterable: IterableIterator<number> = HashSet.values(hashSet)
*
* console.log(...iterable) // Logs:  1 2 3
*
* // Using HashSet.toValues to convert HashSet.HashSet<A> to Array<A>
* const array: Array<number> = HashSet.toValues(hashSet)
*
* console.log(array) // Logs: [ 1, 2, 3 ]
* ```
*
* Be mindful of performance implications (both time and space complexity) when
* frequently converting between Effect's immutable HashSet and mutable
* JavaScript data structures, especially for large collections.
*
* @module HashSet
* @since 2.0.0
*/
/**
* Creates an empty `HashSet`.
*
* Time complexity: **`O(1)`**
*
* @memberof HashSet
* @since 2.0.0
* @category constructors
* @example
*
* ```ts
* import { HashSet, pipe } from "effect"
*
* console.log(
*   pipe(
*     // Provide a type argument to create a HashSet of a specific type
*     HashSet.empty<number>(),
*     HashSet.add(1),
*     HashSet.add(1), // Notice the duplicate
*     HashSet.add(2),
*     HashSet.toValues
*   )
* ) // Output: [1, 2]
* ```
*
* @see Other `HashSet` constructors are {@link module:HashSet.make} {@link module:HashSet.fromIterable}
*/
const empty$19 = empty$20;
/**
* Creates a new `HashSet` from an iterable collection of values.
*
* Time complexity: **`O(n)`** where n is the number of elements in the iterable
*
* @memberof HashSet
* @since 2.0.0
* @category constructors
* @example
*
* ```ts
* // Creating a HashSet from an Array
* import { HashSet, pipe } from "effect"
*
* console.log(
*   pipe(
*     [1, 2, 3, 4, 5, 1, 2, 3], // Array<number> is an Iterable<number>;  Note the duplicates.
*     HashSet.fromIterable,
*     HashSet.toValues
*   )
* ) // Output: [1, 2, 3, 4, 5]
* ```
*
* @example
*
* ```ts
* // Creating a HashSet from a Set
* import { HashSet, pipe } from "effect"
*
* console.log(
*   pipe(
*     new Set(["apple", "banana", "orange", "apple"]), // Set<string> is an Iterable<string>
*     HashSet.fromIterable,
*     HashSet.toValues
*   )
* ) // Output: ["apple", "banana", "orange"]
* ```
*
* @example
*
* ```ts
* // Creating a HashSet from a Generator
* import { HashSet } from "effect"
*
* // Generator functions return iterables
* function* fibonacci(n: number): Generator<number, void, unknown> {
*   let [a, b] = [0, 1]
*   for (let i = 0; i < n; i++) {
*     yield a
*     ;[a, b] = [b, a + b]
*   }
* }
*
* // Create a HashSet from the first 10 Fibonacci numbers
* const fibonacciSet = HashSet.fromIterable(fibonacci(10))
*
* console.log(HashSet.toValues(fibonacciSet))
* // Outputs: [0, 1, 2, 3, 5, 8, 13, 21, 34] but in unsorted order
* ```
*
* @example
*
* ```ts
* //  Creating a HashSet from another HashSet
* import { HashSet, pipe } from "effect"
*
* console.log(
*   pipe(
*     // since HashSet implements the Iterable interface, we can use it to create a new HashSet
*     HashSet.make(1, 2, 3, 4),
*     HashSet.fromIterable,
*     HashSet.toValues // turns the HashSet back into an array
*   )
* ) // Output: [1, 2, 3, 4]
* ```
*
* @example
*
* ```ts
* // Creating a HashSet from other Effect's data structures like Chunk
* import { Chunk, HashSet, pipe } from "effect"
*
* console.log(
*   pipe(
*     Chunk.make(1, 2, 3, 4), // Iterable<number>
*     HashSet.fromIterable,
*     HashSet.toValues // turns the HashSet back into an array
*   )
* ) // Outputs: [1, 2, 3, 4]
* ```
*
* @see Other `HashSet` constructors are {@link module:HashSet.empty} {@link module:HashSet.make}
*/
const fromIterable$2 = fromIterable$3;
/**
* Construct a new `HashSet` from a variable number of values.
*
* Time complexity: **`O(n)`** where n is the number of elements
*
* @memberof HashSet
* @since 2.0.0
* @category constructors
* @example
*
* ```ts
* import { Equal, Hash, HashSet, pipe } from "effect"
* import assert from "node:assert/strict"
*
* class Character implements Equal.Equal {
*   readonly name: string
*   readonly trait: string
*
*   constructor(name: string, trait: string) {
*     this.name = name
*     this.trait = trait
*   }
*
*   // Define equality based on name, and trait
*   [Equal.symbol](that: Equal.Equal): boolean {
*     if (that instanceof Character) {
*       return (
*         Equal.equals(this.name, that.name) &&
*         Equal.equals(this.trait, that.trait)
*       )
*     }
*     return false
*   }
*
*   // Generate a hash code based on the sum of the character's name and trait
*   [Hash.symbol](): number {
*     return Hash.hash(this.name + this.trait)
*   }
*
*   static readonly of = (name: string, trait: string): Character => {
*     return new Character(name, trait)
*   }
* }
*
* assert.strictEqual(
*   Equal.equals(
*     HashSet.make(
*       Character.of("Alice", "Curious"),
*       Character.of("Alice", "Curious"),
*       Character.of("White Rabbit", "Always late"),
*       Character.of("Mad Hatter", "Tea enthusiast")
*     ),
*     // Is the same as adding each character to an empty set
*     pipe(
*       HashSet.empty(),
*       HashSet.add(Character.of("Alice", "Curious")),
*       HashSet.add(Character.of("Alice", "Curious")), // Alice tried to attend twice!
*       HashSet.add(Character.of("White Rabbit", "Always late")),
*       HashSet.add(Character.of("Mad Hatter", "Tea enthusiast"))
*     )
*   ),
*   true,
*   "`HashSet.make` and `HashSet.empty() + HashSet.add()` should be equal"
* )
*
* assert.strictEqual(
*   Equal.equals(
*     HashSet.make(
*       Character.of("Alice", "Curious"),
*       Character.of("Alice", "Curious"),
*       Character.of("White Rabbit", "Always late"),
*       Character.of("Mad Hatter", "Tea enthusiast")
*     ),
*     HashSet.fromIterable([
*       Character.of("Alice", "Curious"),
*       Character.of("Alice", "Curious"),
*       Character.of("White Rabbit", "Always late"),
*       Character.of("Mad Hatter", "Tea enthusiast")
*     ])
*   ),
*   true,
*   "`HashSet.make` and `HashSet.fromIterable` should be equal"
* )
* ```
*
* @see Other `HashSet` constructors are {@link module:HashSet.fromIterable} {@link module:HashSet.empty}
*/
const make$40 = make$41;
/**
* Checks if the specified value exists in the `HashSet`.
*
* Time complexity: **`O(1)`** average
*
* @memberof HashSet
* @since 2.0.0
* @category elements
* @example
*
* ```ts
* // Syntax
* import { HashSet, pipe } from "effect"
*
* // with `data-last`, a.k.a. `pipeable` API
* pipe(HashSet.make(0, 1, 2), HashSet.has(3)) // false
*
* // or piped with the pipe function
* HashSet.make(0, 1, 2).pipe(HashSet.has(3)) // false
*
* // or with `data-first` API
* HashSet.has(HashSet.make(0, 1, 2), 3) // false
* ```
*
* @returns A `boolean` signaling the presence of the value in the HashSet
* @see Other `HashSet` elements are {@link module:HashSet.some} {@link module:HashSet.every} {@link module:HashSet.isSubset}
*/
const has$1 = has$2;
/**
* Calculates the number of values in the `HashSet`.
*
* Time complexity: **`O(1)`**
*
* @memberof HashSet
* @since 2.0.0
* @category getters
* @example
*
* ```ts
* import { HashSet, pipe } from "effect"
* import assert from "node:assert/strict"
*
* assert.deepStrictEqual(pipe(HashSet.empty(), HashSet.size), 0)
*
* assert.deepStrictEqual(
*   pipe(HashSet.make(1, 2, 2, 3, 4, 3), HashSet.size),
*   4
* )
* ```
*
* @see Other `HashSet` getters are {@link module:HashSet.values} {@link module:HashSet.toValues}
*/
const size$5 = size$6;
/**
* Adds a value to the `HashSet`.
*
* Time complexity: **`O(1)`** average
*
* @remarks
* Remember that a `HashSet` is a collection of unique values, so adding a value
* that already exists in the `HashSet` will not add a duplicate.
*
* Remember that HashSet is an immutable data structure, so the `add` function,
* like all other functions that modify the HashSet, will return a new HashSet
* with the added value.
* @memberof HashSet
* @since 2.0.0
* @example
*
* ```ts
* // Syntax
* import { HashSet, pipe } from "effect"
*
* // with data-last, a.k.a. pipeable API
* pipe(HashSet.empty(), HashSet.add(0), HashSet.add(0))
*
* // or piped with the pipe function
* HashSet.empty().pipe(HashSet.add(0))
*
* // or with data-first API
* HashSet.add(HashSet.empty(), 0)
* ```
*
* @see Other `HashSet` mutations are {@link module:HashSet.remove} {@link module:HashSet.toggle} {@link module:HashSet.beginMutation} {@link module:HashSet.endMutation} {@link module:HashSet.mutate}
*/
const add = add$1;
/**
* Removes a value from the `HashSet`.
*
* Time complexity: **`O(1)`** average
*
* @memberof HashSet
* @since 2.0.0
* @example
*
* ```ts
* // Syntax
* import { HashSet, pipe } from "effect"
*
* // with `data-last`, a.k.a. `pipeable` API
* pipe(HashSet.make(0, 1, 2), HashSet.remove(0))
*
* // or piped with the pipe function
* HashSet.make(0, 1, 2).pipe(HashSet.remove(0))
*
* // or with `data-first` API
* HashSet.remove(HashSet.make(0, 1, 2), 0)
* ```
*
* @see Other `HashSet` mutations are {@link module:HashSet.add} {@link module:HashSet.toggle} {@link module:HashSet.beginMutation} {@link module:HashSet.endMutation} {@link module:HashSet.mutate}
*/
const remove$2 = remove$3;
/**
* Computes the set difference `(A - B)` between this `HashSet` and the
* specified `Iterable<A>`.
*
* Time complexity: **`O(n)`** where n is the number of elements in the set
*
* **NOTE**: the hash and equal of the values in both the set and the iterable
* must be the same; meaning we cannot compute a difference between a `HashSet
* of bananas` and a `HashSet of elephants` as they are not the same type and
* won't implement the Equal trait in the same way.
*
* @memberof HashSet
* @since 2.0.0
* @example
*
* ```ts
* // Syntax
* import { HashSet, pipe } from "effect"
*
* // with data-last, a.k.a. pipeable API
* pipe(HashSet.make(1, 2, 3), HashSet.difference(HashSet.make(3, 4, 5)))
*
* // or piped with the pipe function
* HashSet.make(1, 2, 3).pipe(HashSet.difference(HashSet.make(3, 4, 5)))
*
* // or with data-first API
* HashSet.difference(HashSet.make(1, 2, 3), HashSet.make(3, 4, 5))
* ```
*
* @see Other `HashSet` operations are {@link module:HashSet.intersection} {@link module:HashSet.union}
*/
const difference = difference$1;
/**
* Computes the set union `( self ∪ that )` between this `HashSet` and the
* specified `Iterable<A>`.
*
* Time complexity: **`O(n)`** where n is the number of elements in the set
*
* **NOTE**: the hash and equal of the values in both the set and the iterable
* must be the same.
*
* @memberof HashSet
* @since 2.0.0
* @example
*
* ```ts
* // Syntax
* import { HashSet, pipe } from "effect"
*
* // with data-last, a.k.a. pipeable API
* pipe(HashSet.make(1, 2, 3), HashSet.union(HashSet.make(3, 4, 5)))
*
* // or piped with the pipe function
* HashSet.make(1, 2, 3).pipe(HashSet.union(HashSet.make(3, 4, 5)))
*
* // or with data-first API
* HashSet.union(HashSet.make(1, 2, 3), HashSet.make(3, 4, 5))
* ```
*
* @see Other `HashSet` operations are {@link module:HashSet.difference} {@link module:HashSet.intersection}
*/
const union$1 = union$2;
/**
* Reduces the specified state over the values of the `HashSet`.
*
* The time complexity is of **`O(n)`**.
*
* @memberof HashSet
* @since 2.0.0
* @category folding
* @example
*
* ```ts
* // Syntax
* import { HashSet, pipe } from "effect"
*
* const sum = (a: number, b: number): number => a + b
*
* // with `data-last`, a.k.a. `pipeable` API
* pipe(HashSet.make(0, 1, 2), HashSet.reduce(0, sum))
*
* // or with the pipe method
* HashSet.make(0, 1, 2).pipe(HashSet.reduce(0, sum))
*
* // or with `data-first` API
* HashSet.reduce(HashSet.make(0, 1, 2), 0, sum)
* ```
*/
const reduce$5 = reduce$6;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/MutableRef.js
/**
* @since 2.0.0
*/
const TypeId$20 = /*#__PURE__*/ Symbol.for("effect/MutableRef");
const MutableRefProto = {
	[TypeId$20]: TypeId$20,
	toString() {
		return format$4(this.toJSON());
	},
	toJSON() {
		return {
			_id: "MutableRef",
			current: toJSON(this.current)
		};
	},
	[NodeInspectSymbol]() {
		return this.toJSON();
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/**
* @since 2.0.0
* @category constructors
*/
const make$39 = (value) => {
	const ref = Object.create(MutableRefProto);
	ref.current = value;
	return ref;
};
/**
* @since 2.0.0
* @category general
*/
const compareAndSet = /*#__PURE__*/ dual(3, (self, oldValue, newValue) => {
	if (equals$2(oldValue, self.current)) {
		self.current = newValue;
		return true;
	}
	return false;
});
/**
* @since 2.0.0
* @category general
*/
const get$7 = (self) => self.current;
/**
* @since 2.0.0
* @category general
*/
const set$4 = /*#__PURE__*/ dual(2, (self, value) => {
	self.current = value;
	return self;
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/fiberId.js
/** @internal */
const FiberIdSymbolKey = "effect/FiberId";
/** @internal */
const FiberIdTypeId = /*#__PURE__*/ Symbol.for(FiberIdSymbolKey);
/** @internal */
const OP_NONE = "None";
/** @internal */
const OP_RUNTIME = "Runtime";
/** @internal */
const OP_COMPOSITE = "Composite";
const emptyHash = /*#__PURE__*/ string(`${FiberIdSymbolKey}-${OP_NONE}`);
/** @internal */
var None$2 = class {
	[FiberIdTypeId] = FiberIdTypeId;
	_tag = OP_NONE;
	id = -1;
	startTimeMillis = -1;
	[symbol$1]() {
		return emptyHash;
	}
	[symbol](that) {
		return isFiberId$1(that) && that._tag === OP_NONE;
	}
	toString() {
		return format$4(this.toJSON());
	}
	toJSON() {
		return {
			_id: "FiberId",
			_tag: this._tag
		};
	}
	[NodeInspectSymbol]() {
		return this.toJSON();
	}
};
/** @internal */
var Runtime = class {
	id;
	startTimeMillis;
	[FiberIdTypeId] = FiberIdTypeId;
	_tag = OP_RUNTIME;
	constructor(id, startTimeMillis) {
		this.id = id;
		this.startTimeMillis = startTimeMillis;
	}
	[symbol$1]() {
		return cached(this, string(`${FiberIdSymbolKey}-${this._tag}-${this.id}-${this.startTimeMillis}`));
	}
	[symbol](that) {
		return isFiberId$1(that) && that._tag === OP_RUNTIME && this.id === that.id && this.startTimeMillis === that.startTimeMillis;
	}
	toString() {
		return format$4(this.toJSON());
	}
	toJSON() {
		return {
			_id: "FiberId",
			_tag: this._tag,
			id: this.id,
			startTimeMillis: this.startTimeMillis
		};
	}
	[NodeInspectSymbol]() {
		return this.toJSON();
	}
};
/** @internal */
var Composite$1 = class {
	left;
	right;
	[FiberIdTypeId] = FiberIdTypeId;
	_tag = OP_COMPOSITE;
	constructor(left, right) {
		this.left = left;
		this.right = right;
	}
	_hash;
	[symbol$1]() {
		return pipe(string(`${FiberIdSymbolKey}-${this._tag}`), combine$7(hash(this.left)), combine$7(hash(this.right)), cached(this));
	}
	[symbol](that) {
		return isFiberId$1(that) && that._tag === OP_COMPOSITE && equals$2(this.left, that.left) && equals$2(this.right, that.right);
	}
	toString() {
		return format$4(this.toJSON());
	}
	toJSON() {
		return {
			_id: "FiberId",
			_tag: this._tag,
			left: toJSON(this.left),
			right: toJSON(this.right)
		};
	}
	[NodeInspectSymbol]() {
		return this.toJSON();
	}
};
/** @internal */
const none$3 = /*#__PURE__*/ new None$2();
/** @internal */
const runtime$3 = (id, startTimeMillis) => {
	return new Runtime(id, startTimeMillis);
};
/** @internal */
const composite$1 = (left, right) => {
	return new Composite$1(left, right);
};
/** @internal */
const isFiberId$1 = (self) => hasProperty(self, FiberIdTypeId);
/** @internal */
const combine$6 = /*#__PURE__*/ dual(2, (self, that) => {
	if (self._tag === OP_NONE) return that;
	if (that._tag === OP_NONE) return self;
	return new Composite$1(self, that);
});
/** @internal */
const combineAll$1 = (fiberIds) => {
	return pipe(fiberIds, reduce$5(none$3, (a, b) => combine$6(b)(a)));
};
/** @internal */
const ids$1 = (self) => {
	switch (self._tag) {
		case OP_NONE: return empty$19();
		case OP_RUNTIME: return make$40(self.id);
		case OP_COMPOSITE: return pipe(ids$1(self.left), union$1(ids$1(self.right)));
	}
};
const _fiberCounter = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/Fiber/Id/_fiberCounter"), () => make$39(0));
/** @internal */
const make$38 = (id, startTimeSeconds) => {
	return new Runtime(id, startTimeSeconds);
};
/** @internal */
const threadName$1 = (self) => {
	return Array.from(ids$1(self)).map((n) => `#${n}`).join(",");
};
/** @internal */
const unsafeMake$9 = () => {
	const id = get$7(_fiberCounter);
	pipe(_fiberCounter, set$4(id + 1));
	return new Runtime(id, Date.now());
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/FiberId.js
/**
* @since 2.0.0
* @category constructors
*/
const none$2 = none$3;
/**
* @since 2.0.0
* @category constructors
*/
const runtime$2 = runtime$3;
/**
* @since 2.0.0
* @category constructors
*/
const composite = composite$1;
/**
* Returns `true` if the specified unknown value is a `FiberId`, `false`
* otherwise.
*
* @since 2.0.0
* @category refinements
*/
const isFiberId = isFiberId$1;
/**
* Combine two `FiberId`s.
*
* @since 2.0.0
* @category constructors
*/
const combine$5 = combine$6;
/**
* Combines a set of `FiberId`s into a single `FiberId`.
*
* @since 2.0.0
* @category constructors
*/
const combineAll = combineAll$1;
/**
* Get the set of identifiers for this `FiberId`.
*
* @since 2.0.0
* @category destructors
*/
const ids = ids$1;
/**
* Creates a new `FiberId`.
*
* @since 2.0.0
* @category constructors
*/
const make$37 = make$38;
/**
* Creates a string representing the name of the current thread of execution
* represented by the specified `FiberId`.
*
* @since 2.0.0
* @category destructors
*/
const threadName = threadName$1;
/**
* Unsafely creates a new `FiberId`.
*
* @since 2.0.0
* @category unsafe
*/
const unsafeMake$8 = unsafeMake$9;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/HashMap.js
/**
* @since 2.0.0
*/
/**
* Creates a new `HashMap`.
*
* @since 2.0.0
* @category constructors
*/
const empty$18 = empty$21;
/**
* Creates a new `HashMap` from an iterable collection of key/value pairs.
*
* @since 2.0.0
* @category constructors
*/
const fromIterable$1 = fromIterable$4;
/**
* Checks if the `HashMap` contains any entries.
*
* @since 2.0.0
* @category elements
*/
const isEmpty$5 = isEmpty$6;
/**
* Safely lookup the value for the specified key in the `HashMap` using the
* internal hashing function.
*
* @since 2.0.0
* @category elements
*/
const get$6 = get$8;
/**
* Sets the specified key to the specified value using the internal hashing
* function.
*
* @since 2.0.0
*/
const set$3 = set$5;
/**
* Returns an `IterableIterator` of the keys within the `HashMap`.
*
* @since 2.0.0
* @category getters
*/
const keys = keys$1;
/**
* Returns the number of entries within the `HashMap`.
*
* @since 2.0.0
* @category getters
*/
const size$4 = size$7;
/**
* Set or remove the specified key in the `HashMap` using the specified
* update function. The value of the specified key will be computed using the
* provided hash.
*
* The update function will be invoked with the current value of the key if it
* exists, or `None` if no such value exists.
*
* @since 2.0.0
*/
const modifyAt = modifyAt$1;
/**
* Performs a union of this `HashMap` and that `HashMap`.
*
* @since 2.0.0
*/
const union = union$3;
/**
* Maps over the entries of the `HashMap` using the specified function.
*
* @since 2.0.0
* @category mapping
*/
const map$8 = map$9;
/**
* Reduces the specified state over the entries of the `HashMap`.
*
* @since 2.0.0
* @category folding
*/
const reduce$4 = reduce$7;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/List.js
/**
* A data type for immutable linked lists representing ordered collections of elements of type `A`.
*
* This data type is optimal for last-in-first-out (LIFO), stack-like access patterns. If you need another access pattern, for example, random access or FIFO, consider using a collection more suited to this than `List`.
*
* **Performance**
*
* - Time: `List` has `O(1)` prepend and head/tail access. Most other operations are `O(n)` on the number of elements in the list. This includes the index-based lookup of elements, `length`, `append` and `reverse`.
* - Space: `List` implements structural sharing of the tail list. This means that many operations are either zero- or constant-memory cost.
*
* @since 2.0.0
*/
/**
* This file is ported from
*
* Scala (https://www.scala-lang.org)
*
* Copyright EPFL and Lightbend, Inc.
*
* Licensed under Apache License 2.0
* (http://www.apache.org/licenses/LICENSE-2.0).
*/
/**
* @since 2.0.0
* @category symbol
*/
const TypeId$19 = /*#__PURE__*/ Symbol.for("effect/List");
/**
* Converts the specified `List` to an `Array`.
*
* @category conversions
* @since 2.0.0
*/
const toArray = (self) => fromIterable$6(self);
/**
* @category equivalence
* @since 2.0.0
*/
const getEquivalence = (isEquivalent) => mapInput$1(getEquivalence$2(isEquivalent), toArray);
const _equivalence = /*#__PURE__*/ getEquivalence(equals$2);
const ConsProto = {
	[TypeId$19]: TypeId$19,
	_tag: "Cons",
	toString() {
		return format$4(this.toJSON());
	},
	toJSON() {
		return {
			_id: "List",
			_tag: "Cons",
			values: toArray(this).map(toJSON)
		};
	},
	[NodeInspectSymbol]() {
		return this.toJSON();
	},
	[symbol](that) {
		return isList(that) && this._tag === that._tag && _equivalence(this, that);
	},
	[symbol$1]() {
		return cached(this, array$1(toArray(this)));
	},
	[Symbol.iterator]() {
		let done = false;
		let self = this;
		return {
			next() {
				if (done) return this.return();
				if (self._tag === "Nil") {
					done = true;
					return this.return();
				}
				const value = self.head;
				self = self.tail;
				return {
					done,
					value
				};
			},
			return(value) {
				if (!done) done = true;
				return {
					done: true,
					value
				};
			}
		};
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
const makeCons = (head, tail) => {
	const cons = Object.create(ConsProto);
	cons.head = head;
	cons.tail = tail;
	return cons;
};
const NilHash = /*#__PURE__*/ string("Nil");
const _Nil = /*#__PURE__*/ Object.create({
	[TypeId$19]: TypeId$19,
	_tag: "Nil",
	toString() {
		return format$4(this.toJSON());
	},
	toJSON() {
		return {
			_id: "List",
			_tag: "Nil"
		};
	},
	[NodeInspectSymbol]() {
		return this.toJSON();
	},
	[symbol$1]() {
		return NilHash;
	},
	[symbol](that) {
		return isList(that) && this._tag === that._tag;
	},
	[Symbol.iterator]() {
		return { next() {
			return {
				done: true,
				value: void 0
			};
		} };
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
});
/**
* Returns `true` if the specified value is a `List`, `false` otherwise.
*
* @since 2.0.0
* @category refinements
*/
const isList = (u) => hasProperty(u, TypeId$19);
/**
* Returns `true` if the specified value is a `List.Nil<A>`, `false` otherwise.
*
* @since 2.0.0
* @category refinements
*/
const isNil = (self) => self._tag === "Nil";
/**
* Returns `true` if the specified value is a `List.Cons<A>`, `false` otherwise.
*
* @since 2.0.0
* @category refinements
*/
const isCons = (self) => self._tag === "Cons";
/**
* Constructs a new empty `List<A>`.
*
* @since 2.0.0
* @category constructors
*/
const nil = () => _Nil;
/**
* Constructs a new `List.Cons<A>` from the specified `head` and `tail` values.
*
* @since 2.0.0
* @category constructors
*/
const cons = (head, tail) => makeCons(head, tail);
/**
* Constructs a new empty `List<A>`.
*
* Alias of {@link nil}.
*
* @since 2.0.0
* @category constructors
*/
const empty$17 = nil;
/**
* Constructs a new `List<A>` from the specified value.
*
* @since 2.0.0
* @category constructors
*/
const of = (value) => makeCons(value, _Nil);
/**
* Concatenates two lists, combining their elements.
* If either list is non-empty, the result is also a non-empty list.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { List } from "effect"
*
* assert.deepStrictEqual(
*   List.make(1, 2).pipe(List.appendAll(List.make("a", "b")), List.toArray),
*   [1, 2, "a", "b"]
* )
* ```
*
* @category concatenating
* @since 2.0.0
*/
const appendAll = /*#__PURE__*/ dual(2, (self, that) => prependAll(that, self));
/**
* Prepends the specified element to the beginning of the list.
*
* @category concatenating
* @since 2.0.0
*/
const prepend = /*#__PURE__*/ dual(2, (self, element) => cons(element, self));
/**
* Prepends the specified prefix list to the beginning of the specified list.
* If either list is non-empty, the result is also a non-empty list.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { List } from "effect"
*
* assert.deepStrictEqual(
*   List.make(1, 2).pipe(List.prependAll(List.make("a", "b")), List.toArray),
*   ["a", "b", 1, 2]
* )
* ```
*
* @category concatenating
* @since 2.0.0
*/
const prependAll = /*#__PURE__*/ dual(2, (self, prefix) => {
	if (isNil(self)) return prefix;
	else if (isNil(prefix)) return self;
	else {
		const result = makeCons(prefix.head, self);
		let curr = result;
		let that = prefix.tail;
		while (!isNil(that)) {
			const temp = makeCons(that.head, self);
			curr.tail = temp;
			curr = temp;
			that = that.tail;
		}
		return result;
	}
});
/**
* Folds over the elements of the list using the specified function, using the
* specified initial value.
*
* @since 2.0.0
* @category folding
*/
const reduce$3 = /*#__PURE__*/ dual(3, (self, zero, f) => {
	let acc = zero;
	let these = self;
	while (!isNil(these)) {
		acc = f(acc, these.head);
		these = these.tail;
	}
	return acc;
});
/**
* Returns a new list with the elements of the specified list in reverse order.
*
* @since 2.0.0
* @category elements
*/
const reverse = (self) => {
	let result = empty$17();
	let these = self;
	while (!isNil(these)) {
		result = prepend(result, these.head);
		these = these.tail;
	}
	return result;
};
Array.prototype;
/** @internal */
const Structural = /*#__PURE__*/ function() {
	function Structural(args) {
		if (args) Object.assign(this, args);
	}
	Structural.prototype = StructuralPrototype;
	return Structural;
}();
/** @internal */
const struct$1 = (as) => Object.assign(Object.create(StructuralPrototype), as);
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/differ/contextPatch.js
/** @internal */
const ContextPatchTypeId = /*#__PURE__*/ Symbol.for("effect/DifferContextPatch");
function variance$5(a) {
	return a;
}
/** @internal */
const PatchProto$2 = {
	...Structural.prototype,
	[ContextPatchTypeId]: {
		_Value: variance$5,
		_Patch: variance$5
	}
};
const _empty$2 = /*#__PURE__*/ Object.create(/* @__PURE__ */ Object.assign(/*#__PURE__*/ Object.create(PatchProto$2), { _tag: "Empty" }));
/**
* @internal
*/
const empty$16 = () => _empty$2;
const AndThenProto$2 = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(PatchProto$2), { _tag: "AndThen" });
const makeAndThen$2 = (first, second) => {
	const o = Object.create(AndThenProto$2);
	o.first = first;
	o.second = second;
	return o;
};
const AddServiceProto = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(PatchProto$2), { _tag: "AddService" });
const makeAddService = (key, service) => {
	const o = Object.create(AddServiceProto);
	o.key = key;
	o.service = service;
	return o;
};
const RemoveServiceProto = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(PatchProto$2), { _tag: "RemoveService" });
const makeRemoveService = (key) => {
	const o = Object.create(RemoveServiceProto);
	o.key = key;
	return o;
};
const UpdateServiceProto = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(PatchProto$2), { _tag: "UpdateService" });
const makeUpdateService = (key, update) => {
	const o = Object.create(UpdateServiceProto);
	o.key = key;
	o.update = update;
	return o;
};
/** @internal */
const diff$6 = (oldValue, newValue) => {
	const missingServices = new Map(oldValue.unsafeMap);
	let patch = empty$16();
	for (const [tag, newService] of newValue.unsafeMap.entries()) if (missingServices.has(tag)) {
		const old = missingServices.get(tag);
		missingServices.delete(tag);
		if (!equals$2(old, newService)) patch = combine$4(makeUpdateService(tag, () => newService))(patch);
	} else {
		missingServices.delete(tag);
		patch = combine$4(makeAddService(tag, newService))(patch);
	}
	for (const [tag] of missingServices.entries()) patch = combine$4(makeRemoveService(tag))(patch);
	return patch;
};
/** @internal */
const combine$4 = /*#__PURE__*/ dual(2, (self, that) => makeAndThen$2(self, that));
/** @internal */
const patch$7 = /*#__PURE__*/ dual(2, (self, context) => {
	if (self._tag === "Empty") return context;
	let wasServiceUpdated = false;
	let patches = of$1(self);
	const updatedContext = new Map(context.unsafeMap);
	while (isNonEmpty$4(patches)) {
		const head = headNonEmpty(patches);
		const tail = tailNonEmpty(patches);
		switch (head._tag) {
			case "Empty":
				patches = tail;
				break;
			case "AddService":
				updatedContext.set(head.key, head.service);
				patches = tail;
				break;
			case "AndThen":
				patches = prepend$1(prepend$1(tail, head.second), head.first);
				break;
			case "RemoveService":
				updatedContext.delete(head.key);
				patches = tail;
				break;
			case "UpdateService":
				updatedContext.set(head.key, head.update(updatedContext.get(head.key)));
				wasServiceUpdated = true;
				patches = tail;
		}
	}
	if (!wasServiceUpdated) return makeContext(updatedContext);
	const map = /* @__PURE__ */ new Map();
	for (const [tag] of context.unsafeMap) if (updatedContext.has(tag)) {
		map.set(tag, updatedContext.get(tag));
		updatedContext.delete(tag);
	}
	for (const [tag, s] of updatedContext) map.set(tag, s);
	return makeContext(map);
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/differ/hashSetPatch.js
/** @internal */
const HashSetPatchTypeId = /*#__PURE__*/ Symbol.for("effect/DifferHashSetPatch");
function variance$4(a) {
	return a;
}
/** @internal */
const PatchProto$1 = {
	...Structural.prototype,
	[HashSetPatchTypeId]: {
		_Value: variance$4,
		_Key: variance$4,
		_Patch: variance$4
	}
};
const _empty$1 = /*#__PURE__*/ Object.create(/* @__PURE__ */ Object.assign(/*#__PURE__*/ Object.create(PatchProto$1), { _tag: "Empty" }));
/** @internal */
const empty$15 = () => _empty$1;
const AndThenProto$1 = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(PatchProto$1), { _tag: "AndThen" });
/** @internal */
const makeAndThen$1 = (first, second) => {
	const o = Object.create(AndThenProto$1);
	o.first = first;
	o.second = second;
	return o;
};
const AddProto = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(PatchProto$1), { _tag: "Add" });
/** @internal */
const makeAdd = (value) => {
	const o = Object.create(AddProto);
	o.value = value;
	return o;
};
const RemoveProto = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(PatchProto$1), { _tag: "Remove" });
/** @internal */
const makeRemove = (value) => {
	const o = Object.create(RemoveProto);
	o.value = value;
	return o;
};
/** @internal */
const diff$5 = (oldValue, newValue) => {
	const [removed, patch] = reduce$5([oldValue, empty$15()], ([set, patch], value) => {
		if (has$1(value)(set)) return [remove$2(value)(set), patch];
		return [set, combine$3(makeAdd(value))(patch)];
	})(newValue);
	return reduce$5(patch, (patch, value) => combine$3(makeRemove(value))(patch))(removed);
};
/** @internal */
const combine$3 = /*#__PURE__*/ dual(2, (self, that) => makeAndThen$1(self, that));
/** @internal */
const patch$6 = /*#__PURE__*/ dual(2, (self, oldValue) => {
	if (self._tag === "Empty") return oldValue;
	let set = oldValue;
	let patches = of$1(self);
	while (isNonEmpty$4(patches)) {
		const head = headNonEmpty(patches);
		const tail = tailNonEmpty(patches);
		switch (head._tag) {
			case "Empty":
				patches = tail;
				break;
			case "AndThen":
				patches = prepend$1(head.first)(prepend$1(head.second)(tail));
				break;
			case "Add":
				set = add(head.value)(set);
				patches = tail;
				break;
			case "Remove":
				set = remove$2(head.value)(set);
				patches = tail;
		}
	}
	return set;
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/differ/readonlyArrayPatch.js
/** @internal */
const ReadonlyArrayPatchTypeId = /*#__PURE__*/ Symbol.for("effect/DifferReadonlyArrayPatch");
function variance$3(a) {
	return a;
}
const PatchProto = {
	...Structural.prototype,
	[ReadonlyArrayPatchTypeId]: {
		_Value: variance$3,
		_Patch: variance$3
	}
};
const _empty = /*#__PURE__*/ Object.create(/* @__PURE__ */ Object.assign(/*#__PURE__*/ Object.create(PatchProto), { _tag: "Empty" }));
/**
* @internal
*/
const empty$14 = () => _empty;
const AndThenProto = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(PatchProto), { _tag: "AndThen" });
const makeAndThen = (first, second) => {
	const o = Object.create(AndThenProto);
	o.first = first;
	o.second = second;
	return o;
};
const AppendProto = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(PatchProto), { _tag: "Append" });
const makeAppend = (values) => {
	const o = Object.create(AppendProto);
	o.values = values;
	return o;
};
const SliceProto = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(PatchProto), { _tag: "Slice" });
const makeSlice = (from, until) => {
	const o = Object.create(SliceProto);
	o.from = from;
	o.until = until;
	return o;
};
const UpdateProto = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(PatchProto), { _tag: "Update" });
const makeUpdate = (index, patch) => {
	const o = Object.create(UpdateProto);
	o.index = index;
	o.patch = patch;
	return o;
};
/** @internal */
const diff$4 = (options) => {
	let i = 0;
	let patch = empty$14();
	while (i < options.oldValue.length && i < options.newValue.length) {
		const oldElement = options.oldValue[i];
		const newElement = options.newValue[i];
		const valuePatch = options.differ.diff(oldElement, newElement);
		if (!equals$2(valuePatch, options.differ.empty)) patch = combine$2(patch, makeUpdate(i, valuePatch));
		i = i + 1;
	}
	if (i < options.oldValue.length) patch = combine$2(patch, makeSlice(0, i));
	if (i < options.newValue.length) patch = combine$2(patch, makeAppend(drop$1(i)(options.newValue)));
	return patch;
};
/** @internal */
const combine$2 = /*#__PURE__*/ dual(2, (self, that) => makeAndThen(self, that));
/** @internal */
const patch$5 = /*#__PURE__*/ dual(3, (self, oldValue, differ) => {
	if (self._tag === "Empty") return oldValue;
	let readonlyArray = oldValue.slice();
	let patches = of$2(self);
	while (isNonEmptyArray(patches)) {
		const head = headNonEmpty$1(patches);
		const tail = tailNonEmpty$1(patches);
		switch (head._tag) {
			case "Empty":
				patches = tail;
				break;
			case "AndThen":
				tail.unshift(head.first, head.second);
				patches = tail;
				break;
			case "Append":
				for (const value of head.values) readonlyArray.push(value);
				patches = tail;
				break;
			case "Slice":
				readonlyArray = readonlyArray.slice(head.from, head.until);
				patches = tail;
				break;
			case "Update":
				readonlyArray[head.index] = differ.patch(head.patch, readonlyArray[head.index]);
				patches = tail;
		}
	}
	return readonlyArray;
});
/** @internal */
const DifferProto = {
	[/* @__PURE__ */ Symbol.for("effect/Differ")]: {
		_P: identity,
		_V: identity
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const make$36 = (params) => {
	const differ = Object.create(DifferProto);
	differ.empty = params.empty;
	differ.diff = params.diff;
	differ.combine = params.combine;
	differ.patch = params.patch;
	return differ;
};
/** @internal */
const environment = () => make$36({
	empty: empty$16(),
	combine: (first, second) => combine$4(second)(first),
	diff: (oldValue, newValue) => diff$6(oldValue, newValue),
	patch: (patch, oldValue) => patch$7(oldValue)(patch)
});
/** @internal */
const hashSet = () => make$36({
	empty: empty$15(),
	combine: (first, second) => combine$3(second)(first),
	diff: (oldValue, newValue) => diff$5(oldValue, newValue),
	patch: (patch, oldValue) => patch$6(oldValue)(patch)
});
/** @internal */
const readonlyArray = (differ) => make$36({
	empty: empty$14(),
	combine: (first, second) => combine$2(first, second),
	diff: (oldValue, newValue) => diff$4({
		oldValue,
		newValue,
		differ
	}),
	patch: (patch, oldValue) => patch$5(patch, oldValue, differ)
});
/** @internal */
const update$3 = () => updateWith((_, a) => a);
/** @internal */
const updateWith = (f) => make$36({
	empty: identity,
	combine: (first, second) => {
		if (first === identity) return second;
		if (second === identity) return first;
		return (a) => second(first(a));
	},
	diff: (oldValue, newValue) => {
		if (equals$2(oldValue, newValue)) return identity;
		return constant(newValue);
	},
	patch: (patch, oldValue) => f(oldValue, patch(oldValue))
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/runtimeFlagsPatch.js
/** @internal */
const BIT_MASK = 255;
/** @internal */
const BIT_SHIFT = 8;
/** @internal */
const active = (patch) => patch & BIT_MASK;
/** @internal */
const enabled = (patch) => patch >> BIT_SHIFT & BIT_MASK;
/** @internal */
const make$35 = (active, enabled) => (active & BIT_MASK) + ((enabled & active & BIT_MASK) << BIT_SHIFT);
/** @internal */
const empty$13 = /*#__PURE__*/ make$35(0, 0);
/** @internal */
const enable$2 = (flag) => make$35(flag, flag);
/** @internal */
const disable$2 = (flag) => make$35(flag, 0);
/** @internal */
const exclude$1 = /*#__PURE__*/ dual(2, (self, flag) => make$35(active(self) & ~flag, enabled(self)));
/** @internal */
const andThen = /*#__PURE__*/ dual(2, (self, that) => self | that);
/** @internal */
const invert = (n) => ~n >>> 0 & BIT_MASK;
/** @internal */
const cooperativeYielding = (self) => isEnabled(self, 32);
/** @internal */
const disable$1 = /*#__PURE__*/ dual(2, (self, flag) => self & ~flag);
/** @internal */
const enable$1 = /*#__PURE__*/ dual(2, (self, flag) => self | flag);
/** @internal */
const interruptible$3 = (self) => interruption(self) && !windDown(self);
/** @internal */
const interruption = (self) => isEnabled(self, 1);
/** @internal */
const isEnabled = /*#__PURE__*/ dual(2, (self, flag) => (self & flag) !== 0);
/** @internal */
const make$34 = (...flags) => flags.reduce((a, b) => a | b, 0);
/** @internal */
const none$1 = /*#__PURE__*/ make$34(0);
/** @internal */
const runtimeMetrics = (self) => isEnabled(self, 4);
const windDown = (self) => isEnabled(self, 16);
/** @internal */
const diff$3 = /*#__PURE__*/ dual(2, (self, that) => make$35(self ^ that, that));
/** @internal */
const patch$4 = /*#__PURE__*/ dual(2, (self, patch) => self & (invert(active(patch)) | enabled(patch)) | active(patch) & enabled(patch));
/** @internal */
const differ$1 = /*#__PURE__*/ make$36({
	empty: empty$13,
	diff: (oldValue, newValue) => diff$3(oldValue, newValue),
	combine: (first, second) => andThen(second)(first),
	patch: (_patch, oldValue) => patch$4(oldValue, _patch)
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/RuntimeFlagsPatch.js
/**
* Creates a `RuntimeFlagsPatch` describing enabling the provided `RuntimeFlag`.
*
* @since 2.0.0
* @category constructors
*/
const enable = enable$2;
/**
* Creates a `RuntimeFlagsPatch` describing disabling the provided `RuntimeFlag`.
*
* @since 2.0.0
* @category constructors
*/
const disable = disable$2;
/**
* Creates a `RuntimeFlagsPatch` which describes exclusion of the specified
* `RuntimeFlag` from the set of `RuntimeFlags`.
*
* @category utils
* @since 2.0.0
*/
const exclude = exclude$1;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/blockedRequests.js
/**
* Combines this collection of blocked requests with the specified collection
* of blocked requests, in parallel.
*
* @internal
*/
const par = (self, that) => ({
	_tag: "Par",
	left: self,
	right: that
});
/**
* Combines this collection of blocked requests with the specified collection
* of blocked requests, in sequence.
*
* @internal
*/
const seq = (self, that) => ({
	_tag: "Seq",
	left: self,
	right: that
});
/**
* Flattens a collection of blocked requests into a collection of pipelined
* and batched requests that can be submitted for execution.
*
* @internal
*/
const flatten$7 = (self) => {
	let current = of(self);
	let updated = empty$17();
	while (1) {
		const [parallel, sequential] = reduce$3(current, [parallelCollectionEmpty(), empty$17()], ([parallel, sequential], blockedRequest) => {
			const [par, seq] = step$1(blockedRequest);
			return [parallelCollectionCombine(parallel, par), appendAll(sequential, seq)];
		});
		updated = merge$2(updated, parallel);
		if (isNil(sequential)) return reverse(updated);
		current = sequential;
	}
	throw new Error("BUG: BlockedRequests.flatten - please report an issue at https://github.com/Effect-TS/effect/issues");
};
/**
* Takes one step in evaluating a collection of blocked requests, returning a
* collection of blocked requests that can be performed in parallel and a list
* of blocked requests that must be performed sequentially after those
* requests.
*/
const step$1 = (requests) => {
	let current = requests;
	let parallel = parallelCollectionEmpty();
	let stack = empty$17();
	let sequential = empty$17();
	while (1) switch (current._tag) {
		case "Empty":
			if (isNil(stack)) return [parallel, sequential];
			current = stack.head;
			stack = stack.tail;
			break;
		case "Par":
			stack = cons(current.right, stack);
			current = current.left;
			break;
		case "Seq": {
			const left = current.left;
			const right = current.right;
			switch (left._tag) {
				case "Empty":
					current = right;
					break;
				case "Par": {
					const l = left.left;
					const r = left.right;
					current = par(seq(l, right), seq(r, right));
					break;
				}
				case "Seq": {
					const l = left.left;
					const r = left.right;
					current = seq(l, seq(r, right));
					break;
				}
				case "Single":
					current = left;
					sequential = cons(right, sequential);
			}
			break;
		}
		case "Single":
			parallel = parallelCollectionAdd(parallel, current);
			if (isNil(stack)) return [parallel, sequential];
			current = stack.head;
			stack = stack.tail;
	}
	throw new Error("BUG: BlockedRequests.step - please report an issue at https://github.com/Effect-TS/effect/issues");
};
/**
* Merges a collection of requests that must be executed sequentially with a
* collection of requests that can be executed in parallel. If the collections
* are both from the same single data source then the requests can be
* pipelined while preserving ordering guarantees.
*/
const merge$2 = (sequential, parallel) => {
	if (isNil(sequential)) return of(parallelCollectionToSequentialCollection(parallel));
	if (parallelCollectionIsEmpty(parallel)) return sequential;
	const seqHeadKeys = sequentialCollectionKeys(sequential.head);
	const parKeys = parallelCollectionKeys(parallel);
	if (seqHeadKeys.length === 1 && parKeys.length === 1 && equals$2(seqHeadKeys[0], parKeys[0])) return cons(sequentialCollectionCombine(sequential.head, parallelCollectionToSequentialCollection(parallel)), sequential.tail);
	return cons(parallelCollectionToSequentialCollection(parallel), sequential);
};
/** @internal */
const RequestBlockParallelTypeId = /*#__PURE__*/ Symbol.for("effect/RequestBlock/RequestBlockParallel");
const parallelVariance = { 
/* c8 ignore next */
_R: (_) => _ };
var ParallelImpl = class {
	map;
	[RequestBlockParallelTypeId] = parallelVariance;
	constructor(map) {
		this.map = map;
	}
};
/** @internal */
const parallelCollectionEmpty = () => new ParallelImpl(empty$18());
/** @internal */
const parallelCollectionAdd = (self, blockedRequest) => new ParallelImpl(modifyAt(self.map, blockedRequest.dataSource, (_) => orElseSome(map$13(_, append$1(blockedRequest.blockedRequest)), () => of$1(blockedRequest.blockedRequest))));
/** @internal */
const parallelCollectionCombine = (self, that) => new ParallelImpl(reduce$4(self.map, that.map, (map, value, key) => set$3(map, key, match$9(get$6(map, key), {
	onNone: () => value,
	onSome: (other) => appendAll$1(value, other)
}))));
/** @internal */
const parallelCollectionIsEmpty = (self) => isEmpty$5(self.map);
/** @internal */
const parallelCollectionKeys = (self) => Array.from(keys(self.map));
/** @internal */
const parallelCollectionToSequentialCollection = (self) => sequentialCollectionMake(map$8(self.map, (x) => of$1(x)));
/** @internal */
const SequentialCollectionTypeId = /*#__PURE__*/ Symbol.for("effect/RequestBlock/RequestBlockSequential");
const sequentialVariance = { 
/* c8 ignore next */
_R: (_) => _ };
var SequentialImpl = class {
	map;
	[SequentialCollectionTypeId] = sequentialVariance;
	constructor(map) {
		this.map = map;
	}
};
/** @internal */
const sequentialCollectionMake = (map) => new SequentialImpl(map);
/** @internal */
const sequentialCollectionCombine = (self, that) => new SequentialImpl(reduce$4(that.map, self.map, (map, value, key) => set$3(map, key, match$9(get$6(map, key), {
	onNone: () => empty$22(),
	onSome: (a) => appendAll$1(a, value)
}))));
/** @internal */
const sequentialCollectionKeys = (self) => Array.from(keys(self.map));
/** @internal */
const sequentialCollectionToChunk = (self) => Array.from(self.map);
/** @internal */
const OP_EMPTY$2 = "Empty";
/** @internal */
const OP_FAIL$2 = "Fail";
/** @internal */
const OP_INTERRUPT = "Interrupt";
/** @internal */
const OP_PARALLEL$1 = "Parallel";
/** @internal */
const OP_SEQUENTIAL$1 = "Sequential";
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/cause.js
/** @internal */
const CauseSymbolKey = "effect/Cause";
/** @internal */
const CauseTypeId = /*#__PURE__*/ Symbol.for(CauseSymbolKey);
const variance$2 = { 
/* c8 ignore next */
_E: (_) => _ };
/** @internal */
const proto$10 = {
	[CauseTypeId]: variance$2,
	[symbol$1]() {
		return pipe(hash(CauseSymbolKey), combine$7(hash(flattenCause(this))), cached(this));
	},
	[symbol](that) {
		return isCause$1(that) && causeEquals(this, that);
	},
	pipe() {
		return pipeArguments(this, arguments);
	},
	toJSON() {
		switch (this._tag) {
			case "Empty": return {
				_id: "Cause",
				_tag: this._tag
			};
			case "Die": return {
				_id: "Cause",
				_tag: this._tag,
				defect: toJSON(this.defect)
			};
			case "Interrupt": return {
				_id: "Cause",
				_tag: this._tag,
				fiberId: this.fiberId.toJSON()
			};
			case "Fail": return {
				_id: "Cause",
				_tag: this._tag,
				failure: toJSON(this.error)
			};
			case "Sequential":
			case "Parallel": return {
				_id: "Cause",
				_tag: this._tag,
				left: toJSON(this.left),
				right: toJSON(this.right)
			};
		}
	},
	toString() {
		return pretty$1(this);
	},
	[NodeInspectSymbol]() {
		return this.toJSON();
	}
};
/** @internal */
const empty$12 = /*#__PURE__*/ (() => {
	const o = /*#__PURE__*/ Object.create(proto$10);
	o._tag = OP_EMPTY$2;
	return o;
})();
/** @internal */
const fail$8 = (error) => {
	const o = Object.create(proto$10);
	o._tag = OP_FAIL$2;
	o.error = error;
	return o;
};
/** @internal */
const die$5 = (defect) => {
	const o = Object.create(proto$10);
	o._tag = "Die";
	o.defect = defect;
	return o;
};
/** @internal */
const interrupt$5 = (fiberId) => {
	const o = Object.create(proto$10);
	o._tag = OP_INTERRUPT;
	o.fiberId = fiberId;
	return o;
};
/** @internal */
const parallel$3 = (left, right) => {
	const o = Object.create(proto$10);
	o._tag = OP_PARALLEL$1;
	o.left = left;
	o.right = right;
	return o;
};
/** @internal */
const sequential$3 = (left, right) => {
	const o = Object.create(proto$10);
	o._tag = OP_SEQUENTIAL$1;
	o.left = left;
	o.right = right;
	return o;
};
/** @internal */
const isCause$1 = (u) => hasProperty(u, CauseTypeId);
/** @internal */
const isEmptyType = (self) => self._tag === OP_EMPTY$2;
/** @internal */
const isFailType$1 = (self) => self._tag === OP_FAIL$2;
/** @internal */
const isDieType$1 = (self) => self._tag === "Die";
/** @internal */
const isEmpty$4 = (self) => {
	if (self._tag === "Empty") return true;
	return reduce$2(self, true, (acc, cause) => {
		switch (cause._tag) {
			case OP_EMPTY$2: return some(acc);
			case "Die":
			case OP_FAIL$2:
			case OP_INTERRUPT: return some(false);
			default: return none$4();
		}
	});
};
/** @internal */
const isInterrupted$1 = (self) => isSome(interruptOption(self));
/** @internal */
const isInterruptedOnly$1 = (self) => reduceWithContext$2(void 0, IsInterruptedOnlyCauseReducer)(self);
/** @internal */
const failures = (self) => reverse$1(reduce$2(self, empty$22(), (list, cause) => cause._tag === "Fail" ? some(pipe(list, prepend$1(cause.error))) : none$4()));
/** @internal */
const defects = (self) => reverse$1(reduce$2(self, empty$22(), (list, cause) => cause._tag === "Die" ? some(pipe(list, prepend$1(cause.defect))) : none$4()));
/** @internal */
const interruptors$1 = (self) => reduce$2(self, empty$19(), (set, cause) => cause._tag === "Interrupt" ? some(pipe(set, add(cause.fiberId))) : none$4());
/** @internal */
const failureOption = (self) => find(self, (cause) => cause._tag === "Fail" ? some(cause.error) : none$4());
/** @internal */
const failureOrCause$1 = (self) => {
	const option = failureOption(self);
	switch (option._tag) {
		case "None": return right(self);
		case "Some": return left(option.value);
	}
};
/** @internal */
const flipCauseOption$1 = (self) => match$6(self, {
	onEmpty: some(empty$12),
	onFail: map$13(fail$8),
	onDie: (defect) => some(die$5(defect)),
	onInterrupt: (fiberId) => some(interrupt$5(fiberId)),
	onSequential: mergeWith$1(sequential$3),
	onParallel: mergeWith$1(parallel$3)
});
/** @internal */
const interruptOption = (self) => find(self, (cause) => cause._tag === "Interrupt" ? some(cause.fiberId) : none$4());
/** @internal */
const keepDefectsAndElectFailures = (self) => match$6(self, {
	onEmpty: none$4(),
	onFail: (failure) => some(die$5(failure)),
	onDie: (defect) => some(die$5(defect)),
	onInterrupt: () => none$4(),
	onSequential: mergeWith$1(sequential$3),
	onParallel: mergeWith$1(parallel$3)
});
/** @internal */
const stripFailures = (self) => match$6(self, {
	onEmpty: empty$12,
	onFail: () => empty$12,
	onDie: die$5,
	onInterrupt: interrupt$5,
	onSequential: sequential$3,
	onParallel: parallel$3
});
/** @internal */
const electFailures = (self) => match$6(self, {
	onEmpty: empty$12,
	onFail: die$5,
	onDie: die$5,
	onInterrupt: interrupt$5,
	onSequential: sequential$3,
	onParallel: parallel$3
});
/** @internal */
const map$7 = /*#__PURE__*/ dual(2, (self, f) => flatMap$7(self, (e) => fail$8(f(e))));
/** @internal */
const flatMap$7 = /*#__PURE__*/ dual(2, (self, f) => match$6(self, {
	onEmpty: empty$12,
	onFail: (error) => f(error),
	onDie: (defect) => die$5(defect),
	onInterrupt: (fiberId) => interrupt$5(fiberId),
	onSequential: (left, right) => sequential$3(left, right),
	onParallel: (left, right) => parallel$3(left, right)
}));
/** @internal */
const causeEquals = (left, right) => {
	let leftStack = of$1(left);
	let rightStack = of$1(right);
	while (isNonEmpty$4(leftStack) && isNonEmpty$4(rightStack)) {
		const [leftParallel, leftSequential] = pipe(headNonEmpty(leftStack), reduce$2([empty$19(), empty$22()], ([parallel, sequential], cause) => {
			const [par, seq] = evaluateCause(cause);
			return some([pipe(parallel, union$1(par)), pipe(sequential, appendAll$1(seq))]);
		}));
		const [rightParallel, rightSequential] = pipe(headNonEmpty(rightStack), reduce$2([empty$19(), empty$22()], ([parallel, sequential], cause) => {
			const [par, seq] = evaluateCause(cause);
			return some([pipe(parallel, union$1(par)), pipe(sequential, appendAll$1(seq))]);
		}));
		if (!equals$2(leftParallel, rightParallel)) return false;
		leftStack = leftSequential;
		rightStack = rightSequential;
	}
	return true;
};
/**
* Flattens a cause to a sequence of sets of causes, where each set represents
* causes that fail in parallel and sequential sets represent causes that fail
* after each other.
*
* @internal
*/
const flattenCause = (cause) => {
	return flattenCauseLoop(of$1(cause), empty$22());
};
/** @internal */
const flattenCauseLoop = (causes, flattened) => {
	while (1) {
		const [parallel, sequential] = pipe(causes, reduce$9([empty$19(), empty$22()], ([parallel, sequential], cause) => {
			const [par, seq] = evaluateCause(cause);
			return [pipe(parallel, union$1(par)), pipe(sequential, appendAll$1(seq))];
		}));
		const updated = size$5(parallel) > 0 ? pipe(flattened, prepend$1(parallel)) : flattened;
		if (isEmpty$7(sequential)) return reverse$1(updated);
		causes = sequential;
		flattened = updated;
	}
	throw new Error(getBugErrorMessage("Cause.flattenCauseLoop"));
};
/** @internal */
const find = /*#__PURE__*/ dual(2, (self, pf) => {
	const stack = [self];
	while (stack.length > 0) {
		const item = stack.pop();
		const option = pf(item);
		switch (option._tag) {
			case "None":
				switch (item._tag) {
					case OP_SEQUENTIAL$1:
					case OP_PARALLEL$1:
						stack.push(item.right);
						stack.push(item.left);
				}
				break;
			case "Some": return option;
		}
	}
	return none$4();
});
/**
* Takes one step in evaluating a cause, returning a set of causes that fail
* in parallel and a list of causes that fail sequentially after those causes.
*
* @internal
*/
const evaluateCause = (self) => {
	let cause = self;
	const stack = [];
	let _parallel = empty$19();
	let _sequential = empty$22();
	while (cause !== void 0) switch (cause._tag) {
		case OP_EMPTY$2:
			if (stack.length === 0) return [_parallel, _sequential];
			cause = stack.pop();
			break;
		case OP_FAIL$2:
			_parallel = add(_parallel, make$43(cause._tag, cause.error));
			if (stack.length === 0) return [_parallel, _sequential];
			cause = stack.pop();
			break;
		case "Die":
			_parallel = add(_parallel, make$43(cause._tag, cause.defect));
			if (stack.length === 0) return [_parallel, _sequential];
			cause = stack.pop();
			break;
		case OP_INTERRUPT:
			_parallel = add(_parallel, make$43(cause._tag, cause.fiberId));
			if (stack.length === 0) return [_parallel, _sequential];
			cause = stack.pop();
			break;
		case OP_SEQUENTIAL$1:
			switch (cause.left._tag) {
				case OP_EMPTY$2:
					cause = cause.right;
					break;
				case OP_SEQUENTIAL$1:
					cause = sequential$3(cause.left.left, sequential$3(cause.left.right, cause.right));
					break;
				case OP_PARALLEL$1:
					cause = parallel$3(sequential$3(cause.left.left, cause.right), sequential$3(cause.left.right, cause.right));
					break;
				default:
					_sequential = prepend$1(_sequential, cause.right);
					cause = cause.left;
			}
			break;
		case OP_PARALLEL$1:
			stack.push(cause.right);
			cause = cause.left;
	}
	throw new Error(getBugErrorMessage("Cause.evaluateCauseLoop"));
};
/** @internal */
const IsInterruptedOnlyCauseReducer = {
	emptyCase: constTrue,
	failCase: constFalse,
	dieCase: constFalse,
	interruptCase: constTrue,
	sequentialCase: (_, left, right) => left && right,
	parallelCase: (_, left, right) => left && right
};
const OP_SEQUENTIAL_CASE = "SequentialCase";
const OP_PARALLEL_CASE = "ParallelCase";
/** @internal */
const match$6 = /*#__PURE__*/ dual(2, (self, { onDie, onEmpty, onFail, onInterrupt, onParallel, onSequential }) => {
	return reduceWithContext$2(self, void 0, {
		emptyCase: () => onEmpty,
		failCase: (_, error) => onFail(error),
		dieCase: (_, defect) => onDie(defect),
		interruptCase: (_, fiberId) => onInterrupt(fiberId),
		sequentialCase: (_, left, right) => onSequential(left, right),
		parallelCase: (_, left, right) => onParallel(left, right)
	});
});
/** @internal */
const reduce$2 = /*#__PURE__*/ dual(3, (self, zero, pf) => {
	let accumulator = zero;
	let cause = self;
	const causes = [];
	while (cause !== void 0) {
		const option = pf(accumulator, cause);
		accumulator = isSome(option) ? option.value : accumulator;
		switch (cause._tag) {
			case OP_SEQUENTIAL$1:
				causes.push(cause.right);
				cause = cause.left;
				break;
			case OP_PARALLEL$1:
				causes.push(cause.right);
				cause = cause.left;
				break;
			default: cause = void 0;
		}
		if (cause === void 0 && causes.length > 0) cause = causes.pop();
	}
	return accumulator;
});
/** @internal */
const reduceWithContext$2 = /*#__PURE__*/ dual(3, (self, context, reducer) => {
	const input = [self];
	const output = [];
	while (input.length > 0) {
		const cause = input.pop();
		switch (cause._tag) {
			case OP_EMPTY$2:
				output.push(right(reducer.emptyCase(context)));
				break;
			case OP_FAIL$2:
				output.push(right(reducer.failCase(context, cause.error)));
				break;
			case "Die":
				output.push(right(reducer.dieCase(context, cause.defect)));
				break;
			case OP_INTERRUPT:
				output.push(right(reducer.interruptCase(context, cause.fiberId)));
				break;
			case OP_SEQUENTIAL$1:
				input.push(cause.right);
				input.push(cause.left);
				output.push(left({ _tag: OP_SEQUENTIAL_CASE }));
				break;
			case OP_PARALLEL$1:
				input.push(cause.right);
				input.push(cause.left);
				output.push(left({ _tag: OP_PARALLEL_CASE }));
		}
	}
	const accumulator = [];
	while (output.length > 0) {
		const either = output.pop();
		switch (either._tag) {
			case "Left":
				switch (either.left._tag) {
					case OP_SEQUENTIAL_CASE: {
						const left = accumulator.pop();
						const right = accumulator.pop();
						const value = reducer.sequentialCase(context, left, right);
						accumulator.push(value);
						break;
					}
					case OP_PARALLEL_CASE: {
						const left = accumulator.pop();
						const right = accumulator.pop();
						const value = reducer.parallelCase(context, left, right);
						accumulator.push(value);
						break;
					}
				}
				break;
			case "Right": accumulator.push(either.right);
		}
	}
	if (accumulator.length === 0) throw new Error("BUG: Cause.reduceWithContext - please report an issue at https://github.com/Effect-TS/effect/issues");
	return accumulator.pop();
});
/** @internal */
const pretty$1 = (cause, options) => {
	if (isInterruptedOnly$1(cause)) return "All fibers interrupted without errors.";
	return prettyErrors(cause).map(function(e) {
		if (options?.renderErrorCause !== true || e.cause === void 0) return e.stack;
		return `${e.stack} {\n${renderErrorCause(e.cause, "  ")}\n}`;
	}).join("\n");
};
const renderErrorCause = (cause, prefix) => {
	const lines = cause.stack.split("\n");
	let stack = `${prefix}[cause]: ${lines[0]}`;
	for (let i = 1, len = lines.length; i < len; i++) stack += `\n${prefix}${lines[i]}`;
	if (cause.cause) stack += ` {\n${renderErrorCause(cause.cause, `${prefix}  `)}\n${prefix}}`;
	return stack;
};
/** @internal */
const makePrettyError = (originalError) => {
	const originalErrorIsObject = typeof originalError === "object" && originalError !== null;
	const prevLimit = Error.stackTraceLimit;
	Error.stackTraceLimit = 1;
	const error = new Error(prettyErrorMessage(originalError), originalErrorIsObject && "cause" in originalError && typeof originalError.cause !== "undefined" ? { cause: makePrettyError(originalError.cause) } : void 0);
	Error.stackTraceLimit = prevLimit;
	if (error.message === "") error.message = "An error has occurred";
	Error.stackTraceLimit = prevLimit;
	error.name = originalError instanceof Error ? originalError.name : "Error";
	if (originalErrorIsObject) {
		if (spanSymbol in originalError) error.span = originalError[spanSymbol];
		Object.keys(originalError).forEach((key) => {
			if (!(key in error)) error[key] = originalError[key];
		});
	}
	error.stack = prettyErrorStack(`${error.name}: ${error.message}`, originalError instanceof Error && originalError.stack ? originalError.stack : "", error.span);
	return error;
};
/**
* A utility function for generating human-readable error messages from a generic error of type `unknown`.
*
* Rules:
*
* 1) If the input `u` is already a string, it's considered a message.
* 2) If `u` is an Error instance with a message defined, it uses the message.
* 3) If `u` has a user-defined `toString()` method, it uses that method.
* 4) Otherwise, it uses `Inspectable.stringifyCircular` to produce a string representation and uses it as the error message,
*   with "Error" added as a prefix.
*
* @internal
*/
const prettyErrorMessage = (u) => {
	if (typeof u === "string") return u;
	if (typeof u === "object" && u !== null && u instanceof Error) return u.message;
	try {
		if (hasProperty(u, "toString") && isFunction(u["toString"]) && u["toString"] !== Object.prototype.toString && u["toString"] !== globalThis.Array.prototype.toString) return u["toString"]();
	} catch {}
	return stringifyCircular(u);
};
const locationRegex = /\((.*)\)/g;
/** @internal */
const spanToTrace = /*#__PURE__*/ globalValue("effect/Tracer/spanToTrace", () => /* @__PURE__ */ new WeakMap());
const prettyErrorStack = (message, stack, span) => {
	const out = [message];
	const lines = stack.startsWith(message) ? stack.slice(message.length).split("\n") : stack.split("\n");
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].includes(" at new BaseEffectError") || lines[i].includes(" at new YieldableError")) {
			i++;
			continue;
		}
		if (lines[i].includes("Generator.next")) break;
		if (lines[i].includes("effect_internal_function")) break;
		out.push(lines[i].replace(/at .*effect_instruction_i.*\((.*)\)/, "at $1").replace(/EffectPrimitive\.\w+/, "<anonymous>"));
	}
	if (span) {
		let current = span;
		let i = 0;
		while (current && current._tag === "Span" && i < 10) {
			const stackFn = spanToTrace.get(current);
			if (typeof stackFn === "function") {
				const stack = stackFn();
				if (typeof stack === "string") {
					const locationMatchAll = stack.matchAll(locationRegex);
					let match = false;
					for (const [, location] of locationMatchAll) {
						match = true;
						out.push(`    at ${current.name} (${location})`);
					}
					if (!match) out.push(`    at ${current.name} (${stack.replace(/^at /, "")})`);
				} else out.push(`    at ${current.name}`);
			} else out.push(`    at ${current.name}`);
			current = getOrUndefined(current.parent);
			i++;
		}
	}
	return out.join("\n");
};
/** @internal */
const spanSymbol = /*#__PURE__*/ Symbol.for("effect/SpanAnnotation");
/** @internal */
const prettyErrors = (cause) => reduceWithContext$2(cause, void 0, {
	emptyCase: () => [],
	dieCase: (_, unknownError) => {
		return [makePrettyError(unknownError)];
	},
	failCase: (_, error) => {
		return [makePrettyError(error)];
	},
	interruptCase: () => [],
	parallelCase: (_, l, r) => [...l, ...r],
	sequentialCase: (_, l, r) => [...l, ...r]
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/opCodes/deferred.js
/** @internal */
const OP_STATE_PENDING = "Pending";
/** @internal */
const OP_STATE_DONE$1 = "Done";
/** @internal */
const DeferredTypeId$1 = /*#__PURE__*/ Symbol.for("effect/Deferred");
/** @internal */
const deferredVariance = {
	/* c8 ignore next */
	_E: (_) => _,
	/* c8 ignore next */
	_A: (_) => _
};
/** @internal */
const pending = (joiners) => {
	return {
		_tag: OP_STATE_PENDING,
		joiners
	};
};
/** @internal */
const done$5 = (effect) => {
	return {
		_tag: OP_STATE_DONE$1,
		effect
	};
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/singleShotGen.js
/** @internal */
var SingleShotGen = class SingleShotGen {
	self;
	called = false;
	constructor(self) {
		this.self = self;
	}
	next(a) {
		return this.called ? {
			value: a,
			done: true
		} : (this.called = true, {
			value: this.self,
			done: false
		});
	}
	return(a) {
		return {
			value: a,
			done: true
		};
	}
	throw(e) {
		throw e;
	}
	[Symbol.iterator]() {
		return new SingleShotGen(this.self);
	}
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/core.js
/**
* @internal
*/
const blocked = (blockedRequests, _continue) => {
	const effect = new EffectPrimitive("Blocked");
	effect.effect_instruction_i0 = blockedRequests;
	effect.effect_instruction_i1 = _continue;
	return effect;
};
/**
* @internal
*/
const runRequestBlock = (blockedRequests) => {
	const effect = new EffectPrimitive("RunBlocked");
	effect.effect_instruction_i0 = blockedRequests;
	return effect;
};
/** @internal */
const EffectTypeId = /*#__PURE__*/ Symbol.for("effect/Effect");
/** @internal */
var RevertFlags = class {
	patch;
	op;
	_op = OP_REVERT_FLAGS;
	constructor(patch, op) {
		this.patch = patch;
		this.op = op;
	}
};
var EffectPrimitive = class {
	_op;
	effect_instruction_i0 = void 0;
	effect_instruction_i1 = void 0;
	effect_instruction_i2 = void 0;
	trace = void 0;
	[EffectTypeId] = effectVariance;
	constructor(_op) {
		this._op = _op;
	}
	[symbol](that) {
		return this === that;
	}
	[symbol$1]() {
		return cached(this, random(this));
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
	toJSON() {
		return {
			_id: "Effect",
			_op: this._op,
			effect_instruction_i0: toJSON(this.effect_instruction_i0),
			effect_instruction_i1: toJSON(this.effect_instruction_i1),
			effect_instruction_i2: toJSON(this.effect_instruction_i2)
		};
	}
	toString() {
		return format$4(this.toJSON());
	}
	[NodeInspectSymbol]() {
		return this.toJSON();
	}
	[Symbol.iterator]() {
		return new SingleShotGen(new YieldWrap(this));
	}
};
/** @internal */
var EffectPrimitiveFailure = class {
	_op;
	effect_instruction_i0 = void 0;
	effect_instruction_i1 = void 0;
	effect_instruction_i2 = void 0;
	trace = void 0;
	[EffectTypeId] = effectVariance;
	constructor(_op) {
		this._op = _op;
		this._tag = _op;
	}
	[symbol](that) {
		return exitIsExit(that) && that._op === "Failure" && equals$2(this.effect_instruction_i0, that.effect_instruction_i0);
	}
	[symbol$1]() {
		return pipe(string(this._tag), combine$7(hash(this.effect_instruction_i0)), cached(this));
	}
	get cause() {
		return this.effect_instruction_i0;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
	toJSON() {
		return {
			_id: "Exit",
			_tag: this._op,
			cause: this.cause.toJSON()
		};
	}
	toString() {
		return format$4(this.toJSON());
	}
	[NodeInspectSymbol]() {
		return this.toJSON();
	}
	[Symbol.iterator]() {
		return new SingleShotGen(new YieldWrap(this));
	}
};
/** @internal */
var EffectPrimitiveSuccess = class {
	_op;
	effect_instruction_i0 = void 0;
	effect_instruction_i1 = void 0;
	effect_instruction_i2 = void 0;
	trace = void 0;
	[EffectTypeId] = effectVariance;
	constructor(_op) {
		this._op = _op;
		this._tag = _op;
	}
	[symbol](that) {
		return exitIsExit(that) && that._op === "Success" && equals$2(this.effect_instruction_i0, that.effect_instruction_i0);
	}
	[symbol$1]() {
		return pipe(string(this._tag), combine$7(hash(this.effect_instruction_i0)), cached(this));
	}
	get value() {
		return this.effect_instruction_i0;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
	toJSON() {
		return {
			_id: "Exit",
			_tag: this._op,
			value: toJSON(this.value)
		};
	}
	toString() {
		return format$4(this.toJSON());
	}
	[NodeInspectSymbol]() {
		return this.toJSON();
	}
	[Symbol.iterator]() {
		return new SingleShotGen(new YieldWrap(this));
	}
};
/** @internal */
const isEffect$1 = (u) => hasProperty(u, EffectTypeId);
const withFiberRuntime$1 = (withRuntime) => {
	const effect = new EffectPrimitive(OP_WITH_RUNTIME);
	effect.effect_instruction_i0 = withRuntime;
	return effect;
};
const acquireUseRelease$3 = /*#__PURE__*/ dual(3, (acquire, use, release) => uninterruptibleMask$2((restore) => flatMap$6(acquire, (a) => flatMap$6(exit$1(suspend$7(() => restore(use(a)))), (exit) => {
	return suspend$7(() => release(a, exit)).pipe(matchCauseEffect$2({
		onFailure: (cause) => {
			switch (exit._tag) {
				case OP_FAILURE: return failCause$6(sequential$3(exit.effect_instruction_i0, cause));
				case OP_SUCCESS: return failCause$6(cause);
			}
		},
		onSuccess: () => exit
	}));
}))));
const as$2 = /*#__PURE__*/ dual(2, (self, value) => flatMap$6(self, () => succeed$8(value)));
const asVoid$1 = (self) => as$2(self, void 0);
const custom = function() {
	const wrapper = new EffectPrimitive(OP_COMMIT);
	switch (arguments.length) {
		case 2:
			wrapper.effect_instruction_i0 = arguments[0];
			wrapper.commit = arguments[1];
			break;
		case 3:
			wrapper.effect_instruction_i0 = arguments[0];
			wrapper.effect_instruction_i1 = arguments[1];
			wrapper.commit = arguments[2];
			break;
		case 4:
			wrapper.effect_instruction_i0 = arguments[0];
			wrapper.effect_instruction_i1 = arguments[1];
			wrapper.effect_instruction_i2 = arguments[2];
			wrapper.commit = arguments[3];
			break;
		default: throw new Error(getBugErrorMessage("you're not supposed to end up here"));
	}
	return wrapper;
};
const unsafeAsync = (register, blockingOn = none$2) => {
	const effect = new EffectPrimitive(OP_ASYNC);
	let cancelerRef = void 0;
	effect.effect_instruction_i0 = (resume) => {
		cancelerRef = register(resume);
	};
	effect.effect_instruction_i1 = blockingOn;
	return onInterrupt(effect, (_) => isEffect$1(cancelerRef) ? cancelerRef : void_$4);
};
const asyncInterrupt = (register, blockingOn = none$2) => suspend$7(() => unsafeAsync(register, blockingOn));
const async_ = (resume, blockingOn = none$2) => {
	return custom(resume, function() {
		let backingResume = void 0;
		let pendingEffect = void 0;
		function proxyResume(effect) {
			if (backingResume) backingResume(effect);
			else if (pendingEffect === void 0) pendingEffect = effect;
		}
		const effect = new EffectPrimitive(OP_ASYNC);
		effect.effect_instruction_i0 = (resume) => {
			backingResume = resume;
			if (pendingEffect) resume(pendingEffect);
		};
		effect.effect_instruction_i1 = blockingOn;
		let cancelerRef = void 0;
		let controllerRef = void 0;
		if (this.effect_instruction_i0.length !== 1) {
			controllerRef = new AbortController();
			cancelerRef = internalCall(() => this.effect_instruction_i0(proxyResume, controllerRef.signal));
		} else cancelerRef = internalCall(() => this.effect_instruction_i0(proxyResume));
		return cancelerRef || controllerRef ? onInterrupt(effect, (_) => {
			if (controllerRef) controllerRef.abort();
			return cancelerRef ?? void_$4;
		}) : effect;
	});
};
const catchAllCause$1 = /*#__PURE__*/ dual(2, (self, f) => {
	const effect = new EffectPrimitive(OP_ON_FAILURE);
	effect.effect_instruction_i0 = self;
	effect.effect_instruction_i1 = f;
	return effect;
});
const catchAll$1 = /*#__PURE__*/ dual(2, (self, f) => matchEffect$1(self, {
	onFailure: f,
	onSuccess: succeed$8
}));
const catchIf = /*#__PURE__*/ dual(3, (self, predicate, f) => catchAllCause$1(self, (cause) => {
	const either = failureOrCause$1(cause);
	switch (either._tag) {
		case "Left": return predicate(either.left) ? f(either.left) : failCause$6(cause);
		case "Right": return failCause$6(either.right);
	}
}));
const originalSymbol = /*#__PURE__*/ Symbol.for("effect/OriginalAnnotation");
const capture = (obj, span) => {
	if (isSome(span)) return new Proxy(obj, {
		has(target, p) {
			return p === spanSymbol || p === originalSymbol || p in target;
		},
		get(target, p) {
			if (p === spanSymbol) return span.value;
			if (p === originalSymbol) return obj;
			return target[p];
		}
	});
	return obj;
};
const die$4 = (defect) => isObject(defect) && !(spanSymbol in defect) ? withFiberRuntime$1((fiber) => failCause$6(die$5(capture(defect, currentSpanFromFiber(fiber))))) : failCause$6(die$5(defect));
const dieMessage$1 = (message) => failCauseSync$1(() => die$5(new RuntimeException(message)));
const either$2 = (self) => matchEffect$1(self, {
	onFailure: (e) => succeed$8(left(e)),
	onSuccess: (a) => succeed$8(right(a))
});
const exit$1 = (self) => matchCause$1(self, {
	onFailure: exitFailCause$1,
	onSuccess: exitSucceed$1
});
const fail$7 = (error) => isObject(error) && !(spanSymbol in error) ? withFiberRuntime$1((fiber) => failCause$6(fail$8(capture(error, currentSpanFromFiber(fiber))))) : failCause$6(fail$8(error));
const failSync = (evaluate) => flatMap$6(sync$2(evaluate), fail$7);
const failCause$6 = (cause) => {
	const effect = new EffectPrimitiveFailure(OP_FAILURE);
	effect.effect_instruction_i0 = cause;
	return effect;
};
const failCauseSync$1 = (evaluate) => flatMap$6(sync$2(evaluate), failCause$6);
const fiberId = /*#__PURE__*/ withFiberRuntime$1((state) => succeed$8(state.id()));
const fiberIdWith$1 = (f) => withFiberRuntime$1((state) => f(state.id()));
const flatMap$6 = /*#__PURE__*/ dual(2, (self, f) => {
	const effect = new EffectPrimitive(OP_ON_SUCCESS);
	effect.effect_instruction_i0 = self;
	effect.effect_instruction_i1 = f;
	return effect;
});
const step = (self) => {
	const effect = new EffectPrimitive("OnStep");
	effect.effect_instruction_i0 = self;
	return effect;
};
const flatten$6 = (self) => flatMap$6(self, identity);
const matchCause$1 = /*#__PURE__*/ dual(2, (self, options) => matchCauseEffect$2(self, {
	onFailure: (cause) => succeed$8(options.onFailure(cause)),
	onSuccess: (a) => succeed$8(options.onSuccess(a))
}));
const matchCauseEffect$2 = /*#__PURE__*/ dual(2, (self, options) => {
	const effect = new EffectPrimitive(OP_ON_SUCCESS_AND_FAILURE);
	effect.effect_instruction_i0 = self;
	effect.effect_instruction_i1 = options.onFailure;
	effect.effect_instruction_i2 = options.onSuccess;
	return effect;
});
const matchEffect$1 = /*#__PURE__*/ dual(2, (self, options) => matchCauseEffect$2(self, {
	onFailure: (cause) => {
		if (defects(cause).length > 0) return failCause$6(electFailures(cause));
		const failures$2 = failures(cause);
		if (failures$2.length > 0) return options.onFailure(unsafeHead(failures$2));
		return failCause$6(cause);
	},
	onSuccess: options.onSuccess
}));
const forEachSequential = /*#__PURE__*/ dual(2, (self, f) => suspend$7(() => {
	const arr = fromIterable$6(self);
	const ret = allocate(arr.length);
	let i = 0;
	return as$2(whileLoop({
		while: () => i < arr.length,
		body: () => f(arr[i], i),
		step: (b) => {
			ret[i++] = b;
		}
	}), ret);
}));
const forEachSequentialDiscard = /*#__PURE__*/ dual(2, (self, f) => suspend$7(() => {
	const arr = fromIterable$6(self);
	let i = 0;
	return whileLoop({
		while: () => i < arr.length,
		body: () => f(arr[i], i),
		step: () => {
			i++;
		}
	});
}));
const interrupt$4 = /*#__PURE__*/ flatMap$6(fiberId, (fiberId) => interruptWith(fiberId));
const interruptWith = (fiberId) => failCause$6(interrupt$5(fiberId));
const interruptible$2 = (self) => {
	const effect = new EffectPrimitive(OP_UPDATE_RUNTIME_FLAGS);
	effect.effect_instruction_i0 = enable(1);
	effect.effect_instruction_i1 = () => self;
	return effect;
};
const intoDeferred$1 = /*#__PURE__*/ dual(2, (self, deferred) => uninterruptibleMask$2((restore) => flatMap$6(exit$1(restore(self)), (exit) => deferredDone(deferred, exit))));
const map$6 = /*#__PURE__*/ dual(2, (self, f) => flatMap$6(self, (a) => sync$2(() => f(a))));
const mapBoth$3 = /*#__PURE__*/ dual(2, (self, options) => matchEffect$1(self, {
	onFailure: (e) => failSync(() => options.onFailure(e)),
	onSuccess: (a) => sync$2(() => options.onSuccess(a))
}));
const mapError$2 = /*#__PURE__*/ dual(2, (self, f) => matchCauseEffect$2(self, {
	onFailure: (cause) => {
		const either = failureOrCause$1(cause);
		switch (either._tag) {
			case "Left": return failSync(() => f(either.left));
			case "Right": return failCause$6(either.right);
		}
	},
	onSuccess: succeed$8
}));
const onError$1 = /*#__PURE__*/ dual(2, (self, cleanup) => onExit$1(self, (exit) => exitIsSuccess(exit) ? void_$4 : cleanup(exit.effect_instruction_i0)));
const onExit$1 = /*#__PURE__*/ dual(2, (self, cleanup) => uninterruptibleMask$2((restore) => matchCauseEffect$2(restore(self), {
	onFailure: (cause1) => {
		const result = exitFailCause$1(cause1);
		return matchCauseEffect$2(cleanup(result), {
			onFailure: (cause2) => exitFailCause$1(sequential$3(cause1, cause2)),
			onSuccess: () => result
		});
	},
	onSuccess: (success) => {
		const result = exitSucceed$1(success);
		return zipRight$3(cleanup(result), result);
	}
})));
const onInterrupt = /*#__PURE__*/ dual(2, (self, cleanup) => onExit$1(self, exitMatch({
	onFailure: (cause) => isInterruptedOnly$1(cause) ? asVoid$1(cleanup(interruptors$1(cause))) : void_$4,
	onSuccess: () => void_$4
})));
const orElse$4 = /*#__PURE__*/ dual(2, (self, that) => attemptOrElse(self, that, succeed$8));
const orDie$1 = (self) => orDieWith(self, identity);
const orDieWith = /*#__PURE__*/ dual(2, (self, f) => matchEffect$1(self, {
	onFailure: (e) => die$4(f(e)),
	onSuccess: succeed$8
}));
const succeed$8 = (value) => {
	const effect = new EffectPrimitiveSuccess(OP_SUCCESS);
	effect.effect_instruction_i0 = value;
	return effect;
};
const suspend$7 = (evaluate) => {
	const effect = new EffectPrimitive(OP_COMMIT);
	effect.commit = evaluate;
	return effect;
};
const sync$2 = (thunk) => {
	const effect = new EffectPrimitive(OP_SYNC);
	effect.effect_instruction_i0 = thunk;
	return effect;
};
const tap$1 = /*#__PURE__*/ dual((args) => args.length === 3 || args.length === 2 && !(isObject(args[1]) && "onlyEffect" in args[1]), (self, f) => flatMap$6(self, (a) => {
	const b = typeof f === "function" ? f(a) : f;
	if (isEffect$1(b)) return as$2(b, a);
	else if (isPromiseLike(b)) return unsafeAsync((resume) => {
		b.then((_) => resume(succeed$8(a)), (e) => resume(fail$7(new UnknownException(e, "An unknown error occurred in Effect.tap"))));
	});
	return succeed$8(a);
}));
const transplant = (f) => withFiberRuntime$1((state) => {
	const scope = pipe(state.getFiberRef(currentForkScopeOverride), getOrElse(() => state.scope()));
	return f(fiberRefLocally(currentForkScopeOverride, some(scope)));
});
const attemptOrElse = /*#__PURE__*/ dual(3, (self, that, onSuccess) => matchCauseEffect$2(self, {
	onFailure: (cause) => {
		if (defects(cause).length > 0) return failCause$6(getOrThrow$1(keepDefectsAndElectFailures(cause)));
		return that();
	},
	onSuccess
}));
const uninterruptible$1 = (self) => {
	const effect = new EffectPrimitive(OP_UPDATE_RUNTIME_FLAGS);
	effect.effect_instruction_i0 = disable(1);
	effect.effect_instruction_i1 = () => self;
	return effect;
};
const uninterruptibleMask$2 = (f) => custom(f, function() {
	const effect = new EffectPrimitive(OP_UPDATE_RUNTIME_FLAGS);
	effect.effect_instruction_i0 = disable(1);
	effect.effect_instruction_i1 = (oldFlags) => interruption(oldFlags) ? internalCall(() => this.effect_instruction_i0(interruptible$2)) : internalCall(() => this.effect_instruction_i0(uninterruptible$1));
	return effect;
});
const void_$4 = /*#__PURE__*/ succeed$8(void 0);
const updateRuntimeFlags = (patch) => {
	const effect = new EffectPrimitive(OP_UPDATE_RUNTIME_FLAGS);
	effect.effect_instruction_i0 = patch;
	effect.effect_instruction_i1 = void 0;
	return effect;
};
const whenEffect = /*#__PURE__*/ dual(2, (self, condition) => flatMap$6(condition, (b) => {
	if (b) return pipe(self, map$6(some));
	return succeed$8(none$4());
}));
const whileLoop = (options) => {
	const effect = new EffectPrimitive(OP_WHILE);
	effect.effect_instruction_i0 = options.while;
	effect.effect_instruction_i1 = options.body;
	effect.effect_instruction_i2 = options.step;
	return effect;
};
const fromIterator = (iterator) => suspend$7(() => {
	const effect = new EffectPrimitive(OP_ITERATOR);
	effect.effect_instruction_i0 = iterator();
	return effect;
});
const gen$1 = function() {
	const f = arguments.length === 1 ? arguments[0] : arguments[1].bind(arguments[0]);
	return fromIterator(() => f(pipe));
};
/** @internal */
const fnUntraced$1 = (body, ...pipeables) => Object.defineProperty(pipeables.length === 0 ? function(...args) {
	return fromIterator(() => body.apply(this, args));
} : function(...args) {
	let effect = fromIterator(() => body.apply(this, args));
	for (const x of pipeables) effect = x(effect, ...args);
	return effect;
}, "length", {
	value: body.length,
	configurable: true
});
const withRuntimeFlags = /*#__PURE__*/ dual(2, (self, update) => {
	const effect = new EffectPrimitive(OP_UPDATE_RUNTIME_FLAGS);
	effect.effect_instruction_i0 = update;
	effect.effect_instruction_i1 = () => self;
	return effect;
});
const yieldNow$2 = (options) => {
	const effect = new EffectPrimitive(OP_YIELD$1);
	return typeof options?.priority !== "undefined" ? withSchedulingPriority(effect, options.priority) : effect;
};
const zip$3 = /*#__PURE__*/ dual(2, (self, that) => flatMap$6(self, (a) => map$6(that, (b) => [a, b])));
const zipLeft$1 = /*#__PURE__*/ dual(2, (self, that) => flatMap$6(self, (a) => as$2(that, a)));
const zipRight$3 = /*#__PURE__*/ dual(2, (self, that) => flatMap$6(self, () => that));
const zipWith$2 = /*#__PURE__*/ dual(3, (self, that, f) => flatMap$6(self, (a) => map$6(that, (b) => f(a, b))));
const interruptFiber = (self) => flatMap$6(fiberId, (fiberId) => pipe(self, interruptAsFiber(fiberId)));
const interruptAsFiber = /*#__PURE__*/ dual(2, (self, fiberId) => flatMap$6(self.interruptAsFork(fiberId), () => self.await));
/** @internal */
const logLevelAll = {
	_tag: "All",
	syslog: 0,
	label: "ALL",
	ordinal: Number.MIN_SAFE_INTEGER,
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const logLevelFatal = {
	_tag: "Fatal",
	syslog: 2,
	label: "FATAL",
	ordinal: 5e4,
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const logLevelError = {
	_tag: "Error",
	syslog: 3,
	label: "ERROR",
	ordinal: 4e4,
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const logLevelWarning = {
	_tag: "Warning",
	syslog: 4,
	label: "WARN",
	ordinal: 3e4,
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const logLevelInfo = {
	_tag: "Info",
	syslog: 6,
	label: "INFO",
	ordinal: 2e4,
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const logLevelDebug = {
	_tag: "Debug",
	syslog: 7,
	label: "DEBUG",
	ordinal: 1e4,
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const logLevelTrace = {
	_tag: "Trace",
	syslog: 7,
	label: "TRACE",
	ordinal: 0,
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const logLevelNone = {
	_tag: "None",
	syslog: 7,
	label: "OFF",
	ordinal: Number.MAX_SAFE_INTEGER,
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const FiberRefTypeId = /*#__PURE__*/ Symbol.for("effect/FiberRef");
const fiberRefVariance = { 
/* c8 ignore next */
_A: (_) => _ };
const fiberRefGet = (self) => withFiberRuntime$1((fiber) => exitSucceed$1(fiber.getFiberRef(self)));
const fiberRefGetWith = /*#__PURE__*/ dual(2, (self, f) => flatMap$6(fiberRefGet(self), f));
const fiberRefSet = /*#__PURE__*/ dual(2, (self, value) => fiberRefModify(self, () => [void 0, value]));
const fiberRefModify = /*#__PURE__*/ dual(2, (self, f) => withFiberRuntime$1((state) => {
	const [b, a] = f(state.getFiberRef(self));
	state.setFiberRef(self, a);
	return succeed$8(b);
}));
const fiberRefLocally = /*#__PURE__*/ dual(3, (use, self, value) => acquireUseRelease$3(zipLeft$1(fiberRefGet(self), fiberRefSet(self, value)), () => use, (oldValue) => fiberRefSet(self, oldValue)));
const fiberRefLocallyWith = /*#__PURE__*/ dual(3, (use, self, f) => fiberRefGetWith(self, (a) => fiberRefLocally(use, self, f(a))));
/** @internal */
const fiberRefUnsafeMake = (initial, options) => fiberRefUnsafeMakePatch(initial, {
	differ: update$3(),
	fork: options?.fork ?? identity,
	join: options?.join
});
/** @internal */
const fiberRefUnsafeMakeHashSet = (initial) => {
	const differ = hashSet();
	return fiberRefUnsafeMakePatch(initial, {
		differ,
		fork: differ.empty
	});
};
/** @internal */
const fiberRefUnsafeMakeReadonlyArray = (initial) => {
	const differ = readonlyArray(update$3());
	return fiberRefUnsafeMakePatch(initial, {
		differ,
		fork: differ.empty
	});
};
/** @internal */
const fiberRefUnsafeMakeContext = (initial) => {
	const differ = environment();
	return fiberRefUnsafeMakePatch(initial, {
		differ,
		fork: differ.empty
	});
};
/** @internal */
const fiberRefUnsafeMakePatch = (initial, options) => {
	return {
		...CommitPrototype,
		[FiberRefTypeId]: fiberRefVariance,
		initial,
		commit() {
			return fiberRefGet(this);
		},
		diff: (oldValue, newValue) => options.differ.diff(oldValue, newValue),
		combine: (first, second) => options.differ.combine(first, second),
		patch: (patch) => (oldValue) => options.differ.patch(patch, oldValue),
		fork: options.fork,
		join: options.join ?? ((_, n) => n)
	};
};
/** @internal */
const fiberRefUnsafeMakeRuntimeFlags = (initial) => fiberRefUnsafeMakePatch(initial, {
	differ: differ$1,
	fork: differ$1.empty
});
/** @internal */
const currentContext$1 = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/FiberRef/currentContext"), () => fiberRefUnsafeMakeContext(empty$25()));
/** @internal */
const currentSchedulingPriority = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/FiberRef/currentSchedulingPriority"), () => fiberRefUnsafeMake(0));
/** @internal */
const currentMaxOpsBeforeYield = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/FiberRef/currentMaxOpsBeforeYield"), () => fiberRefUnsafeMake(2048));
/** @internal */
const currentLogAnnotations = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/FiberRef/currentLogAnnotation"), () => fiberRefUnsafeMake(empty$18()));
/** @internal */
const currentLogLevel = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/FiberRef/currentLogLevel"), () => fiberRefUnsafeMake(logLevelInfo));
/** @internal */
const currentLogSpan = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/FiberRef/currentLogSpan"), () => fiberRefUnsafeMake(empty$17()));
/** @internal */
const withSchedulingPriority = /*#__PURE__*/ dual(2, (self, scheduler) => fiberRefLocally(self, currentSchedulingPriority, scheduler));
/** @internal */
const currentConcurrency = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/FiberRef/currentConcurrency"), () => fiberRefUnsafeMake("unbounded"));
/**
* @internal
*/
const currentRequestBatching = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/FiberRef/currentRequestBatching"), () => fiberRefUnsafeMake(true));
/** @internal */
const currentUnhandledErrorLogLevel = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/FiberRef/currentUnhandledErrorLogLevel"), () => fiberRefUnsafeMake(some(logLevelDebug)));
/** @internal */
const currentVersionMismatchErrorLogLevel = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/FiberRef/versionMismatchErrorLogLevel"), () => fiberRefUnsafeMake(some(logLevelWarning)));
/** @internal */
const currentMetricLabels = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/FiberRef/currentMetricLabels"), () => fiberRefUnsafeMakeReadonlyArray(empty$23()));
/** @internal */
const currentForkScopeOverride = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/FiberRef/currentForkScopeOverride"), () => fiberRefUnsafeMake(none$4(), {
	fork: () => none$4(),
	join: (parent, _) => parent
}));
/** @internal */
const currentInterruptedCause = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/FiberRef/currentInterruptedCause"), () => fiberRefUnsafeMake(empty$12, {
	fork: () => empty$12,
	join: (parent, _) => parent
}));
/** @internal */
const ScopeTypeId = /*#__PURE__*/ Symbol.for("effect/Scope");
/** @internal */
const CloseableScopeTypeId = /*#__PURE__*/ Symbol.for("effect/CloseableScope");
const scopeAddFinalizer = (self, finalizer) => self.addFinalizer(() => asVoid$1(finalizer));
const scopeAddFinalizerExit = (self, finalizer) => self.addFinalizer(finalizer);
const scopeClose = (self, exit) => self.close(exit);
const scopeFork = (self, strategy) => self.fork(strategy);
/** @internal */
const causeSquash = (self) => {
	return causeSquashWith(identity)(self);
};
/** @internal */
const causeSquashWith = /*#__PURE__*/ dual(2, (self, f) => {
	const option = pipe(self, failureOption, map$13(f));
	switch (option._tag) {
		case "None": return pipe(defects(self), head, match$9({
			onNone: () => {
				const interrupts = fromIterable$6(interruptors$1(self)).flatMap((fiberId) => fromIterable$6(ids(fiberId)).map((id) => `#${id}`));
				return new InterruptedException(interrupts ? `Interrupted by fibers: ${interrupts.join(", ")}` : void 0);
			},
			onSome: identity
		}));
		case "Some": return option.value;
	}
});
/** @internal */
const YieldableError$1 = /*#__PURE__*/ function() {
	class YieldableError extends globalThis.Error {
		commit() {
			return fail$7(this);
		}
		toJSON() {
			const obj = { ...this };
			if (this.message) obj.message = this.message;
			if (this.cause) obj.cause = this.cause;
			return obj;
		}
		[NodeInspectSymbol]() {
			if (this.toString !== globalThis.Error.prototype.toString) return this.stack ? `${this.toString()}\n${this.stack.split("\n").slice(1).join("\n")}` : this.toString();
			else if ("Bun" in globalThis) return pretty$1(fail$8(this), { renderErrorCause: true });
			return this;
		}
	}
	Object.assign(YieldableError.prototype, StructuralCommitPrototype);
	return YieldableError;
}();
const makeException = (proto, tag) => {
	class Base extends YieldableError$1 {
		_tag = tag;
	}
	Object.assign(Base.prototype, proto);
	Base.prototype.name = tag;
	return Base;
};
/** @internal */
const RuntimeExceptionTypeId = /*#__PURE__*/ Symbol.for("effect/Cause/errors/RuntimeException");
/** @internal */
const RuntimeException = /*#__PURE__*/ makeException({ [RuntimeExceptionTypeId]: RuntimeExceptionTypeId }, "RuntimeException");
/** @internal */
const InterruptedExceptionTypeId = /*#__PURE__*/ Symbol.for("effect/Cause/errors/InterruptedException");
/** @internal */
const InterruptedException = /*#__PURE__*/ makeException({ [InterruptedExceptionTypeId]: InterruptedExceptionTypeId }, "InterruptedException");
/** @internal */
const isInterruptedException = (u) => hasProperty(u, InterruptedExceptionTypeId);
/** @internal */
const IllegalArgumentExceptionTypeId = /*#__PURE__*/ Symbol.for("effect/Cause/errors/IllegalArgument");
/** @internal */
const IllegalArgumentException$1 = /*#__PURE__*/ makeException({ [IllegalArgumentExceptionTypeId]: IllegalArgumentExceptionTypeId }, "IllegalArgumentException");
/** @internal */
const NoSuchElementExceptionTypeId = /*#__PURE__*/ Symbol.for("effect/Cause/errors/NoSuchElement");
/** @internal */
const NoSuchElementException$2 = /*#__PURE__*/ makeException({ [NoSuchElementExceptionTypeId]: NoSuchElementExceptionTypeId }, "NoSuchElementException");
/** @internal */
const TimeoutExceptionTypeId = /*#__PURE__*/ Symbol.for("effect/Cause/errors/Timeout");
/** @internal */
const TimeoutException$1 = /*#__PURE__*/ makeException({ [TimeoutExceptionTypeId]: TimeoutExceptionTypeId }, "TimeoutException");
/** @internal */
const timeoutExceptionFromDuration = (duration) => new TimeoutException$1(`Operation timed out after '${format$3(duration)}'`);
/** @internal */
const UnknownExceptionTypeId = /*#__PURE__*/ Symbol.for("effect/Cause/errors/UnknownException");
/** @internal */
const UnknownException = /*#__PURE__*/ function() {
	class UnknownException extends YieldableError$1 {
		_tag = "UnknownException";
		error;
		constructor(cause, message) {
			super(message ?? "An unknown error occurred", { cause });
			this.error = cause;
		}
	}
	Object.assign(UnknownException.prototype, {
		[UnknownExceptionTypeId]: UnknownExceptionTypeId,
		name: "UnknownException"
	});
	return UnknownException;
}();
/** @internal */
const exitIsExit = (u) => isEffect$1(u) && "_tag" in u && (u._tag === "Success" || u._tag === "Failure");
/** @internal */
const exitIsFailure = (self) => self._tag === "Failure";
/** @internal */
const exitIsSuccess = (self) => self._tag === "Success";
/** @internal */
const exitAs = /*#__PURE__*/ dual(2, (self, value) => {
	switch (self._tag) {
		case OP_FAILURE: return exitFailCause$1(self.effect_instruction_i0);
		case OP_SUCCESS: return exitSucceed$1(value);
	}
});
/** @internal */
const exitAsVoid = (self) => exitAs(self, void 0);
/** @internal */
const exitCollectAll = (exits, options) => exitCollectAllInternal(exits, options?.parallel ? parallel$3 : sequential$3);
/** @internal */
const exitDie$1 = (defect) => exitFailCause$1(die$5(defect));
/** @internal */
const exitFail = (error) => exitFailCause$1(fail$8(error));
/** @internal */
const exitFailCause$1 = (cause) => {
	const effect = new EffectPrimitiveFailure(OP_FAILURE);
	effect.effect_instruction_i0 = cause;
	return effect;
};
/** @internal */
const exitFlatMap = /*#__PURE__*/ dual(2, (self, f) => {
	switch (self._tag) {
		case OP_FAILURE: return exitFailCause$1(self.effect_instruction_i0);
		case OP_SUCCESS: return f(self.effect_instruction_i0);
	}
});
/** @internal */
const exitFlatten = (self) => pipe(self, exitFlatMap(identity));
/** @internal */
const exitInterrupt$1 = (fiberId) => exitFailCause$1(interrupt$5(fiberId));
/** @internal */
const exitMap = /*#__PURE__*/ dual(2, (self, f) => {
	switch (self._tag) {
		case OP_FAILURE: return exitFailCause$1(self.effect_instruction_i0);
		case OP_SUCCESS: return exitSucceed$1(f(self.effect_instruction_i0));
	}
});
/** @internal */
const exitMapBoth = /*#__PURE__*/ dual(2, (self, { onFailure, onSuccess }) => {
	switch (self._tag) {
		case OP_FAILURE: return exitFailCause$1(pipe(self.effect_instruction_i0, map$7(onFailure)));
		case OP_SUCCESS: return exitSucceed$1(onSuccess(self.effect_instruction_i0));
	}
});
/** @internal */
const exitMatch = /*#__PURE__*/ dual(2, (self, { onFailure, onSuccess }) => {
	switch (self._tag) {
		case OP_FAILURE: return onFailure(self.effect_instruction_i0);
		case OP_SUCCESS: return onSuccess(self.effect_instruction_i0);
	}
});
/** @internal */
const exitMatchEffect = /*#__PURE__*/ dual(2, (self, { onFailure, onSuccess }) => {
	switch (self._tag) {
		case OP_FAILURE: return onFailure(self.effect_instruction_i0);
		case OP_SUCCESS: return onSuccess(self.effect_instruction_i0);
	}
});
/** @internal */
const exitSucceed$1 = (value) => {
	const effect = new EffectPrimitiveSuccess(OP_SUCCESS);
	effect.effect_instruction_i0 = value;
	return effect;
};
/** @internal */
const exitVoid$1 = /*#__PURE__*/ exitSucceed$1(void 0);
/** @internal */
const exitZip = /*#__PURE__*/ dual(2, (self, that) => exitZipWith(self, that, {
	onSuccess: (a, a2) => [a, a2],
	onFailure: sequential$3
}));
/** @internal */
const exitZipRight = /*#__PURE__*/ dual(2, (self, that) => exitZipWith(self, that, {
	onSuccess: (_, a2) => a2,
	onFailure: sequential$3
}));
/** @internal */
const exitZipWith = /*#__PURE__*/ dual(3, (self, that, { onFailure, onSuccess }) => {
	switch (self._tag) {
		case OP_FAILURE: switch (that._tag) {
			case OP_SUCCESS: return exitFailCause$1(self.effect_instruction_i0);
			case OP_FAILURE: return exitFailCause$1(onFailure(self.effect_instruction_i0, that.effect_instruction_i0));
		}
		case OP_SUCCESS: switch (that._tag) {
			case OP_SUCCESS: return exitSucceed$1(onSuccess(self.effect_instruction_i0, that.effect_instruction_i0));
			case OP_FAILURE: return exitFailCause$1(that.effect_instruction_i0);
		}
	}
});
const exitCollectAllInternal = (exits, combineCauses) => {
	const list = fromIterable$5(exits);
	if (!isNonEmpty$4(list)) return none$4();
	return pipe(tailNonEmpty(list), reduce$9(pipe(headNonEmpty(list), exitMap(of$1)), (accumulator, current) => pipe(accumulator, exitZipWith(current, {
		onSuccess: (list, value) => pipe(list, prepend$1(value)),
		onFailure: combineCauses
	}))), exitMap(reverse$1), exitMap((chunk) => toReadonlyArray(chunk)), some);
};
/** @internal */
const deferredUnsafeMake = (fiberId) => {
	return {
		...CommitPrototype,
		[DeferredTypeId$1]: deferredVariance,
		state: make$39(pending([])),
		commit() {
			return deferredAwait(this);
		},
		blockingOn: fiberId
	};
};
const deferredMake = () => flatMap$6(fiberId, (id) => deferredMakeAs(id));
const deferredMakeAs = (fiberId) => sync$2(() => deferredUnsafeMake(fiberId));
const deferredAwait = (self) => asyncInterrupt((resume) => {
	const state = get$7(self.state);
	switch (state._tag) {
		case OP_STATE_DONE$1: return resume(state.effect);
		case OP_STATE_PENDING:
			state.joiners.push(resume);
			return deferredInterruptJoiner(self, resume);
	}
}, self.blockingOn);
const deferredComplete = /*#__PURE__*/ dual(2, (self, effect) => intoDeferred$1(effect, self));
const deferredCompleteWith = /*#__PURE__*/ dual(2, (self, effect) => sync$2(() => {
	const state = get$7(self.state);
	switch (state._tag) {
		case OP_STATE_DONE$1: return false;
		case OP_STATE_PENDING:
			set$4(self.state, done$5(effect));
			for (let i = 0, len = state.joiners.length; i < len; i++) state.joiners[i](effect);
			return true;
	}
}));
const deferredDone = /*#__PURE__*/ dual(2, (self, exit) => deferredCompleteWith(self, exit));
const deferredFail = /*#__PURE__*/ dual(2, (self, error) => deferredCompleteWith(self, fail$7(error)));
const deferredFailCause = /*#__PURE__*/ dual(2, (self, cause) => deferredCompleteWith(self, failCause$6(cause)));
const deferredInterrupt = (self) => flatMap$6(fiberId, (fiberId) => deferredCompleteWith(self, interruptWith(fiberId)));
const deferredInterruptWith = /*#__PURE__*/ dual(2, (self, fiberId) => deferredCompleteWith(self, interruptWith(fiberId)));
const deferredIsDone = (self) => sync$2(() => get$7(self.state)._tag === OP_STATE_DONE$1);
const deferredSucceed = /*#__PURE__*/ dual(2, (self, value) => deferredCompleteWith(self, succeed$8(value)));
/** @internal */
const deferredUnsafeDone = (self, effect) => {
	const state = get$7(self.state);
	if (state._tag === "Pending") {
		set$4(self.state, done$5(effect));
		for (let i = 0, len = state.joiners.length; i < len; i++) state.joiners[i](effect);
	}
};
const deferredInterruptJoiner = (self, joiner) => sync$2(() => {
	const state = get$7(self.state);
	if (state._tag === "Pending") {
		const index = state.joiners.indexOf(joiner);
		if (index >= 0) state.joiners.splice(index, 1);
	}
});
const constContext = /*#__PURE__*/ withFiberRuntime$1((fiber) => exitSucceed$1(fiber.currentContext));
const context$1 = () => constContext;
const contextWithEffect = (f) => flatMap$6(context$1(), f);
const provideContext$1 = /*#__PURE__*/ dual(2, (self, context) => fiberRefLocally(currentContext$1, context)(self));
const provideSomeContext = /*#__PURE__*/ dual(2, (self, context) => fiberRefLocallyWith(currentContext$1, (parent) => merge$4(parent, context))(self));
const mapInputContext = /*#__PURE__*/ dual(2, (self, f) => contextWithEffect((context) => provideContext$1(self, f(context))));
/** @internal */
const currentSpanFromFiber = (fiber) => {
	const span = fiber.currentSpan;
	return span !== void 0 && span._tag === "Span" ? some(span) : none$4();
};
/** @internal */
const ClockTypeId = /*#__PURE__*/ Symbol.for("effect/Clock");
/** @internal */
const clockTag = /*#__PURE__*/ GenericTag("effect/Clock");
/** @internal */
const MAX_TIMER_MILLIS = 2 ** 31 - 1;
/** @internal */
const globalClockScheduler = { unsafeSchedule(task, duration) {
	const millis = toMillis(duration);
	if (millis > MAX_TIMER_MILLIS) return constFalse;
	let completed = false;
	const handle = setTimeout(() => {
		completed = true;
		task();
	}, millis);
	return () => {
		clearTimeout(handle);
		return !completed;
	};
} };
const performanceNowNanos = /*#__PURE__*/ function() {
	const bigint1e6 = /*#__PURE__*/ BigInt(1e6);
	if (typeof performance === "undefined" || typeof performance.now !== "function") return () => BigInt(Date.now()) * bigint1e6;
	let origin;
	return () => {
		if (origin === void 0) origin = BigInt(Date.now()) * bigint1e6 - BigInt(Math.round(performance.now() * 1e6));
		return origin + BigInt(Math.round(performance.now() * 1e6));
	};
}();
const processOrPerformanceNow = /*#__PURE__*/ function() {
	const processHrtime = typeof process === "object" && "hrtime" in process && typeof process.hrtime.bigint === "function" ? process.hrtime : void 0;
	if (!processHrtime) return performanceNowNanos;
	const origin = /*#__PURE__*/ performanceNowNanos() - /*#__PURE__*/ processHrtime.bigint();
	return () => origin + processHrtime.bigint();
}();
/** @internal */
var ClockImpl = class {
	[ClockTypeId] = ClockTypeId;
	unsafeCurrentTimeMillis() {
		return Date.now();
	}
	unsafeCurrentTimeNanos() {
		return processOrPerformanceNow();
	}
	currentTimeMillis = /*#__PURE__*/ sync$2(() => this.unsafeCurrentTimeMillis());
	currentTimeNanos = /*#__PURE__*/ sync$2(() => this.unsafeCurrentTimeNanos());
	scheduler() {
		return succeed$8(globalClockScheduler);
	}
	sleep(duration) {
		return async_((resume) => {
			const canceler = globalClockScheduler.unsafeSchedule(() => resume(void_$4), duration);
			return asVoid$1(sync$2(canceler));
		});
	}
};
/** @internal */
const make$33 = () => new ClockImpl();
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Number.js
/**
* @memberof Number
* @since 2.0.0
* @category instances
*/
const Order$1 = number;
/**
* Tries to parse a `number` from a `string` using the `Number()` function. The
* following special string values are supported: "NaN", "Infinity",
* "-Infinity".
*
* @memberof Number
* @since 2.0.0
* @category constructors
*/
const parse = (s) => {
	if (s === "NaN") return some$1(NaN);
	if (s === "Infinity") return some$1(Infinity);
	if (s === "-Infinity") return some$1(-Infinity);
	if (s.trim() === "") return none$5;
	const n = Number(s);
	return Number.isNaN(n) ? none$5 : some$1(n);
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/RegExp.js
/**
* Escapes special characters in a regular expression pattern.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { RegExp } from "effect"
*
* assert.deepStrictEqual(RegExp.escape("a*b"), "a\\*b")
* ```
*
* @since 2.0.0
*/
const escape = (string) => string.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&");
/** @internal */
const OP_INVALID_DATA = "InvalidData";
/** @internal */
const OP_MISSING_DATA = "MissingData";
/** @internal */
const OP_SOURCE_UNAVAILABLE = "SourceUnavailable";
/** @internal */
const OP_UNSUPPORTED = "Unsupported";
/** @internal */
const ConfigErrorTypeId = /*#__PURE__*/ Symbol.for("effect/ConfigError");
/** @internal */
const proto$9 = {
	_tag: "ConfigError",
	[ConfigErrorTypeId]: ConfigErrorTypeId
};
/** @internal */
const And = (self, that) => {
	const error = Object.create(proto$9);
	error._op = "And";
	error.left = self;
	error.right = that;
	Object.defineProperty(error, "toString", {
		enumerable: false,
		value() {
			return `${this.left} and ${this.right}`;
		}
	});
	Object.defineProperty(error, "message", {
		enumerable: false,
		get() {
			return this.toString();
		}
	});
	return error;
};
/** @internal */
const Or = (self, that) => {
	const error = Object.create(proto$9);
	error._op = "Or";
	error.left = self;
	error.right = that;
	Object.defineProperty(error, "toString", {
		enumerable: false,
		value() {
			return `${this.left} or ${this.right}`;
		}
	});
	Object.defineProperty(error, "message", {
		enumerable: false,
		get() {
			return this.toString();
		}
	});
	return error;
};
/** @internal */
const InvalidData = (path, message, options = { pathDelim: "." }) => {
	const error = Object.create(proto$9);
	error._op = OP_INVALID_DATA;
	error.path = path;
	error.message = message;
	Object.defineProperty(error, "toString", {
		enumerable: false,
		value() {
			return `(Invalid data at ${pipe(this.path, join$3(options.pathDelim))}: "${this.message}")`;
		}
	});
	return error;
};
/** @internal */
const MissingData = (path, message, options = { pathDelim: "." }) => {
	const error = Object.create(proto$9);
	error._op = OP_MISSING_DATA;
	error.path = path;
	error.message = message;
	Object.defineProperty(error, "toString", {
		enumerable: false,
		value() {
			return `(Missing data at ${pipe(this.path, join$3(options.pathDelim))}: "${this.message}")`;
		}
	});
	return error;
};
/** @internal */
const SourceUnavailable = (path, message, cause, options = { pathDelim: "." }) => {
	const error = Object.create(proto$9);
	error._op = OP_SOURCE_UNAVAILABLE;
	error.path = path;
	error.message = message;
	error.cause = cause;
	Object.defineProperty(error, "toString", {
		enumerable: false,
		value() {
			return `(Source unavailable at ${pipe(this.path, join$3(options.pathDelim))}: "${this.message}")`;
		}
	});
	return error;
};
/** @internal */
const Unsupported = (path, message, options = { pathDelim: "." }) => {
	const error = Object.create(proto$9);
	error._op = OP_UNSUPPORTED;
	error.path = path;
	error.message = message;
	Object.defineProperty(error, "toString", {
		enumerable: false,
		value() {
			return `(Unsupported operation at ${pipe(this.path, join$3(options.pathDelim))}: "${this.message}")`;
		}
	});
	return error;
};
/** @internal */
const prefixed = /*#__PURE__*/ dual(2, (self, prefix) => {
	switch (self._op) {
		case "And": return And(prefixed(self.left, prefix), prefixed(self.right, prefix));
		case "Or": return Or(prefixed(self.left, prefix), prefixed(self.right, prefix));
		case OP_INVALID_DATA: return InvalidData([...prefix, ...self.path], self.message);
		case OP_MISSING_DATA: return MissingData([...prefix, ...self.path], self.message);
		case OP_SOURCE_UNAVAILABLE: return SourceUnavailable([...prefix, ...self.path], self.message, self.cause);
		case OP_UNSUPPORTED: return Unsupported([...prefix, ...self.path], self.message);
	}
});
/** @internal */
const reduceWithContext$1 = /*#__PURE__*/ dual(3, (self, context, reducer) => {
	const input = [self];
	const output = [];
	while (input.length > 0) {
		const error = input.pop();
		switch (error._op) {
			case "And":
				input.push(error.right);
				input.push(error.left);
				output.push(left({ _op: "AndCase" }));
				break;
			case "Or":
				input.push(error.right);
				input.push(error.left);
				output.push(left({ _op: "OrCase" }));
				break;
			case OP_INVALID_DATA:
				output.push(right(reducer.invalidDataCase(context, error.path, error.message)));
				break;
			case OP_MISSING_DATA:
				output.push(right(reducer.missingDataCase(context, error.path, error.message)));
				break;
			case OP_SOURCE_UNAVAILABLE:
				output.push(right(reducer.sourceUnavailableCase(context, error.path, error.message, error.cause)));
				break;
			case OP_UNSUPPORTED: output.push(right(reducer.unsupportedCase(context, error.path, error.message)));
		}
	}
	const accumulator = [];
	while (output.length > 0) {
		const either = output.pop();
		switch (either._op) {
			case "Left":
				switch (either.left._op) {
					case "AndCase": {
						const left = accumulator.pop();
						const right = accumulator.pop();
						const value = reducer.andCase(context, left, right);
						accumulator.push(value);
						break;
					}
					case "OrCase": {
						const left = accumulator.pop();
						const right = accumulator.pop();
						const value = reducer.orCase(context, left, right);
						accumulator.push(value);
						break;
					}
				}
				break;
			case "Right": accumulator.push(either.right);
		}
	}
	if (accumulator.length === 0) throw new Error("BUG: ConfigError.reduceWithContext - please report an issue at https://github.com/Effect-TS/effect/issues");
	return accumulator.pop();
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/configProvider/pathPatch.js
/** @internal */
const empty$11 = { _tag: "Empty" };
/** @internal */
const patch$3 = /*#__PURE__*/ dual(2, (path, patch) => {
	let input = of(patch);
	let output = path;
	while (isCons(input)) {
		const patch = input.head;
		switch (patch._tag) {
			case "Empty":
				input = input.tail;
				break;
			case "AndThen":
				input = cons(patch.first, cons(patch.second, input.tail));
				break;
			case "MapName":
				output = map$11(output, patch.f);
				input = input.tail;
				break;
			case "Nested":
				output = prepend$2(output, patch.name);
				input = input.tail;
				break;
			case "Unnested": if (pipe(head$1(output), contains(patch.name))) {
				output = tailNonEmpty$1(output);
				input = input.tail;
			} else return left(MissingData(output, `Expected ${patch.name} to be in path in ConfigProvider#unnested`));
		}
	}
	return right(output);
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/opCodes/config.js
/** @internal */
const OP_CONSTANT = "Constant";
/** @internal */
const OP_FAIL$1 = "Fail";
/** @internal */
const OP_FALLBACK = "Fallback";
/** @internal */
const OP_DESCRIBED = "Described";
/** @internal */
const OP_LAZY = "Lazy";
/** @internal */
const OP_MAP_OR_FAIL = "MapOrFail";
/** @internal */
const OP_NESTED = "Nested";
/** @internal */
const OP_PRIMITIVE = "Primitive";
/** @internal */
const OP_REDACTED = "Redacted";
/** @internal */
const OP_SEQUENCE = "Sequence";
/** @internal */
const OP_HASHMAP = "HashMap";
/** @internal */
const OP_ZIP_WITH$1 = "ZipWith";
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/configProvider.js
const concat = (l, r) => [...l, ...r];
/** @internal */
const ConfigProviderTypeId = /*#__PURE__*/ Symbol.for("effect/ConfigProvider");
/** @internal */
const configProviderTag = /*#__PURE__*/ GenericTag("effect/ConfigProvider");
/** @internal */
const FlatConfigProviderTypeId = /*#__PURE__*/ Symbol.for("effect/ConfigProviderFlat");
/** @internal */
const make$32 = (options) => ({
	[ConfigProviderTypeId]: ConfigProviderTypeId,
	pipe() {
		return pipeArguments(this, arguments);
	},
	...options
});
/** @internal */
const makeFlat = (options) => ({
	[FlatConfigProviderTypeId]: FlatConfigProviderTypeId,
	patch: options.patch,
	load: (path, config, split = true) => options.load(path, config, split),
	enumerateChildren: options.enumerateChildren
});
/** @internal */
const fromFlat = (flat) => make$32({
	load: (config) => flatMap$6(fromFlatLoop(flat, empty$23(), config, false), (chunk) => match$9(head$1(chunk), {
		onNone: () => fail$7(MissingData(empty$23(), `Expected a single value having structure: ${config}`)),
		onSome: succeed$8
	})),
	flattened: flat
});
/** @internal */
const fromEnv = (options) => {
	const { pathDelim, seqDelim } = Object.assign({}, {
		pathDelim: "_",
		seqDelim: ","
	}, options);
	const makePathString = (path) => pipe(path, join$3(pathDelim));
	const unmakePathString = (pathString) => pathString.split(pathDelim);
	const getEnv = () => typeof process !== "undefined" && "env" in process && typeof process.env === "object" ? process.env : {};
	const load = (path, primitive, split = true) => {
		const pathString = makePathString(path);
		const current = getEnv();
		return pipe(pathString in current ? some(current[pathString]) : none$4(), mapError$2(() => MissingData(path, `Expected ${pathString} to exist in the process context`)), flatMap$6((value) => parsePrimitive(value, path, primitive, seqDelim, split)));
	};
	const enumerateChildren = (path) => sync$2(() => {
		const current = getEnv();
		const filteredKeyPaths = Object.keys(current).map((value) => unmakePathString(value.toUpperCase())).filter((keyPath) => {
			for (let i = 0; i < path.length; i++) {
				const pathComponent = pipe(path, unsafeGet$1(i));
				const currentElement = keyPath[i];
				if (currentElement === void 0 || pathComponent !== currentElement) return false;
			}
			return true;
		}).flatMap((keyPath) => keyPath.slice(path.length, path.length + 1));
		return fromIterable$2(filteredKeyPaths);
	});
	return fromFlat(makeFlat({
		load,
		enumerateChildren,
		patch: empty$11
	}));
};
const extend$2 = (leftDef, rightDef, left, right) => {
	const leftPad = unfold$1(left.length, (index) => index >= right.length ? none$4() : some([leftDef(index), index + 1]));
	const rightPad = unfold$1(right.length, (index) => index >= left.length ? none$4() : some([rightDef(index), index + 1]));
	return [concat(left, leftPad), concat(right, rightPad)];
};
const appendConfigPath = (path, config) => {
	let op = config;
	if (op._tag === "Nested") {
		const out = path.slice();
		while (op._tag === "Nested") {
			out.push(op.name);
			op = op.config;
		}
		return out;
	}
	return path;
};
const RedactedConfigErrorReducer = {
	andCase: (_, left, right) => And(left, right),
	orCase: (_, left, right) => Or(left, right),
	invalidDataCase: (_, path) => InvalidData(path, "<redacted>"),
	missingDataCase: (_, path) => MissingData(path, "<redacted>"),
	sourceUnavailableCase: (_, path, _message, cause) => SourceUnavailable(path, "<redacted>", cause),
	unsupportedCase: (_, path) => Unsupported(path, "<redacted>")
};
const redactConfigError = (error) => reduceWithContext$1(error, void 0, RedactedConfigErrorReducer);
const fromFlatLoop = (flat, prefix, config, split) => {
	const op = config;
	switch (op._tag) {
		case OP_CONSTANT: return succeed$8(of$2(op.value));
		case OP_DESCRIBED: return suspend$7(() => fromFlatLoop(flat, prefix, op.config, split));
		case OP_FAIL$1: return fail$7(MissingData(prefix, op.message));
		case OP_FALLBACK: return pipe(suspend$7(() => fromFlatLoop(flat, prefix, op.first, split)), catchAll$1((error1) => {
			if (op.condition(error1)) return pipe(fromFlatLoop(flat, prefix, op.second, split), catchAll$1((error2) => fail$7(Or(error1, error2))));
			return fail$7(error1);
		}));
		case OP_LAZY: return suspend$7(() => fromFlatLoop(flat, prefix, op.config(), split));
		case OP_MAP_OR_FAIL: return suspend$7(() => pipe(fromFlatLoop(flat, prefix, op.original, split), flatMap$6(forEachSequential((a) => pipe(op.mapOrFail(a), mapError$2(prefixed(appendConfigPath(prefix, op.original))))))));
		case OP_NESTED: return suspend$7(() => fromFlatLoop(flat, concat(prefix, of$2(op.name)), op.config, split));
		case OP_PRIMITIVE: return pipe(patch$3(prefix, flat.patch), flatMap$6((prefix) => pipe(flat.load(prefix, op, split), flatMap$6((values) => {
			if (values.length === 0) {
				const name = pipe(last(prefix), getOrElse(() => "<n/a>"));
				return fail$7(MissingData([], `Expected ${op.description} with name ${name}`));
			}
			return succeed$8(values);
		}))));
		case OP_REDACTED: return suspend$7(() => pipe(fromFlatLoop(flat, prefix, op.original, split), mapError$2(redactConfigError), map$6(map$11(op.redact))));
		case OP_SEQUENCE: return pipe(patch$3(prefix, flat.patch), flatMap$6((patchedPrefix) => pipe(flat.enumerateChildren(patchedPrefix), flatMap$6(indicesFrom), flatMap$6((indices) => {
			if (indices.length === 0) return suspend$7(() => map$6(fromFlatLoop(flat, prefix, op.config, true), of$2));
			return pipe(forEachSequential(indices, (index) => fromFlatLoop(flat, append$2(prefix, `[${index}]`), op.config, true)), map$6((chunkChunk) => {
				const flattened = flatten$8(chunkChunk);
				if (flattened.length === 0) return of$2(empty$23());
				return of$2(flattened);
			}));
		}))));
		case OP_HASHMAP: return suspend$7(() => pipe(patch$3(prefix, flat.patch), flatMap$6((prefix) => pipe(flat.enumerateChildren(prefix), flatMap$6((keys) => {
			return pipe(keys, forEachSequential((key) => fromFlatLoop(flat, concat(prefix, of$2(key)), op.valueConfig, split)), map$6((matrix) => {
				if (matrix.length === 0) return of$2(empty$18());
				return pipe(transpose(matrix), map$11((values) => fromIterable$1(zip$4(fromIterable$6(keys), values))));
			}));
		})))));
		case OP_ZIP_WITH$1: return suspend$7(() => pipe(fromFlatLoop(flat, prefix, op.left, split), either$2, flatMap$6((left) => pipe(fromFlatLoop(flat, prefix, op.right, split), either$2, flatMap$6((right$9) => {
			if (isLeft(left) && isLeft(right$9)) return fail$7(And(left.left, right$9.left));
			if (isLeft(left) && isRight(right$9)) return fail$7(left.left);
			if (isRight(left) && isLeft(right$9)) return fail$7(right$9.left);
			if (isRight(left) && isRight(right$9)) {
				const path = pipe(prefix, join$3("."));
				const fail = fromFlatLoopFail(prefix, path);
				const [lefts, rights] = extend$2(fail, fail, pipe(left.right, map$11(right)), pipe(right$9.right, map$11(right)));
				return pipe(lefts, zip$4(rights), forEachSequential(([left, right]) => pipe(zip$3(left, right), map$6(([left, right]) => op.zip(left, right)))));
			}
			throw new Error("BUG: ConfigProvider.fromFlatLoop - please report an issue at https://github.com/Effect-TS/effect/issues");
		})))));
	}
};
const fromFlatLoopFail = (prefix, path) => (index) => left(MissingData(prefix, `The element at index ${index} in a sequence at path "${path}" was missing`));
const splitPathString = (text, delim) => {
	return text.split(new RegExp(`\\s*${escape(delim)}\\s*`));
};
const parsePrimitive = (text, path, primitive, delimiter, split) => {
	if (!split) return pipe(primitive.parse(text), mapBoth$3({
		onFailure: prefixed(path),
		onSuccess: of$2
	}));
	return pipe(splitPathString(text, delimiter), forEachSequential((char) => primitive.parse(char.trim())), mapError$2(prefixed(path)));
};
const transpose = (array) => {
	return Object.keys(array[0]).map((column) => array.map((row) => row[column]));
};
const indicesFrom = (quotedIndices) => pipe(forEachSequential(quotedIndices, parseQuotedIndex), mapBoth$3({
	onFailure: () => empty$23(),
	onSuccess: sort(Order$1)
}), either$2, map$6(merge$3));
const QUOTED_INDEX_REGEX = /^(\[(\d+)\])$/;
const parseQuotedIndex = (str) => {
	const match = str.match(QUOTED_INDEX_REGEX);
	if (match !== null) {
		const matchedIndex = match[2];
		return pipe(matchedIndex !== void 0 && matchedIndex.length > 0 ? some(matchedIndex) : none$4(), flatMap$9(parseInteger));
	}
	return none$4();
};
const parseInteger = (str) => {
	const parsedIndex = Number.parseInt(str);
	return Number.isNaN(parsedIndex) ? none$4() : some(parsedIndex);
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/defaultServices/console.js
/** @internal */
const TypeId$18 = /*#__PURE__*/ Symbol.for("effect/Console");
/** @internal */
const consoleTag = /*#__PURE__*/ GenericTag("effect/Console");
/** @internal */
const defaultConsole = {
	[TypeId$18]: TypeId$18,
	assert(condition, ...args) {
		return sync$2(() => {
			console.assert(condition, ...args);
		});
	},
	clear: /*#__PURE__*/ sync$2(() => {
		console.clear();
	}),
	count(label) {
		return sync$2(() => {
			console.count(label);
		});
	},
	countReset(label) {
		return sync$2(() => {
			console.countReset(label);
		});
	},
	debug(...args) {
		return sync$2(() => {
			console.debug(...args);
		});
	},
	dir(item, options) {
		return sync$2(() => {
			console.dir(item, options);
		});
	},
	dirxml(...args) {
		return sync$2(() => {
			console.dirxml(...args);
		});
	},
	error(...args) {
		return sync$2(() => {
			console.error(...args);
		});
	},
	group(options) {
		return options?.collapsed ? sync$2(() => console.groupCollapsed(options?.label)) : sync$2(() => console.group(options?.label));
	},
	groupEnd: /*#__PURE__*/ sync$2(() => {
		console.groupEnd();
	}),
	info(...args) {
		return sync$2(() => {
			console.info(...args);
		});
	},
	log(...args) {
		return sync$2(() => {
			console.log(...args);
		});
	},
	table(tabularData, properties) {
		return sync$2(() => {
			console.table(tabularData, properties);
		});
	},
	time(label) {
		return sync$2(() => console.time(label));
	},
	timeEnd(label) {
		return sync$2(() => console.timeEnd(label));
	},
	timeLog(label, ...args) {
		return sync$2(() => {
			console.timeLog(label, ...args);
		});
	},
	trace(...args) {
		return sync$2(() => {
			console.trace(...args);
		});
	},
	warn(...args) {
		return sync$2(() => {
			console.warn(...args);
		});
	},
	unsafe: console
};
/** @internal */
const RandomTypeId = /*#__PURE__*/ Symbol.for("effect/Random");
/** @internal */
const randomTag = /*#__PURE__*/ GenericTag("effect/Random");
/** @internal */
var RandomImpl = class {
	seed;
	[RandomTypeId] = RandomTypeId;
	PRNG;
	constructor(seed) {
		this.seed = seed;
		this.PRNG = new PCGRandom(seed);
	}
	get next() {
		return sync$2(() => this.PRNG.number());
	}
	get nextBoolean() {
		return map$6(this.next, (n) => n > .5);
	}
	get nextInt() {
		return sync$2(() => this.PRNG.integer(Number.MAX_SAFE_INTEGER));
	}
	nextRange(min, max) {
		return map$6(this.next, (n) => (max - min) * n + min);
	}
	nextIntBetween(min, max) {
		return sync$2(() => this.PRNG.integer(max - min) + min);
	}
	shuffle(elements) {
		return shuffleWith(elements, (n) => this.nextIntBetween(0, n));
	}
};
const shuffleWith = (elements, nextIntBounded) => {
	return suspend$7(() => pipe(sync$2(() => Array.from(elements)), flatMap$6((buffer) => {
		const numbers = [];
		for (let i = buffer.length; i >= 2; i = i - 1) numbers.push(i);
		return pipe(numbers, forEachSequentialDiscard((n) => pipe(nextIntBounded(n), map$6((k) => swap(buffer, n - 1, k)))), as$2(fromIterable$5(buffer)));
	})));
};
const swap = (buffer, index1, index2) => {
	const tmp = buffer[index1];
	buffer[index1] = buffer[index2];
	buffer[index2] = tmp;
	return buffer;
};
const make$31 = (seed) => new RandomImpl(hash(seed));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/tracer.js
/**
* @since 2.0.0
*/
/** @internal */
const TracerTypeId = /*#__PURE__*/ Symbol.for("effect/Tracer");
/** @internal */
const make$30 = (options) => ({
	[TracerTypeId]: TracerTypeId,
	...options
});
/** @internal */
const tracerTag = /*#__PURE__*/ GenericTag("effect/Tracer");
/** @internal */
const spanTag = /*#__PURE__*/ GenericTag("effect/ParentSpan");
const randomHexString = /*#__PURE__*/ function() {
	const characters = "abcdef0123456789";
	const charactersLength = 16;
	return function(length) {
		let result = "";
		for (let i = 0; i < length; i++) result += characters.charAt(Math.floor(Math.random() * charactersLength));
		return result;
	};
}();
/** @internal */
var NativeSpan = class {
	name;
	parent;
	context;
	startTime;
	kind;
	_tag = "Span";
	spanId;
	traceId = "native";
	sampled = true;
	status;
	attributes;
	events = [];
	links;
	constructor(name, parent, context, links, startTime, kind) {
		this.name = name;
		this.parent = parent;
		this.context = context;
		this.startTime = startTime;
		this.kind = kind;
		this.status = {
			_tag: "Started",
			startTime
		};
		this.attributes = /* @__PURE__ */ new Map();
		this.traceId = parent._tag === "Some" ? parent.value.traceId : randomHexString(32);
		this.spanId = randomHexString(16);
		this.links = Array.from(links);
	}
	end(endTime, exit) {
		this.status = {
			_tag: "Ended",
			endTime,
			exit,
			startTime: this.status.startTime
		};
	}
	attribute(key, value) {
		this.attributes.set(key, value);
	}
	event(name, startTime, attributes) {
		this.events.push([
			name,
			startTime,
			attributes ?? {}
		]);
	}
	addLinks(links) {
		this.links.push(...links);
	}
};
/** @internal */
const nativeTracer = /*#__PURE__*/ make$30({
	span: (name, parent, context, links, startTime, kind) => new NativeSpan(name, parent, context, links, startTime, kind),
	context: (f) => f()
});
/** @internal */
const DisablePropagation = /*#__PURE__*/ Reference()("effect/Tracer/DisablePropagation", { defaultValue: constFalse });
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/defaultServices.js
/** @internal */
const liveServices = /*#__PURE__*/ pipe(/*#__PURE__*/ empty$25(), /*#__PURE__*/ add$2(clockTag, /*#__PURE__*/ make$33()), /*#__PURE__*/ add$2(consoleTag, defaultConsole), /*#__PURE__*/ add$2(randomTag, /*#__PURE__*/ make$31(/*#__PURE__*/ Math.random())), /*#__PURE__*/ add$2(configProviderTag, /*#__PURE__*/ fromEnv()), /*#__PURE__*/ add$2(tracerTag, nativeTracer));
/**
* The `FiberRef` holding the default `Effect` services.
*
* @since 2.0.0
* @category fiberRefs
*/
const currentServices = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/DefaultServices/currentServices"), () => fiberRefUnsafeMakeContext(liveServices));
/** @internal */
const sleep$2 = (duration) => {
	const decodedDuration = decode(duration);
	return clockWith((clock) => clock.sleep(decodedDuration));
};
/** @internal */
const defaultServicesWith = (f) => withFiberRuntime$1((fiber) => f(fiber.currentDefaultServices));
/** @internal */
const clockWith = (f) => defaultServicesWith((services) => f(services.unsafeMap.get(clockTag.key)));
/** @internal */
const currentTimeMillis$1 = /*#__PURE__*/ clockWith((clock) => clock.currentTimeMillis);
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Boolean.js
/**
* Negates the given boolean: `!self`
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { not } from "effect/Boolean"
*
* assert.deepStrictEqual(not(true), false)
* assert.deepStrictEqual(not(false), true)
* ```
*
* @category combinators
* @since 2.0.0
*/
const not = (self) => !self;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Effectable.js
/**
* @since 2.0.0
* @category prototypes
*/
const EffectPrototype = EffectPrototype$1;
const Base = Base$1;
/**
* @since 2.0.0
* @category constructors
*/
var Class$1 = class extends Base {};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/executionStrategy.js
/** @internal */
const OP_SEQUENTIAL = "Sequential";
/** @internal */
const OP_PARALLEL = "Parallel";
/** @internal */
const OP_PARALLEL_N = "ParallelN";
/** @internal */
const sequential$2 = { _tag: OP_SEQUENTIAL };
/** @internal */
const parallel$2 = { _tag: OP_PARALLEL };
/** @internal */
const parallelN$1 = (parallelism) => ({
	_tag: OP_PARALLEL_N,
	parallelism
});
/** @internal */
const isSequential = (self) => self._tag === OP_SEQUENTIAL;
/** @internal */
const isParallel = (self) => self._tag === OP_PARALLEL;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/ExecutionStrategy.js
/**
* Execute effects sequentially.
*
* @since 2.0.0
* @category constructors
*/
const sequential$1 = sequential$2;
/**
* Execute effects in parallel.
*
* @since 2.0.0
* @category constructors
*/
const parallel$1 = parallel$2;
/**
* Execute effects in parallel, up to the specified number of concurrent fibers.
*
* @since 2.0.0
* @category constructors
*/
const parallelN = parallelN$1;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/fiberRefs.js
/** @internal */
function unsafeMake$7(fiberRefLocals) {
	return new FiberRefsImpl(fiberRefLocals);
}
/** @internal */
function empty$10() {
	return unsafeMake$7(/* @__PURE__ */ new Map());
}
/** @internal */
const FiberRefsSym = /*#__PURE__*/ Symbol.for("effect/FiberRefs");
/** @internal */
var FiberRefsImpl = class {
	locals;
	[FiberRefsSym] = FiberRefsSym;
	constructor(locals) {
		this.locals = locals;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const findAncestor = (_ref, _parentStack, _childStack, _childModified = false) => {
	const ref = _ref;
	let parentStack = _parentStack;
	let childStack = _childStack;
	let childModified = _childModified;
	let ret = void 0;
	while (ret === void 0) if (isNonEmptyReadonlyArray(parentStack) && isNonEmptyReadonlyArray(childStack)) {
		const parentFiberId = headNonEmpty$1(parentStack)[0];
		const parentAncestors = tailNonEmpty$1(parentStack);
		const childFiberId = headNonEmpty$1(childStack)[0];
		const childRefValue = headNonEmpty$1(childStack)[1];
		const childAncestors = tailNonEmpty$1(childStack);
		if (parentFiberId.startTimeMillis < childFiberId.startTimeMillis) {
			childStack = childAncestors;
			childModified = true;
		} else if (parentFiberId.startTimeMillis > childFiberId.startTimeMillis) parentStack = parentAncestors;
		else if (parentFiberId.id < childFiberId.id) {
			childStack = childAncestors;
			childModified = true;
		} else if (parentFiberId.id > childFiberId.id) parentStack = parentAncestors;
		else ret = [childRefValue, childModified];
	} else ret = [ref.initial, true];
	return ret;
};
/** @internal */
const joinAs = /*#__PURE__*/ dual(3, (self, fiberId, that) => {
	const parentFiberRefs = new Map(self.locals);
	that.locals.forEach((childStack, fiberRef) => {
		const childValue = childStack[0][1];
		if (!childStack[0][0][symbol](fiberId)) {
			if (!parentFiberRefs.has(fiberRef)) {
				if (equals$2(childValue, fiberRef.initial)) return;
				parentFiberRefs.set(fiberRef, [[fiberId, fiberRef.join(fiberRef.initial, childValue)]]);
				return;
			}
			const parentStack = parentFiberRefs.get(fiberRef);
			const [ancestor, wasModified] = findAncestor(fiberRef, parentStack, childStack);
			if (wasModified) {
				const patch = fiberRef.diff(ancestor, childValue);
				const oldValue = parentStack[0][1];
				const newValue = fiberRef.join(oldValue, fiberRef.patch(patch)(oldValue));
				if (!equals$2(oldValue, newValue)) {
					let newStack;
					const parentFiberId = parentStack[0][0];
					if (parentFiberId[symbol](fiberId)) newStack = [[parentFiberId, newValue], ...parentStack.slice(1)];
					else newStack = [[fiberId, newValue], ...parentStack];
					parentFiberRefs.set(fiberRef, newStack);
				}
			}
		}
	});
	return new FiberRefsImpl(parentFiberRefs);
});
/** @internal */
const forkAs = /*#__PURE__*/ dual(2, (self, childId) => {
	const map = /* @__PURE__ */ new Map();
	unsafeForkAs(self, map, childId);
	return new FiberRefsImpl(map);
});
const unsafeForkAs = (self, map, fiberId) => {
	self.locals.forEach((stack, fiberRef) => {
		const oldValue = stack[0][1];
		const newValue = fiberRef.patch(fiberRef.fork)(oldValue);
		if (equals$2(oldValue, newValue)) map.set(fiberRef, stack);
		else map.set(fiberRef, [[fiberId, newValue], ...stack]);
	});
};
/** @internal */
const delete_ = /*#__PURE__*/ dual(2, (self, fiberRef) => {
	const locals = new Map(self.locals);
	locals.delete(fiberRef);
	return new FiberRefsImpl(locals);
});
/** @internal */
const get$5 = /*#__PURE__*/ dual(2, (self, fiberRef) => {
	if (!self.locals.has(fiberRef)) return none$4();
	return some(headNonEmpty$1(self.locals.get(fiberRef))[1]);
});
/** @internal */
const getOrDefault$1 = /*#__PURE__*/ dual(2, (self, fiberRef) => pipe(get$5(self, fiberRef), getOrElse(() => fiberRef.initial)));
/** @internal */
const updateAs$1 = /*#__PURE__*/ dual(2, (self, { fiberId, fiberRef, value }) => {
	if (self.locals.size === 0) return new FiberRefsImpl(/* @__PURE__ */ new Map([[fiberRef, [[fiberId, value]]]]));
	const locals = new Map(self.locals);
	unsafeUpdateAs(locals, fiberId, fiberRef, value);
	return new FiberRefsImpl(locals);
});
const unsafeUpdateAs = (locals, fiberId, fiberRef, value) => {
	const oldStack = locals.get(fiberRef) ?? [];
	let newStack;
	if (isNonEmptyReadonlyArray(oldStack)) {
		const [currentId, currentValue] = headNonEmpty$1(oldStack);
		if (currentId[symbol](fiberId)) {
			if (equals$2(currentValue, value)) return;
			else newStack = [[fiberId, value], ...oldStack.slice(1)];
		} else newStack = [[fiberId, value], ...oldStack];
	} else newStack = [[fiberId, value]];
	locals.set(fiberRef, newStack);
};
/** @internal */
const updateManyAs$1 = /*#__PURE__*/ dual(2, (self, { entries, forkAs }) => {
	if (self.locals.size === 0) return new FiberRefsImpl(new Map(entries));
	const locals = new Map(self.locals);
	if (forkAs !== void 0) unsafeForkAs(self, locals, forkAs);
	entries.forEach(([fiberRef, values]) => {
		if (values.length === 1) unsafeUpdateAs(locals, values[0][0], fiberRef, values[0][1]);
		else values.forEach(([fiberId, value]) => {
			unsafeUpdateAs(locals, fiberId, fiberRef, value);
		});
	});
	return new FiberRefsImpl(locals);
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/FiberRefs.js
/**
* Gets the value of the specified `FiberRef` in this collection of `FiberRef`
* values if it exists or the `initial` value of the `FiberRef` otherwise.
*
* @since 2.0.0
* @category getters
*/
const getOrDefault = getOrDefault$1;
/**
* Updates the value of the specified `FiberRef` using the provided `FiberId`
*
* @since 2.0.0
* @category utils
*/
const updateAs = updateAs$1;
/**
* Updates the values of the specified `FiberRef` & value pairs using the provided `FiberId`
*
* @since 2.0.0
* @category utils
*/
const updateManyAs = updateManyAs$1;
/**
* The empty collection of `FiberRef` values.
*
* @category constructors
* @since 2.0.0
*/
const empty$9 = empty$10;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/fiberRefs/patch.js
/** @internal */
const OP_EMPTY$1 = "Empty";
/** @internal */
const OP_REMOVE = "Remove";
/** @internal */
const OP_UPDATE = "Update";
/** @internal */
const OP_AND_THEN$1 = "AndThen";
/** @internal */
const empty$8 = { _tag: OP_EMPTY$1 };
/** @internal */
const diff$2 = (oldValue, newValue) => {
	const missingLocals = new Map(oldValue.locals);
	let patch = empty$8;
	for (const [fiberRef, pairs] of newValue.locals.entries()) {
		const newValue = headNonEmpty$1(pairs)[1];
		const old = missingLocals.get(fiberRef);
		if (old !== void 0) {
			const oldValue = headNonEmpty$1(old)[1];
			if (!equals$2(oldValue, newValue)) patch = combine$1({
				_tag: OP_UPDATE,
				fiberRef,
				patch: fiberRef.diff(oldValue, newValue)
			})(patch);
		} else patch = combine$1({
			_tag: "Add",
			fiberRef,
			value: newValue
		})(patch);
		missingLocals.delete(fiberRef);
	}
	for (const [fiberRef] of missingLocals.entries()) patch = combine$1({
		_tag: OP_REMOVE,
		fiberRef
	})(patch);
	return patch;
};
/** @internal */
const combine$1 = /*#__PURE__*/ dual(2, (self, that) => ({
	_tag: OP_AND_THEN$1,
	first: self,
	second: that
}));
/** @internal */
const patch$2 = /*#__PURE__*/ dual(3, (self, fiberId, oldValue) => {
	let fiberRefs = oldValue;
	let patches = of$2(self);
	while (isNonEmptyReadonlyArray(patches)) {
		const head = headNonEmpty$1(patches);
		const tail = tailNonEmpty$1(patches);
		switch (head._tag) {
			case OP_EMPTY$1:
				patches = tail;
				break;
			case "Add":
				fiberRefs = updateAs$1(fiberRefs, {
					fiberId,
					fiberRef: head.fiberRef,
					value: head.value
				});
				patches = tail;
				break;
			case OP_REMOVE:
				fiberRefs = delete_(fiberRefs, head.fiberRef);
				patches = tail;
				break;
			case OP_UPDATE: {
				const value = getOrDefault$1(fiberRefs, head.fiberRef);
				fiberRefs = updateAs$1(fiberRefs, {
					fiberId,
					fiberRef: head.fiberRef,
					value: head.fiberRef.patch(head.patch)(value)
				});
				patches = tail;
				break;
			}
			case OP_AND_THEN$1: patches = prepend$2(head.first)(prepend$2(head.second)(tail));
		}
	}
	return fiberRefs;
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/FiberRefsPatch.js
/**
* Constructs a patch that describes the changes between the specified
* collections of `FiberRef`
*
* @since 2.0.0
* @category constructors
*/
const diff$1 = diff$2;
/**
* Applies the changes described by this patch to the specified collection
* of `FiberRef` values.
*
* @since 2.0.0
* @category destructors
*/
const patch$1 = patch$2;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/fiberStatus.js
const FiberStatusSymbolKey = "effect/FiberStatus";
/** @internal */
const FiberStatusTypeId = /*#__PURE__*/ Symbol.for(FiberStatusSymbolKey);
/** @internal */
const OP_DONE$3 = "Done";
/** @internal */
const OP_RUNNING = "Running";
/** @internal */
const OP_SUSPENDED = "Suspended";
const DoneHash = /*#__PURE__*/ string(`${FiberStatusSymbolKey}-${OP_DONE$3}`);
/** @internal */
var Done$1 = class {
	[FiberStatusTypeId] = FiberStatusTypeId;
	_tag = OP_DONE$3;
	[symbol$1]() {
		return DoneHash;
	}
	[symbol](that) {
		return isFiberStatus(that) && that._tag === "Done";
	}
};
/** @internal */
var Running = class {
	runtimeFlags;
	[FiberStatusTypeId] = FiberStatusTypeId;
	_tag = OP_RUNNING;
	constructor(runtimeFlags) {
		this.runtimeFlags = runtimeFlags;
	}
	[symbol$1]() {
		return pipe(hash(FiberStatusSymbolKey), combine$7(hash(this._tag)), combine$7(hash(this.runtimeFlags)), cached(this));
	}
	[symbol](that) {
		return isFiberStatus(that) && that._tag === "Running" && this.runtimeFlags === that.runtimeFlags;
	}
};
/** @internal */
var Suspended = class {
	runtimeFlags;
	blockingOn;
	[FiberStatusTypeId] = FiberStatusTypeId;
	_tag = OP_SUSPENDED;
	constructor(runtimeFlags, blockingOn) {
		this.runtimeFlags = runtimeFlags;
		this.blockingOn = blockingOn;
	}
	[symbol$1]() {
		return pipe(hash(FiberStatusSymbolKey), combine$7(hash(this._tag)), combine$7(hash(this.runtimeFlags)), combine$7(hash(this.blockingOn)), cached(this));
	}
	[symbol](that) {
		return isFiberStatus(that) && that._tag === "Suspended" && this.runtimeFlags === that.runtimeFlags && equals$2(this.blockingOn, that.blockingOn);
	}
};
/** @internal */
const done$4 = /*#__PURE__*/ new Done$1();
/** @internal */
const running$1 = (runtimeFlags) => new Running(runtimeFlags);
/** @internal */
const suspended$1 = (runtimeFlags, blockingOn) => new Suspended(runtimeFlags, blockingOn);
/** @internal */
const isFiberStatus = (u) => hasProperty(u, FiberStatusTypeId);
/** @internal */
const isDone$4 = (self) => self._tag === OP_DONE$3;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/FiberStatus.js
/**
* @since 2.0.0
* @category constructors
*/
const done$3 = done$4;
/**
* @since 2.0.0
* @category constructors
*/
const running = running$1;
/**
* @since 2.0.0
* @category constructors
*/
const suspended = suspended$1;
/**
* Returns `true` if the specified `FiberStatus` is `Done`, `false` otherwise.
*
* @since 2.0.0
* @category refinements
*/
const isDone$3 = isDone$4;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/LogLevel.js
/**
* @since 2.0.0
* @category constructors
*/
const All = logLevelAll;
/**
* @since 2.0.0
* @category constructors
*/
const Fatal = logLevelFatal;
/**
* @since 2.0.0
* @category constructors
*/
const Error$3 = logLevelError;
/**
* @since 2.0.0
* @category constructors
*/
const Warning = logLevelWarning;
/**
* @since 2.0.0
* @category constructors
*/
const Info = logLevelInfo;
/**
* @since 2.0.0
* @category constructors
*/
const Debug = logLevelDebug;
/**
* @since 2.0.0
* @category constructors
*/
const Trace = logLevelTrace;
/**
* @since 2.0.0
* @category constructors
*/
const None = logLevelNone;
/**
* @since 2.0.0
* @category ordering
*/
const greaterThan$1 = /*#__PURE__*/ greaterThan$2(/* @__PURE__ */ pipe(Order$1, /*#__PURE__*/ mapInput((level) => level.ordinal)));
/**
* @since 2.0.0
* @category conversions
*/
const fromLiteral = (literal) => {
	switch (literal) {
		case "All": return All;
		case "Debug": return Debug;
		case "Error": return Error$3;
		case "Fatal": return Fatal;
		case "Info": return Info;
		case "Trace": return Trace;
		case "None": return None;
		case "Warning": return Warning;
	}
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Micro.js
/**
* @since 3.4.0
* @experimental
* @category type ids
*/
const TypeId$17 = /*#__PURE__*/ Symbol.for("effect/Micro");
/**
* @since 3.4.0
* @experimental
* @category MicroExit
*/
const MicroExitTypeId = /*#__PURE__*/ Symbol.for("effect/Micro/MicroExit");
/**
* @since 3.4.6
* @experimental
* @category MicroCause
*/
const MicroCauseTypeId = /*#__PURE__*/ Symbol.for("effect/Micro/MicroCause");
const microCauseVariance = { _E: identity };
var MicroCauseImpl = class extends globalThis.Error {
	_tag;
	traces;
	[MicroCauseTypeId];
	constructor(_tag, originalError, traces) {
		const causeName = `MicroCause.${_tag}`;
		let name;
		let message;
		let stack;
		if (originalError instanceof globalThis.Error) {
			name = `(${causeName}) ${originalError.name}`;
			message = originalError.message;
			const messageLines = message.split("\n").length;
			stack = originalError.stack ? `(${causeName}) ${originalError.stack.split("\n").slice(0, messageLines + 3).join("\n")}` : `${name}: ${message}`;
		} else {
			name = causeName;
			message = toStringUnknown(originalError, 0);
			stack = `${name}: ${message}`;
		}
		if (traces.length > 0) stack += `\n    ${traces.join("\n    ")}`;
		super(message);
		this._tag = _tag;
		this.traces = traces;
		this[MicroCauseTypeId] = microCauseVariance;
		this.name = name;
		this.stack = stack;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
	toString() {
		return this.stack;
	}
	[NodeInspectSymbol]() {
		return this.stack;
	}
};
var Fail = class extends MicroCauseImpl {
	error;
	constructor(error, traces = []) {
		super("Fail", error, traces);
		this.error = error;
	}
};
/**
* @since 3.4.6
* @experimental
* @category MicroCause
*/
const causeFail = (error, traces = []) => new Fail(error, traces);
var Die = class extends MicroCauseImpl {
	defect;
	constructor(defect, traces = []) {
		super("Die", defect, traces);
		this.defect = defect;
	}
};
/**
* @since 3.4.6
* @experimental
* @category MicroCause
*/
const causeDie = (defect, traces = []) => new Die(defect, traces);
var Interrupt = class extends MicroCauseImpl {
	constructor(traces = []) {
		super("Interrupt", "interrupted", traces);
	}
};
/**
* @since 3.4.6
* @experimental
* @category MicroCause
*/
const causeInterrupt = (traces = []) => new Interrupt(traces);
/**
* @since 3.4.6
* @experimental
* @category MicroCause
*/
const causeIsInterrupt = (self) => self._tag === "Interrupt";
/**
* @since 3.11.0
* @experimental
* @category MicroFiber
*/
const MicroFiberTypeId = /*#__PURE__*/ Symbol.for("effect/Micro/MicroFiber");
const fiberVariance$1 = {
	_A: identity,
	_E: identity
};
var MicroFiberImpl = class {
	context;
	interruptible;
	[MicroFiberTypeId];
	_stack = [];
	_observers = [];
	_exit;
	_children;
	currentOpCount = 0;
	constructor(context, interruptible = true) {
		this.context = context;
		this.interruptible = interruptible;
		this[MicroFiberTypeId] = fiberVariance$1;
	}
	getRef(ref) {
		return unsafeGetReference(this.context, ref);
	}
	addObserver(cb) {
		if (this._exit) {
			cb(this._exit);
			return constVoid;
		}
		this._observers.push(cb);
		return () => {
			const index = this._observers.indexOf(cb);
			if (index >= 0) this._observers.splice(index, 1);
		};
	}
	_interrupted = false;
	unsafeInterrupt() {
		if (this._exit) return;
		this._interrupted = true;
		if (this.interruptible) this.evaluate(exitInterrupt);
	}
	unsafePoll() {
		return this._exit;
	}
	evaluate(effect) {
		if (this._exit) return;
		else if (this._yielded !== void 0) {
			const yielded = this._yielded;
			this._yielded = void 0;
			yielded();
		}
		const exit = this.runLoop(effect);
		if (exit === Yield) return;
		const interruptChildren = fiberMiddleware.interruptChildren && fiberMiddleware.interruptChildren(this);
		if (interruptChildren !== void 0) return this.evaluate(flatMap$5(interruptChildren, () => exit));
		this._exit = exit;
		for (let i = 0; i < this._observers.length; i++) this._observers[i](exit);
		this._observers.length = 0;
	}
	runLoop(effect) {
		let yielding = false;
		let current = effect;
		this.currentOpCount = 0;
		try {
			while (true) {
				this.currentOpCount++;
				if (!yielding && this.getRef(CurrentScheduler).shouldYield(this)) {
					yielding = true;
					const prev = current;
					current = flatMap$5(yieldNow$1, () => prev);
				}
				current = current[evaluate](this);
				if (current === Yield) {
					const yielded = this._yielded;
					if (MicroExitTypeId in yielded) {
						this._yielded = void 0;
						return yielded;
					}
					return Yield;
				}
			}
		} catch (error) {
			if (!hasProperty(current, evaluate)) return exitDie(`MicroFiber.runLoop: Not a valid effect: ${String(current)}`);
			return exitDie(error);
		}
	}
	getCont(symbol) {
		while (true) {
			const op = this._stack.pop();
			if (!op) return void 0;
			const cont = op[ensureCont] && op[ensureCont](this);
			if (cont) return { [symbol]: cont };
			if (op[symbol]) return op;
		}
	}
	_yielded = void 0;
	yieldWith(value) {
		this._yielded = value;
		return Yield;
	}
	children() {
		return this._children ??= /* @__PURE__ */ new Set();
	}
};
const fiberMiddleware = /*#__PURE__*/ globalValue("effect/Micro/fiberMiddleware", () => ({ interruptChildren: void 0 }));
const identifier = /*#__PURE__*/ Symbol.for("effect/Micro/identifier");
const args = /*#__PURE__*/ Symbol.for("effect/Micro/args");
const evaluate = /*#__PURE__*/ Symbol.for("effect/Micro/evaluate");
const successCont = /*#__PURE__*/ Symbol.for("effect/Micro/successCont");
const failureCont = /*#__PURE__*/ Symbol.for("effect/Micro/failureCont");
const ensureCont = /*#__PURE__*/ Symbol.for("effect/Micro/ensureCont");
const Yield = /*#__PURE__*/ Symbol.for("effect/Micro/Yield");
const microVariance = {
	_A: identity,
	_E: identity,
	_R: identity
};
const MicroProto = {
	...EffectPrototype,
	_op: "Micro",
	[TypeId$17]: microVariance,
	pipe() {
		return pipeArguments(this, arguments);
	},
	[Symbol.iterator]() {
		return new SingleShotGen$1(new YieldWrap(this));
	},
	toJSON() {
		return {
			_id: "Micro",
			op: this[identifier],
			...args in this ? { args: this[args] } : void 0
		};
	},
	toString() {
		return format$4(this);
	},
	[NodeInspectSymbol]() {
		return format$4(this);
	}
};
function defaultEvaluate(_fiber) {
	return exitDie(`Micro.evaluate: Not implemented`);
}
const makePrimitiveProto = (options) => ({
	...MicroProto,
	[identifier]: options.op,
	[evaluate]: options.eval ?? defaultEvaluate,
	[successCont]: options.contA,
	[failureCont]: options.contE,
	[ensureCont]: options.ensure
});
const makePrimitive = (options) => {
	const Proto = makePrimitiveProto(options);
	return function() {
		const self = Object.create(Proto);
		self[args] = options.single === false ? arguments : arguments[0];
		return self;
	};
};
const makeExit = (options) => {
	const Proto = {
		...makePrimitiveProto(options),
		[MicroExitTypeId]: MicroExitTypeId,
		_tag: options.op,
		get [options.prop]() {
			return this[args];
		},
		toJSON() {
			return {
				_id: "MicroExit",
				_tag: options.op,
				[options.prop]: this[args]
			};
		},
		[symbol](that) {
			return isMicroExit(that) && that._tag === options.op && equals$2(this[args], that[args]);
		},
		[symbol$1]() {
			return cached(this, combine$7(string(options.op))(hash(this[args])));
		}
	};
	return function(value) {
		const self = Object.create(Proto);
		self[args] = value;
		self[successCont] = void 0;
		self[failureCont] = void 0;
		self[ensureCont] = void 0;
		return self;
	};
};
/**
* Creates a `Micro` effect that will succeed with the specified constant value.
*
* @since 3.4.0
* @experimental
* @category constructors
*/
const succeed$7 = /*#__PURE__*/ makeExit({
	op: "Success",
	prop: "value",
	eval(fiber) {
		const cont = fiber.getCont(successCont);
		return cont ? cont[successCont](this[args], fiber) : fiber.yieldWith(this);
	}
});
/**
* Creates a `Micro` effect that will fail with the specified `MicroCause`.
*
* @since 3.4.6
* @experimental
* @category constructors
*/
const failCause$5 = /*#__PURE__*/ makeExit({
	op: "Failure",
	prop: "cause",
	eval(fiber) {
		let cont = fiber.getCont(failureCont);
		while (causeIsInterrupt(this[args]) && cont && fiber.interruptible) cont = fiber.getCont(failureCont);
		return cont ? cont[failureCont](this[args], fiber) : fiber.yieldWith(this);
	}
});
/**
* Creates a `Micro` effect that fails with the given error.
*
* This results in a `Fail` variant of the `MicroCause` type, where the error is
* tracked at the type level.
*
* @since 3.4.0
* @experimental
* @category constructors
*/
const fail$6 = (error) => failCause$5(causeFail(error));
/**
* Pause the execution of the current `Micro` effect, and resume it on the next
* scheduler tick.
*
* @since 3.4.0
* @experimental
* @category constructors
*/
const yieldNow$1 = /*#__PURE__*/ (/* @__PURE__ */ makePrimitive({
	op: "Yield",
	eval(fiber) {
		let resumed = false;
		fiber.getRef(CurrentScheduler).scheduleTask(() => {
			if (resumed) return;
			fiber.evaluate(exitVoid);
		}, this[args] ?? 0);
		return fiber.yieldWith(() => {
			resumed = true;
		});
	}
}))(0);
const void_$3 = /*#__PURE__*/ succeed$7(void 0);
/**
* Create a `Micro` effect using the current `MicroFiber`.
*
* @since 3.4.0
* @experimental
* @category constructors
*/
const withMicroFiber = /*#__PURE__*/ makePrimitive({
	op: "WithMicroFiber",
	eval(fiber) {
		return this[args](fiber);
	}
});
/**
* Map the success value of this `Micro` effect to another `Micro` effect, then
* flatten the result.
*
* @since 3.4.0
* @experimental
* @category mapping & sequencing
*/
const flatMap$5 = /*#__PURE__*/ dual(2, (self, f) => {
	const onSuccess = Object.create(OnSuccessProto);
	onSuccess[args] = self;
	onSuccess[successCont] = f;
	return onSuccess;
});
const OnSuccessProto = /*#__PURE__*/ makePrimitiveProto({
	op: "OnSuccess",
	eval(fiber) {
		fiber._stack.push(this);
		return this[args];
	}
});
/**
* @since 3.4.6
* @experimental
* @category MicroExit
*/
const isMicroExit = (u) => hasProperty(u, MicroExitTypeId);
/**
* @since 3.4.6
* @experimental
* @category MicroExit
*/
const exitSucceed = succeed$7;
/**
* @since 3.4.6
* @experimental
* @category MicroExit
*/
const exitFailCause = failCause$5;
/**
* @since 3.4.6
* @experimental
* @category MicroExit
*/
const exitInterrupt = /*#__PURE__*/ exitFailCause(/*#__PURE__*/ causeInterrupt());
/**
* @since 3.4.6
* @experimental
* @category MicroExit
*/
const exitDie = (defect) => exitFailCause(causeDie(defect));
/**
* @since 3.4.6
* @experimental
* @category MicroExit
*/
const exitVoid = /*#__PURE__*/ exitSucceed(void 0);
const setImmediate = "setImmediate" in globalThis ? globalThis.setImmediate : (f) => setTimeout(f, 0);
/**
* @since 3.5.9
* @experimental
* @category scheduler
*/
var MicroSchedulerDefault = class {
	tasks = [];
	running = false;
	/**
	* @since 3.5.9
	*/
	scheduleTask(task, _priority) {
		this.tasks.push(task);
		if (!this.running) {
			this.running = true;
			setImmediate(this.afterScheduled);
		}
	}
	/**
	* @since 3.5.9
	*/
	afterScheduled = () => {
		this.running = false;
		this.runTasks();
	};
	/**
	* @since 3.5.9
	*/
	runTasks() {
		const tasks = this.tasks;
		this.tasks = [];
		for (let i = 0, len = tasks.length; i < len; i++) tasks[i]();
	}
	/**
	* @since 3.5.9
	*/
	shouldYield(fiber) {
		return fiber.currentOpCount >= fiber.getRef(MaxOpsBeforeYield);
	}
	/**
	* @since 3.5.9
	*/
	flush() {
		while (this.tasks.length > 0) this.runTasks();
	}
};
/**
* Update the Context with the given mapping function.
*
* @since 3.11.0
* @experimental
* @category environment
*/
const updateContext$2 = /*#__PURE__*/ dual(2, (self, f) => withMicroFiber((fiber) => {
	const prev = fiber.context;
	fiber.context = f(prev);
	return onExit(self, () => {
		fiber.context = prev;
		return void_$3;
	});
}));
/**
* Merge the given `Context` with the current context.
*
* @since 3.4.0
* @experimental
* @category environment
*/
const provideContext = /*#__PURE__*/ dual(2, (self, provided) => updateContext$2(self, merge$4(provided)));
/**
* @since 3.11.0
* @experimental
* @category references
*/
var MaxOpsBeforeYield = class extends Reference()("effect/Micro/currentMaxOpsBeforeYield", { defaultValue: () => 2048 }) {};
Reference()("effect/Micro/currentConcurrency", { defaultValue: () => "unbounded" });
/**
* @since 3.11.0
* @experimental
* @category environment refs
*/
var CurrentScheduler = class extends Reference()("effect/Micro/currentScheduler", { defaultValue: () => new MicroSchedulerDefault() }) {};
/**
* @since 3.4.6
* @experimental
* @category pattern matching
*/
const matchCauseEffect$1 = /*#__PURE__*/ dual(2, (self, options) => {
	const primitive = Object.create(OnSuccessAndFailureProto);
	primitive[args] = self;
	primitive[successCont] = options.onSuccess;
	primitive[failureCont] = options.onFailure;
	return primitive;
});
const OnSuccessAndFailureProto = /*#__PURE__*/ makePrimitiveProto({
	op: "OnSuccessAndFailure",
	eval(fiber) {
		fiber._stack.push(this);
		return this[args];
	}
});
/**
* When the `Micro` effect is completed, run the given finalizer effect with the
* `MicroExit` of the executed effect.
*
* @since 3.4.6
* @experimental
* @category resources & finalization
*/
const onExit = /*#__PURE__*/ dual(2, (self, f) => uninterruptibleMask$1((restore) => matchCauseEffect$1(restore(self), {
	onFailure: (cause) => flatMap$5(f(exitFailCause(cause)), () => failCause$5(cause)),
	onSuccess: (a) => flatMap$5(f(exitSucceed(a)), () => succeed$7(a))
})));
const setInterruptible = /*#__PURE__*/ makePrimitive({
	op: "SetInterruptible",
	ensure(fiber) {
		fiber.interruptible = this[args];
		if (fiber._interrupted && fiber.interruptible) return () => exitInterrupt;
	}
});
/**
* Flag the effect as interruptible, which means that when the effect is
* interrupted, it will be interrupted immediately.
*
* @since 3.4.0
* @experimental
* @category flags
*/
const interruptible$1 = (self) => withMicroFiber((fiber) => {
	if (fiber.interruptible) return self;
	fiber.interruptible = true;
	fiber._stack.push(setInterruptible(false));
	if (fiber._interrupted) return exitInterrupt;
	return self;
});
/**
* Wrap the given `Micro` effect in an uninterruptible region, preventing the
* effect from being aborted.
*
* You can use the `restore` function to restore a `Micro` effect to the
* interruptibility state before the `uninterruptibleMask` was applied.
*
* @example
* ```ts
* import * as Micro from "effect/Micro"
*
* Micro.uninterruptibleMask((restore) =>
*   Micro.sleep(1000).pipe( // uninterruptible
*     Micro.andThen(restore(Micro.sleep(1000))) // interruptible
*   )
* )
* ```
*
* @since 3.4.0
* @experimental
* @category interruption
*/
const uninterruptibleMask$1 = (f) => withMicroFiber((fiber) => {
	if (!fiber.interruptible) return f(identity);
	fiber.interruptible = false;
	fiber._stack.push(setInterruptible(true));
	return f(interruptible$1);
});
/**
* Execute the `Micro` effect and return a `MicroFiber` that can be awaited, joined,
* or aborted.
*
* You can listen for the result by adding an observer using the handle's
* `addObserver` method.
*
* @example
* ```ts
* import * as Micro from "effect/Micro"
*
* const handle = Micro.succeed(42).pipe(
*   Micro.delay(1000),
*   Micro.runFork
* )
*
* handle.addObserver((exit) => {
*   console.log(exit)
* })
* ```
*
* @since 3.4.0
* @experimental
* @category execution
*/
const runFork$2 = (effect, options) => {
	const fiber = new MicroFiberImpl(CurrentScheduler.context(options?.scheduler ?? new MicroSchedulerDefault()));
	fiber.evaluate(effect);
	if (options?.signal) {
		if (options.signal.aborted) fiber.unsafeInterrupt();
		else {
			const abort = () => fiber.unsafeInterrupt();
			options.signal.addEventListener("abort", abort, { once: true });
			fiber.addObserver(() => options.signal.removeEventListener("abort", abort));
		}
	}
	return fiber;
};
const YieldableError = /*#__PURE__*/ function() {
	class YieldableError extends globalThis.Error {}
	Object.assign(YieldableError.prototype, MicroProto, StructuralPrototype, {
		[identifier]: "Failure",
		[evaluate]() {
			return fail$6(this);
		},
		toString() {
			return this.message ? `${this.name}: ${this.message}` : this.name;
		},
		toJSON() {
			return { ...this };
		},
		[NodeInspectSymbol]() {
			const stack = this.stack;
			if (stack) return `${this.toString()}\n${stack.split("\n").slice(1).join("\n")}`;
			return this.toString();
		}
	});
	return YieldableError;
}();
/**
* @since 3.4.0
* @experimental
* @category errors
*/
const Error$2 = /*#__PURE__*/ function() {
	return class extends YieldableError {
		constructor(args) {
			super();
			if (args) Object.assign(this, args);
		}
	};
}();
/**
* @since 3.4.0
* @experimental
* @category errors
*/
const TaggedError$2 = (tag) => {
	class Base extends Error$2 {
		_tag = tag;
	}
	Base.prototype.name = tag;
	return Base;
};
TaggedError$2("NoSuchElementException");
TaggedError$2("TimeoutException");
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Readable.js
/**
* @since 2.0.0
* @category type ids
*/
const TypeId$16 = /*#__PURE__*/ Symbol.for("effect/Readable");
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/ref.js
/** @internal */
const RefTypeId = /*#__PURE__*/ Symbol.for("effect/Ref");
/** @internal */
const refVariance = { 
/* c8 ignore next */
_A: (_) => _ };
var RefImpl = class extends Class$1 {
	ref;
	commit() {
		return this.get;
	}
	[RefTypeId] = refVariance;
	[TypeId$16] = TypeId$16;
	constructor(ref) {
		super();
		this.ref = ref;
		this.get = sync$2(() => get$7(this.ref));
	}
	get;
	modify(f) {
		return sync$2(() => {
			const current = get$7(this.ref);
			const [b, a] = f(current);
			if (current !== a) set$4(a)(this.ref);
			return b;
		});
	}
};
/** @internal */
const unsafeMake$6 = (value) => new RefImpl(make$39(value));
/** @internal */
const make$29 = (value) => sync$2(() => unsafeMake$6(value));
/** @internal */
const get$4 = (self) => self.get;
/** @internal */
const set$2 = /*#__PURE__*/ dual(2, (self, value) => self.modify(() => [void 0, value]));
/** @internal */
const modify$1 = /*#__PURE__*/ dual(2, (self, f) => self.modify(f));
/** @internal */
const update$2 = /*#__PURE__*/ dual(2, (self, f) => self.modify((a) => [void 0, f(a)]));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Ref.js
/**
* @since 2.0.0
* @category constructors
*/
const make$28 = make$29;
/**
* @since 2.0.0
* @category getters
*/
const get$3 = get$4;
/**
* @since 2.0.0
* @category utils
*/
const modify = modify$1;
/**
* @since 2.0.0
* @category utils
*/
const set$1 = set$2;
/**
* @since 2.0.0
* @category utils
*/
const update$1 = update$2;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Scheduler.js
/**
* @since 3.20.0
* @category models
*/
var SchedulerRunner = class SchedulerRunner {
	scheduleDrain;
	running = false;
	tasks = /*#__PURE__*/ new PriorityBuckets();
	constructor(scheduleDrain) {
		this.scheduleDrain = scheduleDrain;
	}
	starveInternal = (depth) => {
		const tasks = this.tasks.buckets;
		this.tasks.buckets = [];
		for (const [_, toRun] of tasks) for (let i = 0; i < toRun.length; i++) toRun[i]();
		if (this.tasks.buckets.length === 0) this.running = false;
		else this.starve(depth);
	};
	starve(depth = 0) {
		this.scheduleDrain(depth, this.starveInternal);
	}
	scheduleTask(task, priority) {
		this.tasks.scheduleTask(task, priority);
		if (!this.running) {
			this.running = true;
			this.starve();
		}
	}
	/**
	* @since 3.20.0
	* @category constructors
	*/
	static cached(scheduleDrain) {
		const fallback = new SchedulerRunner(scheduleDrain);
		const runners = /* @__PURE__ */ new WeakMap();
		return (fiber) => {
			if (fiber === void 0) return fallback;
			let runner = runners.get(fiber);
			if (runner === void 0) {
				runner = new SchedulerRunner(scheduleDrain);
				runners.set(fiber, runner);
			}
			return runner;
		};
	}
};
/**
* @since 2.0.0
* @category utils
*/
var PriorityBuckets = class {
	/**
	* @since 2.0.0
	*/
	buckets = [];
	/**
	* @since 2.0.0
	*/
	scheduleTask(task, priority) {
		const length = this.buckets.length;
		let bucket = void 0;
		let index = 0;
		for (; index < length; index++) if (this.buckets[index][0] <= priority) bucket = this.buckets[index];
		else break;
		if (bucket && bucket[0] === priority) bucket[1].push(task);
		else if (index === length) this.buckets.push([priority, [task]]);
		else this.buckets.splice(index, 0, [priority, [task]]);
	}
};
/**
* @since 2.0.0
* @category constructors
*/
var MixedScheduler = class {
	maxNextTickBeforeTimer;
	getRunner = /*#__PURE__*/ SchedulerRunner.cached((depth, drain) => {
		if (depth >= this.maxNextTickBeforeTimer) setTimeout(() => drain(0), 0);
		else Promise.resolve(void 0).then(() => drain(depth + 1));
	});
	constructor(maxNextTickBeforeTimer) {
		this.maxNextTickBeforeTimer = maxNextTickBeforeTimer;
	}
	/**
	* @since 2.0.0
	*/
	shouldYield(fiber) {
		return fiber.currentOpCount > fiber.getFiberRef(currentMaxOpsBeforeYield) ? fiber.getFiberRef(currentSchedulingPriority) : false;
	}
	/**
	* @since 2.0.0
	*/
	scheduleTask(task, priority, fiber) {
		this.getRunner(fiber).scheduleTask(task, priority);
	}
};
/**
* @since 2.0.0
* @category schedulers
*/
const defaultScheduler = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/Scheduler/defaultScheduler"), () => new MixedScheduler(2048));
/**
* @since 2.0.0
* @category constructors
*/
var SyncScheduler = class {
	/**
	* @since 2.0.0
	*/
	tasks = /*#__PURE__*/ new PriorityBuckets();
	/**
	* @since 2.0.0
	*/
	deferred = false;
	/**
	* @since 2.0.0
	*/
	scheduleTask(task, priority, fiber) {
		if (this.deferred) defaultScheduler.scheduleTask(task, priority, fiber);
		else this.tasks.scheduleTask(task, priority);
	}
	/**
	* @since 2.0.0
	*/
	shouldYield(fiber) {
		return fiber.currentOpCount > fiber.getFiberRef(currentMaxOpsBeforeYield) ? fiber.getFiberRef(currentSchedulingPriority) : false;
	}
	/**
	* @since 2.0.0
	*/
	flush() {
		while (this.tasks.buckets.length > 0) {
			const tasks = this.tasks.buckets;
			this.tasks.buckets = [];
			for (const [_, toRun] of tasks) for (let i = 0; i < toRun.length; i++) toRun[i]();
		}
		this.deferred = true;
	}
};
/** @internal */
const currentScheduler = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/FiberRef/currentScheduler"), () => fiberRefUnsafeMake(defaultScheduler));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/completedRequestMap.js
/** @internal */
const currentRequestMap = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/FiberRef/currentRequestMap"), () => fiberRefUnsafeMake(/* @__PURE__ */ new Map()));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/concurrency.js
/** @internal */
const match$5 = (concurrency, sequential, unbounded, bounded) => {
	switch (concurrency) {
		case void 0: return sequential();
		case "unbounded": return unbounded();
		case "inherit": return fiberRefGetWith(currentConcurrency, (concurrency) => concurrency === "unbounded" ? unbounded() : concurrency > 1 ? bounded(concurrency) : sequential());
		default: return concurrency > 1 ? bounded(concurrency) : sequential();
	}
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Clock.js
/**
* @since 2.0.0
* @category constructors
*/
const sleep$1 = sleep$2;
/**
* @since 2.0.0
* @category constructors
*/
const currentTimeMillis = currentTimeMillis$1;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/logSpan.js
/**
* Sanitize a given string by replacing spaces, equal signs, and double quotes with underscores.
*
* @internal
*/
const formatLabel = (key) => key.replace(/[\s="]/g, "_");
/** @internal */
const render = (now) => (self) => {
	return `${formatLabel(self.label)}=${now - self.startTime}ms`;
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Tracer.js
/**
* @since 2.0.0
* @category tags
*/
const ParentSpan = spanTag;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/metric/label.js
/** @internal */
const MetricLabelSymbolKey = "effect/MetricLabel";
/** @internal */
const MetricLabelTypeId = /*#__PURE__*/ Symbol.for(MetricLabelSymbolKey);
/** @internal */
var MetricLabelImpl = class {
	key;
	value;
	[MetricLabelTypeId] = MetricLabelTypeId;
	_hash;
	constructor(key, value) {
		this.key = key;
		this.value = value;
		this._hash = string(MetricLabelSymbolKey + this.key + this.value);
	}
	[symbol$1]() {
		return this._hash;
	}
	[symbol](that) {
		return isMetricLabel(that) && this.key === that.key && this.value === that.value;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const make$27 = (key, value) => {
	return new MetricLabelImpl(key, value);
};
/** @internal */
const isMetricLabel = (u) => hasProperty(u, MetricLabelTypeId);
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/core-effect.js
const annotateLogs$1 = /*#__PURE__*/ dual((args) => isEffect$1(args[0]), function() {
	const args = arguments;
	return fiberRefLocallyWith(args[0], currentLogAnnotations, typeof args[1] === "string" ? set$3(args[1], args[2]) : (annotations) => Object.entries(args[1]).reduce((acc, [key, value]) => set$3(acc, key, value), annotations));
});
const asSome = (self) => map$6(self, some);
const try_$1 = (arg) => {
	let evaluate;
	let onFailure = void 0;
	if (typeof arg === "function") evaluate = arg;
	else {
		evaluate = arg.try;
		onFailure = arg.catch;
	}
	return suspend$7(() => {
		try {
			return succeed$8(internalCall(evaluate));
		} catch (error) {
			return fail$7(onFailure ? internalCall(() => onFailure(error)) : new UnknownException(error, "An unknown error occurred in Effect.try"));
		}
	});
};
const catchTag$1 = /*#__PURE__*/ dual((args) => isEffect$1(args[0]), (self, ...args) => {
	const f = args[args.length - 1];
	let predicate;
	if (args.length === 2) predicate = isTagged(args[0]);
	else predicate = (e) => {
		const tag = hasProperty(e, "_tag") ? e["_tag"] : void 0;
		if (!tag) return false;
		for (let i = 0; i < args.length - 1; i++) if (args[i] === tag) return true;
		return false;
	};
	return catchIf(self, predicate, f);
});
const diffFiberRefs = (self) => summarized(self, fiberRefs, diff$2);
const bind = /*#__PURE__*/ bind$1(map$6, flatMap$6);
const bindTo = /*#__PURE__*/ bindTo$1(map$6);
const match$4 = /*#__PURE__*/ dual(2, (self, options) => matchEffect$1(self, {
	onFailure: (e) => succeed$8(options.onFailure(e)),
	onSuccess: (a) => succeed$8(options.onSuccess(a))
}));
const fiberRefs = /*#__PURE__*/ withFiberRuntime$1((state) => succeed$8(state.getFiberRefs()));
const ignore$1 = (self) => match$4(self, {
	onFailure: constVoid,
	onSuccess: constVoid
});
/** @internal */
const logWithLevel = (level) => (...message) => {
	const levelOption = fromNullable(level);
	let cause = void 0;
	for (let i = 0, len = message.length; i < len; i++) {
		const msg = message[i];
		if (isCause$1(msg)) {
			if (cause !== void 0) cause = sequential$3(cause, msg);
			else cause = msg;
			message = [...message.slice(0, i), ...message.slice(i + 1)];
			i--;
		}
	}
	if (cause === void 0) cause = empty$12;
	return withFiberRuntime$1((fiberState) => {
		fiberState.log(message, cause, levelOption);
		return void_$4;
	});
};
/** @internal */
const logWarning$1 = /*#__PURE__*/ logWithLevel(Warning);
/** @internal */
const logError$1 = /*#__PURE__*/ logWithLevel(Error$3);
const mapErrorCause = /*#__PURE__*/ dual(2, (self, f) => matchCauseEffect$2(self, {
	onFailure: (c) => failCauseSync$1(() => f(c)),
	onSuccess: succeed$8
}));
const negate$1 = (self) => map$6(self, (b) => !b);
const patchFiberRefs = (patch) => updateFiberRefs((fiberId, fiberRefs) => pipe(patch, patch$2(fiberId, fiberRefs)));
const provideService$1 = /*#__PURE__*/ dual(3, (self, tag, service) => contextWithEffect((env) => provideContext$1(self, add$2(env, tag, service))));
const provideServiceEffect = /*#__PURE__*/ dual(3, (self, tag, effect) => contextWithEffect((env) => flatMap$6(effect, (service) => provideContext$1(self, pipe(env, add$2(tag, service))))));
const reduce$1 = /*#__PURE__*/ dual(3, (elements, zero, f) => fromIterable$6(elements).reduce((acc, el, i) => flatMap$6(acc, (a) => f(a, el, i)), succeed$8(zero)));
const sleep = sleep$1;
const succeedNone = /*#__PURE__*/ succeed$8(/*#__PURE__*/ none$4());
const summarized = /*#__PURE__*/ dual(3, (self, summary, f) => flatMap$6(summary, (start) => flatMap$6(self, (value) => map$6(summary, (end) => [f(start, end), value]))));
const tapErrorCause$1 = /*#__PURE__*/ dual(2, (self, f) => matchCauseEffect$2(self, {
	onFailure: (cause) => zipRight$3(f(cause), failCause$6(cause)),
	onSuccess: succeed$8
}));
const tryPromise$1 = (arg) => {
	let evaluate;
	let catcher = void 0;
	if (typeof arg === "function") evaluate = arg;
	else {
		evaluate = arg.try;
		catcher = arg.catch;
	}
	const fail = (e) => catcher ? failSync(() => catcher(e)) : fail$7(new UnknownException(e, "An unknown error occurred in Effect.tryPromise"));
	if (evaluate.length >= 1) return async_((resolve, signal) => {
		try {
			evaluate(signal).then((a) => resolve(succeed$8(a)), (e) => resolve(fail(e)));
		} catch (e) {
			resolve(fail(e));
		}
	});
	return async_((resolve) => {
		try {
			evaluate().then((a) => resolve(succeed$8(a)), (e) => resolve(fail(e)));
		} catch (e) {
			resolve(fail(e));
		}
	});
};
const tryMap$1 = /*#__PURE__*/ dual(2, (self, options) => flatMap$6(self, (a) => try_$1({
	try: () => options.try(a),
	catch: options.catch
})));
const updateFiberRefs = (f) => withFiberRuntime$1((state) => {
	state.setFiberRefs(f(state.id(), state.getFiberRefs()));
	return void_$4;
});
const when$3 = /*#__PURE__*/ dual(2, (self, condition) => suspend$7(() => condition() ? map$6(self, some) : succeed$8(none$4())));
/** @internal */
const serviceOption$1 = (tag) => map$6(context$1(), getOption(tag));
const filterDisablePropagation = /*#__PURE__*/ flatMap$9((span) => get$11(span.context, DisablePropagation) ? span._tag === "Span" ? filterDisablePropagation(span.parent) : none$4() : some(span));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Exit.js
/**
* Returns `true` if the specified `Exit` is a `Failure`, `false` otherwise.
*
* @since 2.0.0
* @category refinements
*/
const isFailure = exitIsFailure;
/**
* Returns `true` if the specified `Exit` is a `Success`, `false` otherwise.
*
* @since 2.0.0
* @category refinements
*/
const isSuccess = exitIsSuccess;
/**
* Collects all of the specified exit values into a `Some<Exit<List<A>, E>>`. If
* the provided iterable contains no elements, `None` will be returned.
*
* @since 2.0.0
* @category constructors
*/
const all$2 = exitCollectAll;
/**
* Constructs a new `Exit.Failure` from the specified unrecoverable defect.
*
* @since 2.0.0
* @category constructors
*/
const die$3 = exitDie$1;
/**
* Constructs a new `Exit.Failure` from the specified recoverable error of type
* `E`.
*
* @since 2.0.0
* @category constructors
*/
const fail$5 = exitFail;
/**
* Constructs a new `Exit.Failure` from the specified `Cause` of type `E`.
*
* @since 2.0.0
* @category constructors
*/
const failCause$4 = exitFailCause$1;
/**
* Maps over the `Success` value of the specified exit using the provided
* function.
*
* @since 2.0.0
* @category mapping
*/
const map$5 = exitMap;
/**
* Maps over the `Success` and `Failure` cases of the specified exit using the
* provided functions.
*
* @since 2.0.0
* @category mapping
*/
const mapBoth$2 = exitMapBoth;
/**
* @since 2.0.0
* @category folding
*/
const match$3 = exitMatch;
/**
* Constructs a new `Exit.Success` containing the specified value of type `A`.
*
* @since 2.0.0
* @category constructors
*/
const succeed$6 = exitSucceed$1;
const void_$2 = exitVoid$1;
/**
* Sequentially zips the this result with the specified result or else returns
* the failed `Cause<E | E2>`.
*
* @since 2.0.0
* @category zipping
*/
const zip$2 = exitZip;
/**
* Sequentially zips the this result with the specified result discarding the
* first element of the tuple or else returns the failed `Cause<E | E2>`.
*
* @since 2.0.0
* @category zipping
*/
const zipRight$2 = exitZipRight;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/fiberMessage.js
/** @internal */
const OP_INTERRUPT_SIGNAL = "InterruptSignal";
/** @internal */
const OP_STATEFUL = "Stateful";
/** @internal */
const OP_RESUME = "Resume";
/** @internal */
const OP_YIELD_NOW = "YieldNow";
/** @internal */
const interruptSignal = (cause) => ({
	_tag: OP_INTERRUPT_SIGNAL,
	cause
});
/** @internal */
const stateful = (onFiber) => ({
	_tag: OP_STATEFUL,
	onFiber
});
/** @internal */
const resume = (effect) => ({
	_tag: OP_RESUME,
	effect
});
/** @internal */
const yieldNow = () => ({ _tag: OP_YIELD_NOW });
/** @internal */
const FiberScopeTypeId = /*#__PURE__*/ Symbol.for("effect/FiberScope");
/** @internal */
var Global = class {
	[FiberScopeTypeId] = FiberScopeTypeId;
	fiberId = none$2;
	roots = /*#__PURE__*/ new Set();
	add(_runtimeFlags, child) {
		this.roots.add(child);
		child.addObserver(() => {
			this.roots.delete(child);
		});
	}
};
/** @internal */
var Local = class {
	fiberId;
	parent;
	[FiberScopeTypeId] = FiberScopeTypeId;
	constructor(fiberId, parent) {
		this.fiberId = fiberId;
		this.parent = parent;
	}
	add(_runtimeFlags, child) {
		this.parent.tell(stateful((parentFiber) => {
			parentFiber.addChild(child);
			child.addObserver(() => {
				parentFiber.removeChild(child);
			});
		}));
	}
};
/** @internal */
const unsafeMake$5 = (fiber) => {
	return new Local(fiber.id(), fiber);
};
/** @internal */
const globalScope = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/FiberScope/Global"), () => new Global());
/** @internal */
const FiberTypeId = /*#__PURE__*/ Symbol.for("effect/Fiber");
/** @internal */
const fiberVariance = {
	/* c8 ignore next */
	_E: (_) => _,
	/* c8 ignore next */
	_A: (_) => _
};
/** @internal */
const fiberProto = {
	[FiberTypeId]: fiberVariance,
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const RuntimeFiberTypeId = /*#__PURE__*/ Symbol.for("effect/Fiber");
/** @internal */
const isRuntimeFiber = (self) => RuntimeFiberTypeId in self;
/** @internal */
const _await$2 = (self) => self.await;
/** @internal */
const inheritAll$1 = (self) => self.inheritAll;
/** @internal */
const interruptAllAs$1 = /*#__PURE__*/ dual(2, /*#__PURE__*/ fnUntraced$1(function* (fibers, fiberId) {
	for (const fiber of fibers) {
		if (isRuntimeFiber(fiber)) {
			fiber.unsafeInterruptAsFork(fiberId);
			continue;
		}
		yield* fiber.interruptAsFork(fiberId);
	}
	for (const fiber of fibers) {
		if (isRuntimeFiber(fiber) && fiber.unsafePoll()) continue;
		yield* fiber.await;
	}
}));
/** @internal */
const join$2 = (self) => zipLeft$1(flatten$6(self.await), self.inheritAll);
({ ...CommitPrototype }), { ...fiberProto };
/** @internal */
const currentFiberURI = "effect/FiberCurrent";
/** @internal */
const LoggerTypeId = /*#__PURE__*/ Symbol.for("effect/Logger");
const loggerVariance = {
	/* c8 ignore next */
	_Message: (_) => _,
	/* c8 ignore next */
	_Output: (_) => _
};
/** @internal */
const makeLogger = (log) => ({
	[LoggerTypeId]: loggerVariance,
	log,
	pipe() {
		return pipeArguments(this, arguments);
	}
});
/**
* Match strings that do not contain any whitespace characters, double quotes,
* or equal signs.
*
* @internal
*/
const textOnly = /^[^\s"=]*$/;
/**
* Used by both {@link stringLogger} and {@link logfmtLogger} to render a log
* message.
*
* @internal
*/
const format$2 = (quoteValue, whitespace) => ({ annotations, cause, date, fiberId, logLevel, message, spans }) => {
	const formatValue = (value) => value.match(textOnly) ? value : quoteValue(value);
	const format = (label, value) => `${formatLabel(label)}=${formatValue(value)}`;
	const append = (label, value) => " " + format(label, value);
	let out = format("timestamp", date.toISOString());
	out += append("level", logLevel.label);
	out += append("fiber", threadName$1(fiberId));
	const messages = ensure(message);
	for (let i = 0; i < messages.length; i++) out += append("message", toStringUnknown(messages[i], whitespace));
	if (!isEmptyType(cause)) out += append("cause", pretty$1(cause, { renderErrorCause: true }));
	for (const span of spans) out += " " + render(date.getTime())(span);
	for (const [label, value] of annotations) out += append(label, toStringUnknown(value, whitespace));
	return out;
};
/** @internal */
const escapeDoubleQuotes = (s) => `"${s.replace(/\\([\s\S])|(")/g, "\\$1$2")}"`;
/** @internal */
const stringLogger = /*#__PURE__*/ makeLogger(/*#__PURE__*/ format$2(escapeDoubleQuotes));
/** @internal */
const structuredMessage = (u) => {
	switch (typeof u) {
		case "bigint":
		case "function":
		case "symbol": return String(u);
		default: return toJSON(u);
	}
};
const withColor = (text, ...colors) => {
	let out = "";
	for (let i = 0; i < colors.length; i++) out += `\x1b[${colors[i]}m`;
	return out + text + "\x1B[0m";
};
const withColorNoop = (text, ..._colors) => text;
const colors = {
	bold: "1",
	red: "31",
	green: "32",
	yellow: "33",
	blue: "34",
	cyan: "36",
	white: "37",
	gray: "90",
	black: "30",
	bgBrightRed: "101"
};
const logLevelColors = {
	None: [],
	All: [],
	Trace: [colors.gray],
	Debug: [colors.blue],
	Info: [colors.green],
	Warning: [colors.yellow],
	Error: [colors.red],
	Fatal: [colors.bgBrightRed, colors.black]
};
const logLevelStyle = {
	None: "",
	All: "",
	Trace: "color:gray",
	Debug: "color:blue",
	Info: "color:green",
	Warning: "color:orange",
	Error: "color:red",
	Fatal: "background-color:red;color:white"
};
const defaultDateFormat = (date) => `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}.${date.getMilliseconds().toString().padStart(3, "0")}`;
const hasProcessStdout = typeof process === "object" && process !== null && typeof process.stdout === "object" && process.stdout !== null;
const processStdoutIsTTY = hasProcessStdout && process.stdout.isTTY === true;
const hasProcessStdoutOrDeno = hasProcessStdout || "Deno" in globalThis;
/** @internal */
const prettyLogger = (options) => {
	const mode_ = options?.mode ?? "auto";
	const isBrowser = (mode_ === "auto" ? hasProcessStdoutOrDeno ? "tty" : "browser" : mode_) === "browser";
	const showColors = typeof options?.colors === "boolean" ? options.colors : processStdoutIsTTY || isBrowser;
	const formatDate = options?.formatDate ?? defaultDateFormat;
	return isBrowser ? prettyLoggerBrowser({
		colors: showColors,
		formatDate
	}) : prettyLoggerTty({
		colors: showColors,
		formatDate,
		stderr: options?.stderr === true
	});
};
const prettyLoggerTty = (options) => {
	const color = options.colors ? withColor : withColorNoop;
	return makeLogger(({ annotations, cause, context, date, fiberId, logLevel, message: message_, spans }) => {
		const services = getOrDefault(context, currentServices);
		const console = get$11(services, consoleTag).unsafe;
		const log = options.stderr === true ? console.error : console.log;
		const message = ensure(message_);
		let firstLine = color(`[${options.formatDate(date)}]`, colors.white) + ` ${color(logLevel.label, ...logLevelColors[logLevel._tag])} (${threadName$1(fiberId)})`;
		if (isCons(spans)) {
			const now = date.getTime();
			const render$1 = render(now);
			for (const span of spans) firstLine += " " + render$1(span);
		}
		firstLine += ":";
		let messageIndex = 0;
		if (message.length > 0) {
			const firstMaybeString = structuredMessage(message[0]);
			if (typeof firstMaybeString === "string") {
				firstLine += " " + color(firstMaybeString, colors.bold, colors.cyan);
				messageIndex++;
			}
		}
		log(firstLine);
		console.group();
		if (!isEmpty$4(cause)) log(pretty$1(cause, { renderErrorCause: true }));
		if (messageIndex < message.length) for (; messageIndex < message.length; messageIndex++) log(redact(message[messageIndex]));
		if (size$4(annotations) > 0) for (const [key, value] of annotations) log(color(`${key}:`, colors.bold, colors.white), redact(value));
		console.groupEnd();
	});
};
const prettyLoggerBrowser = (options) => {
	const color = options.colors ? "%c" : "";
	return makeLogger(({ annotations, cause, context, date, fiberId, logLevel, message: message_, spans }) => {
		const services = getOrDefault(context, currentServices);
		const console = get$11(services, consoleTag).unsafe;
		const message = ensure(message_);
		let firstLine = `${color}[${options.formatDate(date)}]`;
		const firstParams = [];
		if (options.colors) firstParams.push("color:gray");
		firstLine += ` ${color}${logLevel.label}${color} (${threadName$1(fiberId)})`;
		if (options.colors) firstParams.push(logLevelStyle[logLevel._tag], "");
		if (isCons(spans)) {
			const now = date.getTime();
			const render$2 = render(now);
			for (const span of spans) firstLine += " " + render$2(span);
		}
		firstLine += ":";
		let messageIndex = 0;
		if (message.length > 0) {
			const firstMaybeString = structuredMessage(message[0]);
			if (typeof firstMaybeString === "string") {
				firstLine += ` ${color}${firstMaybeString}`;
				if (options.colors) firstParams.push("color:deepskyblue");
				messageIndex++;
			}
		}
		console.groupCollapsed(firstLine, ...firstParams);
		if (!isEmpty$4(cause)) console.error(...prettyErrors(cause));
		if (messageIndex < message.length) for (; messageIndex < message.length; messageIndex++) console.log(redact(message[messageIndex]));
		if (size$4(annotations) > 0) for (const [key, value] of annotations) {
			const redacted = redact(value);
			if (options.colors) console.log(`%c${key}:`, "color:gray", redacted);
			else console.log(`${key}:`, redacted);
		}
		console.groupEnd();
	});
};
/** @internal */
const prettyLoggerDefault$1 = /*#__PURE__*/ globalValue("effect/Logger/prettyLoggerDefault", () => prettyLogger());
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/metric/boundaries.js
/** @internal */
const MetricBoundariesSymbolKey = "effect/MetricBoundaries";
/** @internal */
const MetricBoundariesTypeId = /*#__PURE__*/ Symbol.for(MetricBoundariesSymbolKey);
/** @internal */
var MetricBoundariesImpl = class {
	values;
	[MetricBoundariesTypeId] = MetricBoundariesTypeId;
	constructor(values) {
		this.values = values;
		this._hash = pipe(string(MetricBoundariesSymbolKey), combine$7(array$1(this.values)));
	}
	_hash;
	[symbol$1]() {
		return this._hash;
	}
	[symbol](u) {
		return isMetricBoundaries(u) && equals$2(this.values, u.values);
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const isMetricBoundaries = (u) => hasProperty(u, MetricBoundariesTypeId);
/** @internal */
const fromIterable = (iterable) => {
	return new MetricBoundariesImpl(pipe(iterable, appendAll$2(of$1(Number.POSITIVE_INFINITY)), dedupe));
};
/** @internal */
const exponential = (options) => pipe(makeBy(options.count - 1, (i) => options.start * Math.pow(options.factor, i)), unsafeFromArray, fromIterable);
/** @internal */
const MetricKeyTypeTypeId = /*#__PURE__*/ Symbol.for("effect/MetricKeyType");
/** @internal */
const CounterKeyTypeSymbolKey = "effect/MetricKeyType/Counter";
/** @internal */
const CounterKeyTypeTypeId = /*#__PURE__*/ Symbol.for(CounterKeyTypeSymbolKey);
/** @internal */
const FrequencyKeyTypeTypeId = /*#__PURE__*/ Symbol.for("effect/MetricKeyType/Frequency");
/** @internal */
const GaugeKeyTypeTypeId = /*#__PURE__*/ Symbol.for("effect/MetricKeyType/Gauge");
/** @internal */
const HistogramKeyTypeSymbolKey = "effect/MetricKeyType/Histogram";
/** @internal */
const HistogramKeyTypeTypeId = /*#__PURE__*/ Symbol.for(HistogramKeyTypeSymbolKey);
/** @internal */
const SummaryKeyTypeTypeId = /*#__PURE__*/ Symbol.for("effect/MetricKeyType/Summary");
const metricKeyTypeVariance = {
	/* c8 ignore next */
	_In: (_) => _,
	/* c8 ignore next */
	_Out: (_) => _
};
/** @internal */
var CounterKeyType = class {
	incremental;
	bigint;
	[MetricKeyTypeTypeId] = metricKeyTypeVariance;
	[CounterKeyTypeTypeId] = CounterKeyTypeTypeId;
	constructor(incremental, bigint) {
		this.incremental = incremental;
		this.bigint = bigint;
		this._hash = string(CounterKeyTypeSymbolKey);
	}
	_hash;
	[symbol$1]() {
		return this._hash;
	}
	[symbol](that) {
		return isCounterKey(that);
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
var HistogramKeyType = class {
	boundaries;
	[MetricKeyTypeTypeId] = metricKeyTypeVariance;
	[HistogramKeyTypeTypeId] = HistogramKeyTypeTypeId;
	constructor(boundaries) {
		this.boundaries = boundaries;
		this._hash = pipe(string(HistogramKeyTypeSymbolKey), combine$7(hash(this.boundaries)));
	}
	_hash;
	[symbol$1]() {
		return this._hash;
	}
	[symbol](that) {
		return isHistogramKey(that) && equals$2(this.boundaries, that.boundaries);
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const counter$4 = (options) => new CounterKeyType(options?.incremental ?? false, options?.bigint ?? false);
/** @internal */
const histogram$4 = (boundaries) => {
	return new HistogramKeyType(boundaries);
};
/** @internal */
const isCounterKey = (u) => hasProperty(u, CounterKeyTypeTypeId);
/** @internal */
const isFrequencyKey = (u) => hasProperty(u, FrequencyKeyTypeTypeId);
/** @internal */
const isGaugeKey = (u) => hasProperty(u, GaugeKeyTypeTypeId);
/** @internal */
const isHistogramKey = (u) => hasProperty(u, HistogramKeyTypeTypeId);
/** @internal */
const isSummaryKey = (u) => hasProperty(u, SummaryKeyTypeTypeId);
/** @internal */
const MetricKeyTypeId = /*#__PURE__*/ Symbol.for("effect/MetricKey");
const metricKeyVariance = { 
/* c8 ignore next */
_Type: (_) => _ };
const arrayEquivilence = /*#__PURE__*/ getEquivalence$2(equals$2);
/** @internal */
var MetricKeyImpl = class {
	name;
	keyType;
	description;
	tags;
	[MetricKeyTypeId] = metricKeyVariance;
	constructor(name, keyType, description, tags = []) {
		this.name = name;
		this.keyType = keyType;
		this.description = description;
		this.tags = tags;
		this._hash = pipe(string(this.name + this.description), combine$7(hash(this.keyType)), combine$7(array$1(this.tags)));
	}
	_hash;
	[symbol$1]() {
		return this._hash;
	}
	[symbol](u) {
		return isMetricKey(u) && this.name === u.name && equals$2(this.keyType, u.keyType) && equals$2(this.description, u.description) && arrayEquivilence(this.tags, u.tags);
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const isMetricKey = (u) => hasProperty(u, MetricKeyTypeId);
/** @internal */
const counter$3 = (name, options) => new MetricKeyImpl(name, counter$4(options), fromNullable(options?.description));
/** @internal */
const histogram$3 = (name, boundaries, description) => new MetricKeyImpl(name, histogram$4(boundaries), fromNullable(description));
/** @internal */
const taggedWithLabels$1 = /*#__PURE__*/ dual(2, (self, extraTags) => extraTags.length === 0 ? self : new MetricKeyImpl(self.name, self.keyType, self.description, union$4(self.tags, extraTags)));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/MutableHashMap.js
const TypeId$15 = /*#__PURE__*/ Symbol.for("effect/MutableHashMap");
const MutableHashMapProto = {
	[TypeId$15]: TypeId$15,
	[Symbol.iterator]() {
		return new MutableHashMapIterator(this);
	},
	toString() {
		return format$4(this.toJSON());
	},
	toJSON() {
		return {
			_id: "MutableHashMap",
			values: Array.from(this).map(toJSON)
		};
	},
	[NodeInspectSymbol]() {
		return this.toJSON();
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
var MutableHashMapIterator = class MutableHashMapIterator {
	self;
	referentialIterator;
	bucketIterator;
	constructor(self) {
		this.self = self;
		this.referentialIterator = self.referential[Symbol.iterator]();
	}
	next() {
		if (this.bucketIterator !== void 0) return this.bucketIterator.next();
		const result = this.referentialIterator.next();
		if (result.done) {
			this.bucketIterator = new BucketIterator(this.self.buckets.values());
			return this.next();
		}
		return result;
	}
	[Symbol.iterator]() {
		return new MutableHashMapIterator(this.self);
	}
};
var BucketIterator = class {
	backing;
	constructor(backing) {
		this.backing = backing;
	}
	currentBucket;
	next() {
		if (this.currentBucket === void 0) {
			const result = this.backing.next();
			if (result.done) return result;
			this.currentBucket = result.value[Symbol.iterator]();
		}
		const result = this.currentBucket.next();
		if (result.done) {
			this.currentBucket = void 0;
			return this.next();
		}
		return result;
	}
};
/**
* @since 2.0.0
* @category constructors
*/
const empty$7 = () => {
	const self = Object.create(MutableHashMapProto);
	self.referential = /* @__PURE__ */ new Map();
	self.buckets = /* @__PURE__ */ new Map();
	self.bucketsSize = 0;
	return self;
};
/**
* @since 2.0.0
* @category elements
*/
const get$2 = /*#__PURE__*/ dual(2, (self, key) => {
	if (isEqual(key) === false) return self.referential.has(key) ? some(self.referential.get(key)) : none$4();
	const hash = key[symbol$1]();
	const bucket = self.buckets.get(hash);
	if (bucket === void 0) return none$4();
	return getFromBucket(self, bucket, key);
});
const getFromBucket = (self, bucket, key, remove = false) => {
	for (let i = 0, len = bucket.length; i < len; i++) if (key[symbol](bucket[i][0])) {
		const value = bucket[i][1];
		if (remove) {
			bucket.splice(i, 1);
			self.bucketsSize--;
		}
		return some(value);
	}
	return none$4();
};
/**
* @since 2.0.0
* @category elements
*/
const has = /*#__PURE__*/ dual(2, (self, key) => isSome(get$2(self, key)));
/**
* @since 2.0.0
*/
const set = /*#__PURE__*/ dual(3, (self, key, value) => {
	if (isEqual(key) === false) {
		self.referential.set(key, value);
		return self;
	}
	const hash = key[symbol$1]();
	const bucket = self.buckets.get(hash);
	if (bucket === void 0) {
		self.buckets.set(hash, [[key, value]]);
		self.bucketsSize++;
		return self;
	}
	removeFromBucket(self, bucket, key);
	bucket.push([key, value]);
	self.bucketsSize++;
	return self;
});
const removeFromBucket = (self, bucket, key) => {
	for (let i = 0, len = bucket.length; i < len; i++) if (key[symbol](bucket[i][0])) {
		bucket.splice(i, 1);
		self.bucketsSize--;
		return;
	}
};
/** @internal */
const MetricStateTypeId = /*#__PURE__*/ Symbol.for("effect/MetricState");
/** @internal */
const CounterStateSymbolKey = "effect/MetricState/Counter";
/** @internal */
const CounterStateTypeId = /*#__PURE__*/ Symbol.for(CounterStateSymbolKey);
/** @internal */
const FrequencyStateSymbolKey = "effect/MetricState/Frequency";
/** @internal */
const FrequencyStateTypeId = /*#__PURE__*/ Symbol.for(FrequencyStateSymbolKey);
/** @internal */
const GaugeStateSymbolKey = "effect/MetricState/Gauge";
/** @internal */
const GaugeStateTypeId = /*#__PURE__*/ Symbol.for(GaugeStateSymbolKey);
/** @internal */
const HistogramStateSymbolKey = "effect/MetricState/Histogram";
/** @internal */
const HistogramStateTypeId = /*#__PURE__*/ Symbol.for(HistogramStateSymbolKey);
/** @internal */
const SummaryStateSymbolKey = "effect/MetricState/Summary";
/** @internal */
const SummaryStateTypeId = /*#__PURE__*/ Symbol.for(SummaryStateSymbolKey);
const metricStateVariance = { 
/* c8 ignore next */
_A: (_) => _ };
/** @internal */
var CounterState = class {
	count;
	[MetricStateTypeId] = metricStateVariance;
	[CounterStateTypeId] = CounterStateTypeId;
	constructor(count) {
		this.count = count;
	}
	[symbol$1]() {
		return pipe(hash(CounterStateSymbolKey), combine$7(hash(this.count)), cached(this));
	}
	[symbol](that) {
		return isCounterState(that) && this.count === that.count;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
};
const arrayEquals = /*#__PURE__*/ getEquivalence$2(equals$2);
/** @internal */
var FrequencyState = class {
	occurrences;
	[MetricStateTypeId] = metricStateVariance;
	[FrequencyStateTypeId] = FrequencyStateTypeId;
	constructor(occurrences) {
		this.occurrences = occurrences;
	}
	_hash;
	[symbol$1]() {
		return pipe(string(FrequencyStateSymbolKey), combine$7(array$1(fromIterable$6(this.occurrences.entries()))), cached(this));
	}
	[symbol](that) {
		return isFrequencyState(that) && arrayEquals(fromIterable$6(this.occurrences.entries()), fromIterable$6(that.occurrences.entries()));
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
var GaugeState = class {
	value;
	[MetricStateTypeId] = metricStateVariance;
	[GaugeStateTypeId] = GaugeStateTypeId;
	constructor(value) {
		this.value = value;
	}
	[symbol$1]() {
		return pipe(hash(GaugeStateSymbolKey), combine$7(hash(this.value)), cached(this));
	}
	[symbol](u) {
		return isGaugeState(u) && this.value === u.value;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
var HistogramState = class {
	buckets;
	count;
	min;
	max;
	sum;
	[MetricStateTypeId] = metricStateVariance;
	[HistogramStateTypeId] = HistogramStateTypeId;
	constructor(buckets, count, min, max, sum) {
		this.buckets = buckets;
		this.count = count;
		this.min = min;
		this.max = max;
		this.sum = sum;
	}
	[symbol$1]() {
		return pipe(hash(HistogramStateSymbolKey), combine$7(hash(this.buckets)), combine$7(hash(this.count)), combine$7(hash(this.min)), combine$7(hash(this.max)), combine$7(hash(this.sum)), cached(this));
	}
	[symbol](that) {
		return isHistogramState(that) && equals$2(this.buckets, that.buckets) && this.count === that.count && this.min === that.min && this.max === that.max && this.sum === that.sum;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
var SummaryState = class {
	error;
	quantiles;
	count;
	min;
	max;
	sum;
	[MetricStateTypeId] = metricStateVariance;
	[SummaryStateTypeId] = SummaryStateTypeId;
	constructor(error, quantiles, count, min, max, sum) {
		this.error = error;
		this.quantiles = quantiles;
		this.count = count;
		this.min = min;
		this.max = max;
		this.sum = sum;
	}
	[symbol$1]() {
		return pipe(hash(SummaryStateSymbolKey), combine$7(hash(this.error)), combine$7(hash(this.quantiles)), combine$7(hash(this.count)), combine$7(hash(this.min)), combine$7(hash(this.max)), combine$7(hash(this.sum)), cached(this));
	}
	[symbol](that) {
		return isSummaryState(that) && this.error === that.error && equals$2(this.quantiles, that.quantiles) && this.count === that.count && this.min === that.min && this.max === that.max && this.sum === that.sum;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const counter$2 = (count) => new CounterState(count);
/** @internal */
const frequency$1 = (occurrences) => {
	return new FrequencyState(occurrences);
};
/** @internal */
const gauge$1 = (count) => new GaugeState(count);
/** @internal */
const histogram$2 = (options) => new HistogramState(options.buckets, options.count, options.min, options.max, options.sum);
/** @internal */
const summary$1 = (options) => new SummaryState(options.error, options.quantiles, options.count, options.min, options.max, options.sum);
/** @internal */
const isCounterState = (u) => hasProperty(u, CounterStateTypeId);
/**
* @since 2.0.0
* @category refinements
*/
const isFrequencyState = (u) => hasProperty(u, FrequencyStateTypeId);
/**
* @since 2.0.0
* @category refinements
*/
const isGaugeState = (u) => hasProperty(u, GaugeStateTypeId);
/**
* @since 2.0.0
* @category refinements
*/
const isHistogramState = (u) => hasProperty(u, HistogramStateTypeId);
/**
* @since 2.0.0
* @category refinements
*/
const isSummaryState = (u) => hasProperty(u, SummaryStateTypeId);
/** @internal */
const MetricHookTypeId = /*#__PURE__*/ Symbol.for("effect/MetricHook");
const metricHookVariance = {
	/* c8 ignore next */
	_In: (_) => _,
	/* c8 ignore next */
	_Out: (_) => _
};
/** @internal */
const make$26 = (options) => ({
	[MetricHookTypeId]: metricHookVariance,
	pipe() {
		return pipeArguments(this, arguments);
	},
	...options
});
const bigint0$1 = /*#__PURE__*/ BigInt(0);
/** @internal */
const counter$1 = (key) => {
	let sum = key.keyType.bigint ? bigint0$1 : 0;
	const canUpdate = key.keyType.incremental ? key.keyType.bigint ? (value) => value >= bigint0$1 : (value) => value >= 0 : (_value) => true;
	const update = (value) => {
		if (canUpdate(value)) sum = sum + value;
	};
	return make$26({
		get: () => counter$2(sum),
		update,
		modify: update
	});
};
/** @internal */
const frequency = (key) => {
	const values = /* @__PURE__ */ new Map();
	for (const word of key.keyType.preregisteredWords) values.set(word, 0);
	const update = (word) => {
		const slotCount = values.get(word) ?? 0;
		values.set(word, slotCount + 1);
	};
	return make$26({
		get: () => frequency$1(values),
		update,
		modify: update
	});
};
/** @internal */
const gauge = (_key, startAt) => {
	let value = startAt;
	return make$26({
		get: () => gauge$1(value),
		update: (v) => {
			value = v;
		},
		modify: (v) => {
			value = value + v;
		}
	});
};
/** @internal */
const histogram$1 = (key) => {
	const bounds = key.keyType.boundaries.values;
	const size = bounds.length;
	const values = new Uint32Array(size + 1);
	const boundaries = new Float64Array(size);
	let count = 0;
	let sum = 0;
	let min = Number.MAX_VALUE;
	let max = Number.MIN_VALUE;
	pipe(bounds, sort(Order$1), map$11((n, i) => {
		boundaries[i] = n;
	}));
	const update = (value) => {
		let from = 0;
		let to = size;
		while (from !== to) {
			const mid = Math.floor(from + (to - from) / 2);
			if (value <= boundaries[mid]) to = mid;
			else from = mid;
			if (to === from + 1) {
				if (value <= boundaries[from]) to = from;
				else from = to;
			}
		}
		values[from] = values[from] + 1;
		count = count + 1;
		sum = sum + value;
		if (value < min) min = value;
		if (value > max) max = value;
	};
	const getBuckets = () => {
		const builder = allocate(size);
		let cumulated = 0;
		for (let i = 0; i < size; i++) {
			const boundary = boundaries[i];
			const value = values[i];
			cumulated = cumulated + value;
			builder[i] = [boundary, cumulated];
		}
		return builder;
	};
	return make$26({
		get: () => histogram$2({
			buckets: getBuckets(),
			count,
			min,
			max,
			sum
		}),
		update,
		modify: update
	});
};
/** @internal */
const summary = (key) => {
	const { error, maxAge, maxSize, quantiles } = key.keyType;
	const sortedQuantiles = pipe(quantiles, sort(Order$1));
	const values = allocate(maxSize);
	let head = 0;
	let count = 0;
	let sum = 0;
	let min = 0;
	let max = 0;
	const snapshot = (now) => {
		const builder = [];
		let i = 0;
		while (i !== maxSize - 1) {
			const item = values[i];
			if (item != null) {
				const [t, v] = item;
				const age = millis(now - t);
				if (greaterThanOrEqualTo$1(age, zero$1) && lessThanOrEqualTo$1(age, maxAge)) builder.push(v);
			}
			i = i + 1;
		}
		return calculateQuantiles(error, sortedQuantiles, sort(builder, Order$1));
	};
	const observe = (value, timestamp) => {
		if (maxSize > 0) {
			head = head + 1;
			const target = head % maxSize;
			values[target] = [timestamp, value];
		}
		min = count === 0 ? value : Math.min(min, value);
		max = count === 0 ? value : Math.max(max, value);
		count = count + 1;
		sum = sum + value;
	};
	return make$26({
		get: () => summary$1({
			error,
			quantiles: snapshot(Date.now()),
			count,
			min,
			max,
			sum
		}),
		update: ([value, timestamp]) => observe(value, timestamp),
		modify: ([value, timestamp]) => observe(value, timestamp)
	});
};
/** @internal */
const calculateQuantiles = (error, sortedQuantiles, sortedSamples) => {
	const sampleCount = sortedSamples.length;
	if (!isNonEmptyReadonlyArray(sortedQuantiles)) return empty$23();
	const head = sortedQuantiles[0];
	const tail = sortedQuantiles.slice(1);
	const resolvedHead = resolveQuantile(error, sampleCount, none$4(), 0, head, sortedSamples);
	const resolved = of$2(resolvedHead);
	tail.forEach((quantile) => {
		resolved.push(resolveQuantile(error, sampleCount, resolvedHead.value, resolvedHead.consumed, quantile, resolvedHead.rest));
	});
	return map$11(resolved, (rq) => [rq.quantile, rq.value]);
};
/** @internal */
const resolveQuantile = (error, sampleCount, current, consumed, quantile, rest) => {
	let error_1 = error;
	let sampleCount_1 = sampleCount;
	let current_1 = current;
	let consumed_1 = consumed;
	let quantile_1 = quantile;
	let rest_1 = rest;
	let error_2 = error;
	let sampleCount_2 = sampleCount;
	let current_2 = current;
	let consumed_2 = consumed;
	let quantile_2 = quantile;
	let rest_2 = rest;
	while (1) {
		if (!isNonEmptyReadonlyArray(rest_1)) return {
			quantile: quantile_1,
			value: none$4(),
			consumed: consumed_1,
			rest: []
		};
		if (quantile_1 === 1) return {
			quantile: quantile_1,
			value: some(lastNonEmpty(rest_1)),
			consumed: consumed_1 + rest_1.length,
			rest: []
		};
		const headValue = headNonEmpty$1(rest_1);
		const sameHead = span(rest_1, (n) => n === headValue);
		const desired = quantile_1 * sampleCount_1;
		const allowedError = error_1 / 2 * desired;
		const candConsumed = consumed_1 + sameHead[0].length;
		const candError = Math.abs(candConsumed - desired);
		if (candConsumed < desired - allowedError) {
			error_2 = error_1;
			sampleCount_2 = sampleCount_1;
			current_2 = head$1(rest_1);
			consumed_2 = candConsumed;
			quantile_2 = quantile_1;
			rest_2 = sameHead[1];
			error_1 = error_2;
			sampleCount_1 = sampleCount_2;
			current_1 = current_2;
			consumed_1 = consumed_2;
			quantile_1 = quantile_2;
			rest_1 = rest_2;
			continue;
		}
		if (candConsumed > desired + allowedError) {
			const valueToReturn = isNone(current_1) ? some(headValue) : current_1;
			return {
				quantile: quantile_1,
				value: valueToReturn,
				consumed: consumed_1,
				rest: rest_1
			};
		}
		switch (current_1._tag) {
			case "None":
				error_2 = error_1;
				sampleCount_2 = sampleCount_1;
				current_2 = head$1(rest_1);
				consumed_2 = candConsumed;
				quantile_2 = quantile_1;
				rest_2 = sameHead[1];
				error_1 = error_2;
				sampleCount_1 = sampleCount_2;
				current_1 = current_2;
				consumed_1 = consumed_2;
				quantile_1 = quantile_2;
				rest_1 = rest_2;
				continue;
			case "Some":
				if (candError < Math.abs(desired - current_1.value)) {
					error_2 = error_1;
					sampleCount_2 = sampleCount_1;
					current_2 = head$1(rest_1);
					consumed_2 = candConsumed;
					quantile_2 = quantile_1;
					rest_2 = sameHead[1];
					error_1 = error_2;
					sampleCount_1 = sampleCount_2;
					current_1 = current_2;
					consumed_1 = consumed_2;
					quantile_1 = quantile_2;
					rest_1 = rest_2;
					continue;
				}
				return {
					quantile: quantile_1,
					value: some(current_1.value),
					consumed: consumed_1,
					rest: rest_1
				};
		}
	}
	throw new Error("BUG: MetricHook.resolveQuantiles - please report an issue at https://github.com/Effect-TS/effect/issues");
};
/** @internal */
const MetricPairTypeId = /*#__PURE__*/ Symbol.for("effect/MetricPair");
const metricPairVariance = { 
/* c8 ignore next */
_Type: (_) => _ };
/** @internal */
const unsafeMake$4 = (metricKey, metricState) => {
	return {
		[MetricPairTypeId]: metricPairVariance,
		metricKey,
		metricState,
		pipe() {
			return pipeArguments(this, arguments);
		}
	};
};
/** @internal */
const MetricRegistryTypeId = /*#__PURE__*/ Symbol.for("effect/MetricRegistry");
/** @internal */
var MetricRegistryImpl = class {
	[MetricRegistryTypeId] = MetricRegistryTypeId;
	map = /*#__PURE__*/ empty$7();
	snapshot() {
		const result = [];
		for (const [key, hook] of this.map) result.push(unsafeMake$4(key, hook.get()));
		return result;
	}
	get(key) {
		const hook = pipe(this.map, get$2(key), getOrUndefined);
		if (hook == null) {
			if (isCounterKey(key.keyType)) return this.getCounter(key);
			if (isGaugeKey(key.keyType)) return this.getGauge(key);
			if (isFrequencyKey(key.keyType)) return this.getFrequency(key);
			if (isHistogramKey(key.keyType)) return this.getHistogram(key);
			if (isSummaryKey(key.keyType)) return this.getSummary(key);
			throw new Error("BUG: MetricRegistry.get - unknown MetricKeyType - please report an issue at https://github.com/Effect-TS/effect/issues");
		} else return hook;
	}
	getCounter(key) {
		let value = pipe(this.map, get$2(key), getOrUndefined);
		if (value == null) {
			const counter = counter$1(key);
			if (!pipe(this.map, has(key))) pipe(this.map, set(key, counter));
			value = counter;
		}
		return value;
	}
	getFrequency(key) {
		let value = pipe(this.map, get$2(key), getOrUndefined);
		if (value == null) {
			const frequency$2 = frequency(key);
			if (!pipe(this.map, has(key))) pipe(this.map, set(key, frequency$2));
			value = frequency$2;
		}
		return value;
	}
	getGauge(key) {
		let value = pipe(this.map, get$2(key), getOrUndefined);
		if (value == null) {
			const gauge$2 = gauge(key, key.keyType.bigint ? BigInt(0) : 0);
			if (!pipe(this.map, has(key))) pipe(this.map, set(key, gauge$2));
			value = gauge$2;
		}
		return value;
	}
	getHistogram(key) {
		let value = pipe(this.map, get$2(key), getOrUndefined);
		if (value == null) {
			const histogram = histogram$1(key);
			if (!pipe(this.map, has(key))) pipe(this.map, set(key, histogram));
			value = histogram;
		}
		return value;
	}
	getSummary(key) {
		let value = pipe(this.map, get$2(key), getOrUndefined);
		if (value == null) {
			const summary$2 = summary(key);
			if (!pipe(this.map, has(key))) pipe(this.map, set(key, summary$2));
			value = summary$2;
		}
		return value;
	}
};
/** @internal */
const make$25 = () => {
	return new MetricRegistryImpl();
};
/** @internal */
const MetricTypeId = /*#__PURE__*/ Symbol.for("effect/Metric");
const metricVariance = {
	/* c8 ignore next */
	_Type: (_) => _,
	/* c8 ignore next */
	_In: (_) => _,
	/* c8 ignore next */
	_Out: (_) => _
};
/** @internal */
const globalMetricRegistry = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/Metric/globalMetricRegistry"), () => make$25());
/** @internal */
const make$24 = function(keyType, unsafeUpdate, unsafeValue, unsafeModify) {
	const metric = Object.assign((effect) => tap$1(effect, (a) => update(metric, a)), {
		[MetricTypeId]: metricVariance,
		keyType,
		unsafeUpdate,
		unsafeValue,
		unsafeModify,
		register() {
			this.unsafeValue([]);
			return this;
		},
		pipe() {
			return pipeArguments(this, arguments);
		}
	});
	return metric;
};
/** @internal */
const counter = (name, options) => fromMetricKey(counter$3(name, options));
/** @internal */
const fromMetricKey = (key) => {
	let untaggedHook;
	const hookCache = /* @__PURE__ */ new WeakMap();
	const hook = (extraTags) => {
		if (extraTags.length === 0) {
			if (untaggedHook !== void 0) return untaggedHook;
			untaggedHook = globalMetricRegistry.get(key);
			return untaggedHook;
		}
		let hook = hookCache.get(extraTags);
		if (hook !== void 0) return hook;
		hook = globalMetricRegistry.get(taggedWithLabels$1(key, extraTags));
		hookCache.set(extraTags, hook);
		return hook;
	};
	return make$24(key.keyType, (input, extraTags) => hook(extraTags).update(input), (extraTags) => hook(extraTags).get(), (input, extraTags) => hook(extraTags).modify(input));
};
/** @internal */
const histogram = (name, boundaries, description) => fromMetricKey(histogram$3(name, boundaries, description));
/** @internal */
const tagged$1 = /*#__PURE__*/ dual(3, (self, key, value) => taggedWithLabels(self, [make$27(key, value)]));
/** @internal */
const taggedWithLabels = /*#__PURE__*/ dual(2, (self, extraTags) => {
	return make$24(self.keyType, (input, extraTags1) => self.unsafeUpdate(input, union$4(extraTags, extraTags1)), (extraTags1) => self.unsafeValue(union$4(extraTags, extraTags1)), (input, extraTags1) => self.unsafeModify(input, union$4(extraTags, extraTags1)));
});
const update = /*#__PURE__*/ dual(2, (self, input) => fiberRefGetWith(currentMetricLabels, (tags) => sync$2(() => self.unsafeUpdate(input, tags))));
({ ...StructuralPrototype });
/** @internal */
const complete$1 = /*#__PURE__*/ dual(2, (self, result) => fiberRefGetWith(currentRequestMap, (map) => sync$2(() => {
	if (map.has(self)) {
		const entry = map.get(self);
		if (!entry.state.completed) {
			entry.state.completed = true;
			deferredUnsafeDone(entry.result, result);
		}
	}
})));
/** @internal */
const SupervisorTypeId = /*#__PURE__*/ Symbol.for("effect/Supervisor");
/** @internal */
const supervisorVariance = { 
/* c8 ignore next */
_T: (_) => _ };
/** @internal */
var ProxySupervisor = class ProxySupervisor {
	underlying;
	value0;
	[SupervisorTypeId] = supervisorVariance;
	constructor(underlying, value0) {
		this.underlying = underlying;
		this.value0 = value0;
	}
	get value() {
		return this.value0;
	}
	onStart(context, effect, parent, fiber) {
		this.underlying.onStart(context, effect, parent, fiber);
	}
	onEnd(value, fiber) {
		this.underlying.onEnd(value, fiber);
	}
	onEffect(fiber, effect) {
		this.underlying.onEffect(fiber, effect);
	}
	onSuspend(fiber) {
		this.underlying.onSuspend(fiber);
	}
	onResume(fiber) {
		this.underlying.onResume(fiber);
	}
	map(f) {
		return new ProxySupervisor(this, pipe(this.value, map$6(f)));
	}
	zip(right) {
		return new Zip(this, right);
	}
};
/** @internal */
var Zip = class Zip {
	left;
	right;
	_tag = "Zip";
	[SupervisorTypeId] = supervisorVariance;
	constructor(left, right) {
		this.left = left;
		this.right = right;
	}
	get value() {
		return zip$3(this.left.value, this.right.value);
	}
	onStart(context, effect, parent, fiber) {
		this.left.onStart(context, effect, parent, fiber);
		this.right.onStart(context, effect, parent, fiber);
	}
	onEnd(value, fiber) {
		this.left.onEnd(value, fiber);
		this.right.onEnd(value, fiber);
	}
	onEffect(fiber, effect) {
		this.left.onEffect(fiber, effect);
		this.right.onEffect(fiber, effect);
	}
	onSuspend(fiber) {
		this.left.onSuspend(fiber);
		this.right.onSuspend(fiber);
	}
	onResume(fiber) {
		this.left.onResume(fiber);
		this.right.onResume(fiber);
	}
	map(f) {
		return new ProxySupervisor(this, pipe(this.value, map$6(f)));
	}
	zip(right) {
		return new Zip(this, right);
	}
};
/** @internal */
const isZip = (self) => hasProperty(self, SupervisorTypeId) && isTagged(self, "Zip");
/** @internal */
var Const = class {
	effect;
	[SupervisorTypeId] = supervisorVariance;
	constructor(effect) {
		this.effect = effect;
	}
	get value() {
		return this.effect;
	}
	onStart(_context, _effect, _parent, _fiber) {}
	onEnd(_value, _fiber) {}
	onEffect(_fiber, _effect) {}
	onSuspend(_fiber) {}
	onResume(_fiber) {}
	map(f) {
		return new ProxySupervisor(this, pipe(this.value, map$6(f)));
	}
	zip(right) {
		return new Zip(this, right);
	}
	onRun(execution, _fiber) {
		return execution();
	}
};
/** @internal */
const fromEffect$6 = (effect) => {
	return new Const(effect);
};
/** @internal */
const none = /*#__PURE__*/ globalValue("effect/Supervisor/none", () => fromEffect$6(void_$4));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Differ.js
/**
* Constructs a new `Differ`.
*
* @since 2.0.0
* @category constructors
*/
const make$23 = make$36;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/supervisor/patch.js
/** @internal */
const OP_EMPTY = "Empty";
/** @internal */
const OP_ADD_SUPERVISOR = "AddSupervisor";
/** @internal */
const OP_REMOVE_SUPERVISOR = "RemoveSupervisor";
/** @internal */
const OP_AND_THEN = "AndThen";
/**
* The empty `SupervisorPatch`.
*
* @internal
*/
const empty$6 = { _tag: OP_EMPTY };
/**
* Combines two patches to produce a new patch that describes applying the
* updates from this patch and then the updates from the specified patch.
*
* @internal
*/
const combine = (self, that) => {
	return {
		_tag: OP_AND_THEN,
		first: self,
		second: that
	};
};
/**
* Applies a `SupervisorPatch` to a `Supervisor` to produce a new `Supervisor`.
*
* @internal
*/
const patch = (self, supervisor) => {
	return patchLoop(supervisor, of$1(self));
};
/** @internal */
const patchLoop = (_supervisor, _patches) => {
	let supervisor = _supervisor;
	let patches = _patches;
	while (isNonEmpty$4(patches)) {
		const head = headNonEmpty(patches);
		switch (head._tag) {
			case OP_EMPTY:
				patches = tailNonEmpty(patches);
				break;
			case OP_ADD_SUPERVISOR:
				supervisor = supervisor.zip(head.supervisor);
				patches = tailNonEmpty(patches);
				break;
			case OP_REMOVE_SUPERVISOR:
				supervisor = removeSupervisor(supervisor, head.supervisor);
				patches = tailNonEmpty(patches);
				break;
			case OP_AND_THEN: patches = prepend$1(head.first)(prepend$1(head.second)(tailNonEmpty(patches)));
		}
	}
	return supervisor;
};
/** @internal */
const removeSupervisor = (self, that) => {
	if (equals$2(self, that)) return none;
	else if (isZip(self)) return removeSupervisor(self.left, that).zip(removeSupervisor(self.right, that));
	else return self;
};
/** @internal */
const toSet = (self) => {
	if (equals$2(self, none)) return empty$19();
	else if (isZip(self)) return pipe(toSet(self.left), union$1(toSet(self.right)));
	else return make$40(self);
};
/** @internal */
const diff = (oldValue, newValue) => {
	if (equals$2(oldValue, newValue)) return empty$6;
	const oldSupervisors = toSet(oldValue);
	const newSupervisors = toSet(newValue);
	const added = pipe(newSupervisors, difference(oldSupervisors), reduce$5(empty$6, (patch, supervisor) => combine(patch, {
		_tag: OP_ADD_SUPERVISOR,
		supervisor
	})));
	const removed = pipe(oldSupervisors, difference(newSupervisors), reduce$5(empty$6, (patch, supervisor) => combine(patch, {
		_tag: OP_REMOVE_SUPERVISOR,
		supervisor
	})));
	return combine(added, removed);
};
/** @internal */
const differ = /*#__PURE__*/ make$23({
	empty: empty$6,
	patch,
	combine,
	diff
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/fiberRuntime.js
/** @internal */
const fiberStarted = /*#__PURE__*/ counter("effect_fiber_started", { incremental: true });
/** @internal */
const fiberActive = /*#__PURE__*/ counter("effect_fiber_active");
/** @internal */
const fiberSuccesses = /*#__PURE__*/ counter("effect_fiber_successes", { incremental: true });
/** @internal */
const fiberFailures = /*#__PURE__*/ counter("effect_fiber_failures", { incremental: true });
/** @internal */
const fiberLifetimes = /*#__PURE__*/ tagged$1(/*#__PURE__*/ histogram("effect_fiber_lifetimes", /*#__PURE__*/ exponential({
	start: .5,
	factor: 2,
	count: 35
})), "time_unit", "milliseconds");
/** @internal */
const EvaluationSignalContinue = "Continue";
/** @internal */
const EvaluationSignalDone = "Done";
/** @internal */
const EvaluationSignalYieldNow = "Yield";
const runtimeFiberVariance = {
	/* c8 ignore next */
	_E: (_) => _,
	/* c8 ignore next */
	_A: (_) => _
};
const absurd = (_) => {
	throw new Error(`BUG: FiberRuntime - ${toStringUnknown(_)} - please report an issue at https://github.com/Effect-TS/effect/issues`);
};
const YieldedOp = /*#__PURE__*/ Symbol.for("effect/internal/fiberRuntime/YieldedOp");
const yieldedOpChannel = /*#__PURE__*/ globalValue("effect/internal/fiberRuntime/yieldedOpChannel", () => ({ currentOp: null }));
const contOpSuccess = {
	[OP_ON_SUCCESS]: (_, cont, value) => {
		return internalCall(() => cont.effect_instruction_i1(value));
	},
	["OnStep"]: (_, _cont, value) => {
		return exitSucceed$1(exitSucceed$1(value));
	},
	[OP_ON_SUCCESS_AND_FAILURE]: (_, cont, value) => {
		return internalCall(() => cont.effect_instruction_i2(value));
	},
	[OP_REVERT_FLAGS]: (self, cont, value) => {
		self.patchRuntimeFlags(self.currentRuntimeFlags, cont.patch);
		if (interruptible$3(self.currentRuntimeFlags) && self.isInterrupted()) return exitFailCause$1(self.getInterruptedCause());
		else return exitSucceed$1(value);
	},
	[OP_WHILE]: (self, cont, value) => {
		internalCall(() => cont.effect_instruction_i2(value));
		if (internalCall(() => cont.effect_instruction_i0())) {
			self.pushStack(cont);
			return internalCall(() => cont.effect_instruction_i1());
		} else return void_$4;
	},
	[OP_ITERATOR]: (self, cont, value) => {
		while (true) {
			const state = internalCall(() => cont.effect_instruction_i0.next(value));
			if (state.done) return exitSucceed$1(state.value);
			const primitive = yieldWrapGet(state.value);
			if (!exitIsExit(primitive)) {
				self.pushStack(cont);
				return primitive;
			} else if (primitive._tag === "Failure") return primitive;
			value = primitive.value;
		}
	}
};
const drainQueueWhileRunningTable = {
	[OP_INTERRUPT_SIGNAL]: (self, runtimeFlags, cur, message) => {
		self.processNewInterruptSignal(message.cause);
		return interruptible$3(runtimeFlags) ? exitFailCause$1(message.cause) : cur;
	},
	[OP_RESUME]: (_self, _runtimeFlags, _cur, _message) => {
		throw new Error("It is illegal to have multiple concurrent run loops in a single fiber");
	},
	[OP_STATEFUL]: (self, runtimeFlags, cur, message) => {
		message.onFiber(self, running(runtimeFlags));
		return cur;
	},
	[OP_YIELD_NOW]: (_self, _runtimeFlags, cur, _message) => {
		return flatMap$6(yieldNow$2(), () => cur);
	}
};
/**
* Executes all requests, submitting requests to each data source in parallel.
*/
const runBlockedRequests = (self) => forEachSequentialDiscard(flatten$7(self), (requestsByRequestResolver) => forEachConcurrentDiscard(sequentialCollectionToChunk(requestsByRequestResolver), ([dataSource, sequential]) => {
	const map = /* @__PURE__ */ new Map();
	const arr = [];
	for (const block of sequential) {
		arr.push(toReadonlyArray(block));
		for (const entry of block) map.set(entry.request, entry);
	}
	const flat = arr.flat();
	return fiberRefLocally(invokeWithInterrupt(dataSource.runAll(arr), flat, () => flat.forEach((entry) => {
		entry.listeners.interrupted = true;
	})), currentRequestMap, map);
}, false, false));
const _version = /*#__PURE__*/ getCurrentVersion();
/** @internal */
var FiberRuntime = class extends Class$1 {
	[FiberTypeId] = fiberVariance;
	[RuntimeFiberTypeId] = runtimeFiberVariance;
	_fiberRefs;
	_fiberId;
	_queue = /*#__PURE__*/ new Array();
	_children = null;
	_observers = /*#__PURE__*/ new Array();
	_running = false;
	_stack = [];
	_asyncInterruptor = null;
	_asyncBlockingOn = null;
	_exitValue = null;
	_steps = [];
	_isYielding = false;
	currentRuntimeFlags;
	currentOpCount = 0;
	currentSupervisor;
	currentScheduler;
	currentTracer;
	currentSpan;
	currentContext;
	currentDefaultServices;
	constructor(fiberId, fiberRefs0, runtimeFlags0) {
		super();
		this.currentRuntimeFlags = runtimeFlags0;
		this._fiberId = fiberId;
		this._fiberRefs = fiberRefs0;
		if (runtimeMetrics(runtimeFlags0)) {
			const tags = this.getFiberRef(currentMetricLabels);
			fiberStarted.unsafeUpdate(1, tags);
			fiberActive.unsafeUpdate(1, tags);
		}
		this.refreshRefCache();
	}
	commit() {
		return join$2(this);
	}
	/**
	* The identity of the fiber.
	*/
	id() {
		return this._fiberId;
	}
	/**
	* Begins execution of the effect associated with this fiber on in the
	* background. This can be called to "kick off" execution of a fiber after
	* it has been created.
	*/
	resume(effect) {
		this.tell(resume(effect));
	}
	/**
	* The status of the fiber.
	*/
	get status() {
		return this.ask((_, status) => status);
	}
	/**
	* Gets the fiber runtime flags.
	*/
	get runtimeFlags() {
		return this.ask((state, status) => {
			if (isDone$3(status)) return state.currentRuntimeFlags;
			return status.runtimeFlags;
		});
	}
	/**
	* Returns the current `FiberScope` for the fiber.
	*/
	scope() {
		return unsafeMake$5(this);
	}
	/**
	* Retrieves the immediate children of the fiber.
	*/
	get children() {
		return this.ask((fiber) => Array.from(fiber.getChildren()));
	}
	/**
	* Gets the fiber's set of children.
	*/
	getChildren() {
		if (this._children === null) this._children = /* @__PURE__ */ new Set();
		return this._children;
	}
	/**
	* Retrieves the interrupted cause of the fiber, which will be `Cause.empty`
	* if the fiber has not been interrupted.
	*
	* **NOTE**: This method is safe to invoke on any fiber, but if not invoked
	* on this fiber, then values derived from the fiber's state (including the
	* log annotations and log level) may not be up-to-date.
	*/
	getInterruptedCause() {
		return this.getFiberRef(currentInterruptedCause);
	}
	/**
	* Retrieves the whole set of fiber refs.
	*/
	fiberRefs() {
		return this.ask((fiber) => fiber.getFiberRefs());
	}
	/**
	* Returns an effect that will contain information computed from the fiber
	* state and status while running on the fiber.
	*
	* This allows the outside world to interact safely with mutable fiber state
	* without locks or immutable data.
	*/
	ask(f) {
		return suspend$7(() => {
			const deferred = deferredUnsafeMake(this._fiberId);
			this.tell(stateful((fiber, status) => {
				deferredUnsafeDone(deferred, sync$2(() => f(fiber, status)));
			}));
			return deferredAwait(deferred);
		});
	}
	/**
	* Adds a message to be processed by the fiber on the fiber.
	*/
	tell(message) {
		this._queue.push(message);
		if (!this._running) {
			this._running = true;
			this.drainQueueLaterOnExecutor();
		}
	}
	get await() {
		return async_((resume) => {
			const cb = (exit) => resume(succeed$8(exit));
			if (this._exitValue !== null) {
				cb(this._exitValue);
				return;
			}
			this.tell(stateful((fiber, _) => {
				if (fiber._exitValue !== null) cb(this._exitValue);
				else fiber.addObserver(cb);
			}));
			return sync$2(() => this.tell(stateful((fiber, _) => {
				fiber.removeObserver(cb);
			})));
		}, this.id());
	}
	get inheritAll() {
		return withFiberRuntime$1((parentFiber, parentStatus) => {
			const parentFiberId = parentFiber.id();
			const parentFiberRefs = parentFiber.getFiberRefs();
			const parentRuntimeFlags = parentStatus.runtimeFlags;
			const childFiberRefs = this.getFiberRefs();
			const updatedFiberRefs = joinAs(parentFiberRefs, parentFiberId, childFiberRefs);
			parentFiber.setFiberRefs(updatedFiberRefs);
			const updatedRuntimeFlags = parentFiber.getFiberRef(currentRuntimeFlags);
			const patch = pipe(diff$3(parentRuntimeFlags, updatedRuntimeFlags), exclude(1), exclude(16));
			return updateRuntimeFlags(patch);
		});
	}
	/**
	* Tentatively observes the fiber, but returns immediately if it is not
	* already done.
	*/
	get poll() {
		return sync$2(() => fromNullable(this._exitValue));
	}
	/**
	* Unsafely observes the fiber, but returns immediately if it is not
	* already done.
	*/
	unsafePoll() {
		return this._exitValue;
	}
	/**
	* In the background, interrupts the fiber as if interrupted from the specified fiber.
	*/
	interruptAsFork(fiberId) {
		return sync$2(() => this.tell(interruptSignal(interrupt$5(fiberId))));
	}
	/**
	* In the background, interrupts the fiber as if interrupted from the specified fiber.
	*/
	unsafeInterruptAsFork(fiberId) {
		this.tell(interruptSignal(interrupt$5(fiberId)));
	}
	/**
	* Adds an observer to the list of observers.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	addObserver(observer) {
		if (this._exitValue !== null) observer(this._exitValue);
		else this._observers.push(observer);
	}
	/**
	* Removes the specified observer from the list of observers that will be
	* notified when the fiber exits.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	removeObserver(observer) {
		this._observers = this._observers.filter((o) => o !== observer);
	}
	/**
	* Retrieves all fiber refs of the fiber.
	*
	* **NOTE**: This method is safe to invoke on any fiber, but if not invoked
	* on this fiber, then values derived from the fiber's state (including the
	* log annotations and log level) may not be up-to-date.
	*/
	getFiberRefs() {
		this.setFiberRef(currentRuntimeFlags, this.currentRuntimeFlags);
		return this._fiberRefs;
	}
	/**
	* Deletes the specified fiber ref.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	unsafeDeleteFiberRef(fiberRef) {
		this._fiberRefs = delete_(this._fiberRefs, fiberRef);
	}
	/**
	* Retrieves the state of the fiber ref, or else its initial value.
	*
	* **NOTE**: This method is safe to invoke on any fiber, but if not invoked
	* on this fiber, then values derived from the fiber's state (including the
	* log annotations and log level) may not be up-to-date.
	*/
	getFiberRef(fiberRef) {
		if (this._fiberRefs.locals.has(fiberRef)) return this._fiberRefs.locals.get(fiberRef)[0][1];
		return fiberRef.initial;
	}
	/**
	* Sets the fiber ref to the specified value.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	setFiberRef(fiberRef, value) {
		this._fiberRefs = updateAs$1(this._fiberRefs, {
			fiberId: this._fiberId,
			fiberRef,
			value
		});
		this.refreshRefCache();
	}
	refreshRefCache() {
		this.currentDefaultServices = this.getFiberRef(currentServices);
		this.currentTracer = this.currentDefaultServices.unsafeMap.get(tracerTag.key);
		this.currentSupervisor = this.getFiberRef(currentSupervisor);
		this.currentScheduler = this.getFiberRef(currentScheduler);
		this.currentContext = this.getFiberRef(currentContext$1);
		this.currentSpan = this.currentContext.unsafeMap.get(spanTag.key);
	}
	/**
	* Wholesale replaces all fiber refs of this fiber.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	setFiberRefs(fiberRefs) {
		this._fiberRefs = fiberRefs;
		this.refreshRefCache();
	}
	/**
	* Adds a reference to the specified fiber inside the children set.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	addChild(child) {
		this.getChildren().add(child);
	}
	/**
	* Removes a reference to the specified fiber inside the children set.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	removeChild(child) {
		this.getChildren().delete(child);
	}
	/**
	* Transfers all children of this fiber that are currently running to the
	* specified fiber scope.
	*
	* **NOTE**: This method must be invoked by the fiber itself after it has
	* evaluated the effects but prior to exiting.
	*/
	transferChildren(scope) {
		const children = this._children;
		this._children = null;
		if (children !== null && children.size > 0) {
			for (const child of children) if (child._exitValue === null) scope.add(this.currentRuntimeFlags, child);
		}
	}
	/**
	* On the current thread, executes all messages in the fiber's inbox. This
	* method may return before all work is done, in the event the fiber executes
	* an asynchronous operation.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	drainQueueOnCurrentThread() {
		let recurse = true;
		while (recurse) {
			let evaluationSignal = EvaluationSignalContinue;
			const prev = globalThis[currentFiberURI];
			globalThis[currentFiberURI] = this;
			try {
				while (evaluationSignal === EvaluationSignalContinue) evaluationSignal = this._queue.length === 0 ? EvaluationSignalDone : this.evaluateMessageWhileSuspended(this._queue.splice(0, 1)[0]);
			} finally {
				this._running = false;
				globalThis[currentFiberURI] = prev;
			}
			if (this._queue.length > 0 && !this._running) {
				this._running = true;
				if (evaluationSignal === EvaluationSignalYieldNow) {
					this.drainQueueLaterOnExecutor();
					recurse = false;
				} else recurse = true;
			} else recurse = false;
		}
	}
	/**
	* Schedules the execution of all messages in the fiber's inbox.
	*
	* This method will return immediately after the scheduling
	* operation is completed, but potentially before such messages have been
	* executed.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	drainQueueLaterOnExecutor() {
		this.currentScheduler.scheduleTask(this.run, this.getFiberRef(currentSchedulingPriority), this);
	}
	/**
	* Drains the fiber's message queue while the fiber is actively running,
	* returning the next effect to execute, which may be the input effect if no
	* additional effect needs to be executed.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	drainQueueWhileRunning(runtimeFlags, cur0) {
		let cur = cur0;
		while (this._queue.length > 0) {
			const message = this._queue.splice(0, 1)[0];
			cur = drainQueueWhileRunningTable[message._tag](this, runtimeFlags, cur, message);
		}
		return cur;
	}
	/**
	* Determines if the fiber is interrupted.
	*
	* **NOTE**: This method is safe to invoke on any fiber, but if not invoked
	* on this fiber, then values derived from the fiber's state (including the
	* log annotations and log level) may not be up-to-date.
	*/
	isInterrupted() {
		return !isEmpty$4(this.getFiberRef(currentInterruptedCause));
	}
	/**
	* Adds an interruptor to the set of interruptors that are interrupting this
	* fiber.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	addInterruptedCause(cause) {
		const oldSC = this.getFiberRef(currentInterruptedCause);
		this.setFiberRef(currentInterruptedCause, sequential$3(oldSC, cause));
	}
	/**
	* Processes a new incoming interrupt signal.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	processNewInterruptSignal(cause) {
		this.addInterruptedCause(cause);
		this.sendInterruptSignalToAllChildren();
	}
	/**
	* Interrupts all children of the current fiber, returning an effect that will
	* await the exit of the children. This method will return null if the fiber
	* has no children.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	sendInterruptSignalToAllChildren() {
		if (this._children === null || this._children.size === 0) return false;
		let told = false;
		for (const child of this._children) {
			child.tell(interruptSignal(interrupt$5(this.id())));
			told = true;
		}
		return told;
	}
	/**
	* Interrupts all children of the current fiber, returning an effect that will
	* await the exit of the children. This method will return null if the fiber
	* has no children.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	interruptAllChildren() {
		if (this.sendInterruptSignalToAllChildren()) {
			const it = this._children.values();
			this._children = null;
			let isDone = false;
			const body = () => {
				const next = it.next();
				if (!next.done) return asVoid$1(next.value.await);
				else return sync$2(() => {
					isDone = true;
				});
			};
			return whileLoop({
				while: () => !isDone,
				body,
				step: () => {}
			});
		}
		return null;
	}
	reportExitValue(exit) {
		if (runtimeMetrics(this.currentRuntimeFlags)) {
			const tags = this.getFiberRef(currentMetricLabels);
			const startTimeMillis = this.id().startTimeMillis;
			const endTimeMillis = Date.now();
			fiberLifetimes.unsafeUpdate(endTimeMillis - startTimeMillis, tags);
			fiberActive.unsafeUpdate(-1, tags);
			switch (exit._tag) {
				case OP_SUCCESS:
					fiberSuccesses.unsafeUpdate(1, tags);
					break;
				case OP_FAILURE: fiberFailures.unsafeUpdate(1, tags);
			}
		}
		if (exit._tag === "Failure") {
			const level = this.getFiberRef(currentUnhandledErrorLogLevel);
			if (!isInterruptedOnly$1(exit.cause) && level._tag === "Some") this.log("Fiber terminated with an unhandled error", exit.cause, level);
		}
	}
	setExitValue(exit) {
		this._exitValue = exit;
		this.reportExitValue(exit);
		for (let i = this._observers.length - 1; i >= 0; i--) this._observers[i](exit);
		this._observers = [];
	}
	getLoggers() {
		return this.getFiberRef(currentLoggers$1);
	}
	log(message, cause, overrideLogLevel) {
		const logLevel = isSome(overrideLogLevel) ? overrideLogLevel.value : this.getFiberRef(currentLogLevel);
		const minimumLogLevel = this.getFiberRef(currentMinimumLogLevel);
		if (greaterThan$1(minimumLogLevel, logLevel)) return;
		const spans = this.getFiberRef(currentLogSpan);
		const annotations = this.getFiberRef(currentLogAnnotations);
		const loggers = this.getLoggers();
		const contextMap = this.getFiberRefs();
		if (size$5(loggers) > 0) {
			const clockService = get$11(this.getFiberRef(currentServices), clockTag);
			const date = new Date(clockService.unsafeCurrentTimeMillis());
			withRedactableContext(contextMap, () => {
				for (const logger of loggers) logger.log({
					fiberId: this.id(),
					logLevel,
					message,
					cause,
					context: contextMap,
					spans,
					annotations,
					date
				});
			});
		}
	}
	/**
	* Evaluates a single message on the current thread, while the fiber is
	* suspended. This method should only be called while evaluation of the
	* fiber's effect is suspended due to an asynchronous operation.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	evaluateMessageWhileSuspended(message) {
		switch (message._tag) {
			case OP_YIELD_NOW: return EvaluationSignalYieldNow;
			case OP_INTERRUPT_SIGNAL:
				this.processNewInterruptSignal(message.cause);
				if (this._asyncInterruptor !== null) {
					this._asyncInterruptor(exitFailCause$1(message.cause));
					this._asyncInterruptor = null;
				}
				return EvaluationSignalContinue;
			case OP_RESUME:
				this._asyncInterruptor = null;
				this._asyncBlockingOn = null;
				this.evaluateEffect(message.effect);
				return EvaluationSignalContinue;
			case OP_STATEFUL:
				message.onFiber(this, this._exitValue !== null ? done$3 : suspended(this.currentRuntimeFlags, this._asyncBlockingOn));
				return EvaluationSignalContinue;
			default: return absurd(message);
		}
	}
	/**
	* Evaluates an effect until completion, potentially asynchronously.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	evaluateEffect(effect0) {
		this.currentSupervisor.onResume(this);
		try {
			let effect = interruptible$3(this.currentRuntimeFlags) && this.isInterrupted() ? exitFailCause$1(this.getInterruptedCause()) : effect0;
			while (effect !== null) {
				const eff = effect;
				const exit = this.runLoop(eff);
				if (exit === YieldedOp) {
					const op = yieldedOpChannel.currentOp;
					yieldedOpChannel.currentOp = null;
					if (op._op === "Yield") {
						if (cooperativeYielding(this.currentRuntimeFlags)) {
							this.tell(yieldNow());
							this.tell(resume(exitVoid$1));
							effect = null;
						} else effect = exitVoid$1;
					} else if (op._op === "Async") effect = null;
				} else {
					this.currentRuntimeFlags = pipe(this.currentRuntimeFlags, enable$1(16));
					const interruption = this.interruptAllChildren();
					if (interruption !== null) effect = flatMap$6(interruption, () => exit);
					else {
						if (this._queue.length === 0) this.setExitValue(exit);
						else this.tell(resume(exit));
						effect = null;
					}
				}
			}
		} finally {
			this.currentSupervisor.onSuspend(this);
		}
	}
	/**
	* Begins execution of the effect associated with this fiber on the current
	* thread. This can be called to "kick off" execution of a fiber after it has
	* been created, in hopes that the effect can be executed synchronously.
	*
	* This is not the normal way of starting a fiber, but it is useful when the
	* express goal of executing the fiber is to synchronously produce its exit.
	*/
	start(effect) {
		if (!this._running) {
			this._running = true;
			const prev = globalThis[currentFiberURI];
			globalThis[currentFiberURI] = this;
			try {
				this.evaluateEffect(effect);
			} finally {
				this._running = false;
				globalThis[currentFiberURI] = prev;
				if (this._queue.length > 0) this.drainQueueLaterOnExecutor();
			}
		} else this.tell(resume(effect));
	}
	/**
	* Begins execution of the effect associated with this fiber on in the
	* background, and on the correct thread pool. This can be called to "kick
	* off" execution of a fiber after it has been created, in hopes that the
	* effect can be executed synchronously.
	*/
	startFork(effect) {
		this.tell(resume(effect));
	}
	/**
	* Takes the current runtime flags, patches them to return the new runtime
	* flags, and then makes any changes necessary to fiber state based on the
	* specified patch.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	patchRuntimeFlags(oldRuntimeFlags, patch) {
		const newRuntimeFlags = patch$4(oldRuntimeFlags, patch);
		globalThis[currentFiberURI] = this;
		this.currentRuntimeFlags = newRuntimeFlags;
		return newRuntimeFlags;
	}
	/**
	* Initiates an asynchronous operation, by building a callback that will
	* resume execution, and then feeding that callback to the registration
	* function, handling error cases and repeated resumptions appropriately.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	initiateAsync(runtimeFlags, asyncRegister) {
		let alreadyCalled = false;
		const callback = (effect) => {
			if (!alreadyCalled) {
				alreadyCalled = true;
				this.tell(resume(effect));
			}
		};
		if (interruptible$3(runtimeFlags)) this._asyncInterruptor = callback;
		try {
			asyncRegister(callback);
		} catch (e) {
			callback(failCause$6(die$5(e)));
		}
	}
	pushStack(cont) {
		this._stack.push(cont);
		if (cont._op === "OnStep") this._steps.push({
			refs: this.getFiberRefs(),
			flags: this.currentRuntimeFlags
		});
	}
	popStack() {
		const item = this._stack.pop();
		if (item) {
			if (item._op === "OnStep") this._steps.pop();
			return item;
		}
	}
	getNextSuccessCont() {
		let frame = this.popStack();
		while (frame) {
			if (frame._op !== "OnFailure") return frame;
			frame = this.popStack();
		}
	}
	getNextFailCont() {
		let frame = this.popStack();
		while (frame) {
			if (frame._op !== "OnSuccess" && frame._op !== "While" && frame._op !== "Iterator") return frame;
			frame = this.popStack();
		}
	}
	["Tag"](op) {
		return sync$2(() => unsafeGet$2(this.currentContext, op));
	}
	["Left"](op) {
		return fail$7(op.left);
	}
	["None"](_) {
		return fail$7(new NoSuchElementException$2());
	}
	["Right"](op) {
		return exitSucceed$1(op.right);
	}
	["Some"](op) {
		return exitSucceed$1(op.value);
	}
	["Micro"](op) {
		return unsafeAsync((microResume) => {
			let resume = microResume;
			const fiber = runFork$2(provideContext(op, this.currentContext));
			fiber.addObserver((exit) => {
				if (exit._tag === "Success") return resume(exitSucceed$1(exit.value));
				switch (exit.cause._tag) {
					case "Interrupt": return resume(exitFailCause$1(interrupt$5(none$2)));
					case "Fail": return resume(fail$7(exit.cause.error));
					case "Die": return resume(die$4(exit.cause.defect));
				}
			});
			return unsafeAsync((abortResume) => {
				resume = (_) => {
					abortResume(void_$4);
				};
				fiber.unsafeInterrupt();
			});
		});
	}
	[OP_SYNC](op) {
		const value = internalCall(() => op.effect_instruction_i0());
		const cont = this.getNextSuccessCont();
		if (cont !== void 0) {
			if (!(cont._op in contOpSuccess)) absurd(cont);
			return contOpSuccess[cont._op](this, cont, value);
		} else {
			yieldedOpChannel.currentOp = exitSucceed$1(value);
			return YieldedOp;
		}
	}
	[OP_SUCCESS](op) {
		const oldCur = op;
		const cont = this.getNextSuccessCont();
		if (cont !== void 0) {
			if (!(cont._op in contOpSuccess)) absurd(cont);
			return contOpSuccess[cont._op](this, cont, oldCur.effect_instruction_i0);
		} else {
			yieldedOpChannel.currentOp = oldCur;
			return YieldedOp;
		}
	}
	[OP_FAILURE](op) {
		const cause = op.effect_instruction_i0;
		const cont = this.getNextFailCont();
		if (cont !== void 0) switch (cont._op) {
			case OP_ON_FAILURE:
			case OP_ON_SUCCESS_AND_FAILURE: if (!(interruptible$3(this.currentRuntimeFlags) && this.isInterrupted())) return internalCall(() => cont.effect_instruction_i1(cause));
			else return exitFailCause$1(stripFailures(cause));
			case "OnStep": if (!(interruptible$3(this.currentRuntimeFlags) && this.isInterrupted())) return exitSucceed$1(exitFailCause$1(cause));
			else return exitFailCause$1(stripFailures(cause));
			case OP_REVERT_FLAGS:
				this.patchRuntimeFlags(this.currentRuntimeFlags, cont.patch);
				if (interruptible$3(this.currentRuntimeFlags) && this.isInterrupted()) return exitFailCause$1(sequential$3(cause, this.getInterruptedCause()));
				else return exitFailCause$1(cause);
			default: absurd(cont);
		}
		else {
			yieldedOpChannel.currentOp = exitFailCause$1(cause);
			return YieldedOp;
		}
	}
	[OP_WITH_RUNTIME](op) {
		return internalCall(() => op.effect_instruction_i0(this, running(this.currentRuntimeFlags)));
	}
	["Blocked"](op) {
		const refs = this.getFiberRefs();
		const flags = this.currentRuntimeFlags;
		if (this._steps.length > 0) {
			const frames = [];
			const snap = this._steps[this._steps.length - 1];
			let frame = this.popStack();
			while (frame && frame._op !== "OnStep") {
				frames.push(frame);
				frame = this.popStack();
			}
			this.setFiberRefs(snap.refs);
			this.currentRuntimeFlags = snap.flags;
			const patchRefs = diff$1(snap.refs, refs);
			const patchFlags = diff$3(snap.flags, flags);
			return exitSucceed$1(blocked(op.effect_instruction_i0, withFiberRuntime$1((newFiber) => {
				while (frames.length > 0) newFiber.pushStack(frames.pop());
				newFiber.setFiberRefs(patch$1(newFiber.id(), newFiber.getFiberRefs())(patchRefs));
				newFiber.currentRuntimeFlags = patch$4(patchFlags)(newFiber.currentRuntimeFlags);
				return op.effect_instruction_i1;
			})));
		}
		return uninterruptibleMask$2((restore) => flatMap$6(forkDaemon$1(runRequestBlock(op.effect_instruction_i0)), () => restore(op.effect_instruction_i1)));
	}
	["RunBlocked"](op) {
		return runBlockedRequests(op.effect_instruction_i0);
	}
	[OP_UPDATE_RUNTIME_FLAGS](op) {
		const updateFlags = op.effect_instruction_i0;
		const oldRuntimeFlags = this.currentRuntimeFlags;
		const newRuntimeFlags = patch$4(oldRuntimeFlags, updateFlags);
		if (interruptible$3(newRuntimeFlags) && this.isInterrupted()) return exitFailCause$1(this.getInterruptedCause());
		else {
			this.patchRuntimeFlags(this.currentRuntimeFlags, updateFlags);
			if (op.effect_instruction_i1) {
				const revertFlags = diff$3(newRuntimeFlags, oldRuntimeFlags);
				this.pushStack(new RevertFlags(revertFlags, op));
				return internalCall(() => op.effect_instruction_i1(oldRuntimeFlags));
			} else return exitVoid$1;
		}
	}
	[OP_ON_SUCCESS](op) {
		this.pushStack(op);
		return op.effect_instruction_i0;
	}
	["OnStep"](op) {
		this.pushStack(op);
		return op.effect_instruction_i0;
	}
	[OP_ON_FAILURE](op) {
		this.pushStack(op);
		return op.effect_instruction_i0;
	}
	[OP_ON_SUCCESS_AND_FAILURE](op) {
		this.pushStack(op);
		return op.effect_instruction_i0;
	}
	[OP_ASYNC](op) {
		this._asyncBlockingOn = op.effect_instruction_i1;
		this.initiateAsync(this.currentRuntimeFlags, op.effect_instruction_i0);
		yieldedOpChannel.currentOp = op;
		return YieldedOp;
	}
	[OP_YIELD$1](op) {
		this._isYielding = false;
		yieldedOpChannel.currentOp = op;
		return YieldedOp;
	}
	[OP_WHILE](op) {
		const check = op.effect_instruction_i0;
		const body = op.effect_instruction_i1;
		if (check()) {
			this.pushStack(op);
			return body();
		} else return exitVoid$1;
	}
	[OP_ITERATOR](op) {
		return contOpSuccess[OP_ITERATOR](this, op, void 0);
	}
	[OP_COMMIT](op) {
		return internalCall(() => op.commit());
	}
	/**
	* The main run-loop for evaluating effects.
	*
	* **NOTE**: This method must be invoked by the fiber itself.
	*/
	runLoop(effect0) {
		let cur = effect0;
		this.currentOpCount = 0;
		while (true) {
			if ((this.currentRuntimeFlags & 2) !== 0) this.currentSupervisor.onEffect(this, cur);
			if (this._queue.length > 0) cur = this.drainQueueWhileRunning(this.currentRuntimeFlags, cur);
			if (!this._isYielding) {
				this.currentOpCount += 1;
				const shouldYield = this.currentScheduler.shouldYield(this);
				if (shouldYield !== false) {
					this._isYielding = true;
					this.currentOpCount = 0;
					const oldCur = cur;
					cur = flatMap$6(yieldNow$2({ priority: shouldYield }), () => oldCur);
				}
			}
			try {
				cur = this.currentTracer.context(() => {
					if (_version !== cur[EffectTypeId]._V) {
						const level = this.getFiberRef(currentVersionMismatchErrorLogLevel);
						if (level._tag === "Some") {
							const effectVersion = cur[EffectTypeId]._V;
							this.log(`Executing an Effect versioned ${effectVersion} with a Runtime of version ${getCurrentVersion()}, you may want to dedupe the effect dependencies, you can use the language service plugin to detect this at compile time: https://github.com/Effect-TS/language-service`, empty$12, level);
						}
					}
					return this[cur._op](cur);
				}, this);
				if (cur === YieldedOp) {
					const op = yieldedOpChannel.currentOp;
					if (op._op === "Yield" || op._op === "Async") return YieldedOp;
					yieldedOpChannel.currentOp = null;
					return op._op === "Success" || op._op === "Failure" ? op : exitFailCause$1(die$5(op));
				}
			} catch (e) {
				if (cur !== YieldedOp && !hasProperty(cur, "_op") || !(cur._op in this)) cur = dieMessage$1(`Not a valid effect: ${toStringUnknown(cur)}`);
				else if (isInterruptedException(e)) cur = exitFailCause$1(sequential$3(die$5(e), interrupt$5(none$2)));
				else cur = die$4(e);
			}
		}
	}
	run = () => {
		this.drainQueueOnCurrentThread();
	};
};
/** @internal */
const currentMinimumLogLevel = /*#__PURE__*/ globalValue("effect/FiberRef/currentMinimumLogLevel", () => fiberRefUnsafeMake(fromLiteral("Info")));
/** @internal */
const loggerWithConsoleLog = (self) => makeLogger((opts) => {
	const services = getOrDefault(opts.context, currentServices);
	get$11(services, consoleTag).unsafe.log(self.log(opts));
});
/** @internal */
const defaultLogger$1 = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/Logger/defaultLogger"), () => loggerWithConsoleLog(stringLogger));
/** @internal */
const tracerLogger = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/Logger/tracerLogger"), () => makeLogger(({ annotations, cause, context, fiberId, logLevel, message }) => {
	const span = filterDisablePropagation(getOption(getOrDefault$1(context, currentContext$1), spanTag));
	if (span._tag === "None" || span.value._tag === "ExternalSpan") return;
	const clockService = unsafeGet$2(getOrDefault$1(context, currentServices), clockTag);
	const attributes = {};
	for (const [key, value] of annotations) attributes[key] = value;
	attributes["effect.fiberId"] = threadName(fiberId);
	attributes["effect.logLevel"] = logLevel.label;
	if (cause !== null && cause._tag !== "Empty") attributes["effect.cause"] = pretty$1(cause, { renderErrorCause: true });
	span.value.event(toStringUnknown(Array.isArray(message) && message.length === 1 ? message[0] : message), clockService.unsafeCurrentTimeNanos(), attributes);
}));
/** @internal */
const currentLoggers$1 = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/FiberRef/currentLoggers"), () => fiberRefUnsafeMakeHashSet(make$40(defaultLogger$1, tracerLogger)));
const acquireRelease$1 = /*#__PURE__*/ dual((args) => isEffect$1(args[0]), (acquire, release) => uninterruptible$1(tap$1(acquire, (a) => addFinalizer$2((exit) => release(a, exit)))));
const addFinalizer$2 = (finalizer) => withFiberRuntime$1((runtime) => {
	const acquireRefs = runtime.getFiberRefs();
	const acquireFlags = disable$1(runtime.currentRuntimeFlags, 1);
	return flatMap$6(scope$1, (scope) => scopeAddFinalizerExit(scope, (exit) => withFiberRuntime$1((runtimeFinalizer) => {
		const preRefs = runtimeFinalizer.getFiberRefs();
		const preFlags = runtimeFinalizer.currentRuntimeFlags;
		const patchRefs = diff$1(preRefs, acquireRefs);
		const patchFlags = diff$3(preFlags, acquireFlags);
		const inverseRefs = diff$1(acquireRefs, preRefs);
		runtimeFinalizer.setFiberRefs(patch$1(patchRefs, runtimeFinalizer.id(), acquireRefs));
		return ensuring$3(withRuntimeFlags(finalizer(exit), patchFlags), sync$2(() => {
			runtimeFinalizer.setFiberRefs(patch$1(inverseRefs, runtimeFinalizer.id(), runtimeFinalizer.getFiberRefs()));
		}));
	})));
});
const allResolveInput = (input) => {
	if (Array.isArray(input) || isIterable(input)) return [input, none$4()];
	const keys = Object.keys(input);
	const size = keys.length;
	return [keys.map((k) => input[k]), some((values) => {
		const res = {};
		for (let i = 0; i < size; i++) res[keys[i]] = values[i];
		return res;
	})];
};
const allValidate = (effects, reconcile, options) => {
	const eitherEffects = [];
	for (const effect of effects) eitherEffects.push(either$2(effect));
	return flatMap$6(forEach$3(eitherEffects, identity, {
		concurrency: options?.concurrency,
		batching: options?.batching,
		concurrentFinalizers: options?.concurrentFinalizers
	}), (eithers) => {
		const none = none$4();
		const size = eithers.length;
		const errors = new Array(size);
		const successes = new Array(size);
		let errored = false;
		for (let i = 0; i < size; i++) {
			const either = eithers[i];
			if (either._tag === "Left") {
				errors[i] = some(either.left);
				errored = true;
			} else {
				successes[i] = either.right;
				errors[i] = none;
			}
		}
		if (errored) return reconcile._tag === "Some" ? fail$7(reconcile.value(errors)) : fail$7(errors);
		else if (options?.discard) return void_$4;
		return reconcile._tag === "Some" ? succeed$8(reconcile.value(successes)) : succeed$8(successes);
	});
};
const allEither = (effects, reconcile, options) => {
	const eitherEffects = [];
	for (const effect of effects) eitherEffects.push(either$2(effect));
	if (options?.discard) return forEach$3(eitherEffects, identity, {
		concurrency: options?.concurrency,
		batching: options?.batching,
		discard: true,
		concurrentFinalizers: options?.concurrentFinalizers
	});
	return map$6(forEach$3(eitherEffects, identity, {
		concurrency: options?.concurrency,
		batching: options?.batching,
		concurrentFinalizers: options?.concurrentFinalizers
	}), (eithers) => reconcile._tag === "Some" ? reconcile.value(eithers) : eithers);
};
const all$1 = (arg, options) => {
	const [effects, reconcile] = allResolveInput(arg);
	if (options?.mode === "validate") return allValidate(effects, reconcile, options);
	else if (options?.mode === "either") return allEither(effects, reconcile, options);
	return options?.discard !== true && reconcile._tag === "Some" ? map$6(forEach$3(effects, identity, options), reconcile.value) : forEach$3(effects, identity, options);
};
const forEach$3 = /*#__PURE__*/ dual((args) => isIterable(args[0]), (self, f, options) => withFiberRuntime$1((r) => {
	const isRequestBatchingEnabled = options?.batching === true || options?.batching === "inherit" && r.getFiberRef(currentRequestBatching);
	if (options?.discard) return match$5(options.concurrency, () => finalizersMaskInternal(sequential$1, options?.concurrentFinalizers)((restore) => isRequestBatchingEnabled ? forEachConcurrentDiscard(self, (a, i) => restore(f(a, i)), true, false, 1) : forEachSequentialDiscard(self, (a, i) => restore(f(a, i)))), () => finalizersMaskInternal(parallel$1, options?.concurrentFinalizers)((restore) => forEachConcurrentDiscard(self, (a, i) => restore(f(a, i)), isRequestBatchingEnabled, false)), (n) => finalizersMaskInternal(parallelN(n), options?.concurrentFinalizers)((restore) => forEachConcurrentDiscard(self, (a, i) => restore(f(a, i)), isRequestBatchingEnabled, false, n)));
	return match$5(options?.concurrency, () => finalizersMaskInternal(sequential$1, options?.concurrentFinalizers)((restore) => isRequestBatchingEnabled ? forEachParN(self, 1, (a, i) => restore(f(a, i)), true) : forEachSequential(self, (a, i) => restore(f(a, i)))), () => finalizersMaskInternal(parallel$1, options?.concurrentFinalizers)((restore) => forEachParUnbounded(self, (a, i) => restore(f(a, i)), isRequestBatchingEnabled)), (n) => finalizersMaskInternal(parallelN(n), options?.concurrentFinalizers)((restore) => forEachParN(self, n, (a, i) => restore(f(a, i)), isRequestBatchingEnabled)));
}));
const forEachParUnbounded = (self, f, batching) => suspend$7(() => {
	const as = fromIterable$6(self);
	const array = new Array(as.length);
	const fn = (a, i) => flatMap$6(f(a, i), (b) => sync$2(() => array[i] = b));
	return zipRight$3(forEachConcurrentDiscard(as, fn, batching, false), succeed$8(array));
});
/** @internal */
const forEachConcurrentDiscard = (self, f, batching, processAll, n) => uninterruptibleMask$2((restore) => transplant((graft) => withFiberRuntime$1((parent) => {
	let todos = Array.from(self).reverse();
	let target = todos.length;
	if (target === 0) return void_$4;
	let counter = 0;
	let interrupted = false;
	const fibersCount = n ? Math.min(todos.length, n) : todos.length;
	const fibers = /* @__PURE__ */ new Set();
	const results = new Array();
	const interruptAll = () => fibers.forEach((fiber) => {
		fiber.currentScheduler.scheduleTask(() => {
			fiber.unsafeInterruptAsFork(parent.id());
		}, 0, fiber);
	});
	const startOrder = new Array();
	const joinOrder = new Array();
	const residual = new Array();
	const collectExits = () => {
		const exits = results.filter(({ exit }) => exit._tag === "Failure").sort((a, b) => a.index < b.index ? -1 : a.index === b.index ? 0 : 1).map(({ exit }) => exit);
		if (exits.length === 0) exits.push(exitVoid$1);
		return exits;
	};
	const runFiber = (eff, interruptImmediately = false) => {
		const runnable = uninterruptible$1(graft(eff));
		const fiber = unsafeForkUnstarted(runnable, parent, parent.currentRuntimeFlags, globalScope);
		parent.currentScheduler.scheduleTask(() => {
			if (interruptImmediately) fiber.unsafeInterruptAsFork(parent.id());
			fiber.resume(runnable);
		}, 0, fiber);
		return fiber;
	};
	const onInterruptSignal = () => {
		if (!processAll) {
			target -= todos.length;
			todos = [];
		}
		interrupted = true;
		interruptAll();
	};
	const stepOrExit = batching ? step : exit$1;
	const processingFiber = runFiber(async_((resume) => {
		const pushResult = (res, index) => {
			if (res._op === "Blocked") residual.push(res);
			else {
				results.push({
					index,
					exit: res
				});
				if (res._op === "Failure" && !interrupted) onInterruptSignal();
			}
		};
		const next = () => {
			if (todos.length > 0) {
				const a = todos.pop();
				let index = counter++;
				const returnNextElement = () => {
					const a = todos.pop();
					index = counter++;
					return flatMap$6(yieldNow$2(), () => flatMap$6(stepOrExit(restore(f(a, index))), onRes));
				};
				const onRes = (res) => {
					if (todos.length > 0) {
						pushResult(res, index);
						if (todos.length > 0) return returnNextElement();
					}
					return succeed$8(res);
				};
				const todo = flatMap$6(stepOrExit(restore(f(a, index))), onRes);
				const fiber = runFiber(todo);
				startOrder.push(fiber);
				fibers.add(fiber);
				if (interrupted) fiber.currentScheduler.scheduleTask(() => {
					fiber.unsafeInterruptAsFork(parent.id());
				}, 0, fiber);
				fiber.addObserver((wrapped) => {
					let exit;
					if (wrapped._op === "Failure") exit = wrapped;
					else exit = wrapped.effect_instruction_i0;
					joinOrder.push(fiber);
					fibers.delete(fiber);
					pushResult(exit, index);
					if (results.length === target) resume(succeed$8(getOrElse(exitCollectAll(collectExits(), { parallel: true }), () => exitVoid$1)));
					else if (residual.length + results.length === target) {
						const exits = collectExits();
						const requests = residual.map((blocked) => blocked.effect_instruction_i0).reduce(par);
						resume(succeed$8(blocked(requests, forEachConcurrentDiscard([getOrElse(exitCollectAll(exits, { parallel: true }), () => exitVoid$1), ...residual.map((blocked) => blocked.effect_instruction_i1)], (i) => i, batching, true, n))));
					} else next();
				});
			}
		};
		for (let i = 0; i < fibersCount; i++) next();
	}));
	return asVoid$1(onExit$1(flatten$6(restore(join$2(processingFiber))), exitMatch({
		onFailure: (cause) => {
			onInterruptSignal();
			const target = residual.length + 1;
			const concurrency = Math.min(typeof n === "number" ? n : residual.length, residual.length);
			const toPop = Array.from(residual);
			return async_((cb) => {
				const exits = [];
				let count = 0;
				let index = 0;
				const check = (index, hitNext) => (exit) => {
					exits[index] = exit;
					count++;
					if (count === target) cb(exitSucceed$1(exitFailCause$1(cause)));
					if (toPop.length > 0 && hitNext) next();
				};
				const next = () => {
					runFiber(toPop.pop(), true).addObserver(check(index, true));
					index++;
				};
				processingFiber.addObserver(check(index, false));
				index++;
				for (let i = 0; i < concurrency; i++) next();
			});
		},
		onSuccess: () => forEachSequential(joinOrder, (f) => f.inheritAll)
	})));
})));
const forEachParN = (self, n, f, batching) => suspend$7(() => {
	const as = fromIterable$6(self);
	const array = new Array(as.length);
	const fn = (a, i) => map$6(f(a, i), (b) => array[i] = b);
	return zipRight$3(forEachConcurrentDiscard(as, fn, batching, false, n), succeed$8(array));
});
const forkDaemon$1 = (self) => forkWithScopeOverride(self, globalScope);
/** @internal */
const unsafeFork$1 = (effect, parentFiber, parentRuntimeFlags, overrideScope = null) => {
	const childFiber = unsafeMakeChildFiber(effect, parentFiber, parentRuntimeFlags, overrideScope);
	childFiber.resume(effect);
	return childFiber;
};
/** @internal */
const unsafeForkUnstarted = (effect, parentFiber, parentRuntimeFlags, overrideScope = null) => {
	return unsafeMakeChildFiber(effect, parentFiber, parentRuntimeFlags, overrideScope);
};
/** @internal */
const unsafeMakeChildFiber = (effect, parentFiber, parentRuntimeFlags, overrideScope = null) => {
	const childId = unsafeMake$8();
	const parentFiberRefs = parentFiber.getFiberRefs();
	const childFiberRefs = forkAs(parentFiberRefs, childId);
	const childFiber = new FiberRuntime(childId, childFiberRefs, parentRuntimeFlags);
	const childContext = getOrDefault$1(childFiberRefs, currentContext$1);
	const supervisor = childFiber.currentSupervisor;
	supervisor.onStart(childContext, effect, some(parentFiber), childFiber);
	childFiber.addObserver((exit) => supervisor.onEnd(exit, childFiber));
	(overrideScope !== null ? overrideScope : pipe(parentFiber.getFiberRef(currentForkScopeOverride), getOrElse(() => parentFiber.scope()))).add(parentRuntimeFlags, childFiber);
	return childFiber;
};
const forkWithScopeOverride = (self, scopeOverride) => withFiberRuntime$1((parentFiber, parentStatus) => succeed$8(unsafeFork$1(self, parentFiber, parentStatus.runtimeFlags, scopeOverride)));
const parallelFinalizers = (self) => contextWithEffect((context) => match$9(getOption(context, scopeTag), {
	onNone: () => self,
	onSome: (scope) => {
		switch (scope.strategy._tag) {
			case "Parallel": return self;
			case "Sequential":
			case "ParallelN": return flatMap$6(scopeFork(scope, parallel$1), (inner) => scopeExtend(self, inner));
		}
	}
}));
const parallelNFinalizers = (parallelism) => (self) => contextWithEffect((context) => match$9(getOption(context, scopeTag), {
	onNone: () => self,
	onSome: (scope) => {
		if (scope.strategy._tag === "ParallelN" && scope.strategy.parallelism === parallelism) return self;
		return flatMap$6(scopeFork(scope, parallelN(parallelism)), (inner) => scopeExtend(self, inner));
	}
}));
const finalizersMaskInternal = (strategy, concurrentFinalizers) => (self) => contextWithEffect((context) => match$9(getOption(context, scopeTag), {
	onNone: () => self(identity),
	onSome: (scope) => {
		if (concurrentFinalizers === true) {
			const patch = strategy._tag === "Parallel" ? parallelFinalizers : strategy._tag === "Sequential" ? sequentialFinalizers : parallelNFinalizers(strategy.parallelism);
			switch (scope.strategy._tag) {
				case "Parallel": return patch(self(parallelFinalizers));
				case "Sequential": return patch(self(sequentialFinalizers));
				case "ParallelN": return patch(self(parallelNFinalizers(scope.strategy.parallelism)));
			}
		} else return self(identity);
	}
}));
const scopeWith$1 = (f) => flatMap$6(scopeTag, f);
/** @internal */
const scopedWith$2 = (f) => flatMap$6(scopeMake(), (scope) => onExit$1(f(scope), (exit) => scope.close(exit)));
const scopedEffect = (effect) => flatMap$6(scopeMake(), (scope) => scopeUse(effect, scope));
const sequentialFinalizers = (self) => contextWithEffect((context) => match$9(getOption(context, scopeTag), {
	onNone: () => self,
	onSome: (scope) => {
		switch (scope.strategy._tag) {
			case "Sequential": return self;
			case "Parallel":
			case "ParallelN": return flatMap$6(scopeFork(scope, sequential$1), (inner) => scopeExtend(self, inner));
		}
	}
}));
/** @internal */
const zipOptions = /*#__PURE__*/ dual((args) => isEffect$1(args[1]), (self, that, options) => zipWithOptions(self, that, (a, b) => [a, b], options));
/** @internal */
const zipLeftOptions = /*#__PURE__*/ dual((args) => isEffect$1(args[1]), (self, that, options) => {
	if (options?.concurrent !== true && (options?.batching === void 0 || options.batching === false)) return zipLeft$1(self, that);
	return zipWithOptions(self, that, (a, _) => a, options);
});
/** @internal */
const zipRightOptions = /*#__PURE__*/ dual((args) => isEffect$1(args[1]), (self, that, options) => {
	if (options?.concurrent !== true && (options?.batching === void 0 || options.batching === false)) return zipRight$3(self, that);
	return zipWithOptions(self, that, (_, b) => b, options);
});
/** @internal */
const zipWithOptions = /*#__PURE__*/ dual((args) => isEffect$1(args[1]), (self, that, f, options) => map$6(all$1([self, that], {
	concurrency: options?.concurrent ? 2 : 1,
	batching: options?.batching,
	concurrentFinalizers: options?.concurrentFinalizers
}), ([a, a2]) => f(a, a2)));
/** @internal */
const scopeTag = /*#__PURE__*/ GenericTag("effect/Scope");
const scope$1 = scopeTag;
const scopeUnsafeAddFinalizer = (scope, fin) => {
	if (scope.state._tag === "Open") scope.state.finalizers.set({}, fin);
};
const ScopeImplProto = {
	[ScopeTypeId]: ScopeTypeId,
	[CloseableScopeTypeId]: CloseableScopeTypeId,
	pipe() {
		return pipeArguments(this, arguments);
	},
	fork(strategy) {
		return sync$2(() => {
			const newScope = scopeUnsafeMake(strategy);
			if (this.state._tag === "Closed") {
				newScope.state = this.state;
				return newScope;
			}
			const key = {};
			const fin = (exit) => newScope.close(exit);
			this.state.finalizers.set(key, fin);
			scopeUnsafeAddFinalizer(newScope, (_) => sync$2(() => {
				if (this.state._tag === "Open") this.state.finalizers.delete(key);
			}));
			return newScope;
		});
	},
	close(exit) {
		return suspend$7(() => {
			if (this.state._tag === "Closed") return void_$4;
			const finalizers = Array.from(this.state.finalizers.values()).reverse();
			this.state = {
				_tag: "Closed",
				exit
			};
			if (finalizers.length === 0) return void_$4;
			return isSequential(this.strategy) ? pipe(forEachSequential(finalizers, (fin) => exit$1(fin(exit))), flatMap$6((results) => pipe(exitCollectAll(results), map$13(exitAsVoid), getOrElse(() => exitVoid$1)))) : isParallel(this.strategy) ? pipe(forEachParUnbounded(finalizers, (fin) => exit$1(fin(exit)), false), flatMap$6((results) => pipe(exitCollectAll(results, { parallel: true }), map$13(exitAsVoid), getOrElse(() => exitVoid$1)))) : pipe(forEachParN(finalizers, this.strategy.parallelism, (fin) => exit$1(fin(exit)), false), flatMap$6((results) => pipe(exitCollectAll(results, { parallel: true }), map$13(exitAsVoid), getOrElse(() => exitVoid$1))));
		});
	},
	addFinalizer(fin) {
		return suspend$7(() => {
			if (this.state._tag === "Closed") return fin(this.state.exit);
			this.state.finalizers.set({}, fin);
			return void_$4;
		});
	}
};
const scopeUnsafeMake = (strategy = sequential$2) => {
	const scope = Object.create(ScopeImplProto);
	scope.strategy = strategy;
	scope.state = {
		_tag: "Open",
		finalizers: /* @__PURE__ */ new Map()
	};
	return scope;
};
const scopeMake = (strategy = sequential$2) => sync$2(() => scopeUnsafeMake(strategy));
const scopeExtend = /*#__PURE__*/ dual(2, (effect, scope) => mapInputContext(effect, merge$4(make$48(scopeTag, scope))));
const scopeUse = /*#__PURE__*/ dual(2, (effect, scope) => pipe(effect, scopeExtend(scope), onExit$1((exit) => scope.close(exit))));
/** @internal */
const fiberRefUnsafeMakeSupervisor = (initial) => fiberRefUnsafeMakePatch(initial, {
	differ,
	fork: empty$6
});
/** @internal */
const currentRuntimeFlags = /*#__PURE__*/ fiberRefUnsafeMakeRuntimeFlags(none$1);
/** @internal */
const currentSupervisor = /*#__PURE__*/ fiberRefUnsafeMakeSupervisor(none);
/** @internal */
const raceWith$1 = /*#__PURE__*/ dual(3, (self, other, options) => raceFibersWith(self, other, {
	onSelfWin: (winner, loser) => flatMap$6(winner.await, (exit) => {
		switch (exit._tag) {
			case OP_SUCCESS: return flatMap$6(winner.inheritAll, () => options.onSelfDone(exit, loser));
			case OP_FAILURE: return options.onSelfDone(exit, loser);
		}
	}),
	onOtherWin: (winner, loser) => flatMap$6(winner.await, (exit) => {
		switch (exit._tag) {
			case OP_SUCCESS: return flatMap$6(winner.inheritAll, () => options.onOtherDone(exit, loser));
			case OP_FAILURE: return options.onOtherDone(exit, loser);
		}
	})
}));
/** @internal */
const race$1 = /*#__PURE__*/ dual(2, (self, that) => fiberIdWith$1((parentFiberId) => raceWith$1(self, that, {
	onSelfDone: (exit, right) => exitMatchEffect(exit, {
		onFailure: (cause) => pipe(join$2(right), mapErrorCause((cause2) => parallel$3(cause, cause2))),
		onSuccess: (value) => pipe(right, interruptAsFiber(parentFiberId), as$2(value))
	}),
	onOtherDone: (exit, left) => exitMatchEffect(exit, {
		onFailure: (cause) => pipe(join$2(left), mapErrorCause((cause2) => parallel$3(cause2, cause))),
		onSuccess: (value) => pipe(left, interruptAsFiber(parentFiberId), as$2(value))
	})
})));
/** @internal */
const raceFibersWith = /*#__PURE__*/ dual(3, (self, other, options) => withFiberRuntime$1((parentFiber, parentStatus) => {
	const parentRuntimeFlags = parentStatus.runtimeFlags;
	const raceIndicator = make$39(true);
	const leftFiber = unsafeMakeChildFiber(self, parentFiber, parentRuntimeFlags, options.selfScope);
	const rightFiber = unsafeMakeChildFiber(other, parentFiber, parentRuntimeFlags, options.otherScope);
	return async_((cb) => {
		leftFiber.addObserver(() => completeRace(leftFiber, rightFiber, options.onSelfWin, raceIndicator, cb));
		rightFiber.addObserver(() => completeRace(rightFiber, leftFiber, options.onOtherWin, raceIndicator, cb));
		leftFiber.startFork(self);
		rightFiber.startFork(other);
	}, combine$5(leftFiber.id(), rightFiber.id()));
}));
const completeRace = (winner, loser, cont, ab, cb) => {
	if (compareAndSet(true, false)(ab)) cb(cont(winner, loser));
};
/** @internal */
const ensuring$3 = /*#__PURE__*/ dual(2, (self, finalizer) => uninterruptibleMask$2((restore) => matchCauseEffect$2(restore(self), {
	onFailure: (cause1) => matchCauseEffect$2(finalizer, {
		onFailure: (cause2) => failCause$6(sequential$3(cause1, cause2)),
		onSuccess: () => failCause$6(cause1)
	}),
	onSuccess: (a) => as$2(finalizer, a)
})));
/** @internal */
const invokeWithInterrupt = (self, entries, onInterrupt) => fiberIdWith$1((id) => ensuring$3(flatMap$6(forkDaemon$1(interruptible$2(self)), (processing) => async_((cb) => {
	const counts = entries.map((_) => _.listeners.count);
	const checkDone = () => {
		if (counts.every((count) => count === 0)) {
			if (entries.every((_) => {
				if (_.result.state.current._tag === "Pending") return true;
				else if (_.result.state.current._tag === "Done" && exitIsExit(_.result.state.current.effect) && _.result.state.current.effect._tag === "Failure" && isInterrupted$1(_.result.state.current.effect.cause)) return true;
				else return false;
			})) {
				cleanup.forEach((f) => f());
				onInterrupt?.();
				cb(interruptFiber(processing));
			}
		}
	};
	processing.addObserver((exit) => {
		cleanup.forEach((f) => f());
		cb(exit);
	});
	const cleanup = entries.map((r, i) => {
		const observer = (count) => {
			counts[i] = count;
			checkDone();
		};
		r.listeners.addObserver(observer);
		return () => r.listeners.removeObserver(observer);
	});
	checkDone();
	return sync$2(() => {
		cleanup.forEach((f) => f());
	});
})), suspend$7(() => {
	const residual = entries.flatMap((entry) => {
		if (!entry.state.completed) return [entry];
		return [];
	});
	return forEachSequentialDiscard(residual, (entry) => complete$1(entry.request, exitInterrupt$1(id)));
})));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Cause.js
/**
* Creates an `Empty` cause.
*
* **Details**
*
* This function returns a cause that signifies "no error." It's commonly used
* to represent an absence of failure conditions.
*
* @see {@link isEmpty} Check if a `Cause` is empty
*
* @since 2.0.0
* @category Constructors
*/
const empty$5 = empty$12;
/**
* Creates a `Fail` cause from an expected error.
*
* **Details**
*
* This function constructs a `Cause` carrying an error of type `E`. It's used
* when you want to represent a known or anticipated failure in your effectful
* computations.
*
* @see {@link isFailure} Check if a `Cause` contains a failure
*
* @since 2.0.0
* @category Constructors
*/
const fail$4 = fail$8;
/**
* Creates a `Die` cause from an unexpected error.
*
* **Details**
*
* This function wraps an unhandled or unknown defect (like a runtime crash)
* into a `Cause`. It's useful for capturing unforeseen issues in a structured
* way.
*
* @see {@link isDie} Check if a `Cause` contains a defect
*
* @since 2.0.0
* @category Constructors
*/
const die$2 = die$5;
/**
* Creates an `Interrupt` cause from a `FiberId`.
*
* **Details**
*
* This function represents a fiber that has been interrupted. It stores the
* identifier of the interrupted fiber, enabling precise tracking of concurrent
* cancellations.
*
* @see {@link isInterrupted} Check if a `Cause` contains an interruption
*
* @since 2.0.0
* @category Constructors
*/
const interrupt$3 = interrupt$5;
/**
* Combines two `Cause`s in parallel.
*
* **Details**
*
* This function merges two errors that occurred simultaneously. Instead of
* discarding one error, both are retained, allowing for richer error reporting
* and debugging.
*
* @see {@link isParallelType} Check if a `Cause` is a `Parallel`
*
* @since 2.0.0
* @category Constructors
*/
const parallel = parallel$3;
/**
* Combines two `Cause`s sequentially.
*
* **Details**
*
* This function merges two errors that occurred in sequence, such as a main
* error followed by a finalization error. It preserves both errors for complete
* failure information.
*
* @see {@link isSequentialType} Check if a `Cause` is a `Sequential`
*
* @since 2.0.0
* @category Constructors
*/
const sequential = sequential$3;
/**
* Checks if a value is a `Cause`.
*
* @since 2.0.0
* @category Guards
*/
const isCause = isCause$1;
/**
* Checks if a `Cause` is a `Fail` type.
*
* @see {@link fail} Create a new `Fail` cause
*
* @since 2.0.0
* @category Guards
*/
const isFailType = isFailType$1;
/**
* Checks if a `Cause` is a `Die` type.
*
* @see {@link die} Create a new `Die` cause
*
* @since 2.0.0
* @category Guards
*/
const isDieType = isDieType$1;
/**
* Checks if a `Cause` contains an interruption.
*
* **Details**
*
* This function returns `true` if the `Cause` includes any fiber interruptions.
*
* @since 2.0.0
* @category Getters
*/
const isInterrupted = isInterrupted$1;
/**
* Checks if a `Cause` contains only interruptions.
*
* **Details**
*
* This function returns `true` if the `Cause` has been interrupted but does not
* contain any other failures, such as `Fail` or `Die`. It's helpful for
* verifying purely "cancellation" scenarios.
*
* @since 2.0.0
* @category Getters
*/
const isInterruptedOnly = isInterruptedOnly$1;
/**
* Collects all `FiberId`s responsible for interrupting a fiber.
*
* **Details**
*
* This function returns a set of IDs indicating which fibers caused
* interruptions within this `Cause`. It's useful for debugging concurrency
* issues or tracing cancellations.
*
* @since 2.0.0
* @category Getters
*/
const interruptors = interruptors$1;
/**
* Splits a `Cause` into either its first `Fail` error or the rest of the cause
* (which might only contain `Die` or `Interrupt`).
*
* **Details**
*
* This function either returns the checked error (`E`) or the remaining
* `Cause<never>` with defects/interruptions. It helps you decide if there's a
* recoverable path or if only unhandled issues remain.
*
* @since 2.0.0
* @category Getters
*/
const failureOrCause = failureOrCause$1;
/**
* Strips out failures with an error of `None` from a `Cause<Option<E>>`.
*
* **Details**
*
* This function turns a `Cause<Option<E>>` into an `Option<Cause<E>>`. If the
* cause only contains failures of `None`, it becomes `None`; otherwise, it
* returns a `Cause` of the remaining errors. It's helpful when working with
* optional errors and filtering out certain error paths.
*
* @since 2.0.0
* @category Getters
*/
const flipCauseOption = flipCauseOption$1;
/**
* Transforms the errors in a `Cause` using a user-provided function.
*
* **Details**
*
* This function applies `f` to each `Fail` error while leaving defects (`Die`)
* and interruptions untouched. It's useful for changing or simplifying error
* types in your effectful workflows.
*
* @see {@link as} Replace errors with a single constant
*
* @since 2.0.0
* @category Mapping
*/
const map$4 = map$7;
/**
* Extracts the most "important" defect from a `Cause`.
*
* **Details**
*
* This function reduces a `Cause` to a single, prioritized defect. It evaluates
* the `Cause` in the following order of priority:
*
* 1. If the `Cause` contains a failure (e.g., from `Effect.fail`), it returns
*    the raw error value.
* 2. If there is no failure, it looks for the first defect (e.g., from
*    `Effect.die`).
* 3. If neither of the above is present, and the `Cause` stems from an
*    interruption, it creates and returns an `InterruptedException`.
*
* This function ensures you can always extract a meaningful representation of
* the primary issue from a potentially complex `Cause` structure.
*
* **When to Use**
*
* Use this function when you need to extract the most relevant error or defect
* from a `Cause`, especially in scenarios where multiple errors or defects may
* be present. It's particularly useful for simplifying error reporting or
* logging.
*
* @see {@link squashWith} Allows transforming failures into defects when squashing.
*
* @since 2.0.0
* @category Destructors
*/
const squash = causeSquash;
/**
* Combines all parts of a `Cause` into a single value using a custom reducer
* and a context.
*
* **Details**
*
* This function allows you to reduce a `Cause` into a single value of type `Z`
* using a custom `CauseReducer`. A `CauseReducer` provides methods to handle
* specific parts of the `Cause`, such as failures, defects, or interruptions.
* Additionally, this function provides access to a `context` value, which can
* be used to carry information or maintain state during the reduction process.
*
* This is particularly useful when the reduction process needs additional
* context or configuration, such as:
* - Aggregating error details with dynamic formatting.
* - Collecting logs or statistics about the `Cause`.
* - Performing stateful transformations based on the `context`.
*
* @see {@link reduce} To reduce a `Cause` without additional context.
*
* @since 2.0.0
* @category Reducing
*/
const reduceWithContext = reduceWithContext$2;
/**
* Creates an error indicating an invalid method argument.
*
* **Details**
*
* This function constructs an `IllegalArgumentException`. It is typically
* thrown or returned when an operation receives improper inputs, such as
* out-of-range values or invalid object states.
*
* @since 2.0.0
* @category Errors
*/
const IllegalArgumentException = IllegalArgumentException$1;
/**
* Creates an error indicating a missing element.
*
* **Details**
*
* This function constructs a `NoSuchElementException`. It helps you clearly
* communicate that a required element is unavailable.
*
* @since 2.0.0
* @category Errors
*/
const NoSuchElementException = NoSuchElementException$2;
/**
* Converts a `Cause` into a human-readable string.
*
* **Details**
*
* This function pretty-prints the entire `Cause`, including any failures,
* defects, and interruptions. It can be especially helpful for logging,
* debugging, or displaying structured errors to users.
*
* You can optionally pass `options` to configure how the error cause is
* rendered. By default, it includes essential details of all errors in the
* `Cause`.
*
* @see {@link prettyErrors} Get a list of `PrettyError` objects instead of a single string.
*
* @since 2.0.0
* @category Formatting
*/
const pretty = pretty$1;
/** @internal */
const IntervalTypeId = /*#__PURE__*/ Symbol.for("effect/ScheduleInterval");
/** @internal */
const empty$4 = {
	[IntervalTypeId]: IntervalTypeId,
	startMillis: 0,
	endMillis: 0
};
/** @internal */
const make$22 = (startMillis, endMillis) => {
	if (startMillis > endMillis) return empty$4;
	return {
		[IntervalTypeId]: IntervalTypeId,
		startMillis,
		endMillis
	};
};
/** @internal */
const lessThan$4 = /*#__PURE__*/ dual(2, (self, that) => min(self, that) === self);
/** @internal */
const min = /*#__PURE__*/ dual(2, (self, that) => {
	if (self.endMillis <= that.startMillis) return self;
	if (that.endMillis <= self.startMillis) return that;
	if (self.startMillis < that.startMillis) return self;
	if (that.startMillis < self.startMillis) return that;
	if (self.endMillis <= that.endMillis) return self;
	return that;
});
/** @internal */
const isEmpty$3 = (self) => {
	return self.startMillis >= self.endMillis;
};
/** @internal */
const intersect$4 = /*#__PURE__*/ dual(2, (self, that) => {
	const start = Math.max(self.startMillis, that.startMillis);
	const end = Math.min(self.endMillis, that.endMillis);
	return make$22(start, end);
});
/** @internal */
const size$3 = (self) => {
	return millis(self.endMillis - self.startMillis);
};
/** @internal */
const after$1 = (startMilliseconds) => {
	return make$22(startMilliseconds, Number.POSITIVE_INFINITY);
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/ScheduleInterval.js
/**
* Constructs a new interval from the two specified endpoints. If the start
* endpoint greater than the end endpoint, then a zero size interval will be
* returned.
*
* @since 2.0.0
* @category constructors
*/
const make$21 = make$22;
/**
* An `Interval` of zero-width.
*
* @since 2.0.0
* @category constructors
*/
const empty$3 = empty$4;
/**
* Returns `true` if this `Interval` is less than `that` interval, `false`
* otherwise.
*
* @since 2.0.0
* @category ordering
*/
const lessThan$3 = lessThan$4;
/**
* Returns `true` if the specified `Interval` is empty, `false` otherwise.
*
* @since 2.0.0
* @category ordering
*/
const isEmpty$2 = isEmpty$3;
/**
* Computes a new `Interval` which is the intersection of this `Interval` and
* that `Interval`.
*
* @since 2.0.0
* @category ordering
*/
const intersect$3 = intersect$4;
/**
* Calculates the size of the `Interval` as the `Duration` from the start of the
* interval to the end of the interval.
*
* @since 2.0.0
* @category getters
*/
const size$2 = size$3;
/**
* Construct an `Interval` that includes all time equal to and after the
* specified start time.
*
* @since 2.0.0
* @category constructors
*/
const after = after$1;
/** @internal */
const IntervalsTypeId = /*#__PURE__*/ Symbol.for("effect/ScheduleIntervals");
/** @internal */
const make$20 = (intervals) => {
	return {
		[IntervalsTypeId]: IntervalsTypeId,
		intervals
	};
};
/** @internal */
const intersect$2 = /*#__PURE__*/ dual(2, (self, that) => intersectLoop(self.intervals, that.intervals, empty$22()));
/** @internal */
const intersectLoop = (_left, _right, _acc) => {
	let left = _left;
	let right = _right;
	let acc = _acc;
	while (isNonEmpty$4(left) && isNonEmpty$4(right)) {
		const interval = pipe(headNonEmpty(left), intersect$3(headNonEmpty(right)));
		const intervals = isEmpty$2(interval) ? acc : pipe(acc, prepend$1(interval));
		if (pipe(headNonEmpty(left), lessThan$3(headNonEmpty(right)))) left = tailNonEmpty(left);
		else right = tailNonEmpty(right);
		acc = intervals;
	}
	return make$20(reverse$1(acc));
};
/** @internal */
const start$1 = (self) => {
	return pipe(self.intervals, head, getOrElse(() => empty$3)).startMillis;
};
/** @internal */
const end$3 = (self) => {
	return pipe(self.intervals, head, getOrElse(() => empty$3)).endMillis;
};
/** @internal */
const lessThan$2 = /*#__PURE__*/ dual(2, (self, that) => start$1(self) < start$1(that));
/** @internal */
const isNonEmpty$3 = (self) => {
	return isNonEmpty$4(self.intervals);
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/ScheduleIntervals.js
/**
* Creates a new `Intervals` from a `List` of `Interval`s.
*
* @since 2.0.0
* @category constructors
*/
const make$19 = make$20;
/**
* Produces the intersection of this `Intervals` and that `Intervals`.
*
* @since 2.0.0
* @category utils
*/
const intersect$1 = intersect$2;
/**
* The start of the earliest interval in the specified `Intervals`.
*
* @since 2.0.0
* @category getters
*/
const start = start$1;
/**
* The end of the latest interval in the specified `Intervals`.
*
* @since 2.0.0
* @category getters
*/
const end$2 = end$3;
/**
* Returns `true` if the start of this `Intervals` is before the start of that
* `Intervals`, `false` otherwise.
*
* @since 2.0.0
* @category ordering
*/
const lessThan$1 = lessThan$2;
/**
* Returns `true` if this `Intervals` is non-empty, `false` otherwise.
*
* @since 2.0.0
* @category getters
*/
const isNonEmpty$2 = isNonEmpty$3;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/schedule/decision.js
/** @internal */
const OP_CONTINUE$1 = "Continue";
/** @internal */
const OP_DONE$2 = "Done";
/** @internal */
const _continue$1 = (intervals) => {
	return {
		_tag: OP_CONTINUE$1,
		intervals
	};
};
/** @internal */
const continueWith$1 = (interval) => {
	return {
		_tag: OP_CONTINUE$1,
		intervals: make$19(of$1(interval))
	};
};
/** @internal */
const done$2 = { _tag: OP_DONE$2 };
/** @internal */
const isContinue$1 = (self) => {
	return self._tag === OP_CONTINUE$1;
};
/** @internal */
const isDone$2 = (self) => {
	return self._tag === OP_DONE$2;
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/ScheduleDecision.js
/**
* @since 2.0.0
*/
const _continue = _continue$1;
/**
* @since 2.0.0
* @category constructors
*/
const continueWith = continueWith$1;
/**
* @since 2.0.0
* @category constructors
*/
const done$1 = done$2;
/**
* @since 2.0.0
* @category refinements
*/
const isContinue = isContinue$1;
/**
* @since 2.0.0
* @category refinements
*/
const isDone$1 = isDone$2;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Scope.js
/**
* @since 2.0.0
*/
/**
* A tag representing the current `Scope` in the environment.
*
* @since 2.0.0
* @category context
*/
const Scope = scopeTag;
/**
* Adds a finalizer to this scope. The finalizer is guaranteed to be run when
* the scope is closed. Use this when the finalizer does not need to know the
* `Exit` value that the scope is closed with.
*
* @see {@link addFinalizerExit}
*
* @since 2.0.0
* @category utils
*/
const addFinalizer$1 = scopeAddFinalizer;
/**
* Adds a finalizer to this scope. The finalizer receives the `Exit` value
* when the scope is closed, allowing it to perform different actions based
* on the exit status.
*
* @see {@link addFinalizer}
*
* @since 2.0.0
* @category utils
*/
const addFinalizerExit = scopeAddFinalizerExit;
/**
* Closes this scope with the specified exit value, running all finalizers that
* have been added to the scope.
*
* @since 2.0.0
* @category destructors
*/
const close = scopeClose;
/**
* Extends the scope of an `Effect` that requires a scope into this scope.
* It provides this scope to the effect but does not close the scope when the
* effect completes execution. This allows extending a scoped value into a
* larger scope.
*
* @since 2.0.0
* @category utils
*/
const extend$1 = scopeExtend;
/**
* Forks a new child scope with the specified execution strategy. The child scope
* will automatically be closed when this scope is closed.
*
* @since 2.0.0
* @category utils
*/
const fork = scopeFork;
/**
* Creates a new closeable scope where finalizers will run according to the
* specified `ExecutionStrategy`. If no execution strategy is provided, `sequential`
* will be used by default.
*
* @since 2.0.0
* @category constructors
*/
const make$18 = scopeMake;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/effect/circular.js
/** @internal */
var Semaphore = class {
	permits;
	waiters = /*#__PURE__*/ new Set();
	taken = 0;
	constructor(permits) {
		this.permits = permits;
	}
	get free() {
		return this.permits - this.taken;
	}
	take = (n) => asyncInterrupt((resume) => {
		if (this.free < n) {
			const observer = () => {
				if (this.free < n) return;
				this.waiters.delete(observer);
				resume(suspend$7(() => {
					if (this.free < n) return this.take(n);
					this.taken += n;
					return succeed$8(n);
				}));
			};
			this.waiters.add(observer);
			return sync$2(() => {
				this.waiters.delete(observer);
			});
		}
		resume(suspend$7(() => {
			if (this.free < n) return this.take(n);
			this.taken += n;
			return succeed$8(n);
		}));
	});
	updateTakenUnsafe(fiber, f) {
		this.taken = f(this.taken);
		if (this.waiters.size > 0) fiber.getFiberRef(currentScheduler).scheduleTask(() => {
			const iter = this.waiters.values();
			let item = iter.next();
			while (item.done === false && this.free > 0) {
				item.value();
				item = iter.next();
			}
		}, fiber.getFiberRef(currentSchedulingPriority), fiber);
		return succeed$8(this.free);
	}
	updateTaken(f) {
		return withFiberRuntime$1((fiber) => this.updateTakenUnsafe(fiber, f));
	}
	resize = (permits) => asVoid$1(withFiberRuntime$1((fiber) => {
		this.permits = permits;
		if (this.free < 0) return void_$4;
		return this.updateTakenUnsafe(fiber, (taken) => taken);
	}));
	release = (n) => this.updateTaken((taken) => taken - n);
	releaseAll = /*#__PURE__*/ this.updateTaken((_) => 0);
	withPermits = (n) => (self) => uninterruptibleMask$2((restore) => flatMap$6(restore(this.take(n)), (permits) => ensuring$3(restore(self), this.release(permits))));
	withPermitsIfAvailable = (n) => (self) => uninterruptibleMask$2((restore) => suspend$7(() => {
		if (this.free < n) return succeedNone;
		this.taken += n;
		return ensuring$3(restore(asSome(self)), this.release(n));
	}));
};
/** @internal */
const unsafeMakeSemaphore$1 = (permits) => new Semaphore(permits);
/** @internal */
const makeSemaphore$1 = (permits) => sync$2(() => unsafeMakeSemaphore$1(permits));
var Latch = class extends Class$1 {
	isOpen;
	waiters = [];
	scheduled = false;
	constructor(isOpen) {
		super();
		this.isOpen = isOpen;
	}
	commit() {
		return this.await;
	}
	unsafeSchedule(fiber) {
		if (this.scheduled || this.waiters.length === 0) return void_$4;
		this.scheduled = true;
		fiber.currentScheduler.scheduleTask(this.flushWaiters, fiber.getFiberRef(currentSchedulingPriority), fiber);
		return void_$4;
	}
	flushWaiters = () => {
		this.scheduled = false;
		const waiters = this.waiters;
		this.waiters = [];
		for (let i = 0; i < waiters.length; i++) waiters[i](exitVoid$1);
	};
	open = /*#__PURE__*/ withFiberRuntime$1((fiber) => {
		if (this.isOpen) return void_$4;
		this.isOpen = true;
		return this.unsafeSchedule(fiber);
	});
	unsafeOpen() {
		if (this.isOpen) return;
		this.isOpen = true;
		this.flushWaiters();
	}
	release = /*#__PURE__*/ withFiberRuntime$1((fiber) => {
		if (this.isOpen) return void_$4;
		return this.unsafeSchedule(fiber);
	});
	await = /*#__PURE__*/ asyncInterrupt((resume) => {
		if (this.isOpen) return resume(void_$4);
		this.waiters.push(resume);
		return sync$2(() => {
			const index = this.waiters.indexOf(resume);
			if (index !== -1) this.waiters.splice(index, 1);
		});
	});
	unsafeClose() {
		this.isOpen = false;
	}
	close = /*#__PURE__*/ sync$2(() => {
		this.isOpen = false;
	});
	whenOpen = (self) => {
		return zipRight$3(this.await, self);
	};
};
/** @internal */
const unsafeMakeLatch$1 = (open) => new Latch(open ?? false);
/** @internal */
const forkIn$1 = /*#__PURE__*/ dual(2, (self, scope) => withFiberRuntime$1((parent, parentStatus) => {
	const scopeImpl = scope;
	const fiber = unsafeFork$1(self, parent, parentStatus.runtimeFlags, globalScope);
	if (scopeImpl.state._tag === "Open") {
		const finalizer = () => fiberIdWith$1((fiberId) => equals$2(fiberId, fiber.id()) ? void_$4 : asVoid$1(interruptFiber(fiber)));
		const key = {};
		scopeImpl.state.finalizers.set(key, finalizer);
		fiber.addObserver(() => {
			if (scopeImpl.state._tag === "Closed") return;
			scopeImpl.state.finalizers.delete(key);
		});
	} else fiber.unsafeInterruptAsFork(parent.id());
	return succeed$8(fiber);
}));
/** @internal */
const forkScoped$1 = (self) => scopeWith$1((scope) => forkIn$1(self, scope));
/** @internal */
const timeout$1 = /*#__PURE__*/ dual(2, (self, duration) => timeoutFail(self, {
	onTimeout: () => timeoutExceptionFromDuration(duration),
	duration
}));
/** @internal */
const timeoutFail = /*#__PURE__*/ dual(2, (self, { duration, onTimeout }) => flatten$6(timeoutTo(self, {
	onTimeout: () => failSync(onTimeout),
	onSuccess: succeed$8,
	duration
})));
/** @internal */
const timeoutOption$1 = /*#__PURE__*/ dual(2, (self, duration) => timeoutTo(self, {
	duration,
	onSuccess: some,
	onTimeout: none$4
}));
/** @internal */
const timeoutTo = /*#__PURE__*/ dual(2, (self, { duration, onSuccess, onTimeout }) => fiberIdWith$1((parentFiberId) => uninterruptibleMask$2((restore) => raceFibersWith(exit$1(restore(self)), interruptible$2(sleep(duration)), {
	onSelfWin: (winner, loser) => flatMap$6(winner.await, (exit) => {
		const selfExit = exitFlatten(exit);
		if (selfExit._tag === "Success") return flatMap$6(winner.inheritAll, () => as$2(interruptAsFiber(loser, parentFiberId), onSuccess(selfExit.value)));
		else return flatMap$6(interruptAsFiber(loser, parentFiberId), () => exitFailCause$1(selfExit.cause));
	}),
	onOtherWin: (winner, loser) => flatMap$6(winner.await, (exit) => {
		if (exit._tag === "Success") return flatMap$6(winner.inheritAll, () => as$2(interruptAsFiber(loser, parentFiberId), onTimeout()));
		else return flatMap$6(interruptAsFiber(loser, parentFiberId), () => exitFailCause$1(exit.cause));
	}),
	otherScope: globalScope
}))));
/** @internal */
const SynchronizedTypeId = /*#__PURE__*/ Symbol.for("effect/Ref/SynchronizedRef");
/** @internal */
const synchronizedVariance = { 
/* c8 ignore next */
_A: (_) => _ };
/** @internal */
var SynchronizedImpl = class extends Class$1 {
	ref;
	withLock;
	[SynchronizedTypeId] = synchronizedVariance;
	[RefTypeId] = refVariance;
	[TypeId$16] = TypeId$16;
	constructor(ref, withLock) {
		super();
		this.ref = ref;
		this.withLock = withLock;
		this.get = get$4(this.ref);
	}
	get;
	commit() {
		return this.get;
	}
	modify(f) {
		return this.modifyEffect((a) => succeed$8(f(a)));
	}
	modifyEffect(f) {
		return this.withLock(pipe(flatMap$6(get$4(this.ref), f), flatMap$6(([b, a]) => as$2(set$2(this.ref, a), b))));
	}
};
/** @internal */
const makeSynchronized = (value) => sync$2(() => unsafeMakeSynchronized(value));
/** @internal */
const unsafeMakeSynchronized = (value) => {
	return new SynchronizedImpl(unsafeMake$6(value), unsafeMakeSemaphore$1(1).withPermits(1));
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/managedRuntime/circular.js
/** @internal */
const TypeId$14 = /*#__PURE__*/ Symbol.for("effect/ManagedRuntime");
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/opCodes/layer.js
/** @internal */
const OP_FRESH = "Fresh";
/** @internal */
const OP_FROM_EFFECT$2 = "FromEffect";
/** @internal */
const OP_SCOPED = "Scoped";
/** @internal */
const OP_SUSPEND$1 = "Suspend";
/** @internal */
const OP_PROVIDE$1 = "Provide";
/** @internal */
const OP_PROVIDE_MERGE = "ProvideMerge";
/** @internal */
const OP_MERGE_ALL = "MergeAll";
/** @internal */
const OP_ZIP_WITH = "ZipWith";
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Fiber.js
const _await$1 = _await$2;
/**
* Inherits values from all `FiberRef` instances into current fiber. This
* will resume immediately.
*
* @since 2.0.0
* @category destructors
*/
const inheritAll = inheritAll$1;
/**
* Interrupts the fiber from whichever fiber is calling this method. If the
* fiber has already exited, the returned effect will resume immediately.
* Otherwise, the effect will resume when the fiber exits.
*
* @since 2.0.0
* @category interruption
*/
const interrupt$2 = interruptFiber;
/**
* Interrupts the fiber as if interrupted from the specified fiber. If the
* fiber has already exited, the returned effect will resume immediately.
* Otherwise, the effect will resume when the fiber exits.
*
* @since 2.0.0
* @category interruption
*/
const interruptAs = interruptAsFiber;
/**
* Interrupts all fibers as by the specified fiber, awaiting their
* interruption.
*
* @since 2.0.0
* @category interruption
*/
const interruptAllAs = interruptAllAs$1;
/**
* Joins the fiber, which suspends the joining fiber until the result of the
* fiber has been determined. Attempting to join a fiber that has erred will
* result in a catchable error. Joining an interrupted fiber will result in an
* "inner interruption" of this fiber, unlike interruption triggered by
* another fiber, "inner interruption" can be caught and recovered.
*
* @since 2.0.0
* @category destructors
*/
const join$1 = join$2;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/runtime.js
const makeDual = (f) => function() {
	if (arguments.length === 1) {
		const runtime = arguments[0];
		return (effect, ...args) => f(runtime, effect, ...args);
	}
	return f.apply(this, arguments);
};
/** @internal */
const unsafeFork = /*#__PURE__*/ makeDual((runtime, self, options) => {
	const fiberId = unsafeMake$8();
	const fiberRefUpdates = [[currentContext$1, [[fiberId, runtime.context]]]];
	if (options?.scheduler) fiberRefUpdates.push([currentScheduler, [[fiberId, options.scheduler]]]);
	let fiberRefs = updateManyAs(runtime.fiberRefs, {
		entries: fiberRefUpdates,
		forkAs: fiberId
	});
	if (options?.updateRefs) fiberRefs = options.updateRefs(fiberRefs, fiberId);
	const fiberRuntime = new FiberRuntime(fiberId, fiberRefs, runtime.runtimeFlags);
	let effect = self;
	if (options?.scope) effect = flatMap$6(fork(options.scope, sequential$2), (closeableScope) => zipRight$3(scopeAddFinalizer(closeableScope, fiberIdWith$1((id) => equals$2(id, fiberRuntime.id()) ? void_$4 : interruptAsFiber(fiberRuntime, id))), onExit$1(self, (exit) => close(closeableScope, exit))));
	const supervisor = fiberRuntime.currentSupervisor;
	if (supervisor !== none) {
		supervisor.onStart(runtime.context, effect, none$4(), fiberRuntime);
		fiberRuntime.addObserver((exit) => supervisor.onEnd(exit, fiberRuntime));
	}
	globalScope.add(runtime.runtimeFlags, fiberRuntime);
	if (options?.immediate === false) fiberRuntime.resume(effect);
	else fiberRuntime.start(effect);
	return fiberRuntime;
});
/** @internal */
const unsafeRunSync = /*#__PURE__*/ makeDual((runtime, effect) => {
	const result = unsafeRunSyncExit(runtime)(effect);
	if (result._tag === "Failure") throw fiberFailure(result.effect_instruction_i0);
	return result.effect_instruction_i0;
});
var AsyncFiberExceptionImpl = class extends Error {
	fiber;
	_tag = "AsyncFiberException";
	constructor(fiber) {
		super(`Fiber #${fiber.id().id} cannot be resolved synchronously. This is caused by using runSync on an effect that performs async work`);
		this.fiber = fiber;
		this.name = this._tag;
		this.stack = this.message;
	}
};
const asyncFiberException = (fiber) => {
	const limit = Error.stackTraceLimit;
	Error.stackTraceLimit = 0;
	const error = new AsyncFiberExceptionImpl(fiber);
	Error.stackTraceLimit = limit;
	return error;
};
/** @internal */
const FiberFailureId = /*#__PURE__*/ Symbol.for("effect/Runtime/FiberFailure");
/** @internal */
const FiberFailureCauseId = /*#__PURE__*/ Symbol.for("effect/Runtime/FiberFailure/Cause");
var FiberFailureImpl = class extends Error {
	[FiberFailureId];
	[FiberFailureCauseId];
	constructor(cause) {
		const head = prettyErrors(cause)[0];
		super(head?.message || "An error has occurred");
		this[FiberFailureId] = FiberFailureId;
		this[FiberFailureCauseId] = cause;
		this.name = head ? `(FiberFailure) ${head.name}` : "FiberFailure";
		if (head?.stack) this.stack = head.stack;
	}
	toJSON() {
		return {
			_id: "FiberFailure",
			cause: this[FiberFailureCauseId].toJSON()
		};
	}
	toString() {
		return "(FiberFailure) " + pretty$1(this[FiberFailureCauseId], { renderErrorCause: true });
	}
	[NodeInspectSymbol]() {
		return this.toString();
	}
};
/** @internal */
const fiberFailure = (cause) => {
	const limit = Error.stackTraceLimit;
	Error.stackTraceLimit = 0;
	const error = new FiberFailureImpl(cause);
	Error.stackTraceLimit = limit;
	return error;
};
const fastPath = (effect) => {
	const op = effect;
	switch (op._op) {
		case "Failure":
		case "Success": return op;
		case "Left": return exitFail(op.left);
		case "Right": return exitSucceed$1(op.right);
		case "Some": return exitSucceed$1(op.value);
		case "None": return exitFail(new NoSuchElementException$2());
	}
};
/** @internal */
const unsafeRunSyncExit = /*#__PURE__*/ makeDual((runtime, effect) => {
	const op = fastPath(effect);
	if (op) return op;
	const scheduler = new SyncScheduler();
	const fiberRuntime = unsafeFork(runtime)(effect, { scheduler });
	scheduler.flush();
	const result = fiberRuntime.unsafePoll();
	if (result) return result;
	return exitDie$1(capture(asyncFiberException(fiberRuntime), currentSpanFromFiber(fiberRuntime)));
});
/** @internal */
const unsafeRunPromiseExit = /*#__PURE__*/ makeDual((runtime, effect, options) => new Promise((resolve) => {
	const op = fastPath(effect);
	if (op) resolve(op);
	const fiber = unsafeFork(runtime)(effect);
	fiber.addObserver((exit) => {
		resolve(exit);
	});
	if (options?.signal !== void 0) {
		if (options.signal.aborted) fiber.unsafeInterruptAsFork(fiber.id());
		else options.signal.addEventListener("abort", () => {
			fiber.unsafeInterruptAsFork(fiber.id());
		}, { once: true });
	}
}));
/** @internal */
var RuntimeImpl = class {
	context;
	runtimeFlags;
	fiberRefs;
	constructor(context, runtimeFlags, fiberRefs) {
		this.context = context;
		this.runtimeFlags = runtimeFlags;
		this.fiberRefs = fiberRefs;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const make$17 = (options) => new RuntimeImpl(options.context, options.runtimeFlags, options.fiberRefs);
/** @internal */
const runtime$1 = () => withFiberRuntime$1((state, status) => succeed$8(new RuntimeImpl(state.getFiberRef(currentContext$1), status.runtimeFlags, state.getFiberRefs())));
/** @internal */
const defaultRuntime = /*#__PURE__*/ make$17({
	context: /*#__PURE__*/ empty$25(),
	runtimeFlags: /* @__PURE__ */ make$34(1, 32, 4),
	fiberRefs: /*#__PURE__*/ empty$9()
});
/** @internal */
const updateContext$1 = /*#__PURE__*/ dual(2, (self, f) => make$17({
	context: f(self.context),
	runtimeFlags: self.runtimeFlags,
	fiberRefs: self.fiberRefs
}));
/** @internal */
const unsafeForkEffect = /*#__PURE__*/ unsafeFork(defaultRuntime);
/** @internal */
const unsafeRunSyncEffect = /*#__PURE__*/ unsafeRunSync(defaultRuntime);
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/synchronizedRef.js
/** @internal */
const modifyEffect = /*#__PURE__*/ dual(2, (self, f) => self.modifyEffect(f));
/** @internal */
const LayerTypeId = /*#__PURE__*/ Symbol.for("effect/Layer");
const layerVariance = {
	/* c8 ignore next */
	_RIn: (_) => _,
	/* c8 ignore next */
	_E: (_) => _,
	/* c8 ignore next */
	_ROut: (_) => _
};
/** @internal */
const proto$8 = {
	[LayerTypeId]: layerVariance,
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const MemoMapTypeId = /*#__PURE__*/ Symbol.for("effect/Layer/MemoMap");
/** @internal */
const CurrentMemoMap = /*#__PURE__*/ Reference()("effect/Layer/CurrentMemoMap", { defaultValue: () => unsafeMakeMemoMap() });
/** @internal */
const isLayer = (u) => hasProperty(u, LayerTypeId);
/** @internal */
const isFresh = (self) => {
	return self._op_layer === OP_FRESH;
};
/** @internal */
var MemoMapImpl = class {
	ref;
	[MemoMapTypeId];
	constructor(ref) {
		this.ref = ref;
		this[MemoMapTypeId] = MemoMapTypeId;
	}
	/**
	* Checks the memo map to see if a layer exists. If it is, immediately
	* returns it. Otherwise, obtains the layer, stores it in the memo map,
	* and adds a finalizer to the `Scope`.
	*/
	getOrElseMemoize(layer, scope) {
		return pipe(modifyEffect(this.ref, (map) => {
			const inMap = map.get(layer);
			if (inMap !== void 0) {
				const [acquire, release] = inMap;
				const cached = pipe(acquire, flatMap$6(([patch, b]) => pipe(patchFiberRefs(patch), as$2(b))), onExit$1(exitMatch({
					onFailure: () => void_$4,
					onSuccess: () => scopeAddFinalizerExit(scope, release)
				})));
				return succeed$8([cached, map]);
			}
			return pipe(make$29(0), flatMap$6((observers) => pipe(deferredMake(), flatMap$6((deferred) => pipe(make$29(() => void_$4), map$6((finalizerRef) => {
				const resource = uninterruptibleMask$2((restore) => pipe(scopeMake(), flatMap$6((innerScope) => pipe(restore(flatMap$6(makeBuilder(layer, innerScope, true), (f) => diffFiberRefs(f(this)))), exit$1, flatMap$6((exit) => {
					switch (exit._tag) {
						case OP_FAILURE: return pipe(deferredFailCause(deferred, exit.effect_instruction_i0), zipRight$3(scopeClose(innerScope, exit)), zipRight$3(failCause$6(exit.effect_instruction_i0)));
						case OP_SUCCESS: return pipe(set$2(finalizerRef, (exit) => pipe(scopeClose(innerScope, exit), whenEffect(modify$1(observers, (n) => [n === 1, n - 1])), asVoid$1)), zipRight$3(update$2(observers, (n) => n + 1)), zipRight$3(scopeAddFinalizerExit(scope, (exit) => pipe(sync$2(() => map.delete(layer)), zipRight$3(get$4(finalizerRef)), flatMap$6((finalizer) => finalizer(exit))))), zipRight$3(deferredSucceed(deferred, exit.effect_instruction_i0)), as$2(exit.effect_instruction_i0[1]));
					}
				})))));
				const memoized = [pipe(deferredAwait(deferred), onExit$1(exitMatchEffect({
					onFailure: () => void_$4,
					onSuccess: () => update$2(observers, (n) => n + 1)
				}))), (exit) => pipe(get$4(finalizerRef), flatMap$6((finalizer) => finalizer(exit)))];
				return [resource, isFresh(layer) ? map : map.set(layer, memoized)];
			}))))));
		}), flatten$6);
	}
};
/** @internal */
const makeMemoMap = /*#__PURE__*/ suspend$7(() => map$6(makeSynchronized(/* @__PURE__ */ new Map()), (ref) => new MemoMapImpl(ref)));
/** @internal */
const unsafeMakeMemoMap = () => new MemoMapImpl(unsafeMakeSynchronized(/* @__PURE__ */ new Map()));
/** @internal */
const buildWithScope = /*#__PURE__*/ dual(2, (self, scope) => flatMap$6(makeMemoMap, (memoMap) => buildWithMemoMap(self, memoMap, scope)));
/** @internal */
const buildWithMemoMap = /*#__PURE__*/ dual(3, (self, memoMap, scope) => flatMap$6(makeBuilder(self, scope), (run) => provideService$1(run(memoMap), CurrentMemoMap, memoMap)));
const makeBuilder = (self, scope, inMemoMap = false) => {
	const op = self;
	switch (op._op_layer) {
		case "Locally": return sync$2(() => (memoMap) => op.f(memoMap.getOrElseMemoize(op.self, scope)));
		case "ExtendScope": return sync$2(() => (memoMap) => scopeWith$1((scope) => memoMap.getOrElseMemoize(op.layer, scope)));
		case "Fold": return sync$2(() => (memoMap) => pipe(memoMap.getOrElseMemoize(op.layer, scope), matchCauseEffect$2({
			onFailure: (cause) => memoMap.getOrElseMemoize(op.failureK(cause), scope),
			onSuccess: (value) => memoMap.getOrElseMemoize(op.successK(value), scope)
		})));
		case "Fresh": return sync$2(() => (_) => pipe(op.layer, buildWithScope(scope)));
		case "FromEffect": return inMemoMap ? sync$2(() => (_) => op.effect) : sync$2(() => (memoMap) => memoMap.getOrElseMemoize(self, scope));
		case "Provide": return sync$2(() => (memoMap) => pipe(memoMap.getOrElseMemoize(op.first, scope), flatMap$6((env) => pipe(memoMap.getOrElseMemoize(op.second, scope), provideContext$1(env)))));
		case "Scoped": return inMemoMap ? sync$2(() => (_) => scopeExtend(op.effect, scope)) : sync$2(() => (memoMap) => memoMap.getOrElseMemoize(self, scope));
		case "Suspend": return sync$2(() => (memoMap) => memoMap.getOrElseMemoize(op.evaluate(), scope));
		case "ProvideMerge": return sync$2(() => (memoMap) => pipe(memoMap.getOrElseMemoize(op.first, scope), zipWith$2(memoMap.getOrElseMemoize(op.second, scope), op.zipK)));
		case "ZipWith": return gen$1(function* () {
			const parallelScope = yield* scopeFork(scope, parallel$2);
			const firstScope = yield* scopeFork(parallelScope, sequential$2);
			const secondScope = yield* scopeFork(parallelScope, sequential$2);
			return (memoMap) => pipe(memoMap.getOrElseMemoize(op.first, firstScope), zipWithOptions(memoMap.getOrElseMemoize(op.second, secondScope), op.zipK, { concurrent: true }));
		});
		case "MergeAll": {
			const layers = op.layers;
			return map$6(scopeFork(scope, parallel$2), (parallelScope) => (memoMap) => {
				const contexts = new Array(layers.length);
				return map$6(forEachConcurrentDiscard(layers, fnUntraced$1(function* (layer, i) {
					const scope = yield* scopeFork(parallelScope, sequential$2);
					const context = yield* memoMap.getOrElseMemoize(layer, scope);
					contexts[i] = context;
				}), false, false), () => mergeAll$3(...contexts));
			});
		}
	}
};
/** @internal */
const context = () => fromEffectContext(context$1());
/** @internal */
const fromEffect$5 = /*#__PURE__*/ dual(2, (a, b) => {
	const tagFirst = isTag(a);
	const tag = tagFirst ? a : b;
	return fromEffectContext(map$6(tagFirst ? b : a, (service) => make$48(tag, service)));
});
/** @internal */
function fromEffectContext(effect) {
	const fromEffect = Object.create(proto$8);
	fromEffect._op_layer = OP_FROM_EFFECT$2;
	fromEffect.effect = effect;
	return fromEffect;
}
/** @internal */
const merge$1 = /*#__PURE__*/ dual(2, (self, that) => zipWith$1(self, that, (a, b) => merge$4(a, b)));
/** @internal */
const mergeAll$2 = (...layers) => {
	const mergeAll = Object.create(proto$8);
	mergeAll._op_layer = OP_MERGE_ALL;
	mergeAll.layers = layers;
	return mergeAll;
};
/** @internal */
const scoped$4 = /*#__PURE__*/ dual(2, (a, b) => {
	const tagFirst = isTag(a);
	const tag = tagFirst ? a : b;
	return scopedContext(map$6(tagFirst ? b : a, (service) => make$48(tag, service)));
});
/** @internal */
const scopedContext = (effect) => {
	const scoped = Object.create(proto$8);
	scoped._op_layer = OP_SCOPED;
	scoped.effect = effect;
	return scoped;
};
/** @internal */
const succeed$5 = /*#__PURE__*/ dual(2, (a, b) => {
	const tagFirst = isTag(a);
	return fromEffectContext(succeed$8(make$48(tagFirst ? a : b, tagFirst ? b : a)));
});
/** @internal */
const suspend$6 = (evaluate) => {
	const suspend = Object.create(proto$8);
	suspend._op_layer = OP_SUSPEND$1;
	suspend.evaluate = evaluate;
	return suspend;
};
/** @internal */
const provide$2 = /*#__PURE__*/ dual(2, (self, that) => suspend$6(() => {
	const provideTo = Object.create(proto$8);
	provideTo._op_layer = OP_PROVIDE$1;
	provideTo.first = Object.create(proto$8, {
		_op_layer: {
			value: OP_PROVIDE_MERGE,
			enumerable: true
		},
		first: {
			value: context(),
			enumerable: true
		},
		second: { value: Array.isArray(that) ? mergeAll$2(...that) : that },
		zipK: { value: (a, b) => pipe(a, merge$4(b)) }
	});
	provideTo.second = self;
	return provideTo;
}));
/** @internal */
const provideMerge$1 = /*#__PURE__*/ dual(2, (that, self) => {
	const zipWith = Object.create(proto$8);
	zipWith._op_layer = OP_PROVIDE_MERGE;
	zipWith.first = self;
	zipWith.second = provide$2(that, self);
	zipWith.zipK = (a, b) => {
		return pipe(a, merge$4(b));
	};
	return zipWith;
});
/** @internal */
const zipWith$1 = /*#__PURE__*/ dual(3, (self, that, f) => suspend$6(() => {
	const zipWith = Object.create(proto$8);
	zipWith._op_layer = OP_ZIP_WITH;
	zipWith.first = self;
	zipWith.second = that;
	zipWith.zipK = f;
	return zipWith;
}));
const provideSomeLayer = /*#__PURE__*/ dual(2, (self, layer) => scopedWith$2((scope) => flatMap$6(buildWithScope(layer, scope), (context) => provideSomeContext(self, context))));
const provideSomeRuntime = /*#__PURE__*/ dual(2, (self, rt) => {
	const patchRefs = diff$1(defaultRuntime.fiberRefs, rt.fiberRefs);
	const patchFlags = diff$3(defaultRuntime.runtimeFlags, rt.runtimeFlags);
	return uninterruptibleMask$2((restore) => withFiberRuntime$1((fiber) => {
		const oldContext = fiber.getFiberRef(currentContext$1);
		const oldRefs = fiber.getFiberRefs();
		const newRefs = patch$1(fiber.id(), oldRefs)(patchRefs);
		const oldFlags = fiber.currentRuntimeFlags;
		const newFlags = patch$4(patchFlags)(oldFlags);
		const rollbackRefs = diff$1(newRefs, oldRefs);
		const rollbackFlags = diff$3(newFlags, oldFlags);
		fiber.setFiberRefs(newRefs);
		fiber.currentRuntimeFlags = newFlags;
		return ensuring$3(provideSomeContext(restore(self), merge$4(oldContext, rt.context)), withFiberRuntime$1((fiber) => {
			fiber.setFiberRefs(patch$1(fiber.id(), fiber.getFiberRefs())(rollbackRefs));
			fiber.currentRuntimeFlags = patch$4(rollbackFlags)(fiber.currentRuntimeFlags);
			return void_$4;
		}));
	}));
});
/** @internal */
const effect_provide = /*#__PURE__*/ dual(2, (self, source) => {
	if (Array.isArray(source)) return provideSomeLayer(self, mergeAll$2(...source));
	else if (isLayer(source)) return provideSomeLayer(self, source);
	else if (isContext(source)) return provideSomeContext(self, source);
	else if (TypeId$14 in source) return flatMap$6(source.runtimeEffect, (rt) => provideSomeRuntime(self, rt));
	else return provideSomeRuntime(self, source);
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Deferred.js
/**
* @since 2.0.0
* @category symbols
*/
const DeferredTypeId = DeferredTypeId$1;
/**
* Creates a new `Deferred`.
*
* @since 2.0.0
* @category constructors
*/
const make$16 = deferredMake;
const _await = deferredAwait;
/**
* Completes the deferred with the result of the specified effect. If the
* deferred has already been completed, the method will produce false.
*
* Note that `Deferred.completeWith` will be much faster, so consider using
* that if you do not need to memoize the result of the specified effect.
*
* @since 2.0.0
* @category utils
*/
const complete = deferredComplete;
/**
* Fails the `Deferred` with the specified error, which will be propagated to
* all fibers waiting on the value of the `Deferred`.
*
* @since 2.0.0
* @category utils
*/
const fail$3 = deferredFail;
/**
* Fails the `Deferred` with the specified `Cause`, which will be propagated to
* all fibers waiting on the value of the `Deferred`.
*
* @since 2.0.0
* @category utils
*/
const failCause$3 = deferredFailCause;
/**
* Completes the `Deferred` with interruption. This will interrupt all fibers
* waiting on the value of the `Deferred` with the `FiberId` of the fiber
* calling this method.
*
* @since 2.0.0
* @category utils
*/
const interrupt$1 = deferredInterrupt;
/**
* Returns `true` if this `Deferred` has already been completed with a value or
* an error, `false` otherwise.
*
* @since 2.0.0
* @category getters
*/
const isDone = deferredIsDone;
/**
* Completes the `Deferred` with the specified value.
*
* @since 2.0.0
* @category utils
*/
const succeed$4 = deferredSucceed;
/**
* Unsafely exits the `Deferred` with the specified `Exit` value, which will be
* propagated to all fibers waiting on the value of the `Deferred`.
*
* @since 2.0.0
* @category unsafe
*/
const unsafeDone = deferredUnsafeDone;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/MutableList.js
/**
* @since 2.0.0
*/
const TypeId$13 = /*#__PURE__*/ Symbol.for("effect/MutableList");
const MutableListProto = {
	[TypeId$13]: TypeId$13,
	[Symbol.iterator]() {
		let done = false;
		let head = this.head;
		return {
			next() {
				if (done) return this.return();
				if (head == null) {
					done = true;
					return this.return();
				}
				const value = head.value;
				head = head.next;
				return {
					done,
					value
				};
			},
			return(value) {
				if (!done) done = true;
				return {
					done: true,
					value
				};
			}
		};
	},
	toString() {
		return format$4(this.toJSON());
	},
	toJSON() {
		return {
			_id: "MutableList",
			values: Array.from(this).map(toJSON)
		};
	},
	[NodeInspectSymbol]() {
		return this.toJSON();
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const makeNode = (value) => ({
	value,
	removed: false,
	prev: void 0,
	next: void 0
});
/**
* Creates an empty `MutableList`.
*
* @since 2.0.0
* @category constructors
*/
const empty$2 = () => {
	const list = Object.create(MutableListProto);
	list.head = void 0;
	list.tail = void 0;
	list._length = 0;
	return list;
};
/**
* Returns `true` if the list contains zero elements, `false`, otherwise.
*
* @since 2.0.0
* @category getters
*/
const isEmpty$1 = (self) => length$2(self) === 0;
/**
* Returns the length of the list.
*
* @since 2.0.0
* @category getters
*/
const length$2 = (self) => self._length;
/**
* Appends the specified element to the end of the `MutableList`.
*
* @category concatenating
* @since 2.0.0
*/
const append = /*#__PURE__*/ dual(2, (self, value) => {
	const node = makeNode(value);
	if (self.head === void 0) self.head = node;
	if (self.tail === void 0) self.tail = node;
	else {
		self.tail.next = node;
		node.prev = self.tail;
		self.tail = node;
	}
	self._length += 1;
	return self;
});
/**
* Removes the first value from the list and returns it, if it exists.
*
* @since 0.0.1
*/
const shift = (self) => {
	const head = self.head;
	if (head !== void 0) {
		remove$1(self, head);
		return head.value;
	}
};
const remove$1 = (self, node) => {
	if (node.removed) return;
	node.removed = true;
	if (node.prev !== void 0 && node.next !== void 0) {
		node.prev.next = node.next;
		node.next.prev = node.prev;
	} else if (node.prev !== void 0) {
		self.tail = node.prev;
		node.prev.next = void 0;
	} else if (node.next !== void 0) {
		self.head = node.next;
		node.next.prev = void 0;
	} else {
		self.tail = void 0;
		self.head = void 0;
	}
	if (self._length > 0) self._length -= 1;
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/MutableQueue.js
/**
* @since 2.0.0
*/
const TypeId$12 = /*#__PURE__*/ Symbol.for("effect/MutableQueue");
/**
* @since 2.0.0
* @category symbol
*/
const EmptyMutableQueue = /*#__PURE__*/ Symbol.for("effect/mutable/MutableQueue/Empty");
const MutableQueueProto = {
	[TypeId$12]: TypeId$12,
	[Symbol.iterator]() {
		return Array.from(this.queue)[Symbol.iterator]();
	},
	toString() {
		return format$4(this.toJSON());
	},
	toJSON() {
		return {
			_id: "MutableQueue",
			values: Array.from(this).map(toJSON)
		};
	},
	[NodeInspectSymbol]() {
		return this.toJSON();
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
const make$15 = (capacity) => {
	const queue = Object.create(MutableQueueProto);
	queue.queue = empty$2();
	queue.capacity = capacity;
	return queue;
};
/**
* Creates a new bounded `MutableQueue`.
*
* @since 2.0.0
* @category constructors
*/
const bounded$2 = (capacity) => make$15(capacity);
/**
* Creates a new unbounded `MutableQueue`.
*
* @since 2.0.0
* @category constructors
*/
const unbounded$2 = () => make$15(void 0);
/**
* Returns the current number of elements in the queue.
*
* @since 2.0.0
* @category getters
*/
const length$1 = (self) => length$2(self.queue);
/**
* Returns `true` if the queue is empty, `false` otherwise.
*
* @since 2.0.0
* @category getters
*/
const isEmpty = (self) => isEmpty$1(self.queue);
/**
* The **maximum** number of elements that a queue can hold.
*
* **Note**: unbounded queues can still implement this interface with
* `capacity = Infinity`.
*
* @since 2.0.0
* @category getters
*/
const capacity = (self) => self.capacity === void 0 ? Infinity : self.capacity;
/**
* Offers an element to the queue.
*
* Returns whether the enqueue was successful or not.
*
* @since 2.0.0
*/
const offer$2 = /*#__PURE__*/ dual(2, (self, value) => {
	const queueLength = length$2(self.queue);
	if (self.capacity !== void 0 && queueLength === self.capacity) return false;
	append(value)(self.queue);
	return true;
});
/**
* Enqueues a collection of values into the queue.
*
* Returns a `Chunk` of the values that were **not** able to be enqueued.
*
* @since 2.0.0
*/
const offerAll = /*#__PURE__*/ dual(2, (self, values) => {
	const iterator = values[Symbol.iterator]();
	let next;
	let remainder = empty$22();
	let offering = true;
	while (offering && (next = iterator.next()) && !next.done) offering = offer$2(next.value)(self);
	while (next != null && !next.done) {
		remainder = prepend$1(next.value)(remainder);
		next = iterator.next();
	}
	return reverse$1(remainder);
});
/**
* Dequeues an element from the queue.
*
* Returns either an element from the queue, or the `def` param.
*
* **Note**: if there is no meaningful default for your type, you can always
* use `poll(MutableQueue.EmptyMutableQueue)`.
*
* @since 2.0.0
*/
const poll = /*#__PURE__*/ dual(2, (self, def) => {
	if (isEmpty$1(self.queue)) return def;
	return shift(self.queue);
});
/**
* Dequeues up to `n` elements from the queue.
*
* Returns a `List` of up to `n` elements.
*
* @since 2.0.0
*/
const pollUpTo = /*#__PURE__*/ dual(2, (self, n) => {
	let result = empty$22();
	let count = 0;
	while (count < n) {
		const element = poll(EmptyMutableQueue)(self);
		if (element === EmptyMutableQueue) break;
		result = prepend$1(element)(result);
		count += 1;
	}
	return reverse$1(result);
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Layer.js
/**
* Constructs a layer from the specified effect.
*
* @since 2.0.0
* @category constructors
*/
const effect$1 = fromEffect$5;
/**
* Merges this layer with the specified layer concurrently, producing a new layer with combined input and output types.
*
* @since 2.0.0
* @category zipping
*/
const merge = merge$1;
/**
* Combines all the provided layers concurrently, creating a new layer with merged input, error, and output types.
*
* @since 2.0.0
* @category zipping
*/
const mergeAll$1 = mergeAll$2;
/**
* Constructs a layer from the specified scoped effect.
*
* @since 2.0.0
* @category constructors
*/
const scoped$3 = scoped$4;
/**
* Constructs a layer from the specified value.
*
* @since 2.0.0
* @category constructors
*/
const succeed$3 = succeed$5;
/**
* Feeds the output services of this builder into the input of the specified
* builder, resulting in a new builder with the inputs of this builder as
* well as any leftover inputs, and the outputs of the specified builder.
*
* @since 2.0.0
* @category utils
*/
const provide$1 = provide$2;
/**
* Feeds the output services of this layer into the input of the specified
* layer, resulting in a new layer with the inputs of this layer, and the
* outputs of both layers.
*
* @since 2.0.0
* @category utils
*/
const provideMerge = provideMerge$1;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/console.js
/** @internal */
const consoleWith = (f) => fiberRefGetWith(currentServices, (services) => f(get$11(services, consoleTag)));
/** @internal */
const error$1 = (...args) => consoleWith((_) => _.error(...args));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Data.js
/**
* @example
* ```ts
* import * as assert from "node:assert"
* import { Data, Equal } from "effect"
*
* const alice = Data.struct({ name: "Alice", age: 30 })
*
* const bob = Data.struct({ name: "Bob", age: 40 })
*
* assert.deepStrictEqual(Equal.equals(alice, alice), true)
* assert.deepStrictEqual(Equal.equals(alice, Data.struct({ name: "Alice", age: 30 })), true)
*
* assert.deepStrictEqual(Equal.equals(alice, { name: "Alice", age: 30 }), false)
* assert.deepStrictEqual(Equal.equals(alice, bob), false)
* ```
*
* @category constructors
* @since 2.0.0
*/
const struct = struct$1;
/**
* Provides a tagged constructor for the specified `Case`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Data } from "effect"
*
* interface Person {
*   readonly _tag: "Person" // the tag
*   readonly name: string
* }
*
* const Person = Data.tagged<Person>("Person")
*
* const mike = Person({ name: "Mike" })
*
* assert.deepEqual(mike, { _tag: "Person", name: "Mike" })
* ```
*
* @since 2.0.0
* @category constructors
*/
const tagged = (tag) => (args) => {
	const value = args === void 0 ? Object.create(StructuralPrototype) : struct(args);
	value._tag = tag;
	return value;
};
/**
* Provides a constructor for a Case Class.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Data, Equal } from "effect"
*
* class Person extends Data.Class<{ readonly name: string }> {}
*
* // Creating instances of Person
* const mike1 = new Person({ name: "Mike" })
* const mike2 = new Person({ name: "Mike" })
* const john = new Person({ name: "John" })
*
* // Checking equality
* assert.deepStrictEqual(Equal.equals(mike1, mike2), true)
* assert.deepStrictEqual(Equal.equals(mike1, john), false)
* ```
*
* @since 2.0.0
* @category constructors
*/
const Class = Structural;
/**
* Provides a constructor for a Case Class.
*
* @since 2.0.0
* @category constructors
*/
const Error$1 = /*#__PURE__*/ function() {
	const plainArgsSymbol = /*#__PURE__*/ Symbol.for("effect/Data/Error/plainArgs");
	return { BaseEffectError: class extends YieldableError$1 {
		constructor(args) {
			super(args?.message, args?.cause ? { cause: args.cause } : void 0);
			if (args) {
				Object.assign(this, args);
				Object.defineProperty(this, plainArgsSymbol, {
					value: args,
					enumerable: false
				});
			}
		}
		toJSON() {
			return {
				...this[plainArgsSymbol],
				...this
			};
		}
	} }.BaseEffectError;
}();
/**
* @since 2.0.0
* @category constructors
*/
const TaggedError$1 = (tag) => {
	const O = { BaseEffectError: class extends Error$1 {
		_tag = tag;
	} };
	O.BaseEffectError.prototype.name = tag;
	return O.BaseEffectError;
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/dateTime.js
/** @internal */
const TypeId$11 = /*#__PURE__*/ Symbol.for("effect/DateTime");
/** @internal */
const TimeZoneTypeId = /*#__PURE__*/ Symbol.for("effect/DateTime/TimeZone");
const Proto$2 = {
	[TypeId$11]: TypeId$11,
	pipe() {
		return pipeArguments(this, arguments);
	},
	[NodeInspectSymbol]() {
		return this.toString();
	},
	toJSON() {
		return toDateUtc$1(this).toJSON();
	}
};
const ProtoUtc = {
	...Proto$2,
	_tag: "Utc",
	[symbol$1]() {
		return cached(this, number$2(this.epochMillis));
	},
	[symbol](that) {
		return isDateTime$1(that) && that._tag === "Utc" && this.epochMillis === that.epochMillis;
	},
	toString() {
		return `DateTime.Utc(${toDateUtc$1(this).toJSON()})`;
	}
};
const ProtoZoned = {
	...Proto$2,
	_tag: "Zoned",
	[symbol$1]() {
		return pipe(number$2(this.epochMillis), combine$7(hash(this.zone)), cached(this));
	},
	[symbol](that) {
		return isDateTime$1(that) && that._tag === "Zoned" && this.epochMillis === that.epochMillis && equals$2(this.zone, that.zone);
	},
	toString() {
		return `DateTime.Zoned(${formatIsoZoned$1(this)})`;
	}
};
const ProtoTimeZone = {
	[TimeZoneTypeId]: TimeZoneTypeId,
	[NodeInspectSymbol]() {
		return this.toString();
	}
};
const ProtoTimeZoneNamed = {
	...ProtoTimeZone,
	_tag: "Named",
	[symbol$1]() {
		return cached(this, string(`Named:${this.id}`));
	},
	[symbol](that) {
		return isTimeZone(that) && that._tag === "Named" && this.id === that.id;
	},
	toString() {
		return `TimeZone.Named(${this.id})`;
	},
	toJSON() {
		return {
			_id: "TimeZone",
			_tag: "Named",
			id: this.id
		};
	}
};
const ProtoTimeZoneOffset = {
	...ProtoTimeZone,
	_tag: "Offset",
	[symbol$1]() {
		return cached(this, string(`Offset:${this.offset}`));
	},
	[symbol](that) {
		return isTimeZone(that) && that._tag === "Offset" && this.offset === that.offset;
	},
	toString() {
		return `TimeZone.Offset(${offsetToString(this.offset)})`;
	},
	toJSON() {
		return {
			_id: "TimeZone",
			_tag: "Offset",
			offset: this.offset
		};
	}
};
/** @internal */
const makeZonedProto = (epochMillis, zone, partsUtc) => {
	const self = Object.create(ProtoZoned);
	self.epochMillis = epochMillis;
	self.zone = zone;
	Object.defineProperty(self, "partsUtc", {
		value: partsUtc,
		enumerable: false,
		writable: true
	});
	Object.defineProperty(self, "adjustedEpochMillis", {
		value: void 0,
		enumerable: false,
		writable: true
	});
	Object.defineProperty(self, "partsAdjusted", {
		value: void 0,
		enumerable: false,
		writable: true
	});
	return self;
};
/** @internal */
const isDateTime$1 = (u) => hasProperty(u, TypeId$11);
/** @internal */
const isTimeZone = (u) => hasProperty(u, TimeZoneTypeId);
/** @internal */
const isTimeZoneOffset$1 = (u) => isTimeZone(u) && u._tag === "Offset";
/** @internal */
const isTimeZoneNamed$1 = (u) => isTimeZone(u) && u._tag === "Named";
/** @internal */
const isUtc$1 = (self) => self._tag === "Utc";
/** @internal */
const isZoned$1 = (self) => self._tag === "Zoned";
/** @internal */
const Equivalence$2 = /*#__PURE__*/ make$47((a, b) => a.epochMillis === b.epochMillis);
const makeUtc = (epochMillis) => {
	const self = Object.create(ProtoUtc);
	self.epochMillis = epochMillis;
	Object.defineProperty(self, "partsUtc", {
		value: void 0,
		enumerable: false,
		writable: true
	});
	return self;
};
/** @internal */
const unsafeFromDate$1 = (date) => {
	const epochMillis = date.getTime();
	if (Number.isNaN(epochMillis)) throw new IllegalArgumentException("Invalid date");
	return makeUtc(epochMillis);
};
/** @internal */
const unsafeMake$3 = (input) => {
	if (isDateTime$1(input)) return input;
	else if (input instanceof Date) return unsafeFromDate$1(input);
	else if (typeof input === "object") {
		const date = /* @__PURE__ */ new Date(0);
		setPartsDate(date, input);
		return unsafeFromDate$1(date);
	} else if (typeof input === "string" && !hasZone(input)) return unsafeFromDate$1(/* @__PURE__ */ new Date(input + "Z"));
	return unsafeFromDate$1(new Date(input));
};
const hasZone = (input) => /Z|[+-]\d{2}$|[+-]\d{2}:?\d{2}$|\]$/.test(input);
const minEpochMillis = -864e13 + 432e5;
const maxEpochMillis = 864e13 - 504e5;
/** @internal */
const unsafeMakeZoned$1 = (input, options) => {
	if (options?.timeZone === void 0 && isDateTime$1(input) && isZoned$1(input)) return input;
	const self = unsafeMake$3(input);
	if (self.epochMillis < minEpochMillis || self.epochMillis > maxEpochMillis) throw new RangeError(`Epoch millis out of range: ${self.epochMillis}`);
	let zone;
	if (options?.timeZone === void 0) {
		const offset = new Date(self.epochMillis).getTimezoneOffset() * -60 * 1e3;
		zone = zoneMakeOffset$1(offset);
	} else if (isTimeZone(options?.timeZone)) zone = options.timeZone;
	else if (typeof options?.timeZone === "number") zone = zoneMakeOffset$1(options.timeZone);
	else {
		const parsedZone = zoneFromString$1(options.timeZone);
		if (isNone(parsedZone)) throw new IllegalArgumentException(`Invalid time zone: ${options.timeZone}`);
		zone = parsedZone.value;
	}
	if (options?.adjustForTimeZone !== true) return makeZonedProto(self.epochMillis, zone, self.partsUtc);
	return makeZonedFromAdjusted(self.epochMillis, zone, options?.disambiguation ?? "compatible");
};
/** @internal */
const makeZoned = /*#__PURE__*/ liftThrowable(unsafeMakeZoned$1);
const zonedStringRegex = /^(.{17,35})\[(.+)\]$/;
/** @internal */
const makeZonedFromString$1 = (input) => {
	const match = zonedStringRegex.exec(input);
	if (match === null) {
		const offset = parseOffset(input);
		return offset !== null ? makeZoned(input, { timeZone: offset }) : none$4();
	}
	const [, isoString, timeZone] = match;
	return makeZoned(isoString, { timeZone });
};
const validZoneCache = /*#__PURE__*/ globalValue("effect/DateTime/validZoneCache", () => /* @__PURE__ */ new Map());
const formatOptions = {
	day: "numeric",
	month: "numeric",
	year: "numeric",
	hour: "numeric",
	minute: "numeric",
	second: "numeric",
	timeZoneName: "longOffset",
	fractionalSecondDigits: 3,
	hourCycle: "h23"
};
const zoneMakeIntl = (format) => {
	const zoneId = format.resolvedOptions().timeZone;
	if (validZoneCache.has(zoneId)) return validZoneCache.get(zoneId);
	const zone = Object.create(ProtoTimeZoneNamed);
	zone.id = zoneId;
	zone.format = format;
	validZoneCache.set(zoneId, zone);
	return zone;
};
/** @internal */
const zoneUnsafeMakeNamed$1 = (zoneId) => {
	if (validZoneCache.has(zoneId)) return validZoneCache.get(zoneId);
	try {
		return zoneMakeIntl(new Intl.DateTimeFormat("en-US", {
			...formatOptions,
			timeZone: zoneId
		}));
	} catch {
		throw new IllegalArgumentException(`Invalid time zone: ${zoneId}`);
	}
};
/** @internal */
const zoneMakeOffset$1 = (offset) => {
	const zone = Object.create(ProtoTimeZoneOffset);
	zone.offset = offset;
	return zone;
};
/** @internal */
const zoneMakeNamed = /*#__PURE__*/ liftThrowable(zoneUnsafeMakeNamed$1);
const offsetZoneRegex = /^(?:GMT|[+-])/;
/** @internal */
const zoneFromString$1 = (zone) => {
	if (offsetZoneRegex.test(zone)) {
		const offset = parseOffset(zone);
		return offset === null ? none$4() : some(zoneMakeOffset$1(offset));
	}
	return zoneMakeNamed(zone);
};
/** @internal */
const zoneToString$1 = (self) => {
	if (self._tag === "Offset") return offsetToString(self.offset);
	return self.id;
};
/** @internal */
const toDateUtc$1 = (self) => new Date(self.epochMillis);
/** @internal */
const toDate = (self) => {
	if (self._tag === "Utc") return new Date(self.epochMillis);
	else if (self.zone._tag === "Offset") return new Date(self.epochMillis + self.zone.offset);
	else if (self.adjustedEpochMillis !== void 0) return new Date(self.adjustedEpochMillis);
	const parts = self.zone.format.formatToParts(self.epochMillis).filter((_) => _.type !== "literal");
	const date = /* @__PURE__ */ new Date(0);
	date.setUTCFullYear(Number(parts[2].value), Number(parts[0].value) - 1, Number(parts[1].value));
	date.setUTCHours(Number(parts[3].value), Number(parts[4].value), Number(parts[5].value), Number(parts[6].value));
	self.adjustedEpochMillis = date.getTime();
	return date;
};
/** @internal */
const zonedOffset = (self) => {
	return toDate(self).getTime() - toEpochMillis$1(self);
};
const offsetToString = (offset) => {
	const abs = Math.abs(offset);
	let hours = Math.floor(abs / 36e5);
	let minutes = Math.round(abs % 36e5 / 6e4);
	if (minutes === 60) {
		hours += 1;
		minutes = 0;
	}
	return `${offset < 0 ? "-" : "+"}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};
/** @internal */
const zonedOffsetIso = (self) => offsetToString(zonedOffset(self));
/** @internal */
const toEpochMillis$1 = (self) => self.epochMillis;
const setPartsDate = (date, parts) => {
	if (parts.year !== void 0) date.setUTCFullYear(parts.year);
	if (parts.month !== void 0) date.setUTCMonth(parts.month - 1);
	if (parts.day !== void 0) date.setUTCDate(parts.day);
	if (parts.weekDay !== void 0) {
		const diff = parts.weekDay - date.getUTCDay();
		date.setUTCDate(date.getUTCDate() + diff);
	}
	if (parts.hours !== void 0) date.setUTCHours(parts.hours);
	if (parts.minutes !== void 0) date.setUTCMinutes(parts.minutes);
	if (parts.seconds !== void 0) date.setUTCSeconds(parts.seconds);
	if (parts.millis !== void 0) date.setUTCMilliseconds(parts.millis);
};
const constDayMillis = 864e5;
const makeZonedFromAdjusted = (adjustedMillis, zone, disambiguation) => {
	if (zone._tag === "Offset") return makeZonedProto(adjustedMillis - zone.offset, zone);
	const beforeOffset = calculateNamedOffset(adjustedMillis - constDayMillis, adjustedMillis, zone);
	const afterOffset = calculateNamedOffset(adjustedMillis + constDayMillis, adjustedMillis, zone);
	if (beforeOffset === afterOffset) return makeZonedProto(adjustedMillis - beforeOffset, zone);
	const isForwards = beforeOffset < afterOffset;
	const transitionMillis = beforeOffset - afterOffset;
	if (isForwards) {
		if (calculateNamedOffset(adjustedMillis - afterOffset, adjustedMillis, zone) === afterOffset) return makeZonedProto(adjustedMillis - afterOffset, zone);
		const before = makeZonedProto(adjustedMillis - beforeOffset, zone);
		if (adjustedMillis !== toDate(before).getTime()) switch (disambiguation) {
			case "reject": {
				const formatted = new Date(adjustedMillis).toISOString();
				throw new RangeError(`Gap time: ${formatted} does not exist in time zone ${zone.id}`);
			}
			case "earlier": return makeZonedProto(adjustedMillis - afterOffset, zone);
			case "compatible":
			case "later": return before;
		}
		return before;
	}
	if (calculateNamedOffset(adjustedMillis - beforeOffset, adjustedMillis, zone) === beforeOffset) {
		if (disambiguation === "earlier" || disambiguation === "compatible") return makeZonedProto(adjustedMillis - beforeOffset, zone);
		if (calculateNamedOffset(adjustedMillis - beforeOffset + transitionMillis, adjustedMillis + transitionMillis, zone) === beforeOffset) return makeZonedProto(adjustedMillis - beforeOffset, zone);
		if (disambiguation === "reject") {
			const formatted = new Date(adjustedMillis).toISOString();
			throw new RangeError(`Ambiguous time: ${formatted} occurs twice in time zone ${zone.id}`);
		}
	}
	return makeZonedProto(adjustedMillis - afterOffset, zone);
};
const offsetRegex = /([+-])(\d{2}):(\d{2})$/;
const parseOffset = (offset) => {
	const match = offsetRegex.exec(offset);
	if (match === null) return null;
	const [, sign, hours, minutes] = match;
	return (sign === "+" ? 1 : -1) * (Number(hours) * 60 + Number(minutes)) * 60 * 1e3;
};
const calculateNamedOffset = (utcMillis, adjustedMillis, zone) => {
	const offset = zone.format.formatToParts(utcMillis).find((_) => _.type === "timeZoneName")?.value ?? "";
	if (offset === "GMT") return 0;
	const result = parseOffset(offset);
	if (result === null) return zonedOffset(makeZonedProto(adjustedMillis, zone));
	return result;
};
/** @internal */
const formatIso$1 = (self) => toDateUtc$1(self).toISOString();
/** @internal */
const formatIsoOffset = (self) => {
	const date = toDate(self);
	return self._tag === "Utc" ? date.toISOString() : `${date.toISOString().slice(0, -1)}${zonedOffsetIso(self)}`;
};
/** @internal */
const formatIsoZoned$1 = (self) => self.zone._tag === "Offset" ? formatIsoOffset(self) : `${formatIsoOffset(self)}[${self.zone.id}]`;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/String.js
/**
* @example
* ```ts
* import * as assert from "node:assert"
* import { pipe, String } from "effect"
*
* assert.deepStrictEqual(pipe('a', String.toUpperCase), 'A')
* ```
*
* @since 2.0.0
*/
const toUpperCase = (self) => self.toUpperCase();
/**
* @example
* ```ts
* import * as assert from "node:assert"
* import { pipe, String } from "effect"
*
* assert.deepStrictEqual(pipe('A', String.toLowerCase), 'a')
* ```
*
* @since 2.0.0
*/
const toLowerCase = (self) => self.toLowerCase();
/**
* @example
* ```ts
* import * as assert from "node:assert"
* import { pipe, String } from "effect"
*
* assert.deepStrictEqual(pipe('abc', String.capitalize), 'Abc')
* ```
*
* @since 2.0.0
*/
const capitalize = (self) => {
	if (self.length === 0) return self;
	return toUpperCase(self[0]) + self.slice(1);
};
/**
* @example
* ```ts
* import * as assert from "node:assert"
* import { pipe, String } from "effect"
*
* assert.deepStrictEqual(pipe('ABC', String.uncapitalize), 'aBC')
* ```
*
* @since 2.0.0
*/
const uncapitalize = (self) => {
	if (self.length === 0) return self;
	return toLowerCase(self[0]) + self.slice(1);
};
/**
* Test whether a `string` is non empty.
*
* @since 2.0.0
*/
const isNonEmpty$1 = (self) => self.length > 0;
/** @internal */
const ScheduleTypeId = /*#__PURE__*/ Symbol.for("effect/Schedule");
/** @internal */
const isSchedule = (u) => hasProperty(u, ScheduleTypeId);
/** @internal */
const ScheduleDriverTypeId = /*#__PURE__*/ Symbol.for("effect/ScheduleDriver");
/** @internal */
const defaultIterationMetadata = {
	start: 0,
	now: 0,
	input: void 0,
	output: void 0,
	elapsed: zero$1,
	elapsedSincePrevious: zero$1,
	recurrence: 0
};
/** @internal */
const CurrentIterationMetadata = /*#__PURE__*/ Reference()("effect/Schedule/CurrentIterationMetadata", { defaultValue: () => defaultIterationMetadata });
const scheduleVariance = {
	/* c8 ignore next */
	_Out: (_) => _,
	/* c8 ignore next */
	_In: (_) => _,
	/* c8 ignore next */
	_R: (_) => _
};
const scheduleDriverVariance = {
	/* c8 ignore next */
	_Out: (_) => _,
	/* c8 ignore next */
	_In: (_) => _,
	/* c8 ignore next */
	_R: (_) => _
};
/** @internal */
var ScheduleImpl = class {
	initial;
	step;
	[ScheduleTypeId] = scheduleVariance;
	constructor(initial, step) {
		this.initial = initial;
		this.step = step;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const updateInfo = (iterationMetaRef, now, input, output) => update$2(iterationMetaRef, (prev) => prev.recurrence === 0 ? {
	now,
	input,
	output,
	recurrence: prev.recurrence + 1,
	elapsed: zero$1,
	elapsedSincePrevious: zero$1,
	start: now
} : {
	now,
	input,
	output,
	recurrence: prev.recurrence + 1,
	elapsed: millis(now - prev.start),
	elapsedSincePrevious: millis(now - prev.now),
	start: prev.start
});
/** @internal */
var ScheduleDriverImpl = class {
	schedule;
	ref;
	[ScheduleDriverTypeId] = scheduleDriverVariance;
	constructor(schedule, ref) {
		this.schedule = schedule;
		this.ref = ref;
	}
	get state() {
		return map$6(get$4(this.ref), (tuple) => tuple[1]);
	}
	get last() {
		return flatMap$6(get$4(this.ref), ([element, _]) => {
			switch (element._tag) {
				case "None": return failSync(() => new NoSuchElementException$2());
				case "Some": return succeed$8(element.value);
			}
		});
	}
	iterationMeta = /*#__PURE__*/ unsafeMake$6(defaultIterationMetadata);
	get reset() {
		return set$2(this.ref, [none$4(), this.schedule.initial]).pipe(zipLeft$1(set$2(this.iterationMeta, defaultIterationMetadata)));
	}
	next(input) {
		return pipe(map$6(get$4(this.ref), (tuple) => tuple[1]), flatMap$6((state) => pipe(currentTimeMillis, flatMap$6((now) => pipe(suspend$7(() => this.schedule.step(now, input, state)), flatMap$6(([state, out, decision]) => {
			const setState = set$2(this.ref, [some(out), state]);
			if (isDone$1(decision)) return setState.pipe(zipRight$3(fail$7(none$4())));
			const millis$1 = start(decision.intervals) - now;
			if (millis$1 <= 0) return setState.pipe(zipRight$3(updateInfo(this.iterationMeta, now, input, out)), as$2(out));
			const duration = millis(millis$1);
			return pipe(setState, zipRight$3(updateInfo(this.iterationMeta, now, input, out)), zipRight$3(sleep(duration)), as$2(out));
		}))))));
	}
};
/** @internal */
const makeWithState = (initial, step) => new ScheduleImpl(initial, step);
/** @internal */
const addDelay = /*#__PURE__*/ dual(2, (self, f) => addDelayEffect(self, (out) => sync$2(() => f(out))));
/** @internal */
const addDelayEffect = /*#__PURE__*/ dual(2, (self, f) => modifyDelayEffect(self, (out, duration) => map$6(f(out), (delay) => sum(duration, decode(delay)))));
/** @internal */
const check = /*#__PURE__*/ dual(2, (self, test) => checkEffect(self, (input, out) => sync$2(() => test(input, out))));
/** @internal */
const checkEffect = /*#__PURE__*/ dual(2, (self, test) => makeWithState(self.initial, (now, input, state) => flatMap$6(self.step(now, input, state), ([state, out, decision]) => {
	if (isDone$1(decision)) return succeed$8([
		state,
		out,
		done$1
	]);
	return map$6(test(input, out), (cont) => cont ? [
		state,
		out,
		decision
	] : [
		state,
		out,
		done$1
	]);
})));
/** @internal */
const driver = (self) => pipe(make$29([none$4(), self.initial]), map$6((ref) => new ScheduleDriverImpl(self, ref)));
/** @internal */
const intersect = /*#__PURE__*/ dual(2, (self, that) => intersectWith(self, that, intersect$1));
/** @internal */
const intersectWith = /*#__PURE__*/ dual(3, (self, that, f) => makeWithState([self.initial, that.initial], (now, input, state) => pipe(zipWith$2(self.step(now, input, state[0]), that.step(now, input, state[1]), (a, b) => [a, b]), flatMap$6(([[lState, out, lDecision], [rState, out2, rDecision]]) => {
	if (isContinue(lDecision) && isContinue(rDecision)) return intersectWithLoop(self, that, input, lState, out, lDecision.intervals, rState, out2, rDecision.intervals, f);
	return succeed$8([
		[lState, rState],
		[out, out2],
		done$1
	]);
}))));
/** @internal */
const intersectWithLoop = (self, that, input, lState, out, lInterval, rState, out2, rInterval, f) => {
	const combined = f(lInterval, rInterval);
	if (isNonEmpty$2(combined)) return succeed$8([
		[lState, rState],
		[out, out2],
		_continue(combined)
	]);
	if (pipe(lInterval, lessThan$1(rInterval))) return flatMap$6(self.step(end$2(lInterval), input, lState), ([lState, out, decision]) => {
		if (isDone$1(decision)) return succeed$8([
			[lState, rState],
			[out, out2],
			done$1
		]);
		return intersectWithLoop(self, that, input, lState, out, decision.intervals, rState, out2, rInterval, f);
	});
	return flatMap$6(that.step(end$2(rInterval), input, rState), ([rState, out2, decision]) => {
		if (isDone$1(decision)) return succeed$8([
			[lState, rState],
			[out, out2],
			done$1
		]);
		return intersectWithLoop(self, that, input, lState, out, lInterval, rState, out2, decision.intervals, f);
	});
};
/** @internal */
const map$3 = /*#__PURE__*/ dual(2, (self, f) => mapEffect(self, (out) => sync$2(() => f(out))));
/** @internal */
const mapEffect = /*#__PURE__*/ dual(2, (self, f) => makeWithState(self.initial, (now, input, state) => flatMap$6(self.step(now, input, state), ([state, out, decision]) => map$6(f(out), (out2) => [
	state,
	out2,
	decision
]))));
/** @internal */
const modifyDelayEffect = /*#__PURE__*/ dual(2, (self, f) => makeWithState(self.initial, (now, input, state) => flatMap$6(self.step(now, input, state), ([state, out, decision]) => {
	if (isDone$1(decision)) return succeed$8([
		state,
		out,
		decision
	]);
	const intervals = decision.intervals;
	const delay = size$2(make$21(now, start(intervals)));
	return map$6(f(out, delay), (durationInput) => {
		const duration = decode(durationInput);
		const oldStart = start(intervals);
		const newStart = now + toMillis(duration);
		const delta = newStart - oldStart;
		const newEnd = Math.max(0, end$2(intervals) + delta);
		const newInterval = make$21(newStart, newEnd);
		return [
			state,
			out,
			continueWith(newInterval)
		];
	});
})));
/** @internal */
const passthrough = (self) => makeWithState(self.initial, (now, input, state) => pipe(self.step(now, input, state), map$6(([state, _, decision]) => [
	state,
	input,
	decision
])));
/** @internal */
const recurs = (n) => whileOutput(forever, (out) => out < n);
/** @internal */
const spaced$1 = (duration) => addDelay(forever, () => duration);
/** @internal */
const unfold = (initial, f) => makeWithState(initial, (now, _, state) => sync$2(() => [
	f(state),
	state,
	continueWith(after(now))
]));
/** @internal */
const untilInputEffect = /*#__PURE__*/ dual(2, (self, f) => checkEffect(self, (input, _) => negate$1(f(input))));
/** @internal */
const whileInputEffect = /*#__PURE__*/ dual(2, (self, f) => checkEffect(self, (input, _) => f(input)));
/** @internal */
const whileOutput = /*#__PURE__*/ dual(2, (self, f) => check(self, (_, out) => f(out)));
const ScheduleDefectTypeId = /*#__PURE__*/ Symbol.for("effect/Schedule/ScheduleDefect");
var ScheduleDefect = class {
	error;
	[ScheduleDefectTypeId];
	constructor(error) {
		this.error = error;
		this[ScheduleDefectTypeId] = ScheduleDefectTypeId;
	}
};
const isScheduleDefect = (u) => hasProperty(u, ScheduleDefectTypeId);
const scheduleDefectWrap = (self) => catchAll$1(self, (e) => die$4(new ScheduleDefect(e)));
/** @internal */
const scheduleDefectRefailCause = (cause) => match$9(find(cause, (_) => isDieType$1(_) && isScheduleDefect(_.defect) ? some(_.defect) : none$4()), {
	onNone: () => cause,
	onSome: (error) => fail$8(error.error)
});
/** @internal */
const scheduleDefectRefail = (effect) => catchAllCause$1(effect, (cause) => failCause$6(scheduleDefectRefailCause(cause)));
/** @internal */
const repeat_Effect = /*#__PURE__*/ dual(2, (self, schedule) => repeatOrElse_Effect(self, schedule, (e, _) => fail$7(e)));
/** @internal */
const repeat_combined = /*#__PURE__*/ dual(2, (self, options) => {
	if (isSchedule(options)) return repeat_Effect(self, options);
	const base = options.schedule ?? passthrough(forever);
	const withWhile = options.while ? whileInputEffect(base, (a) => {
		const applied = options.while(a);
		if (typeof applied === "boolean") return succeed$8(applied);
		return scheduleDefectWrap(applied);
	}) : base;
	const withUntil = options.until ? untilInputEffect(withWhile, (a) => {
		const applied = options.until(a);
		if (typeof applied === "boolean") return succeed$8(applied);
		return scheduleDefectWrap(applied);
	}) : withWhile;
	const withTimes = options.times ? intersect(withUntil, recurs(options.times)).pipe(map$3((intersectionPair) => intersectionPair[0])) : withUntil;
	return scheduleDefectRefail(repeat_Effect(self, withTimes));
});
/** @internal */
const repeatOrElse_Effect = /*#__PURE__*/ dual(3, (self, schedule, orElse) => flatMap$6(driver(schedule), (driver) => matchEffect$1(self, {
	onFailure: (error) => orElse(error, none$4()),
	onSuccess: (value) => repeatOrElseEffectLoop(provideServiceEffect(self, CurrentIterationMetadata, get$4(driver.iterationMeta)), driver, (error, option) => provideServiceEffect(orElse(error, option), CurrentIterationMetadata, get$4(driver.iterationMeta)), value)
})));
/** @internal */
const repeatOrElseEffectLoop = (self, driver, orElse, value) => matchEffect$1(driver.next(value), {
	onFailure: () => orDie$1(driver.last),
	onSuccess: (b) => matchEffect$1(self, {
		onFailure: (error) => orElse(error, some(b)),
		onSuccess: (value) => repeatOrElseEffectLoop(self, driver, orElse, value)
	})
});
/** @internal */
const retry_Effect = /*#__PURE__*/ dual(2, (self, policy) => retryOrElse_Effect(self, policy, (e, _) => fail$7(e)));
/** @internal */
const retry_combined = /*#__PURE__*/ dual(2, (self, options) => {
	if (isSchedule(options)) return retry_Effect(self, options);
	return scheduleDefectRefail(retry_Effect(self, fromRetryOptions(options)));
});
/** @internal */
const fromRetryOptions = (options) => {
	const base = options.schedule ?? forever;
	const withWhile = options.while ? whileInputEffect(base, (e) => {
		const applied = options.while(e);
		if (typeof applied === "boolean") return succeed$8(applied);
		return scheduleDefectWrap(applied);
	}) : base;
	const withUntil = options.until ? untilInputEffect(withWhile, (e) => {
		const applied = options.until(e);
		if (typeof applied === "boolean") return succeed$8(applied);
		return scheduleDefectWrap(applied);
	}) : withWhile;
	return options.times !== void 0 ? intersect(withUntil, recurs(options.times)) : withUntil;
};
/** @internal */
const retryOrElse_Effect = /*#__PURE__*/ dual(3, (self, policy, orElse) => flatMap$6(driver(policy), (driver) => retryOrElse_EffectLoop(provideServiceEffect(self, CurrentIterationMetadata, get$4(driver.iterationMeta)), driver, (e, out) => provideServiceEffect(orElse(e, out), CurrentIterationMetadata, get$4(driver.iterationMeta)))));
/** @internal */
const retryOrElse_EffectLoop = (self, driver, orElse) => {
	return catchAll$1(self, (e) => matchEffect$1(driver.next(e), {
		onFailure: () => pipe(driver.last, orDie$1, flatMap$6((out) => orElse(e, out))),
		onSuccess: () => retryOrElse_EffectLoop(self, driver, orElse)
	}));
};
/** @internal */
const forever = /*#__PURE__*/ unfold(0, (n) => n + 1);
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Effect.js
/**
* Checks if a given value is an `Effect` value.
*
* **When to Use**
*
* This function can be useful for checking the type of a value before
* attempting to operate on it as an `Effect` value. For example, you could use
* `Effect.isEffect` to check the type of a value before using it as an argument
* to a function that expects an `Effect` value.
*
* @since 2.0.0
* @category Guards
*/
const isEffect = isEffect$1;
/**
* Combines multiple effects into one, returning results based on the input
* structure.
*
* **Details**
*
* Use this function when you need to run multiple effects and combine their
* results into a single output. It supports tuples, iterables, structs, and
* records, making it flexible for different input types.
*
* For instance, if the input is a tuple:
*
* ```ts skip-type-checking
* //         ┌─── a tuple of effects
* //         ▼
* Effect.all([effect1, effect2, ...])
* ```
*
* the effects are executed sequentially, and the result is a new effect
* containing the results as a tuple. The results in the tuple match the order
* of the effects passed to `Effect.all`.
*
* **Concurrency**
*
* You can control the execution order (e.g., sequential vs. concurrent) using
* the `concurrency` option.
*
* **Short-Circuiting Behavior**
*
* This function stops execution on the first error it encounters, this is
* called "short-circuiting". If any effect in the collection fails, the
* remaining effects will not run, and the error will be propagated. To change
* this behavior, you can use the `mode` option, which allows all effects to run
* and collect results as `Either` or `Option`.
*
* **The `mode` option**
*
* The `{ mode: "either" }` option changes the behavior of `Effect.all` to
* ensure all effects run, even if some fail. Instead of stopping on the first
* failure, this mode collects both successes and failures, returning an array
* of `Either` instances where each result is either a `Right` (success) or a
* `Left` (failure).
*
* Similarly, the `{ mode: "validate" }` option uses `Option` to indicate
* success or failure. Each effect returns `None` for success and `Some` with
* the error for failure.
*
* **Example** (Combining Effects in Tuples)
*
* ```ts
* import { Effect, Console } from "effect"
*
* const tupleOfEffects = [
*   Effect.succeed(42).pipe(Effect.tap(Console.log)),
*   Effect.succeed("Hello").pipe(Effect.tap(Console.log))
* ] as const
*
* //      ┌─── Effect<[number, string], never, never>
* //      ▼
* const resultsAsTuple = Effect.all(tupleOfEffects)
*
* Effect.runPromise(resultsAsTuple).then(console.log)
* // Output:
* // 42
* // Hello
* // [ 42, 'Hello' ]
* ```
*
* **Example** (Combining Effects in Iterables)
*
* ```ts
* import { Effect, Console } from "effect"
*
* const iterableOfEffects: Iterable<Effect.Effect<number>> = [1, 2, 3].map(
*   (n) => Effect.succeed(n).pipe(Effect.tap(Console.log))
* )
*
* //      ┌─── Effect<number[], never, never>
* //      ▼
* const resultsAsArray = Effect.all(iterableOfEffects)
*
* Effect.runPromise(resultsAsArray).then(console.log)
* // Output:
* // 1
* // 2
* // 3
* // [ 1, 2, 3 ]
* ```
*
* **Example** (Combining Effects in Structs)
*
* ```ts
* import { Effect, Console } from "effect"
*
* const structOfEffects = {
*   a: Effect.succeed(42).pipe(Effect.tap(Console.log)),
*   b: Effect.succeed("Hello").pipe(Effect.tap(Console.log))
* }
*
* //      ┌─── Effect<{ a: number; b: string; }, never, never>
* //      ▼
* const resultsAsStruct = Effect.all(structOfEffects)
*
* Effect.runPromise(resultsAsStruct).then(console.log)
* // Output:
* // 42
* // Hello
* // { a: 42, b: 'Hello' }
* ```
*
* **Example** (Combining Effects in Records)
*
* ```ts
* import { Effect, Console } from "effect"
*
* const recordOfEffects: Record<string, Effect.Effect<number>> = {
*   key1: Effect.succeed(1).pipe(Effect.tap(Console.log)),
*   key2: Effect.succeed(2).pipe(Effect.tap(Console.log))
* }
*
* //      ┌─── Effect<{ [x: string]: number; }, never, never>
* //      ▼
* const resultsAsRecord = Effect.all(recordOfEffects)
*
* Effect.runPromise(resultsAsRecord).then(console.log)
* // Output:
* // 1
* // 2
* // { key1: 1, key2: 2 }
* ```
*
* **Example** (Short-Circuiting Behavior)
*
* ```ts
* import { Effect, Console } from "effect"
*
* const program = Effect.all([
*   Effect.succeed("Task1").pipe(Effect.tap(Console.log)),
*   Effect.fail("Task2: Oh no!").pipe(Effect.tap(Console.log)),
*   // Won't execute due to earlier failure
*   Effect.succeed("Task3").pipe(Effect.tap(Console.log))
* ])
*
* Effect.runPromiseExit(program).then(console.log)
* // Output:
* // Task1
* // {
* //   _id: 'Exit',
* //   _tag: 'Failure',
* //   cause: { _id: 'Cause', _tag: 'Fail', failure: 'Task2: Oh no!' }
* // }
* ```
*
* **Example** (Collecting Results with `mode: "either"`)
*
* ```ts
* import { Effect, Console } from "effect"
*
* const effects = [
*   Effect.succeed("Task1").pipe(Effect.tap(Console.log)),
*   Effect.fail("Task2: Oh no!").pipe(Effect.tap(Console.log)),
*   Effect.succeed("Task3").pipe(Effect.tap(Console.log))
* ]
*
* const program = Effect.all(effects, { mode: "either" })
*
* Effect.runPromiseExit(program).then(console.log)
* // Output:
* // Task1
* // Task3
* // {
* //   _id: 'Exit',
* //   _tag: 'Success',
* //   value: [
* //     { _id: 'Either', _tag: 'Right', right: 'Task1' },
* //     { _id: 'Either', _tag: 'Left', left: 'Task2: Oh no!' },
* //     { _id: 'Either', _tag: 'Right', right: 'Task3' }
* //   ]
* // }
* ```
*
* **Example** (Collecting Results with `mode: "validate"`)
*
* ```ts
* import { Effect, Console } from "effect"
*
* const effects = [
*   Effect.succeed("Task1").pipe(Effect.tap(Console.log)),
*   Effect.fail("Task2: Oh no!").pipe(Effect.tap(Console.log)),
*   Effect.succeed("Task3").pipe(Effect.tap(Console.log))
* ]
*
* const program = Effect.all(effects, { mode: "validate" })
*
* Effect.runPromiseExit(program).then((result) => console.log("%o", result))
* // Output:
* // Task1
* // Task3
* // {
* //   _id: 'Exit',
* //   _tag: 'Failure',
* //   cause: {
* //     _id: 'Cause',
* //     _tag: 'Fail',
* //     failure: [
* //       { _id: 'Option', _tag: 'None' },
* //       { _id: 'Option', _tag: 'Some', value: 'Task2: Oh no!' },
* //       { _id: 'Option', _tag: 'None' }
* //     ]
* //   }
* // }
* ```
*
* @see {@link forEach} for iterating over elements and applying an effect.
* @see {@link allWith} for a data-last version of this function.
*
* @since 2.0.0
* @category Collecting
*/
const all = all$1;
/**
* Executes an effectful operation for each element in an `Iterable`.
*
* **Details**
*
* This function applies a provided operation to each element in the iterable,
* producing a new effect that returns an array of results.
*
* If any effect fails, the iteration stops immediately (short-circuiting), and
* the error is propagated.
*
* **Concurrency**
*
* The `concurrency` option controls how many operations are performed
* concurrently. By default, the operations are performed sequentially.
*
* **Discarding Results**
*
* If the `discard` option is set to `true`, the intermediate results are not
* collected, and the final result of the operation is `void`.
*
* **Example** (Applying Effects to Iterable Elements)
*
* ```ts
* import { Effect, Console } from "effect"
*
* const result = Effect.forEach([1, 2, 3, 4, 5], (n, index) =>
*   Console.log(`Currently at index ${index}`).pipe(Effect.as(n * 2))
* )
*
* Effect.runPromise(result).then(console.log)
* // Output:
* // Currently at index 0
* // Currently at index 1
* // Currently at index 2
* // Currently at index 3
* // Currently at index 4
* // [ 2, 4, 6, 8, 10 ]
* ```
*
* **Example** (Discarding Results)
*
* ```ts
* import { Effect, Console } from "effect"
*
* // Apply effects but discard the results
* const result = Effect.forEach(
*   [1, 2, 3, 4, 5],
*   (n, index) =>
*     Console.log(`Currently at index ${index}`).pipe(Effect.as(n * 2)),
*   { discard: true }
* )
*
* Effect.runPromise(result).then(console.log)
* // Output:
* // Currently at index 0
* // Currently at index 1
* // Currently at index 2
* // Currently at index 3
* // Currently at index 4
* // undefined
* ```
*
* @see {@link all} for combining multiple effects into one.
*
* @since 2.0.0
* @category Looping
*/
const forEach$2 = forEach$3;
/**
* Reduces an `Iterable<A>` using an effectual function `f`, working
* sequentially from left to right.
*
* **Details**
*
* This function takes an iterable and applies a function `f` to each element in
* the iterable. The function works sequentially, starting with an initial value
* `zero` and then combining it with each element in the collection. The
* provided function `f` is called for each element in the iterable, allowing
* you to accumulate a result based on the current value and the element being
* processed.
*
* **When to Use**
*
* The function is often used for operations like summing a collection of
* numbers or combining results from multiple tasks. It ensures that operations
* are performed one after the other, maintaining the order of the elements.
*
* **Example**
*
* ```ts
* import { Console, Effect } from "effect"
*
* const processOrder = (id: number) =>
*   Effect.succeed({ id, price: 100 * id })
*     .pipe(Effect.tap(() => Console.log(`Order ${id} processed`)), Effect.delay(500 - (id * 100)))
*
* const program = Effect.reduce(
*   [1, 2, 3, 4],
*   0,
*   (acc, id, i) =>
*     processOrder(id)
*       .pipe(Effect.map((order) => acc + order.price))
* )
*
* Effect.runPromise(program).then(console.log)
* // Output:
* // Order 1 processed
* // Order 2 processed
* // Order 3 processed
* // Order 4 processed
* // 1000
* ```
*
* @see {@link reduceWhile} for a similar function that stops the process based on a predicate.
* @see {@link reduceRight} for a similar function that works from right to left.
*
* @since 2.0.0
* @category Collecting
*/
const reduce = reduce$1;
/**
* Creates an `Effect` from a callback-based asynchronous function.
*
* **Details**
*
* The `resume` function:
* - Must be called exactly once. Any additional calls will be ignored.
* - Can return an optional `Effect` that will be run if the `Fiber` executing
*   this `Effect` is interrupted. This can be useful in scenarios where you
*   need to handle resource cleanup if the operation is interrupted.
* - Can receive an `AbortSignal` to handle interruption if needed.
*
* The `FiberId` of the fiber that may complete the async callback may also be
* specified using the `blockingOn` argument. This is called the "blocking
* fiber" because it suspends the fiber executing the `async` effect (i.e.
* semantically blocks the fiber from making progress). Specifying this fiber id
* in cases where it is known will improve diagnostics, but not affect the
* behavior of the returned effect.
*
* **When to Use**
*
* Use `Effect.async` when dealing with APIs that use callback-style instead of
* `async/await` or `Promise`.
*
* **Example** (Wrapping a Callback API)
*
* ```ts
* import { Effect } from "effect"
* import * as NodeFS from "node:fs"
*
* const readFile = (filename: string) =>
*   Effect.async<Buffer, Error>((resume) => {
*     NodeFS.readFile(filename, (error, data) => {
*       if (error) {
*         // Resume with a failed Effect if an error occurs
*         resume(Effect.fail(error))
*       } else {
*         // Resume with a succeeded Effect if successful
*         resume(Effect.succeed(data))
*       }
*     })
*   })
*
* //      ┌─── Effect<Buffer, Error, never>
* //      ▼
* const program = readFile("example.txt")
* ```
*
* **Example** (Handling Interruption with Cleanup)
*
* ```ts
* import { Effect, Fiber } from "effect"
* import * as NodeFS from "node:fs"
*
* // Simulates a long-running operation to write to a file
* const writeFileWithCleanup = (filename: string, data: string) =>
*   Effect.async<void, Error>((resume) => {
*     const writeStream = NodeFS.createWriteStream(filename)
*
*     // Start writing data to the file
*     writeStream.write(data)
*
*     // When the stream is finished, resume with success
*     writeStream.on("finish", () => resume(Effect.void))
*
*     // In case of an error during writing, resume with failure
*     writeStream.on("error", (err) => resume(Effect.fail(err)))
*
*     // Handle interruption by returning a cleanup effect
*     return Effect.sync(() => {
*       console.log(`Cleaning up ${filename}`)
*       NodeFS.unlinkSync(filename)
*     })
*   })
*
* const program = Effect.gen(function* () {
*   const fiber = yield* Effect.fork(
*     writeFileWithCleanup("example.txt", "Some long data...")
*   )
*   // Simulate interrupting the fiber after 1 second
*   yield* Effect.sleep("1 second")
*   yield* Fiber.interrupt(fiber) // This will trigger the cleanup
* })
*
* // Run the program
* Effect.runPromise(program)
* // Output:
* // Cleaning up example.txt
* ```
*
* **Example** (Handling Interruption with AbortSignal)
*
* ```ts
* import { Effect, Fiber } from "effect"
*
* // A task that supports interruption using AbortSignal
* const interruptibleTask = Effect.async<void, Error>((resume, signal) => {
*   // Handle interruption
*   signal.addEventListener("abort", () => {
*     console.log("Abort signal received")
*     clearTimeout(timeoutId)
*   })
*
*   // Simulate a long-running task
*   const timeoutId = setTimeout(() => {
*     console.log("Operation completed")
*     resume(Effect.void)
*   }, 2000)
* })
*
* const program = Effect.gen(function* () {
*   const fiber = yield* Effect.fork(interruptibleTask)
*   // Simulate interrupting the fiber after 1 second
*   yield* Effect.sleep("1 second")
*   yield* Fiber.interrupt(fiber)
* })
*
* // Run the program
* Effect.runPromise(program)
* // Output:
* // Abort signal received
* ```
*
* @since 2.0.0
* @category Creating Effects
*/
const async = async_;
/**
* @since 2.0.0
* @category Creating Effects
*/
const withFiberRuntime = withFiberRuntime$1;
/**
* Creates an `Effect` that represents a recoverable error.
*
* **When to Use**
*
* Use this function to explicitly signal an error in an `Effect`. The error
* will keep propagating unless it is handled. You can handle the error with
* functions like {@link catchAll} or {@link catchTag}.
*
* **Example** (Creating a Failed Effect)
*
* ```ts
* import { Effect } from "effect"
*
* //      ┌─── Effect<never, Error, never>
* //      ▼
* const failure = Effect.fail(
*   new Error("Operation failed due to network error")
* )
* ```
*
* @see {@link succeed} to create an effect that represents a successful value.
*
* @since 2.0.0
* @category Creating Effects
*/
const fail$2 = fail$7;
/**
* Creates an `Effect` that fails with the specified `Cause`.
*
* @since 2.0.0
* @category Creating Effects
*/
const failCause$2 = failCause$6;
/**
* Creates an effect that terminates a fiber with a specified error.
*
* **Details**
*
* This function is used to signal a defect, which represents a critical and
* unexpected error in the code. When invoked, it produces an effect that does
* not handle the error and instead terminates the fiber.
*
* The error channel of the resulting effect is of type `never`, indicating that
* it cannot recover from this failure.
*
* **When to Use**
*
* Use this function when encountering unexpected conditions in your code that
* should not be handled as regular errors but instead represent unrecoverable
* defects.
*
* **Example** (Terminating on Division by Zero with a Specified Error)
*
* ```ts
* import { Effect } from "effect"
*
* const divide = (a: number, b: number) =>
*   b === 0
*     ? Effect.die(new Error("Cannot divide by zero"))
*     : Effect.succeed(a / b)
*
* //      ┌─── Effect<number, never, never>
* //      ▼
* const program = divide(1, 0)
*
* Effect.runPromise(program).catch(console.error)
* // Output:
* // (FiberFailure) Error: Cannot divide by zero
* //   ...stack trace...
* ```
*
* @see {@link dieSync} for a variant that throws a specified error, evaluated
* lazily.
* @see {@link dieMessage} for a variant that throws a `RuntimeException` with a
* message.
*
* @since 2.0.0
* @category Creating Effects
*/
const die$1 = die$4;
/**
* Creates an effect that terminates a fiber with a `RuntimeException`
* containing the specified message.
*
* **Details**
*
* This function is used to signal a defect, representing a critical and
* unexpected error in the code. When invoked, it produces an effect that
* terminates the fiber with a `RuntimeException` carrying the given message.
*
* The resulting effect has an error channel of type `never`, indicating it does
* not handle or recover from the error.
*
* **When to Use**
*
* Use this function when you want to terminate a fiber due to an unrecoverable
* defect and include a clear explanation in the message.
*
* **Example** (Terminating on Division by Zero with a Specified Message)
*
* ```ts
* import { Effect } from "effect"
*
* const divide = (a: number, b: number) =>
*   b === 0
*     ? Effect.dieMessage("Cannot divide by zero")
*     : Effect.succeed(a / b)
*
* //      ┌─── Effect<number, never, never>
* //      ▼
* const program = divide(1, 0)
*
* Effect.runPromise(program).catch(console.error)
* // Output:
* // (FiberFailure) RuntimeException: Cannot divide by zero
* //   ...stack trace...
* ```
*
* @see {@link die} for a variant that throws a specified error.
* @see {@link dieSync} for a variant that throws a specified error, evaluated
* lazily.
*
* @since 2.0.0
* @category Creating Effects
*/
const dieMessage = dieMessage$1;
/**
* Provides a way to write effectful code using generator functions, simplifying
* control flow and error handling.
*
* **When to Use**
*
* `Effect.gen` allows you to write code that looks and behaves like synchronous
* code, but it can handle asynchronous tasks, errors, and complex control flow
* (like loops and conditions). It helps make asynchronous code more readable
* and easier to manage.
*
* The generator functions work similarly to `async/await` but with more
* explicit control over the execution of effects. You can `yield*` values from
* effects and return the final result at the end.
*
* **Example**
*
* ```ts
* import { Effect } from "effect"
*
* const addServiceCharge = (amount: number) => amount + 1
*
* const applyDiscount = (
*   total: number,
*   discountRate: number
* ): Effect.Effect<number, Error> =>
*   discountRate === 0
*     ? Effect.fail(new Error("Discount rate cannot be zero"))
*     : Effect.succeed(total - (total * discountRate) / 100)
*
* const fetchTransactionAmount = Effect.promise(() => Promise.resolve(100))
*
* const fetchDiscountRate = Effect.promise(() => Promise.resolve(5))
*
* export const program = Effect.gen(function* () {
*   const transactionAmount = yield* fetchTransactionAmount
*   const discountRate = yield* fetchDiscountRate
*   const discountedAmount = yield* applyDiscount(
*     transactionAmount,
*     discountRate
*   )
*   const finalAmount = addServiceCharge(discountedAmount)
*   return `Final amount to charge: ${finalAmount}`
* })
* ```
*
* @since 2.0.0
* @category Creating Effects
*/
const gen = gen$1;
/**
* Creates an `Effect` that always succeeds with a given value.
*
* **When to Use**
*
* Use this function when you need an effect that completes successfully with a
* specific value without any errors or external dependencies.
*
* **Example** (Creating a Successful Effect)
*
* ```ts
* import { Effect } from "effect"
*
* // Creating an effect that represents a successful scenario
* //
* //      ┌─── Effect<number, never, never>
* //      ▼
* const success = Effect.succeed(42)
* ```
*
* @see {@link fail} to create an effect that represents a failure.
*
* @since 2.0.0
* @category Creating Effects
*/
const succeed$2 = succeed$8;
/**
* Delays the creation of an `Effect` until it is actually needed.
*
* **Details**
*
* The `Effect.suspend` function takes a thunk that represents the effect and
* wraps it in a suspended effect. This means the effect will not be created
* until it is explicitly needed, which is helpful in various scenarios:
* - **Lazy Evaluation**: Helps optimize performance by deferring computations,
*   especially when the effect might not be needed, or when its computation is
*   expensive. This also ensures that any side effects or scoped captures are
*   re-executed on each invocation.
* - **Handling Circular Dependencies**: Useful in managing circular
*   dependencies, such as recursive functions that need to avoid eager
*   evaluation to prevent stack overflow.
* - **Unifying Return Types**: Can help TypeScript unify return types in
*   situations where multiple branches of logic return different effects,
*   simplifying type inference.
*
* **When to Use**
*
* Use this function when you need to defer the evaluation of an effect until it
* is required. This is particularly useful for optimizing expensive
* computations, managing circular dependencies, or resolving type inference
* issues.
*
* **Example** (Lazy Evaluation with Side Effects)
*
* ```ts
* import { Effect } from "effect"
*
* let i = 0
*
* const bad = Effect.succeed(i++)
*
* const good = Effect.suspend(() => Effect.succeed(i++))
*
* console.log(Effect.runSync(bad)) // Output: 0
* console.log(Effect.runSync(bad)) // Output: 0
*
* console.log(Effect.runSync(good)) // Output: 1
* console.log(Effect.runSync(good)) // Output: 2
* ```
*
* **Example** (Recursive Fibonacci)
*
* ```ts
* import { Effect } from "effect"
*
* const blowsUp = (n: number): Effect.Effect<number> =>
*   n < 2
*     ? Effect.succeed(1)
*     : Effect.zipWith(blowsUp(n - 1), blowsUp(n - 2), (a, b) => a + b)
*
* console.log(Effect.runSync(blowsUp(32)))
* // crash: JavaScript heap out of memory
*
* const allGood = (n: number): Effect.Effect<number> =>
*   n < 2
*     ? Effect.succeed(1)
*     : Effect.zipWith(
*         Effect.suspend(() => allGood(n - 1)),
*         Effect.suspend(() => allGood(n - 2)),
*         (a, b) => a + b
*       )
*
* console.log(Effect.runSync(allGood(32)))
* // Output: 3524578
* ```
*
* **Example** (Using Effect.suspend to Help TypeScript Infer Types)
*
* ```ts
* import { Effect } from "effect"
*
* //   Without suspend, TypeScript may struggle with type inference.
* //   Inferred type:
* //     (a: number, b: number) =>
* //       Effect<never, Error, never> | Effect<number, never, never>
* const withoutSuspend = (a: number, b: number) =>
*   b === 0
*     ? Effect.fail(new Error("Cannot divide by zero"))
*     : Effect.succeed(a / b)
*
* //   Using suspend to unify return types.
* //   Inferred type:
* //     (a: number, b: number) => Effect<number, Error, never>
* const withSuspend = (a: number, b: number) =>
*   Effect.suspend(() =>
*     b === 0
*       ? Effect.fail(new Error("Cannot divide by zero"))
*       : Effect.succeed(a / b)
*   )
* ```
*
* @since 2.0.0
* @category Creating Effects
*/
const suspend$5 = suspend$7;
/**
* Creates an `Effect` that represents a synchronous side-effectful computation.
*
* **Details**
*
* The provided function (`thunk`) must not throw errors; if it does, the error
* will be treated as a "defect".
*
* This defect is not a standard error but indicates a flaw in the logic that
* was expected to be error-free. You can think of it similar to an unexpected
* crash in the program, which can be further managed or logged using tools like
* {@link catchAllDefect}.
*
* **When to Use**
*
* Use this function when you are sure the operation will not fail.
*
* **Example** (Logging a Message)
*
* ```ts
* import { Effect } from "effect"
*
* const log = (message: string) =>
*   Effect.sync(() => {
*     console.log(message) // side effect
*   })
*
* //      ┌─── Effect<void, never, never>
* //      ▼
* const program = log("Hello, World!")
* ```
*
* @see {@link try_ | try} for a version that can handle failures.
*
* @since 2.0.0
* @category Creating Effects
*/
const sync$1 = sync$2;
const _void = void_$4;
/**
* Handles all errors in an effect by providing a fallback effect.
*
* **Details**
*
* This function catches any errors that may occur during the execution of an
* effect and allows you to handle them by specifying a fallback effect. This
* ensures that the program continues without failing by recovering from errors
* using the provided fallback logic.
*
* **Note**: This function only handles recoverable errors. It will not recover
* from unrecoverable defects.
*
* **Example** (Providing Recovery Logic for Recoverable Errors)
*
* ```ts
* import { Effect, Random } from "effect"
*
* class HttpError {
*   readonly _tag = "HttpError"
* }
*
* class ValidationError {
*   readonly _tag = "ValidationError"
* }
*
* //      ┌─── Effect<string, HttpError | ValidationError, never>
* //      ▼
* const program = Effect.gen(function* () {
*   const n1 = yield* Random.next
*   const n2 = yield* Random.next
*   if (n1 < 0.5) {
*     yield* Effect.fail(new HttpError())
*   }
*   if (n2 < 0.5) {
*     yield* Effect.fail(new ValidationError())
*   }
*   return "some result"
* })
*
* //      ┌─── Effect<string, never, never>
* //      ▼
* const recovered = program.pipe(
*   Effect.catchAll((error) =>
*     Effect.succeed(`Recovering from ${error._tag}`)
*   )
* )
* ```
*
* @see {@link catchAllCause} for a version that can recover from both
* recoverable and unrecoverable errors.
*
* @since 2.0.0
* @category Error handling
*/
const catchAll = catchAll$1;
/**
* Handles both recoverable and unrecoverable errors by providing a recovery
* effect.
*
* **When to Use**
*
* The `catchAllCause` function allows you to handle all errors, including
* unrecoverable defects, by providing a recovery effect. The recovery logic is
* based on the `Cause` of the error, which provides detailed information about
* the failure.
*
* **When to Recover from Defects**
*
* Defects are unexpected errors that typically shouldn't be recovered from, as
* they often indicate serious issues. However, in some cases, such as
* dynamically loaded plugins, controlled recovery might be needed.
*
* **Example** (Recovering from All Errors)
*
* ```ts
* import { Cause, Effect } from "effect"
*
* // Define an effect that may fail with a recoverable or unrecoverable error
* const program = Effect.fail("Something went wrong!")
*
* // Recover from all errors by examining the cause
* const recovered = program.pipe(
*   Effect.catchAllCause((cause) =>
*     Cause.isFailure(cause)
*       ? Effect.succeed("Recovered from a regular error")
*       : Effect.succeed("Recovered from a defect")
*   )
* )
*
* Effect.runPromise(recovered).then(console.log)
* // Output: "Recovered from a regular error"
* ```
*
* @since 2.0.0
* @category Error handling
*/
const catchAllCause = catchAllCause$1;
/**
* Catches and handles specific errors by their `_tag` field, which is used as a
* discriminator.
*
* **When to Use**
*
* `catchTag` is useful when your errors are tagged with a readonly `_tag` field
* that identifies the error type. You can use this function to handle specific
* error types by matching the `_tag` value. This allows for precise error
* handling, ensuring that only specific errors are caught and handled.
*
* The error type must have a readonly `_tag` field to use `catchTag`. This
* field is used to identify and match errors.
*
* **Example** (Handling Errors by Tag)
*
* ```ts
* import { Effect, Random } from "effect"
*
* class HttpError {
*   readonly _tag = "HttpError"
* }
*
* class ValidationError {
*   readonly _tag = "ValidationError"
* }
*
* //      ┌─── Effect<string, HttpError | ValidationError, never>
* //      ▼
* const program = Effect.gen(function* () {
*   const n1 = yield* Random.next
*   const n2 = yield* Random.next
*   if (n1 < 0.5) {
*     yield* Effect.fail(new HttpError())
*   }
*   if (n2 < 0.5) {
*     yield* Effect.fail(new ValidationError())
*   }
*   return "some result"
* })
*
* //      ┌─── Effect<string, ValidationError, never>
* //      ▼
* const recovered = program.pipe(
*   // Only handle HttpError errors
*   Effect.catchTag("HttpError", (_HttpError) =>
*     Effect.succeed("Recovering from HttpError")
*   )
* )
* ```
*
* @see {@link catchTags} for a version that allows you to handle multiple error
* types at once.
*
* @since 2.0.0
* @category Error handling
*/
const catchTag = catchTag$1;
/**
* Discards both the success and failure values of an effect.
*
* **When to Use**
*
* `ignore` allows you to run an effect without caring about its result, whether
* it succeeds or fails. This is useful when you only care about the side
* effects of the effect and do not need to handle or process its outcome.
*
* **Example** (Using Effect.ignore to Discard Values)
*
* ```ts
* import { Effect } from "effect"
*
* //      ┌─── Effect<number, string, never>
* //      ▼
* const task = Effect.fail("Uh oh!").pipe(Effect.as(5))
*
* //      ┌─── Effect<void, never, never>
* //      ▼
* const program = Effect.ignore(task)
* ```
*
* @see {@link ignoreLogged} to log failures while ignoring them.
*
* @since 2.0.0
* @category Error handling
*/
const ignore = ignore$1;
/**
* Retries a failing effect based on a defined retry policy.
*
* **Details**
*
* The `Effect.retry` function takes an effect and a {@link Schedule} policy,
* and will automatically retry the effect if it fails, following the rules of
* the policy.
*
* If the effect ultimately succeeds, the result will be returned.
*
* If the maximum retries are exhausted and the effect still fails, the failure
* is propagated.
*
* **When to Use**
*
* This can be useful when dealing with intermittent failures, such as network
* issues or temporary resource unavailability. By defining a retry policy, you
* can control the number of retries, the delay between them, and when to stop
* retrying.
*
* **Example** (Retrying with a Fixed Delay)
*
* ```ts
* import { Effect, Schedule } from "effect"
*
* let count = 0
*
* // Simulates an effect with possible failures
* const task = Effect.async<string, Error>((resume) => {
*   if (count <= 2) {
*     count++
*     console.log("failure")
*     resume(Effect.fail(new Error()))
*   } else {
*     console.log("success")
*     resume(Effect.succeed("yay!"))
*   }
* })
*
* // Define a repetition policy using a fixed delay between retries
* const policy = Schedule.fixed("100 millis")
*
* const repeated = Effect.retry(task, policy)
*
* Effect.runPromise(repeated).then(console.log)
* // Output:
* // failure
* // failure
* // failure
* // success
* // yay!
* ```
*
* **Example** (Retrying a Task up to 5 times)
*
* ```ts
* import { Effect } from "effect"
*
* let count = 0
*
* // Simulates an effect with possible failures
* const task = Effect.async<string, Error>((resume) => {
*   if (count <= 2) {
*     count++
*     console.log("failure")
*     resume(Effect.fail(new Error()))
*   } else {
*     console.log("success")
*     resume(Effect.succeed("yay!"))
*   }
* })
*
* // Retry the task up to 5 times
* Effect.runPromise(Effect.retry(task, { times: 5 })).then(console.log)
* // Output:
* // failure
* // failure
* // failure
* // success
* ```
*
* **Example** (Retrying Until a Specific Condition is Met)
*
* ```ts
* import { Effect } from "effect"
*
* let count = 0
*
* // Define an effect that simulates varying error on each invocation
* const action = Effect.failSync(() => {
*   console.log(`Action called ${++count} time(s)`)
*   return `Error ${count}`
* })
*
* // Retry the action until a specific condition is met
* const program = Effect.retry(action, {
*   until: (err) => err === "Error 3"
* })
*
* Effect.runPromiseExit(program).then(console.log)
* // Output:
* // Action called 1 time(s)
* // Action called 2 time(s)
* // Action called 3 time(s)
* // {
* //   _id: 'Exit',
* //   _tag: 'Failure',
* //   cause: { _id: 'Cause', _tag: 'Fail', failure: 'Error 3' }
* // }
* ```
*
* @see {@link retryOrElse} for a version that allows you to run a fallback.
* @see {@link repeat} if your retry condition is based on successful outcomes rather than errors.
*
* @since 2.0.0
* @category Error handling
*/
const retry = retry_combined;
const try_ = try_$1;
/**
* Returns an effect that maps its success using the specified side-effecting
* `try` function, converting any errors into typed failed effects using the
* `catch` function.
*
* @see {@link tryPromise} for a version that works with asynchronous computations.
*
* @since 2.0.0
* @category Error handling
*/
const tryMap = tryMap$1;
/**
* Creates an `Effect` that represents an asynchronous computation that might
* fail.
*
* **When to Use**
*
* In situations where you need to perform asynchronous operations that might
* fail, such as fetching data from an API, you can use the `tryPromise`
* constructor. This constructor is designed to handle operations that could
* throw exceptions by capturing those exceptions and transforming them into
* manageable errors.
*
* **Error Handling**
*
* There are two ways to handle errors with `tryPromise`:
*
* 1. If you don't provide a `catch` function, the error is caught and the
*    effect fails with an `UnknownException`.
* 2. If you provide a `catch` function, the error is caught and the `catch`
*    function maps it to an error of type `E`.
*
* **Interruptions**
*
* An optional `AbortSignal` can be provided to allow for interruption of the
* wrapped `Promise` API.
*
* **Example** (Fetching a TODO Item)
*
* ```ts
* import { Effect } from "effect"
*
* const getTodo = (id: number) =>
*   // Will catch any errors and propagate them as UnknownException
*   Effect.tryPromise(() =>
*     fetch(`https://jsonplaceholder.typicode.com/todos/${id}`)
*   )
*
* //      ┌─── Effect<Response, UnknownException, never>
* //      ▼
* const program = getTodo(1)
* ```
*
* **Example** (Custom Error Handling)
*
* ```ts
* import { Effect } from "effect"
*
* const getTodo = (id: number) =>
*   Effect.tryPromise({
*     try: () => fetch(`https://jsonplaceholder.typicode.com/todos/${id}`),
*     // remap the error
*     catch: (unknown) => new Error(`something went wrong ${unknown}`)
*   })
*
* //      ┌─── Effect<Response, Error, never>
* //      ▼
* const program = getTodo(1)
* ```
*
* @see {@link promise} if the effectful computation is asynchronous and does not throw errors.
*
* @since 2.0.0
* @category Creating Effects
*/
const tryPromise = tryPromise$1;
/**
* Represents an effect that interrupts the current fiber.
*
* **Details**
*
* This effect models the explicit interruption of the fiber in which it runs.
* When executed, it causes the fiber to stop its operation immediately,
* capturing the interruption details such as the fiber's ID and its start time.
* The resulting interruption can be observed in the `Exit` type if the effect
* is run with functions like {@link runPromiseExit}.
*
* **Example**
*
* ```ts
* import { Effect } from "effect"
*
* const program = Effect.gen(function* () {
*   console.log("start")
*   yield* Effect.sleep("2 seconds")
*   yield* Effect.interrupt
*   console.log("done")
*   return "some result"
* })
*
* Effect.runPromiseExit(program).then(console.log)
* // Output:
* // start
* // {
* //   _id: 'Exit',
* //   _tag: 'Failure',
* //   cause: {
* //     _id: 'Cause',
* //     _tag: 'Interrupt',
* //     fiberId: {
* //       _id: 'FiberId',
* //       _tag: 'Runtime',
* //       id: 0,
* //       startTimeMillis: ...
* //     }
* //   }
* // }
* ```
*
* @since 2.0.0
* @category Interruption
*/
const interrupt = interrupt$4;
/**
* Marks an effect as interruptible.
*
* @since 2.0.0
* @category Interruption
*/
const interruptible = interruptible$2;
/**
* Marks an effect as uninterruptible.
*
* @since 2.0.0
* @category Interruption
*/
const uninterruptible = uninterruptible$1;
/**
* This function behaves like {@link uninterruptible}, but it also provides a
* `restore` function. This function can be used to restore the interruptibility
* of any specific region of code.
*
* @since 2.0.0
* @category Interruption
*/
const uninterruptibleMask = uninterruptibleMask$2;
/**
* Replaces the value inside an effect with a constant value.
*
* **Details**
*
* This function allows you to ignore the original value inside an effect and
* replace it with a constant value.
*
* **When to Use**
*
* It is useful when you no longer need the value produced by an effect but want
* to ensure that the effect completes successfully with a specific constant
* result instead. For instance, you can replace the value produced by a
* computation with a predefined value, ignoring what was calculated before.
*
* **Example** (Replacing a Value)
*
* ```ts
* import { pipe, Effect } from "effect"
*
* // Replaces the value 5 with the constant "new value"
* const program = pipe(Effect.succeed(5), Effect.as("new value"))
*
* Effect.runPromise(program).then(console.log)
* // Output: "new value"
* ```
*
* @since 2.0.0
* @category Mapping
*/
const as$1 = as$2;
/**
* This function maps the success value of an `Effect` value to `void`. If the
* original `Effect` value succeeds, the returned `Effect` value will also
* succeed. If the original `Effect` value fails, the returned `Effect` value
* will fail with the same error.
*
* @since 2.0.0
* @category Mapping
*/
const asVoid = asVoid$1;
/**
* Transforms the value inside an effect by applying a function to it.
*
* **Syntax**
*
* ```ts skip-type-checking
* const mappedEffect = pipe(myEffect, Effect.map(transformation))
* // or
* const mappedEffect = Effect.map(myEffect, transformation)
* // or
* const mappedEffect = myEffect.pipe(Effect.map(transformation))
* ```
*
* **Details**
*
* `map` takes a function and applies it to the value contained within an
* effect, creating a new effect with the transformed value.
*
* It's important to note that effects are immutable, meaning that the original
* effect is not modified. Instead, a new effect is returned with the updated
* value.
*
* **Example** (Adding a Service Charge)
*
* ```ts
* import { pipe, Effect } from "effect"
*
* const addServiceCharge = (amount: number) => amount + 1
*
* const fetchTransactionAmount = Effect.promise(() => Promise.resolve(100))
*
* const finalAmount = pipe(
*   fetchTransactionAmount,
*   Effect.map(addServiceCharge)
* )
*
* Effect.runPromise(finalAmount).then(console.log)
* // Output: 101
* ```
*
* @see {@link mapError} for a version that operates on the error channel.
* @see {@link mapBoth} for a version that operates on both channels.
* @see {@link flatMap} or {@link andThen} for a version that can return a new effect.
*
* @since 2.0.0
* @category Mapping
*/
const map$2 = map$6;
/**
* Applies transformations to both the success and error channels of an effect.
*
* **Details**
*
* This function takes two map functions as arguments: one for the error channel
* and one for the success channel. You can use it when you want to modify both
* the error and the success values without altering the overall success or
* failure status of the effect.
*
* **Example**
*
* ```ts
* import { Effect } from "effect"
*
* //      ┌─── Effect<number, string, never>
* //      ▼
* const simulatedTask = Effect.fail("Oh no!").pipe(Effect.as(1))
*
* //      ┌─── Effect<boolean, Error, never>
* //      ▼
* const modified = Effect.mapBoth(simulatedTask, {
*   onFailure: (message) => new Error(message),
*   onSuccess: (n) => n > 0
* })
* ```
*
* @see {@link map} for a version that operates on the success channel.
* @see {@link mapError} for a version that operates on the error channel.
*
* @since 2.0.0
* @category Mapping
*/
const mapBoth$1 = mapBoth$3;
/**
* Transforms or modifies the error produced by an effect without affecting its
* success value.
*
* **When to Use**
*
* This function is helpful when you want to enhance the error with additional
* information, change the error type, or apply custom error handling while
* keeping the original behavior of the effect's success values intact. It only
* operates on the error channel and leaves the success channel unchanged.
*
* **Example**
*
* ```ts
* import { Effect } from "effect"
*
* //      ┌─── Effect<number, string, never>
* //      ▼
* const simulatedTask = Effect.fail("Oh no!").pipe(Effect.as(1))
*
* //      ┌─── Effect<number, Error, never>
* //      ▼
* const mapped = Effect.mapError(
*   simulatedTask,
*   (message) => new Error(message)
* )
* ```
*
* @see {@link map} for a version that operates on the success channel.
* @see {@link mapBoth} for a version that operates on both channels.
* @see {@link orElseFail} if you want to replace the error with a new one.
*
* @since 2.0.0
* @category Mapping
*/
const mapError$1 = mapError$2;
/**
* Returns a new effect with the boolean value of this effect negated.
*
* @since 2.0.0
* @category Mapping
*/
const negate = negate$1;
/**
* Creates a scoped resource using an `acquire` and `release` effect.
*
* **Details**
*
* This function helps manage resources by combining two `Effect` values: one
* for acquiring the resource and one for releasing it.
*
* `acquireRelease` does the following:
*
*   1. Ensures that the effect that acquires the resource will not be
*      interrupted. Note that acquisition may still fail due to internal
*      reasons (such as an uncaught exception).
*   2. Ensures that the `release` effect will not be interrupted, and will be
*      executed as long as the acquisition effect successfully acquires the
*      resource.
*
* If the `acquire` function succeeds, the `release` function is added to the
* list of finalizers for the scope. This ensures that the release will happen
* automatically when the scope is closed.
*
* Both `acquire` and `release` run uninterruptibly, meaning they cannot be
* interrupted while they are executing.
*
* Additionally, the `release` function can be influenced by the exit value when
* the scope closes, allowing for custom handling of how the resource is
* released based on the execution outcome.
*
* **When to Use**
*
* This function is used to ensure that an effect that represents the
* acquisition of a resource (for example, opening a file, launching a thread,
* etc.) will not be interrupted, and that the resource will always be released
* when the `Effect` completes execution.
*
* **Example** (Defining a Simple Resource)
*
* ```ts
* import { Effect } from "effect"
*
* // Define an interface for a resource
* interface MyResource {
*   readonly contents: string
*   readonly close: () => Promise<void>
* }
*
* // Simulate resource acquisition
* const getMyResource = (): Promise<MyResource> =>
*   Promise.resolve({
*     contents: "lorem ipsum",
*     close: () =>
*       new Promise((resolve) => {
*         console.log("Resource released")
*         resolve()
*       })
*   })
*
* // Define how the resource is acquired
* const acquire = Effect.tryPromise({
*   try: () =>
*     getMyResource().then((res) => {
*       console.log("Resource acquired")
*       return res
*     }),
*   catch: () => new Error("getMyResourceError")
* })
*
* // Define how the resource is released
* const release = (res: MyResource) => Effect.promise(() => res.close())
*
* // Create the resource management workflow
* //
* //      ┌─── Effect<MyResource, Error, Scope>
* //      ▼
* const resource = Effect.acquireRelease(acquire, release)
* ```
*
* @see {@link acquireUseRelease} for a version that automatically handles the scoping of resources.
*
* @since 2.0.0
* @category Scoping, Resources & Finalization
*/
const acquireRelease = acquireRelease$1;
/**
* Many real-world operations involve working with resources that must be released when no longer needed, such as:
*
* - Database connections
* - File handles
* - Network requests
*
* This function ensures that a resource is:
*
* 1. **Acquired** properly.
* 2. **Used** for its intended purpose.
* 3. **Released** even if an error occurs.
*
* **Example** (Automatically Managing Resource Lifetime)
*
* ```ts
* import { Effect, Console } from "effect"
*
* // Define an interface for a resource
* interface MyResource {
*   readonly contents: string
*   readonly close: () => Promise<void>
* }
*
* // Simulate resource acquisition
* const getMyResource = (): Promise<MyResource> =>
*   Promise.resolve({
*     contents: "lorem ipsum",
*     close: () =>
*       new Promise((resolve) => {
*         console.log("Resource released")
*         resolve()
*       })
*   })
*
* // Define how the resource is acquired
* const acquire = Effect.tryPromise({
*   try: () =>
*     getMyResource().then((res) => {
*       console.log("Resource acquired")
*       return res
*     }),
*   catch: () => new Error("getMyResourceError")
* })
*
* // Define how the resource is released
* const release = (res: MyResource) => Effect.promise(() => res.close())
*
* const use = (res: MyResource) => Console.log(`content is ${res.contents}`)
*
* //      ┌─── Effect<void, Error, never>
* //      ▼
* const program = Effect.acquireUseRelease(acquire, use, release)
*
* Effect.runPromise(program)
* // Output:
* // Resource acquired
* // content is lorem ipsum
* // Resource released
* ```
*
* @since 2.0.0
* @category Scoping, Resources & Finalization
*/
const acquireUseRelease$2 = acquireUseRelease$3;
/**
* Ensures a finalizer is added to the scope of the calling effect, guaranteeing
* it runs when the scope is closed.
*
* **Details**
*
* This function adds a finalizer that will execute whenever the scope of the
* effect is closed, regardless of whether the effect succeeds, fails, or is
* interrupted. The finalizer receives the `Exit` value of the effect's scope,
* allowing it to react differently depending on how the effect concludes.
*
* Finalizers are a reliable way to manage resource cleanup, ensuring that
* resources such as file handles, network connections, or database transactions
* are properly closed even in the event of an unexpected interruption or error.
*
* Finalizers operate in conjunction with Effect's scoped resources. If an
* effect with a finalizer is wrapped in a scope, the finalizer will execute
* automatically when the scope ends.
*
* **Example** (Adding a Finalizer on Success)
*
* ```ts
* import { Effect, Console } from "effect"
*
* //      ┌─── Effect<string, never, Scope>
* //      ▼
* const program = Effect.gen(function* () {
*   yield* Effect.addFinalizer((exit) =>
*     Console.log(`Finalizer executed. Exit status: ${exit._tag}`)
*   )
*   return "some result"
* })
*
* // Wrapping the effect in a scope
* //
* //      ┌─── Effect<string, never, never>
* //      ▼
* const runnable = Effect.scoped(program)
*
* Effect.runPromiseExit(runnable).then(console.log)
* // Output:
* // Finalizer executed. Exit status: Success
* // { _id: 'Exit', _tag: 'Success', value: 'some result' }
* ```
*
* **Example** (Adding a Finalizer on Failure)
*
* ```ts
* import { Effect, Console } from "effect"
*
* //      ┌─── Effect<never, string, Scope>
* //      ▼
* const program = Effect.gen(function* () {
*   yield* Effect.addFinalizer((exit) =>
*     Console.log(`Finalizer executed. Exit status: ${exit._tag}`)
*   )
*   return yield* Effect.fail("Uh oh!")
* })
*
* // Wrapping the effect in a scope
* //
* //      ┌─── Effect<never, string, never>
* //      ▼
* const runnable = Effect.scoped(program)
*
* Effect.runPromiseExit(runnable).then(console.log)
* // Output:
* // Finalizer executed. Exit status: Failure
* // {
* //   _id: 'Exit',
* //   _tag: 'Failure',
* //   cause: { _id: 'Cause', _tag: 'Fail', failure: 'Uh oh!' }
* // }
* ```
*
* **Example** (Adding a Finalizer on Interruption)
*
* ```ts
* import { Effect, Console } from "effect"
*
* //      ┌─── Effect<never, never, Scope>
* //      ▼
* const program = Effect.gen(function* () {
*   yield* Effect.addFinalizer((exit) =>
*     Console.log(`Finalizer executed. Exit status: ${exit._tag}`)
*   )
*   return yield* Effect.interrupt
* })
*
* // Wrapping the effect in a scope
* //
* //      ┌─── Effect<never, never, never>
* //      ▼
* const runnable = Effect.scoped(program)
*
* Effect.runPromiseExit(runnable).then(console.log)
* // Output:
* // Finalizer executed. Exit status: Failure
* // {
* //   _id: 'Exit',
* //   _tag: 'Failure',
* //   cause: {
* //     _id: 'Cause',
* //     _tag: 'Interrupt',
* //     fiberId: {
* //       _id: 'FiberId',
* //       _tag: 'Runtime',
* //       id: 0,
* //       startTimeMillis: ...
* //     }
* //   }
* // }
* ```
*
* @see {@link onExit} for attaching a finalizer directly to an effect.
*
* @since 2.0.0
* @category Scoping, Resources & Finalization
*/
const addFinalizer = addFinalizer$2;
/**
* Guarantees the execution of a finalizer when an effect starts execution.
*
* **Details**
*
* This function allows you to specify a `finalizer` effect that will always be
* run once the effect starts execution, regardless of whether the effect
* succeeds, fails, or is interrupted.
*
* **When to Use**
*
* This is useful when you need to ensure that certain cleanup or final steps
* are executed in all cases, such as releasing resources or performing
* necessary logging.
*
* While this function provides strong guarantees about executing the finalizer,
* it is considered a low-level tool, which may not be ideal for more complex
* resource management. For higher-level resource management with automatic
* acquisition and release, see the {@link acquireRelease} family of functions.
* For use cases where you need access to the result of an effect, consider
* using {@link onExit}.
*
* **Example** (Running a Finalizer in All Outcomes)
*
* ```ts
* import { Console, Effect } from "effect"
*
* // Define a cleanup effect
* const handler = Effect.ensuring(Console.log("Cleanup completed"))
*
* // Define a successful effect
* const success = Console.log("Task completed").pipe(
*   Effect.as("some result"),
*   handler
* )
*
* Effect.runFork(success)
* // Output:
* // Task completed
* // Cleanup completed
*
* // Define a failing effect
* const failure = Console.log("Task failed").pipe(
*   Effect.andThen(Effect.fail("some error")),
*   handler
* )
*
* Effect.runFork(failure)
* // Output:
* // Task failed
* // Cleanup completed
*
* // Define an interrupted effect
* const interruption = Console.log("Task interrupted").pipe(
*   Effect.andThen(Effect.interrupt),
*   handler
* )
*
* Effect.runFork(interruption)
* // Output:
* // Task interrupted
* // Cleanup completed
* ```
*
* @see {@link onExit} for a version that provides access to the result of an
* effect.
*
* @since 2.0.0
* @category Scoping, Resources & Finalization
*/
const ensuring$2 = ensuring$3;
/**
* Ensures a cleanup effect runs whenever the calling effect fails, providing
* the failure cause to the cleanup effect.
*
* **Details**
*
* This function allows you to attach a cleanup effect that runs whenever the
* calling effect fails. The cleanup effect receives the cause of the failure,
* allowing you to perform actions such as logging, releasing resources, or
* executing additional recovery logic based on the error. The cleanup effect
* will execute even if the failure is due to interruption.
*
* Importantly, the cleanup effect itself is uninterruptible, ensuring that it
* completes regardless of external interruptions.
*
* **Example** (Running Cleanup Only on Failure)
*
* ```ts
* import { Console, Effect } from "effect"
*
* // This handler logs the failure cause when the effect fails
* const handler = Effect.onError((cause) =>
*   Console.log(`Cleanup completed: ${cause}`)
* )
*
* // Define a successful effect
* const success = Console.log("Task completed").pipe(
*   Effect.as("some result"),
*   handler
* )
*
* Effect.runFork(success)
* // Output:
* // Task completed
*
* // Define a failing effect
* const failure = Console.log("Task failed").pipe(
*   Effect.andThen(Effect.fail("some error")),
*   handler
* )
*
* Effect.runFork(failure)
* // Output:
* // Task failed
* // Cleanup completed: Error: some error
*
* // Define a failing effect
* const defect = Console.log("Task failed with defect").pipe(
*   Effect.andThen(Effect.die("Boom!")),
*   handler
* )
*
* Effect.runFork(defect)
* // Output:
* // Task failed with defect
* // Cleanup completed: Error: Boom!
*
* // Define an interrupted effect
* const interruption = Console.log("Task interrupted").pipe(
*   Effect.andThen(Effect.interrupt),
*   handler
* )
*
* Effect.runFork(interruption)
* // Output:
* // Task interrupted
* // Cleanup completed: All fibers interrupted without errors.
* ```
*
* @see {@link ensuring} for attaching a cleanup effect that runs on both success and failure.
* @see {@link onExit} for attaching a cleanup effect that runs on all possible exits.
*
* @since 2.0.0
* @category Scoping, Resources & Finalization
*/
const onError = onError$1;
/**
* Provides access to the current scope in a scoped workflow.
*
* @since 2.0.0
* @category Scoping, Resources & Finalization
*/
const scope = scope$1;
/**
* Accesses the current scope and uses it to perform the specified effect.
*
* @since 2.0.0
* @category Scoping, Resources & Finalization
*/
const scopeWith = scopeWith$1;
/**
* Creates a `Scope`, passes it to the specified effectful function, and closes
* the scope when the effect completes (whether through success, failure, or
* interruption).
*
* @since 3.11.0
* @category Scoping, Resources & Finalization
*/
const scopedWith$1 = scopedWith$2;
/**
* Scopes all resources used in an effect to the lifetime of the effect.
*
* **Details**
*
* This function ensures that all resources used within an effect are tied to
* its lifetime. Finalizers for these resources are executed automatically when
* the effect completes, whether through success, failure, or interruption. This
* guarantees proper resource cleanup without requiring explicit management.
*
* @since 2.0.0
* @category Scoping, Resources & Finalization
*/
const scoped$2 = scopedEffect;
/**
* @since 2.0.0
* @category Supervision & Fibers
*/
const fiberIdWith = fiberIdWith$1;
/**
* Creates a long-running background fiber that is independent of its parent.
*
* **Details**
*
* This function creates a "daemon" fiber that runs in the background and is not
* tied to the lifecycle of its parent fiber. Unlike normal fibers that stop
* when the parent fiber terminates, a daemon fiber will continue running until
* the global scope closes or the fiber completes naturally. This makes it
* useful for tasks that need to run in the background independently, such as
* periodic logging, monitoring, or background data processing.
*
* **Example** (Creating a Daemon Fiber)
*
* ```ts
* import { Effect, Console, Schedule } from "effect"
*
* // Daemon fiber that logs a message repeatedly every second
* const daemon = Effect.repeat(
*   Console.log("daemon: still running!"),
*   Schedule.fixed("1 second")
* )
*
* const parent = Effect.gen(function* () {
*   console.log("parent: started!")
*   // Daemon fiber running independently
*   yield* Effect.forkDaemon(daemon)
*   yield* Effect.sleep("3 seconds")
*   console.log("parent: finished!")
* })
*
* Effect.runFork(parent)
* // Output:
* // parent: started!
* // daemon: still running!
* // daemon: still running!
* // daemon: still running!
* // parent: finished!
* // daemon: still running!
* // daemon: still running!
* // daemon: still running!
* // daemon: still running!
* // daemon: still running!
* // ...etc...
* ```
*
* @since 2.0.0
* @category Supervision & Fibers
*/
const forkDaemon = forkDaemon$1;
/**
* Forks an effect in a specific scope, allowing finer control over its
* execution.
*
* **Details**
*
* There are some cases where we need more fine-grained control, so we want to
* fork a fiber in a specific scope. We can use the `Effect.forkIn` operator
* which takes the target scope as an argument.
*
* The fiber will be interrupted when the scope is closed.
*
* **Example** (Forking a Fiber in a Specific Scope)
*
* In this example, the child fiber is forked into the outerScope,
* allowing it to outlive the inner scope but still be terminated
* when the outerScope is closed.
*
* ```ts
* import { Console, Effect, Schedule } from "effect"
*
* // Child fiber that logs a message repeatedly every second
* const child = Effect.repeat(
*   Console.log("child: still running!"),
*   Schedule.fixed("1 second")
* )
*
* const program = Effect.scoped(
*   Effect.gen(function* () {
*     yield* Effect.addFinalizer(() =>
*       Console.log("The outer scope is about to be closed!")
*     )
*
*     // Capture the outer scope
*     const outerScope = yield* Effect.scope
*
*     // Create an inner scope
*     yield* Effect.scoped(
*       Effect.gen(function* () {
*         yield* Effect.addFinalizer(() =>
*           Console.log("The inner scope is about to be closed!")
*         )
*         // Fork the child fiber in the outer scope
*         yield* Effect.forkIn(child, outerScope)
*         yield* Effect.sleep("3 seconds")
*       })
*     )
*
*     yield* Effect.sleep("5 seconds")
*   })
* )
*
* Effect.runFork(program)
* // Output:
* // child: still running!
* // child: still running!
* // child: still running!
* // The inner scope is about to be closed!
* // child: still running!
* // child: still running!
* // child: still running!
* // child: still running!
* // child: still running!
* // child: still running!
* // The outer scope is about to be closed!
* ```
*
* @since 2.0.0
* @category Supervision & Fibers
*/
const forkIn = forkIn$1;
/**
* Forks a fiber in a local scope, ensuring it outlives its parent.
*
* **Details**
*
* This function is used to create fibers that are tied to a local scope,
* meaning they are not dependent on their parent fiber's lifecycle. Instead,
* they will continue running until the scope they were created in is closed.
* This is particularly useful when you need a fiber to run independently of the
* parent fiber, but still want it to be terminated when the scope ends.
*
* Fibers created with this function are isolated from the parent fiber’s
* termination, so they can run for a longer period. This behavior is different
* from fibers created with {@link fork}, which are terminated when the parent fiber
* terminates. With `forkScoped`, the child fiber will keep running until the
* local scope ends, regardless of the state of the parent fiber.
*
* **Example** (Forking a Fiber in a Local Scope)
*
* In this example, the child fiber continues to run beyond the lifetime of the parent fiber.
* The child fiber is tied to the local scope and will be terminated only when the scope ends.
*
* ```ts
* import { Effect, Console, Schedule } from "effect"
*
* // Child fiber that logs a message repeatedly every second
* const child = Effect.repeat(
*   Console.log("child: still running!"),
*   Schedule.fixed("1 second")
* )
*
* //      ┌─── Effect<void, never, Scope>
* //      ▼
* const parent = Effect.gen(function* () {
*   console.log("parent: started!")
*   // Child fiber attached to local scope
*   yield* Effect.forkScoped(child)
*   yield* Effect.sleep("3 seconds")
*   console.log("parent: finished!")
* })
*
* // Program runs within a local scope
* const program = Effect.scoped(
*   Effect.gen(function* () {
*     console.log("Local scope started!")
*     yield* Effect.fork(parent)
*     // Scope lasts for 5 seconds
*     yield* Effect.sleep("5 seconds")
*     console.log("Leaving the local scope!")
*   })
* )
*
* Effect.runFork(program)
* // Output:
* // Local scope started!
* // parent: started!
* // child: still running!
* // child: still running!
* // child: still running!
* // parent: finished!
* // child: still running!
* // child: still running!
* // Leaving the local scope!
* ```
*
* @since 2.0.0
* @category Supervision & Fibers
*/
const forkScoped = forkScoped$1;
/**
* Adds a time limit to an effect, triggering a timeout if the effect exceeds
* the duration.
*
* **Details**
*
* This function allows you to enforce a time limit on the execution of an
* effect. If the effect does not complete within the given duration, it fails
* with a `TimeoutException`. This is useful for preventing tasks from hanging
* indefinitely, especially in scenarios where responsiveness or resource limits
* are critical.
*
* The returned effect will either:
* - Succeed with the original effect's result if it completes within the
*   specified duration.
* - Fail with a `TimeoutException` if the time limit is exceeded.
*
* **Example**
*
* ```ts
* import { Effect } from "effect"
*
* const task = Effect.gen(function* () {
*   console.log("Start processing...")
*   yield* Effect.sleep("2 seconds") // Simulates a delay in processing
*   console.log("Processing complete.")
*   return "Result"
* })
*
* // Output will show a TimeoutException as the task takes longer
* // than the specified timeout duration
* const timedEffect = task.pipe(Effect.timeout("1 second"))
*
* Effect.runPromiseExit(timedEffect).then(console.log)
* // Output:
* // Start processing...
* // {
* //   _id: 'Exit',
* //   _tag: 'Failure',
* //   cause: {
* //     _id: 'Cause',
* //     _tag: 'Fail',
* //     failure: { _tag: 'TimeoutException' }
* //   }
* // }
* ```
*
* @see {@link timeoutFail} for a version that raises a custom error.
* @see {@link timeoutFailCause} for a version that raises a custom defect.
* @see {@link timeoutTo} for a version that allows specifying both success and
* timeout handlers.
*
* @since 2.0.0
* @category Delays & Timeouts
*/
const timeout = timeout$1;
/**
* Gracefully handles timeouts by returning an `Option` that represents either
* the result or a timeout.
*
* **Details**
*
* This function wraps the outcome of an effect in an `Option` type. If the
* effect completes within the specified duration, it returns a `Some`
* containing the result. If the effect times out, it returns a `None`. Unlike
* other timeout methods, this approach does not raise errors or exceptions;
* instead, it allows you to treat timeouts as a regular outcome, simplifying
* the logic for handling delays.
*
* **When to Use**
*
* This is useful when you want to handle timeouts without causing the program
* to fail, making it easier to manage situations where you expect tasks might
* take too long but want to continue executing other tasks.
*
* **Example**
*
* ```ts
* import { Effect } from "effect"
*
* const task = Effect.gen(function* () {
*   console.log("Start processing...")
*   yield* Effect.sleep("2 seconds") // Simulates a delay in processing
*   console.log("Processing complete.")
*   return "Result"
* })
*
* const timedOutEffect = Effect.all([
*   task.pipe(Effect.timeoutOption("3 seconds")),
*   task.pipe(Effect.timeoutOption("1 second"))
* ])
*
* Effect.runPromise(timedOutEffect).then(console.log)
* // Output:
* // Start processing...
* // Processing complete.
* // Start processing...
* // [
* //   { _id: 'Option', _tag: 'Some', value: 'Result' },
* //   { _id: 'Option', _tag: 'None' }
* // ]
* ```
*
* @see {@link timeout} for a version that raises a `TimeoutException`.
* @see {@link timeoutFail} for a version that raises a custom error.
* @see {@link timeoutFailCause} for a version that raises a custom defect.
* @see {@link timeoutTo} for a version that allows specifying both success and
* timeout handlers.
*
* @since 3.1.0
* @category Delays & Timeouts
*/
const timeoutOption = timeoutOption$1;
/**
* Provides necessary dependencies to an effect, removing its environmental
* requirements.
*
* **Details**
*
* This function allows you to supply the required environment for an effect.
* The environment can be provided in the form of one or more `Layer`s, a
* `Context`, a `Runtime`, or a `ManagedRuntime`. Once the environment is
* provided, the effect can run without requiring external dependencies.
*
* You can compose layers to create a modular and reusable way of setting up the
* environment for effects. For example, layers can be used to configure
* databases, logging services, or any other required dependencies.
*
* **Example**
*
* ```ts
* import { Context, Effect, Layer } from "effect"
*
* class Database extends Context.Tag("Database")<
*   Database,
*   { readonly query: (sql: string) => Effect.Effect<Array<unknown>> }
* >() {}
*
* const DatabaseLive = Layer.succeed(
*   Database,
*   {
*     // Simulate a database query
*     query: (sql: string) => Effect.log(`Executing query: ${sql}`).pipe(Effect.as([]))
*   }
* )
*
* //      ┌─── Effect<unknown[], never, Database>
* //      ▼
* const program = Effect.gen(function*() {
*   const database = yield* Database
*   const result = yield* database.query("SELECT * FROM users")
*   return result
* })
*
* //      ┌─── Effect<unknown[], never, never>
* //      ▼
* const runnable = Effect.provide(program, DatabaseLive)
*
* Effect.runPromise(runnable).then(console.log)
* // Output:
* // timestamp=... level=INFO fiber=#0 message="Executing query: SELECT * FROM users"
* // []
* ```
*
* @see {@link provideService} for providing a service to an effect.
*
* @since 2.0.0
* @category Context
*/
const provide = effect_provide;
/**
* Provides an implementation for a service in the context of an effect.
*
* **Details**
*
* This function allows you to supply a specific implementation for a service
* required by an effect. Services are typically defined using `Context.Tag`,
* which acts as a unique identifier for the service. By using this function,
* you link the service to its concrete implementation, enabling the effect to
* execute successfully without additional requirements.
*
* For example, you can use this function to provide a random number generator,
* a logger, or any other service your effect depends on. Once the service is
* provided, all parts of the effect that rely on the service will automatically
* use the implementation you supplied.
*
* **Example**
*
* ```ts
* import { Effect, Context } from "effect"
*
* // Declaring a tag for a service that generates random numbers
* class Random extends Context.Tag("MyRandomService")<
*   Random,
*   { readonly next: Effect.Effect<number> }
* >() {}
*
* // Using the service
* const program = Effect.gen(function* () {
*   const random = yield* Random
*   const randomNumber = yield* random.next
*   console.log(`random number: ${randomNumber}`)
* })
*
* // Providing the implementation
* //
* //      ┌─── Effect<void, never, never>
* //      ▼
* const runnable = Effect.provideService(program, Random, {
*   next: Effect.sync(() => Math.random())
* })
*
* // Run successfully
* Effect.runPromise(runnable)
* // Example Output:
* // random number: 0.8241872233134417
* ```
*
* @see {@link provide} for providing multiple layers to an effect.
*
* @since 2.0.0
* @category Context
*/
const provideService = provideService$1;
/**
* Retrieves an optional service from the context as an `Option`.
*
* **Details**
*
* This function retrieves a service from the context and wraps it in an
* `Option`. If the service is available, it returns a `Some` containing the
* service. If the service is not found, it returns a `None`. This approach is
* useful when you want to handle the absence of a service gracefully without
* causing an error.
*
* **When to Use**
*
* Use this function when:
* - You need to access a service that may or may not be present in the context.
* - You want to handle the absence of a service using the `Option` type instead
*   of throwing an error.
*
* @see {@link serviceOptional} for a version that throws an error if the service is missing.
*
* @since 2.0.0
* @category Context
*/
const serviceOption = serviceOption$1;
/**
* Encapsulates both success and failure of an `Effect` into an `Either` type.
*
* **Details**
*
* This function converts an effect that may fail into an effect that always
* succeeds, wrapping the outcome in an `Either` type. The result will be
* `Either.Left` if the effect fails, containing the recoverable error, or
* `Either.Right` if it succeeds, containing the result.
*
* Using this function, you can handle recoverable errors explicitly without
* causing the effect to fail. This is particularly useful in scenarios where
* you want to chain effects and manage both success and failure in the same
* logical flow.
*
* It's important to note that unrecoverable errors, often referred to as
* "defects," are still thrown and not captured within the `Either` type. Only
* failures that are explicitly represented as recoverable errors in the effect
* are encapsulated.
*
* The resulting effect cannot fail directly because all recoverable failures
* are represented inside the `Either` type.
*
* **Example**
*
* ```ts
* import { Effect, Either, Random } from "effect"
*
* class HttpError {
*   readonly _tag = "HttpError"
* }
*
* class ValidationError {
*   readonly _tag = "ValidationError"
* }
*
* //      ┌─── Effect<string, HttpError | ValidationError, never>
* //      ▼
* const program = Effect.gen(function* () {
*   const n1 = yield* Random.next
*   const n2 = yield* Random.next
*   if (n1 < 0.5) {
*     yield* Effect.fail(new HttpError())
*   }
*   if (n2 < 0.5) {
*     yield* Effect.fail(new ValidationError())
*   }
*   return "some result"
* })
*
* //      ┌─── Effect<string, never, never>
* //      ▼
* const recovered = Effect.gen(function* () {
*   //      ┌─── Either<string, HttpError | ValidationError>
*   //      ▼
*   const failureOrSuccess = yield* Effect.either(program)
*   return Either.match(failureOrSuccess, {
*     onLeft: (error) => `Recovering from ${error._tag}`,
*     onRight: (value) => value // Do nothing in case of success
*   })
* })
* ```
*
* @see {@link option} for a version that uses `Option` instead.
* @see {@link exit} for a version that encapsulates both recoverable errors and defects in an `Exit`.
*
* @since 2.0.0
* @category Outcome Encapsulation
*/
const either$1 = either$2;
/**
* Encapsulates both success and failure of an `Effect` using the `Exit` type.
*
* **Details**
*
* This function converts an effect into one that always succeeds, wrapping its
* outcome in the `Exit` type. The `Exit` type provides explicit handling of
* both success (`Exit.Success`) and failure (`Exit.Failure`) cases, including
* defects (unrecoverable errors).
*
* Unlike {@link either} or {@link option}, this function also encapsulates
* defects, which are typically unrecoverable and would otherwise terminate the
* effect. With the `Exit` type, defects are represented in `Exit.Failure`,
* allowing for detailed introspection and structured error handling.
*
* This makes the resulting effect robust and incapable of direct failure (its
* error type is `never`). It is particularly useful for workflows where all
* outcomes, including unexpected defects, must be managed and analyzed.
*
* **Example**
*
* ```ts
* import { Effect, Cause, Console, Exit } from "effect"
*
* // Simulating a runtime error
* const task = Effect.dieMessage("Boom!")
*
* const program = Effect.gen(function* () {
*   const exit = yield* Effect.exit(task)
*   if (Exit.isFailure(exit)) {
*     const cause = exit.cause
*     if (
*       Cause.isDieType(cause) &&
*       Cause.isRuntimeException(cause.defect)
*     ) {
*       yield* Console.log(
*         `RuntimeException defect caught: ${cause.defect.message}`
*       )
*     } else {
*       yield* Console.log("Unknown failure caught.")
*     }
*   }
* })
*
* // We get an Exit.Success because we caught all failures
* Effect.runPromiseExit(program).then(console.log)
* // Output:
* // RuntimeException defect caught: Boom!
* // {
* //   _id: "Exit",
* //   _tag: "Success",
* //   value: undefined
* // }
* ```
*
* @see {@link option} for a version that uses `Option` instead.
* @see {@link either} for a version that uses `Either` instead.
*
* @since 2.0.0
* @category Outcome Encapsulation
*/
const exit = exit$1;
/**
* Converts an `Effect` into an operation that completes a `Deferred` with its result.
*
* **Details**
*
* The `intoDeferred` function takes an effect and a `Deferred` and ensures that the `Deferred`
* is completed based on the outcome of the effect. If the effect succeeds, the `Deferred` is
* completed with the success value. If the effect fails, the `Deferred` is completed with the
* failure. Additionally, if the effect is interrupted, the `Deferred` will also be interrupted.
*
* **Example**
*
* ```ts
* import { Deferred, Effect } from "effect"
*
* // Define an effect that succeeds
* const successEffect = Effect.succeed(42)
*
* const program = Effect.gen(function*() {
*   // Create a deferred
*   const deferred = yield* Deferred.make<number, string>()
*
*   // Complete the deferred using the successEffect
*   const isCompleted = yield* Effect.intoDeferred(successEffect, deferred)
*
*   // Access the value of the deferred
*   const value = yield* Deferred.await(deferred)
*   console.log(value)
*
*   return isCompleted
* })
*
* Effect.runPromise(program).then(console.log)
* // Output:
* // 42
* // true
* ```
*
* @since 2.0.0
* @category Synchronization Utilities
*/
const intoDeferred = intoDeferred$1;
/**
* Conditionally executes an effect based on a boolean condition.
*
* **Details**
*
* This function allows you to run an effect only if a given condition evaluates
* to `true`. If the condition is `true`, the effect is executed, and its result
* is wrapped in an `Option.some`. If the condition is `false`, the effect is
* skipped, and the result is `Option.none`.
*
* **When to Use**
*
* This function is useful for scenarios where you need to dynamically decide
* whether to execute an effect based on runtime logic, while also representing
* the skipped case explicitly.
*
* **Example** (Conditional Effect Execution)
*
* ```ts
* import { Effect, Option } from "effect"
*
* const validateWeightOption = (
*   weight: number
* ): Effect.Effect<Option.Option<number>> =>
*   // Conditionally execute the effect if the weight is non-negative
*   Effect.succeed(weight).pipe(Effect.when(() => weight >= 0))
*
* // Run with a valid weight
* Effect.runPromise(validateWeightOption(100)).then(console.log)
* // Output:
* // {
* //   _id: "Option",
* //   _tag: "Some",
* //   value: 100
* // }
*
* // Run with an invalid weight
* Effect.runPromise(validateWeightOption(-5)).then(console.log)
* // Output:
* // {
* //   _id: "Option",
* //   _tag: "None"
* // }
* ```
*
* @see {@link whenEffect} for a version that allows the condition to be an effect.
* @see {@link unless} for a version that executes the effect when the condition is `false`.
*
* @since 2.0.0
* @category Conditional Operators
*/
const when$2 = when$3;
/**
* Chains effects to produce new `Effect` instances, useful for combining
* operations that depend on previous results.
*
* **Syntax**
*
* ```ts skip-type-checking
* const flatMappedEffect = pipe(myEffect, Effect.flatMap(transformation))
* // or
* const flatMappedEffect = Effect.flatMap(myEffect, transformation)
* // or
* const flatMappedEffect = myEffect.pipe(Effect.flatMap(transformation))
* ```
*
* **Details**
*
* `flatMap` lets you sequence effects so that the result of one effect can be
* used in the next step. It is similar to `flatMap` used with arrays but works
* specifically with `Effect` instances, allowing you to avoid deeply nested
* effect structures.
*
* Since effects are immutable, `flatMap` always returns a new effect instead of
* changing the original one.
*
* **When to Use**
*
* Use `flatMap` when you need to chain multiple effects, ensuring that each
* step produces a new `Effect` while flattening any nested effects that may
* occur.
*
* **Example**
*
* ```ts
* import { pipe, Effect } from "effect"
*
* // Function to apply a discount safely to a transaction amount
* const applyDiscount = (
*   total: number,
*   discountRate: number
* ): Effect.Effect<number, Error> =>
*   discountRate === 0
*     ? Effect.fail(new Error("Discount rate cannot be zero"))
*     : Effect.succeed(total - (total * discountRate) / 100)
*
* // Simulated asynchronous task to fetch a transaction amount from database
* const fetchTransactionAmount = Effect.promise(() => Promise.resolve(100))
*
* // Chaining the fetch and discount application using `flatMap`
* const finalAmount = pipe(
*   fetchTransactionAmount,
*   Effect.flatMap((amount) => applyDiscount(amount, 5))
* )
*
* Effect.runPromise(finalAmount).then(console.log)
* // Output: 95
* ```
*
* @see {@link tap} for a version that ignores the result of the effect.
*
* @since 2.0.0
* @category Sequencing
*/
const flatMap$4 = flatMap$6;
/**
* @since 2.0.0
* @category Sequencing
*/
const flatten$5 = flatten$6;
/**
* Races two effects and returns the result of the first successful one.
*
* **Details**
*
* This function takes two effects and runs them concurrently. The first effect
* that successfully completes will determine the result of the race, and the
* other effect will be interrupted.
*
* If neither effect succeeds, the function will fail with a `Cause`
* containing all the errors.
*
* **When to Use**
*
* This is useful when you want to run two effects concurrently, but only care
* about the first one to succeed. It is commonly used in cases like timeouts,
* retries, or when you want to optimize for the faster response without
* worrying about the other effect.
*
* **Handling Success or Failure with Either**
*
* If you want to handle the result of whichever task completes first, whether
* it succeeds or fails, you can use the `Effect.either` function. This function
* wraps the result in an `Either` type, allowing you to see if the result
* was a success (`Right`) or a failure (`Left`).
*
* **Example** (Both Tasks Succeed)
*
* ```ts
* import { Effect, Console } from "effect"
*
* const task1 = Effect.succeed("task1").pipe(
*   Effect.delay("200 millis"),
*   Effect.tap(Console.log("task1 done")),
*   Effect.onInterrupt(() => Console.log("task1 interrupted"))
* )
* const task2 = Effect.succeed("task2").pipe(
*   Effect.delay("100 millis"),
*   Effect.tap(Console.log("task2 done")),
*   Effect.onInterrupt(() => Console.log("task2 interrupted"))
* )
*
* const program = Effect.race(task1, task2)
*
* Effect.runFork(program)
* // Output:
* // task1 done
* // task2 interrupted
* ```
*
* **Example** (One Task Fails, One Succeeds)
*
* ```ts
* import { Effect, Console } from "effect"
*
* const task1 = Effect.fail("task1").pipe(
*   Effect.delay("100 millis"),
*   Effect.tap(Console.log("task1 done")),
*   Effect.onInterrupt(() => Console.log("task1 interrupted"))
* )
* const task2 = Effect.succeed("task2").pipe(
*   Effect.delay("200 millis"),
*   Effect.tap(Console.log("task2 done")),
*   Effect.onInterrupt(() => Console.log("task2 interrupted"))
* )
*
* const program = Effect.race(task1, task2)
*
* Effect.runFork(program)
* // Output:
* // task2 done
* ```
*
* **Example** (Both Tasks Fail)
*
* ```ts
* import { Effect, Console } from "effect"
*
* const task1 = Effect.fail("task1").pipe(
*   Effect.delay("100 millis"),
*   Effect.tap(Console.log("task1 done")),
*   Effect.onInterrupt(() => Console.log("task1 interrupted"))
* )
* const task2 = Effect.fail("task2").pipe(
*   Effect.delay("200 millis"),
*   Effect.tap(Console.log("task2 done")),
*   Effect.onInterrupt(() => Console.log("task2 interrupted"))
* )
*
* const program = Effect.race(task1, task2)
*
* Effect.runPromiseExit(program).then(console.log)
* // Output:
* // {
* //   _id: 'Exit',
* //   _tag: 'Failure',
* //   cause: {
* //     _id: 'Cause',
* //     _tag: 'Parallel',
* //     left: { _id: 'Cause', _tag: 'Fail', failure: 'task1' },
* //     right: { _id: 'Cause', _tag: 'Fail', failure: 'task2' }
* //   }
* // }
* ```
*
* **Example** (Handling Success or Failure with Either)
*
* ```ts
* import { Effect, Console } from "effect"
*
* const task1 = Effect.fail("task1").pipe(
*   Effect.delay("100 millis"),
*   Effect.tap(Console.log("task1 done")),
*   Effect.onInterrupt(() => Console.log("task1 interrupted"))
* )
* const task2 = Effect.succeed("task2").pipe(
*   Effect.delay("200 millis"),
*   Effect.tap(Console.log("task2 done")),
*   Effect.onInterrupt(() => Console.log("task2 interrupted"))
* )
*
* // Run both tasks concurrently, wrapping the result
* // in Either to capture success or failure
* const program = Effect.race(Effect.either(task1), Effect.either(task2))
*
* Effect.runPromise(program).then(console.log)
* // Output:
* // task2 interrupted
* // { _id: 'Either', _tag: 'Left', left: 'task1' }
* ```
*
* @see {@link raceAll} for a version that handles multiple effects.
* @see {@link raceFirst} for a version that returns the result of the first effect to complete.
*
* @since 2.0.0
* @category Racing
*/
const race = race$1;
/**
* Races two effects and calls a finisher when the first one completes.
*
* **Details**
*
* This function runs two effects concurrently and calls a specified “finisher”
* function once one of the effects completes, regardless of whether it succeeds
* or fails.
*
* The finisher functions for each effect allow you to handle the results of
* each effect as soon as they complete.
*
* The function takes two finisher callbacks, one for each effect, and allows
* you to specify how to handle the result of the race.
*
* **When to Use**
*
* This function is useful when you need to react to the completion of either
* effect without waiting for both to finish. It can be used whenever you want
* to take action based on the first available result.
*
* **Example** (Handling Results of Concurrent Tasks)
*
* ```ts
* import { Effect, Console } from "effect"
*
* const task1 = Effect.succeed("task1").pipe(
*   Effect.delay("100 millis"),
*   Effect.tap(Console.log("task1 done")),
*   Effect.onInterrupt(() =>
*     Console.log("task1 interrupted").pipe(Effect.delay("100 millis"))
*   )
* )
* const task2 = Effect.succeed("task2").pipe(
*   Effect.delay("200 millis"),
*   Effect.tap(Console.log("task2 done")),
*   Effect.onInterrupt(() =>
*     Console.log("task2 interrupted").pipe(Effect.delay("100 millis"))
*   )
* )
*
* const program = Effect.raceWith(task1, task2, {
*   onSelfDone: (exit) => Console.log(`task1 exited with ${exit}`),
*   onOtherDone: (exit) => Console.log(`task2 exited with ${exit}`)
* })
*
* Effect.runFork(program)
* // Output:
* // task1 done
* // task1 exited with {
* //   "_id": "Exit",
* //   "_tag": "Success",
* //   "value": "task1"
* // }
* // task2 interrupted
* ```
*
* @since 2.0.0
* @category Racing
*/
const raceWith = raceWith$1;
/**
* Runs a side effect with the result of an effect without changing the original
* value.
*
* **Details**
*
* This function works similarly to `flatMap`, but it ignores the result of the
* function passed to it. The value from the previous effect remains available
* for the next part of the chain. Note that if the side effect fails, the
* entire chain will fail too.
*
* **When to Use**
*
* Use this function when you want to perform a side effect, like logging or
* tracking, without modifying the main value. This is useful when you need to
* observe or record an action but want the original value to be passed to the
* next step.
*
* **Example** (Logging a step in a pipeline)
*
* ```ts
* import { Console, Effect, pipe } from "effect"
*
* // Function to apply a discount safely to a transaction amount
* const applyDiscount = (
*   total: number,
*   discountRate: number
* ): Effect.Effect<number, Error> =>
*   discountRate === 0
*     ? Effect.fail(new Error("Discount rate cannot be zero"))
*     : Effect.succeed(total - (total * discountRate) / 100)
*
* // Simulated asynchronous task to fetch a transaction amount from database
* const fetchTransactionAmount = Effect.promise(() => Promise.resolve(100))
*
* const finalAmount = pipe(
*   fetchTransactionAmount,
*   // Log the fetched transaction amount
*   Effect.tap((amount) => Console.log(`Apply a discount to: ${amount}`)),
*   // `amount` is still available!
*   Effect.flatMap((amount) => applyDiscount(amount, 5))
* )
*
* Effect.runPromise(finalAmount).then(console.log)
* // Output:
* // Apply a discount to: 100
* // 95
* ```
*
* @see {@link flatMap} for a version that allows you to change the value.
*
* @since 2.0.0
* @category Sequencing
*/
const tap = tap$1;
/**
* Inspect the complete cause of an error, including failures and defects.
*
* **Details**
*
* This function provides access to the full cause of an error, including both
* recoverable failures and irrecoverable defects. It allows you to handle, log,
* or monitor specific error causes without modifying the result of the effect.
* The full `Cause` object encapsulates the error and its contextual
* information, making it useful for debugging and understanding failure
* scenarios in complex workflows.
*
* The effect itself is not modified, and any errors or defects remain in the
* error channel of the original effect.
*
* **Example**
*
* ```ts
* import { Effect, Console } from "effect"
*
* // Create a task that fails with a NetworkError
* const task1: Effect.Effect<number, string> = Effect.fail("NetworkError")
*
* const tapping1 = Effect.tapErrorCause(task1, (cause) =>
*   Console.log(`error cause: ${cause}`)
* )
*
* Effect.runFork(tapping1)
* // Output:
* // error cause: Error: NetworkError
*
* // Simulate a severe failure in the system
* const task2: Effect.Effect<number, string> = Effect.dieMessage(
*   "Something went wrong"
* )
*
* const tapping2 = Effect.tapErrorCause(task2, (cause) =>
*   Console.log(`error cause: ${cause}`)
* )
*
* Effect.runFork(tapping2)
* // Output:
* // error cause: RuntimeException: Something went wrong
* //   ... stack trace ...
* ```
*
* @since 2.0.0
* @category Sequencing
*/
const tapErrorCause = tapErrorCause$1;
/**
* Repeats an effect based on a specified schedule or until the first failure.
*
* **Details**
*
* This function executes an effect repeatedly according to the given schedule.
* Each repetition occurs after the initial execution of the effect, meaning
* that the schedule determines the number of additional repetitions. For
* example, using `Schedule.once` will result in the effect being executed twice
* (once initially and once as part of the repetition).
*
* If the effect succeeds, it is repeated according to the schedule. If it
* fails, the repetition stops immediately, and the failure is returned.
*
* The schedule can also specify delays between repetitions, making it useful
* for tasks like retrying operations with backoff, periodic execution, or
* performing a series of dependent actions.
*
* You can combine schedules for more advanced repetition logic, such as adding
* delays, limiting recursions, or dynamically adjusting based on the outcome of
* each execution.
*
* **Example** (Success Example)
*
* ```ts
* import { Effect, Schedule, Console } from "effect"
*
* const action = Console.log("success")
* const policy = Schedule.addDelay(Schedule.recurs(2), () => "100 millis")
* const program = Effect.repeat(action, policy)
*
* Effect.runPromise(program).then((n) => console.log(`repetitions: ${n}`))
* ```
*
* **Example** (Failure Example)
*
* ```ts
* import { Effect, Schedule } from "effect"
*
* let count = 0
*
* // Define an async effect that simulates an action with possible failures
* const action = Effect.async<string, string>((resume) => {
*   if (count > 1) {
*     console.log("failure")
*     resume(Effect.fail("Uh oh!"))
*   } else {
*     count++
*     console.log("success")
*     resume(Effect.succeed("yay!"))
*   }
* })
*
* const policy = Schedule.addDelay(Schedule.recurs(2), () => "100 millis")
* const program = Effect.repeat(action, policy)
*
* Effect.runPromiseExit(program).then(console.log)
* ```
*
* @since 2.0.0
* @category Repetition / Recursion
*/
const repeat = repeat_combined;
/**
* Handles both success and failure cases of an effect without performing side
* effects.
*
* **Details**
*
* `match` lets you define custom handlers for both success and failure
* scenarios. You provide separate functions to handle each case, allowing you
* to process the result if the effect succeeds, or handle the error if the
* effect fails.
*
* **When to Use**
*
* This is useful for structuring your code to respond differently to success or
* failure without triggering side effects.
*
* **Example** (Handling Both Success and Failure Cases)
*
* ```ts
* import { Effect } from "effect"
*
* const success: Effect.Effect<number, Error> = Effect.succeed(42)
*
* const program1 = Effect.match(success, {
*   onFailure: (error) => `failure: ${error.message}`,
*   onSuccess: (value) => `success: ${value}`
* })
*
* // Run and log the result of the successful effect
* Effect.runPromise(program1).then(console.log)
* // Output: "success: 42"
*
* const failure: Effect.Effect<number, Error> = Effect.fail(
*   new Error("Uh oh!")
* )
*
* const program2 = Effect.match(failure, {
*   onFailure: (error) => `failure: ${error.message}`,
*   onSuccess: (value) => `success: ${value}`
* })
*
* // Run and log the result of the failed effect
* Effect.runPromise(program2).then(console.log)
* // Output: "failure: Uh oh!"
* ```
*
* @see {@link matchEffect} if you need to perform side effects in the handlers.
*
* @since 2.0.0
* @category Matching
*/
const match$2 = match$4;
/**
* Handles failures by matching the cause of failure.
*
* **Details**
*
* The `matchCause` function allows you to handle failures with access to the
* full cause of the failure within a fiber.
*
* **When to Use**
*
* This is useful for differentiating between different types of errors, such as
* regular failures, defects, or interruptions. You can provide specific
* handling logic for each failure type based on the cause.
*
* **Example** (Handling Different Failure Causes)
*
* ```ts
* import { Effect } from "effect"
*
* const task: Effect.Effect<number, Error> = Effect.die("Uh oh!")
*
* const program = Effect.matchCause(task, {
*   onFailure: (cause) => {
*     switch (cause._tag) {
*       case "Fail":
*         // Handle standard failure
*         return `Fail: ${cause.error.message}`
*       case "Die":
*         // Handle defects (unexpected errors)
*         return `Die: ${cause.defect}`
*       case "Interrupt":
*         // Handle interruption
*         return `${cause.fiberId} interrupted!`
*     }
*     // Fallback for other causes
*     return "failed due to other causes"
*   },
*   onSuccess: (value) =>
*     // task completes successfully
*     `succeeded with ${value} value`
* })
*
* Effect.runPromise(program).then(console.log)
* // Output: "Die: Uh oh!"
* ```
*
* @see {@link matchCauseEffect} if you need to perform side effects in the
* handlers.
* @see {@link match} if you don't need to handle the cause of the failure.
*
* @since 2.0.0
* @category Matching
*/
const matchCause = matchCause$1;
/**
* Handles failures with access to the cause and allows performing side effects.
*
* **Details**
*
* The `matchCauseEffect` function works similarly to {@link matchCause}, but it
* also allows you to perform additional side effects based on the failure
* cause. This function provides access to the complete cause of the failure,
* making it possible to differentiate between various failure types, and allows
* you to respond accordingly while performing side effects (like logging or
* other operations).
*
* **Example** (Handling Different Failure Causes with Side Effects)
*
* ```ts
* import { Effect, Console } from "effect"
*
* const task: Effect.Effect<number, Error> = Effect.die("Uh oh!")
*
* const program = Effect.matchCauseEffect(task, {
*   onFailure: (cause) => {
*     switch (cause._tag) {
*       case "Fail":
*         // Handle standard failure with a logged message
*         return Console.log(`Fail: ${cause.error.message}`)
*       case "Die":
*         // Handle defects (unexpected errors) by logging the defect
*         return Console.log(`Die: ${cause.defect}`)
*       case "Interrupt":
*         // Handle interruption and log the fiberId that was interrupted
*         return Console.log(`${cause.fiberId} interrupted!`)
*     }
*     // Fallback for other causes
*     return Console.log("failed due to other causes")
*   },
*   onSuccess: (value) =>
*     // Log success if the task completes successfully
*     Console.log(`succeeded with ${value} value`)
* })
*
* Effect.runPromise(program)
* // Output: "Die: Uh oh!"
* ```
*
* @see {@link matchCause} if you don't need side effects and only want to handle the result or failure.
* @see {@link matchEffect} if you don't need to handle the cause of the failure.
*
* @since 2.0.0
* @category Matching
*/
const matchCauseEffect = matchCauseEffect$2;
/**
* Handles both success and failure cases of an effect, allowing for additional
* side effects.
*
* **Details**
*
* The `matchEffect` function is similar to {@link match}, but it enables you to
* perform side effects in the handlers for both success and failure outcomes.
*
* **When to Use**
*
* This is useful when you need to execute additional actions, like logging or
* notifying users, based on whether an effect succeeds or fails.
*
* **Example** (Handling Both Success and Failure Cases with Side Effects)
*
* ```ts
* import { Effect } from "effect"
*
* const success: Effect.Effect<number, Error> = Effect.succeed(42)
* const failure: Effect.Effect<number, Error> = Effect.fail(
*   new Error("Uh oh!")
* )
*
* const program1 = Effect.matchEffect(success, {
*   onFailure: (error) =>
*     Effect.succeed(`failure: ${error.message}`).pipe(
*       Effect.tap(Effect.log)
*     ),
*   onSuccess: (value) =>
*     Effect.succeed(`success: ${value}`).pipe(Effect.tap(Effect.log))
* })
*
* console.log(Effect.runSync(program1))
* // Output:
* // timestamp=... level=INFO fiber=#0 message="success: 42"
* // success: 42
*
* const program2 = Effect.matchEffect(failure, {
*   onFailure: (error) =>
*     Effect.succeed(`failure: ${error.message}`).pipe(
*       Effect.tap(Effect.log)
*     ),
*   onSuccess: (value) =>
*     Effect.succeed(`success: ${value}`).pipe(Effect.tap(Effect.log))
* })
*
* console.log(Effect.runSync(program2))
* // Output:
* // timestamp=... level=INFO fiber=#1 message="failure: Uh oh!"
* // failure: Uh oh!
* ```
*
* @see {@link match} if you don't need side effects and only want to handle the
* result or failure.
*
* @since 2.0.0
* @category Matching
*/
const matchEffect = matchEffect$1;
/**
* Logs messages at the WARNING log level.
*
* **Details**
*
* This function logs messages at the WARNING level, suitable for highlighting
* potential issues that are not errors but may require attention. These
* messages indicate that something unexpected occurred or might lead to errors
* in the future.
*
* @since 2.0.0
* @category Logging
*/
const logWarning = logWarning$1;
/**
* Logs messages at the ERROR log level.
*
* **Details**
*
* This function logs messages at the ERROR level, suitable for reporting
* application errors or failures. These logs are typically used for unexpected
* issues that need immediate attention.
*
* @since 2.0.0
* @category Logging
*/
const logError = logError$1;
/**
* Adds custom annotations to log entries generated within an effect.
*
* **Details**
*
* This function allows you to enhance log messages by appending additional
* context in the form of key-value pairs. These annotations are included in
* every log message created during the execution of the effect, making the logs
* more informative and easier to trace.
*
* The annotations can be specified as a single key-value pair or as a record of
* multiple key-value pairs. This is particularly useful for tracking
* operations, debugging, or associating specific metadata with logs for better
* observability.
*
* The annotated key-value pairs will appear alongside the log message in the
* output.
*
* **Example**
*
* ```ts
* import { Effect } from "effect"
*
* const program = Effect.gen(function*() {
*   yield* Effect.log("message1")
*   yield* Effect.log("message2")
* }).pipe(Effect.annotateLogs("taskId", "1234")) // Annotation as key/value pair
*
* Effect.runFork(program)
* // timestamp=... level=INFO fiber=#0 message=message1 taskId=1234
* // timestamp=... level=INFO fiber=#0 message=message2 taskId=1234
* ```
*
* @see {@link annotateLogsScoped} to add log annotations with a limited scope.
*
* @since 2.0.0
* @category Logging
*/
const annotateLogs = annotateLogs$1;
/**
* Converts an effect's failure into a fiber termination, removing the error
* from the effect's type.
*
* **Details**
*
* The `orDie` function is used when you encounter errors that you do not want
* to handle or recover from. It removes the error type from the effect and
* ensures that any failure will terminate the fiber. This is useful for
* propagating failures as defects, signaling that they should not be handled
* within the effect.
*
* **When to Use*
*
* Use `orDie` when failures should be treated as unrecoverable defects and no
* error handling is required.
*
* **Example** (Propagating an Error as a Defect)
*
* ```ts
* import { Effect } from "effect"
*
* const divide = (a: number, b: number) =>
*   b === 0
*     ? Effect.fail(new Error("Cannot divide by zero"))
*     : Effect.succeed(a / b)
*
* //      ┌─── Effect<number, never, never>
* //      ▼
* const program = Effect.orDie(divide(1, 0))
*
* Effect.runPromise(program).catch(console.error)
* // Output:
* // (FiberFailure) Error: Cannot divide by zero
* //   ...stack trace...
* ```
*
* @see {@link orDieWith} if you need to customize the error.
*
* @since 2.0.0
* @category Converting Failures to Defects
*/
const orDie = orDie$1;
/**
* Attempts one effect, and if it fails, falls back to another effect.
*
* **Details**
*
* This function allows you to try executing an effect, and if it fails
* (produces an error), a fallback effect is executed instead. The fallback
* effect is defined as a lazy argument, meaning it will only be evaluated if
* the first effect fails. This provides a way to recover from errors by
* specifying an alternative path of execution.
*
* The error type of the resulting effect will be that of the fallback effect,
* as the first effect's error is replaced when the fallback is executed.
*
* **Example**
*
* ```ts
* import { Effect } from "effect"
*
* const success = Effect.succeed("success")
* const failure = Effect.fail("failure")
* const fallback = Effect.succeed("fallback")
*
* // Try the success effect first, fallback is not used
* const program1 = Effect.orElse(success, () => fallback)
* console.log(Effect.runSync(program1))
* // Output: "success"
*
* // Try the failure effect first, fallback is used
* const program2 = Effect.orElse(failure, () => fallback)
* console.log(Effect.runSync(program2))
* // Output: "fallback"
* ```
*
* @see {@link catchAll} if you need to access the error in the fallback effect.
*
* @since 2.0.0
* @category Fallback
*/
const orElse$3 = orElse$4;
/**
* Returns an effect that accesses the runtime, which can be used to (unsafely)
* execute tasks.
*
* **When to Use**
*
* This is useful for integration with legacy code that must call back into
* Effect code.
*
* @since 2.0.0
* @category Runtime
*/
const runtime = runtime$1;
/**
* Unsafely creates a new Semaphore.
*
* @since 2.0.0
* @category Semaphore
*/
const unsafeMakeSemaphore = unsafeMakeSemaphore$1;
/**
* Creates a new semaphore with the specified number of permits.
*
* **Details**
*
* This function initializes a semaphore that controls concurrent access to a
* shared resource. The number of permits determines how many tasks can access
* the resource concurrently.
*
* **Example**
*
* ```ts
* import { Effect } from "effect"
*
* // Create a semaphore with 3 permits
* const mutex = Effect.makeSemaphore(3)
* ```
*
* @since 2.0.0
* @category Semaphore
*/
const makeSemaphore = makeSemaphore$1;
/**
* @category Latch
* @since 3.8.0
*/
const unsafeMakeLatch = unsafeMakeLatch$1;
/**
* Runs an effect in the background, returning a fiber that can be observed or
* interrupted.
*
* Unless you specifically need a `Promise` or synchronous operation, `runFork`
* is a good default choice.
*
* **Details**
*
* This function is the foundational way to execute an effect in the background.
* It creates a "fiber," a lightweight, cooperative thread of execution that can
* be observed (to access its result), interrupted, or joined. Fibers are useful
* for concurrent programming and allow effects to run independently of the main
* program flow.
*
* Once the effect is running in a fiber, you can monitor its progress, cancel
* it if necessary, or retrieve its result when it completes. If the effect
* fails, the fiber will propagate the failure, which you can observe and
* handle.
*
* **When to Use**
*
* Use this function when you need to run an effect in the background,
* especially if the effect is long-running or performs periodic tasks. It's
* suitable for tasks that need to run independently but might still need
* observation or management, like logging, monitoring, or scheduled tasks.
*
* This function is ideal if you don't need the result immediately or if the
* effect is part of a larger concurrent workflow.
*
* **Example** (Running an Effect in the Background)
*
* ```ts
* import { Effect, Console, Schedule, Fiber } from "effect"
*
* //      ┌─── Effect<number, never, never>
* //      ▼
* const program = Effect.repeat(
*   Console.log("running..."),
*   Schedule.spaced("200 millis")
* )
*
* //      ┌─── RuntimeFiber<number, never>
* //      ▼
* const fiber = Effect.runFork(program)
*
* setTimeout(() => {
*   Effect.runFork(Fiber.interrupt(fiber))
* }, 500)
* ```
*
* @since 2.0.0
* @category Running Effects
*/
const runFork$1 = unsafeForkEffect;
/**
* Executes an effect synchronously, running it immediately and returning the
* result.
*
* **Details**
*
* This function evaluates the provided effect synchronously, returning its
* result directly. It is ideal for effects that do not fail or include
* asynchronous operations. If the effect does fail or involves async tasks, it
* will throw an error. Execution stops at the point of failure or asynchronous
* operation, making it unsuitable for effects that require asynchronous
* handling.
*
* **Important**: Attempting to run effects that involve asynchronous operations
* or failures will result in exceptions being thrown, so use this function with
* care for purely synchronous and error-free effects.
*
* **When to Use**
*
* Use this function when:
* - You are sure that the effect will not fail or involve asynchronous
*   operations.
* - You need a direct, synchronous result from the effect.
* - You are working within a context where asynchronous effects are not
*   allowed.
*
* Avoid using this function for effects that can fail or require asynchronous
* handling. For such cases, consider using {@link runPromise} or
* {@link runSyncExit}.
*
* **Example** (Synchronous Logging)
*
* ```ts
* import { Effect } from "effect"
*
* const program = Effect.sync(() => {
*   console.log("Hello, World!")
*   return 1
* })
*
* const result = Effect.runSync(program)
* // Output: Hello, World!
*
* console.log(result)
* // Output: 1
* ```
*
* **Example** (Incorrect Usage with Failing or Async Effects)
*
* ```ts
* import { Effect } from "effect"
*
* try {
*   // Attempt to run an effect that fails
*   Effect.runSync(Effect.fail("my error"))
* } catch (e) {
*   console.error(e)
* }
* // Output:
* // (FiberFailure) Error: my error
*
* try {
*   // Attempt to run an effect that involves async work
*   Effect.runSync(Effect.promise(() => Promise.resolve(1)))
* } catch (e) {
*   console.error(e)
* }
* // Output:
* // (FiberFailure) AsyncFiberException: Fiber #0 cannot be resolved synchronously. This is caused by using runSync on an effect that performs async work
* ```
*
* @see {@link runSyncExit} for a version that returns an `Exit` type instead of
* throwing an error.
*
* @since 2.0.0
* @category Running Effects
*/
const runSync = unsafeRunSyncEffect;
/**
* Combines two effects into a single effect, producing a tuple of their
* results.
*
* **Details**
*
* This function combines two effects, `self` and `that`, into one. It executes
* the first effect (`self`) and then the second effect (`that`), collecting
* their results into a tuple. Both effects must succeed for the resulting
* effect to succeed. If either effect fails, the entire operation fails.
*
* By default, the effects are executed sequentially. If the `concurrent` option
* is set to `true`, the effects will run concurrently, potentially improving
* performance for independent operations.
*
* **Example** (Combining Two Effects Sequentially)
*
* ```ts
* import { Effect } from "effect"
*
* const task1 = Effect.succeed(1).pipe(
*   Effect.delay("200 millis"),
*   Effect.tap(Effect.log("task1 done"))
* )
* const task2 = Effect.succeed("hello").pipe(
*   Effect.delay("100 millis"),
*   Effect.tap(Effect.log("task2 done"))
* )
*
* // Combine the two effects together
* //
* //      ┌─── Effect<[number, string], never, never>
* //      ▼
* const program = Effect.zip(task1, task2)
*
* Effect.runPromise(program).then(console.log)
* // Output:
* // timestamp=... level=INFO fiber=#0 message="task1 done"
* // timestamp=... level=INFO fiber=#0 message="task2 done"
* // [ 1, 'hello' ]
* ```
*
* **Example** (Combining Two Effects Concurrently)
*
* ```ts
* import { Effect } from "effect"
*
* const task1 = Effect.succeed(1).pipe(
*   Effect.delay("200 millis"),
*   Effect.tap(Effect.log("task1 done"))
* )
* const task2 = Effect.succeed("hello").pipe(
*   Effect.delay("100 millis"),
*   Effect.tap(Effect.log("task2 done"))
* )
*
* // Run both effects concurrently using the concurrent option
* const program = Effect.zip(task1, task2, { concurrent: true })
*
* Effect.runPromise(program).then(console.log)
* // Output:
* // timestamp=... level=INFO fiber=#0 message="task2 done"
* // timestamp=... level=INFO fiber=#0 message="task1 done"
* // [ 1, 'hello' ]
* ```
*
* @see {@link zipWith} for a version that combines the results with a custom
* function.
* @see {@link validate} for a version that accumulates errors.
*
* @since 2.0.0
* @category Zipping
*/
const zip$1 = zipOptions;
/**
* Executes two effects sequentially, returning the result of the first effect
* and ignoring the result of the second.
*
* **Details**
*
* This function allows you to run two effects in sequence, where the result of
* the first effect is preserved, and the result of the second effect is
* discarded. By default, the two effects are executed sequentially. If you need
* them to run concurrently, you can pass the `{ concurrent: true }` option.
*
* The second effect will always be executed, even though its result is ignored.
* This makes it useful for cases where you want to execute an effect for its
* side effects while keeping the result of another effect.
*
* **When to Use**
*
* Use this function when you are only interested in the result of the first
* effect but still need to run the second effect for its side effects, such as
* logging or performing a cleanup action.
*
* **Example**
*
* ```ts
* import { Effect } from "effect"
*
* const task1 = Effect.succeed(1).pipe(
*   Effect.delay("200 millis"),
*   Effect.tap(Effect.log("task1 done"))
* )
* const task2 = Effect.succeed("hello").pipe(
*   Effect.delay("100 millis"),
*   Effect.tap(Effect.log("task2 done"))
* )
*
* const program = Effect.zipLeft(task1, task2)
*
* Effect.runPromise(program).then(console.log)
* // Output:
* // timestamp=... level=INFO fiber=#0 message="task1 done"
* // timestamp=... level=INFO fiber=#0 message="task2 done"
* // 1
* ```
*
* @see {@link zipRight} for a version that returns the result of the second
* effect.
*
* @since 2.0.0
* @category Zipping
*/
const zipLeft = zipLeftOptions;
/**
* Executes two effects sequentially, returning the result of the second effect
* while ignoring the result of the first.
*
* **Details**
*
* This function allows you to run two effects in sequence, keeping the result
* of the second effect and discarding the result of the first. By default, the
* two effects are executed sequentially. If you need them to run concurrently,
* you can pass the `{ concurrent: true }` option.
*
* The first effect will always be executed, even though its result is ignored.
* This makes it useful for scenarios where the first effect is needed for its
* side effects, but only the result of the second effect is important.
*
* **When to Use**
*
* Use this function when you are only interested in the result of the second
* effect but still need to run the first effect for its side effects, such as
* initialization or setup tasks.
*
* **Example**
*
* ```ts
* import { Effect } from "effect"
*
* const task1 = Effect.succeed(1).pipe(
*   Effect.delay("200 millis"),
*   Effect.tap(Effect.log("task1 done"))
* )
* const task2 = Effect.succeed("hello").pipe(
*   Effect.delay("100 millis"),
*   Effect.tap(Effect.log("task2 done"))
* )
*
* const program = Effect.zipRight(task1, task2)
*
* Effect.runPromise(program).then(console.log)
* // Output:
* // timestamp=... level=INFO fiber=#0 message="task1 done"
* // timestamp=... level=INFO fiber=#0 message="task2 done"
* // hello
* ```
*
* @see {@link zipLeft} for a version that returns the result of the first
* effect.
*
* @since 2.0.0
* @category Zipping
*/
const zipRight$1 = zipRightOptions;
/**
* Combines two effects sequentially and applies a function to their results to
* produce a single value.
*
* **Details**
*
* This function runs two effects in sequence (or concurrently, if the `{
* concurrent: true }` option is provided) and combines their results using a
* provided function. Unlike {@link zip}, which returns a tuple of the results,
* this function processes the results with a custom function to produce a
* single output.
*
* **Example** (Combining Effects with a Custom Function)
*
* ```ts
* import { Effect } from "effect"
*
* const task1 = Effect.succeed(1).pipe(
*   Effect.delay("200 millis"),
*   Effect.tap(Effect.log("task1 done"))
* )
* const task2 = Effect.succeed("hello").pipe(
*   Effect.delay("100 millis"),
*   Effect.tap(Effect.log("task2 done"))
* )
*
* const task3 = Effect.zipWith(
*   task1,
*   task2,
*   // Combines results into a single value
*   (number, string) => number + string.length
* )
*
* Effect.runPromise(task3).then(console.log)
* // Output:
* // timestamp=... level=INFO fiber=#3 message="task1 done"
* // timestamp=... level=INFO fiber=#2 message="task2 done"
* // 6
* ```
*
* @since 2.0.0
* @category Zipping
*/
const zipWith = zipWithOptions;
/**
* Same as {@link fn}, but allows you to create a function that is not traced, for when performance is critical.
*
* @see {@link fn} for a version that includes tracing.
*
* @since 3.12.0
* @category Tracing
*/
const fnUntraced = fnUntraced$1;
/** @internal */
const EnqueueTypeId = /*#__PURE__*/ Symbol.for("effect/QueueEnqueue");
/** @internal */
const DequeueTypeId = /*#__PURE__*/ Symbol.for("effect/QueueDequeue");
/** @internal */
const QueueStrategyTypeId = /*#__PURE__*/ Symbol.for("effect/QueueStrategy");
/** @internal */
const BackingQueueTypeId = /*#__PURE__*/ Symbol.for("effect/BackingQueue");
const queueStrategyVariance = { 
/* c8 ignore next */
_A: (_) => _ };
const backingQueueVariance = { 
/* c8 ignore next */
_A: (_) => _ };
/** @internal */
const enqueueVariance = { 
/* c8 ignore next */
_In: (_) => _ };
/** @internal */
const dequeueVariance = { 
/* c8 ignore next */
_Out: (_) => _ };
/** @internal */
var QueueImpl = class extends Class$1 {
	queue;
	takers;
	shutdownHook;
	shutdownFlag;
	strategy;
	[EnqueueTypeId] = enqueueVariance;
	[DequeueTypeId] = dequeueVariance;
	constructor(queue, takers, shutdownHook, shutdownFlag, strategy) {
		super();
		this.queue = queue;
		this.takers = takers;
		this.shutdownHook = shutdownHook;
		this.shutdownFlag = shutdownFlag;
		this.strategy = strategy;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
	commit() {
		return this.take;
	}
	capacity() {
		return this.queue.capacity();
	}
	get size() {
		return suspend$7(() => catchAll$1(this.unsafeSize(), () => interrupt$4));
	}
	unsafeSize() {
		if (get$7(this.shutdownFlag)) return none$4();
		return some(this.queue.length() - length$1(this.takers) + this.strategy.surplusSize());
	}
	get isEmpty() {
		return map$6(this.size, (size) => size <= 0);
	}
	get isFull() {
		return map$6(this.size, (size) => size >= this.capacity());
	}
	get shutdown() {
		return uninterruptible$1(withFiberRuntime$1((state) => {
			pipe(this.shutdownFlag, set$4(true));
			return pipe(forEachConcurrentDiscard(unsafePollAll(this.takers), (d) => deferredInterruptWith(d, state.id()), false, false), zipRight$3(this.strategy.shutdown), whenEffect(deferredSucceed(this.shutdownHook, void 0)), asVoid$1);
		}));
	}
	get isShutdown() {
		return sync$2(() => get$7(this.shutdownFlag));
	}
	get awaitShutdown() {
		return deferredAwait(this.shutdownHook);
	}
	isActive() {
		return !get$7(this.shutdownFlag);
	}
	unsafeOffer(value) {
		if (get$7(this.shutdownFlag)) return false;
		let noRemaining;
		if (this.queue.length() === 0) {
			const taker = pipe(this.takers, poll(EmptyMutableQueue));
			if (taker !== EmptyMutableQueue) {
				unsafeCompleteDeferred(taker, value);
				noRemaining = true;
			} else noRemaining = false;
		} else noRemaining = false;
		if (noRemaining) return true;
		const succeeded = this.queue.offer(value);
		unsafeCompleteTakers(this.strategy, this.queue, this.takers);
		return succeeded;
	}
	offer(value) {
		return suspend$7(() => {
			if (get$7(this.shutdownFlag)) return interrupt$4;
			let noRemaining;
			if (this.queue.length() === 0) {
				const taker = pipe(this.takers, poll(EmptyMutableQueue));
				if (taker !== EmptyMutableQueue) {
					unsafeCompleteDeferred(taker, value);
					noRemaining = true;
				} else noRemaining = false;
			} else noRemaining = false;
			if (noRemaining) return succeed$8(true);
			const succeeded = this.queue.offer(value);
			unsafeCompleteTakers(this.strategy, this.queue, this.takers);
			return succeeded ? succeed$8(true) : this.strategy.handleSurplus([value], this.queue, this.takers, this.shutdownFlag);
		});
	}
	offerAll(iterable) {
		return suspend$7(() => {
			if (get$7(this.shutdownFlag)) return interrupt$4;
			const values = fromIterable$6(iterable);
			const pTakers = this.queue.length() === 0 ? fromIterable$6(unsafePollN(this.takers, values.length)) : empty$23;
			const [forTakers, remaining] = pipe(values, splitAt(pTakers.length));
			for (let i = 0; i < pTakers.length; i++) {
				const taker = pTakers[i];
				const item = forTakers[i];
				unsafeCompleteDeferred(taker, item);
			}
			if (remaining.length === 0) return succeed$8(true);
			const surplus = this.queue.offerAll(remaining);
			unsafeCompleteTakers(this.strategy, this.queue, this.takers);
			return isEmpty$7(surplus) ? succeed$8(true) : this.strategy.handleSurplus(surplus, this.queue, this.takers, this.shutdownFlag);
		});
	}
	get take() {
		return withFiberRuntime$1((state) => {
			if (get$7(this.shutdownFlag)) return interrupt$4;
			const item = this.queue.poll(EmptyMutableQueue);
			if (item !== EmptyMutableQueue) {
				this.strategy.unsafeOnQueueEmptySpace(this.queue, this.takers);
				return succeed$8(item);
			} else {
				const deferred = deferredUnsafeMake(state.id());
				return pipe(suspend$7(() => {
					pipe(this.takers, offer$2(deferred));
					unsafeCompleteTakers(this.strategy, this.queue, this.takers);
					return get$7(this.shutdownFlag) ? interrupt$4 : deferredAwait(deferred);
				}), onInterrupt(() => {
					return sync$2(() => unsafeRemove(this.takers, deferred));
				}));
			}
		});
	}
	get takeAll() {
		return suspend$7(() => {
			return get$7(this.shutdownFlag) ? interrupt$4 : sync$2(() => {
				const values = this.queue.pollUpTo(Number.POSITIVE_INFINITY);
				this.strategy.unsafeOnQueueEmptySpace(this.queue, this.takers);
				return fromIterable$5(values);
			});
		});
	}
	takeUpTo(max) {
		return suspend$7(() => get$7(this.shutdownFlag) ? interrupt$4 : sync$2(() => {
			const values = this.queue.pollUpTo(max);
			this.strategy.unsafeOnQueueEmptySpace(this.queue, this.takers);
			return fromIterable$5(values);
		}));
	}
	takeBetween(min, max) {
		return suspend$7(() => takeRemainderLoop(this, min, max, empty$22()));
	}
};
/** @internal */
const takeRemainderLoop = (self, min, max, acc) => {
	if (max < min) return succeed$8(acc);
	return pipe(takeUpTo(self, max), flatMap$6((bs) => {
		const remaining = min - bs.length;
		if (remaining === 1) return pipe(take$3(self), map$6((b) => pipe(acc, appendAll$1(bs), append$1(b))));
		if (remaining > 1) return pipe(take$3(self), flatMap$6((b) => takeRemainderLoop(self, remaining - 1, max - bs.length - 1, pipe(acc, appendAll$1(bs), append$1(b)))));
		return succeed$8(pipe(acc, appendAll$1(bs)));
	}));
};
/** @internal */
const bounded$1 = (requestedCapacity) => pipe(sync$2(() => bounded$2(requestedCapacity)), flatMap$6((queue) => make$14(backingQueueFromMutableQueue(queue), backPressureStrategy())));
/** @internal */
const dropping$1 = (requestedCapacity) => pipe(sync$2(() => bounded$2(requestedCapacity)), flatMap$6((queue) => make$14(backingQueueFromMutableQueue(queue), droppingStrategy())));
/** @internal */
const sliding$1 = (requestedCapacity) => pipe(sync$2(() => bounded$2(requestedCapacity)), flatMap$6((queue) => make$14(backingQueueFromMutableQueue(queue), slidingStrategy())));
/** @internal */
const unbounded$1 = () => pipe(sync$2(() => unbounded$2()), flatMap$6((queue) => make$14(backingQueueFromMutableQueue(queue), droppingStrategy())));
/** @internal */
const unsafeMake$2 = (queue, takers, shutdownHook, shutdownFlag, strategy) => {
	return new QueueImpl(queue, takers, shutdownHook, shutdownFlag, strategy);
};
/** @internal */
const make$14 = (queue, strategy) => pipe(deferredMake(), map$6((deferred) => unsafeMake$2(queue, unbounded$2(), deferred, make$39(false), strategy)));
/** @internal */
var BackingQueueFromMutableQueue = class {
	mutable;
	[BackingQueueTypeId] = backingQueueVariance;
	constructor(mutable) {
		this.mutable = mutable;
	}
	poll(def) {
		return poll(this.mutable, def);
	}
	pollUpTo(limit) {
		return pollUpTo(this.mutable, limit);
	}
	offerAll(elements) {
		return offerAll(this.mutable, elements);
	}
	offer(element) {
		return offer$2(this.mutable, element);
	}
	capacity() {
		return capacity(this.mutable);
	}
	length() {
		return length$1(this.mutable);
	}
};
/** @internal */
const backingQueueFromMutableQueue = (mutable) => new BackingQueueFromMutableQueue(mutable);
/** @internal */
const size$1 = (self) => self.size;
/** @internal */
const shutdown$1 = (self) => self.shutdown;
/** @internal */
const offer$1 = /*#__PURE__*/ dual(2, (self, value) => self.offer(value));
/** @internal */
const take$3 = (self) => self.take;
/** @internal */
const takeUpTo = /*#__PURE__*/ dual(2, (self, max) => self.takeUpTo(max));
/** @internal */
const backPressureStrategy = () => new BackPressureStrategy();
/** @internal */
const droppingStrategy = () => new DroppingStrategy();
/** @internal */
const slidingStrategy = () => new SlidingStrategy();
/** @internal */
var BackPressureStrategy = class {
	[QueueStrategyTypeId] = queueStrategyVariance;
	putters = /*#__PURE__*/ unbounded$2();
	surplusSize() {
		return length$1(this.putters);
	}
	onCompleteTakersWithEmptyQueue(takers) {
		while (!isEmpty(this.putters) && !isEmpty(takers)) {
			const taker = poll(takers, void 0);
			const putter = poll(this.putters, void 0);
			if (putter[2]) unsafeCompleteDeferred(putter[1], true);
			unsafeCompleteDeferred(taker, putter[0]);
		}
	}
	get shutdown() {
		return pipe(fiberId, flatMap$6((fiberId) => pipe(sync$2(() => unsafePollAll(this.putters)), flatMap$6((putters) => forEachConcurrentDiscard(putters, ([_, deferred, isLastItem]) => isLastItem ? pipe(deferredInterruptWith(deferred, fiberId), asVoid$1) : void_$4, false, false)))));
	}
	handleSurplus(iterable, queue, takers, isShutdown) {
		return withFiberRuntime$1((state) => {
			const deferred = deferredUnsafeMake(state.id());
			return pipe(suspend$7(() => {
				this.unsafeOffer(iterable, deferred);
				this.unsafeOnQueueEmptySpace(queue, takers);
				unsafeCompleteTakers(this, queue, takers);
				return get$7(isShutdown) ? interrupt$4 : deferredAwait(deferred);
			}), onInterrupt(() => sync$2(() => this.unsafeRemove(deferred))));
		});
	}
	unsafeOnQueueEmptySpace(queue, takers) {
		let keepPolling = true;
		while (keepPolling && (queue.capacity() === Number.POSITIVE_INFINITY || queue.length() < queue.capacity())) {
			const putter = pipe(this.putters, poll(EmptyMutableQueue));
			if (putter === EmptyMutableQueue) keepPolling = false;
			else {
				const offered = queue.offer(putter[0]);
				if (offered && putter[2]) unsafeCompleteDeferred(putter[1], true);
				else if (!offered) unsafeOfferAll(this.putters, pipe(unsafePollAll(this.putters), prepend$1(putter)));
				unsafeCompleteTakers(this, queue, takers);
			}
		}
	}
	unsafeOffer(iterable, deferred) {
		const stuff = fromIterable$6(iterable);
		for (let i = 0; i < stuff.length; i++) {
			const value = stuff[i];
			if (i === stuff.length - 1) pipe(this.putters, offer$2([
				value,
				deferred,
				true
			]));
			else pipe(this.putters, offer$2([
				value,
				deferred,
				false
			]));
		}
	}
	unsafeRemove(deferred) {
		unsafeOfferAll(this.putters, pipe(unsafePollAll(this.putters), filter$1(([, _]) => _ !== deferred)));
	}
};
/** @internal */
var DroppingStrategy = class {
	[QueueStrategyTypeId] = queueStrategyVariance;
	surplusSize() {
		return 0;
	}
	get shutdown() {
		return void_$4;
	}
	onCompleteTakersWithEmptyQueue() {}
	handleSurplus(_iterable, _queue, _takers, _isShutdown) {
		return succeed$8(false);
	}
	unsafeOnQueueEmptySpace(_queue, _takers) {}
};
/** @internal */
var SlidingStrategy = class {
	[QueueStrategyTypeId] = queueStrategyVariance;
	surplusSize() {
		return 0;
	}
	get shutdown() {
		return void_$4;
	}
	onCompleteTakersWithEmptyQueue() {}
	handleSurplus(iterable, queue, takers, _isShutdown) {
		return sync$2(() => {
			this.unsafeOffer(queue, iterable);
			unsafeCompleteTakers(this, queue, takers);
			return true;
		});
	}
	unsafeOnQueueEmptySpace(_queue, _takers) {}
	unsafeOffer(queue, iterable) {
		const iterator = iterable[Symbol.iterator]();
		let next;
		let offering = true;
		while (!(next = iterator.next()).done && offering) {
			if (queue.capacity() === 0) return;
			queue.poll(EmptyMutableQueue);
			offering = queue.offer(next.value);
		}
	}
};
/** @internal */
const unsafeCompleteDeferred = (deferred, a) => {
	return deferredUnsafeDone(deferred, succeed$8(a));
};
/** @internal */
const unsafeOfferAll = (queue, as) => {
	return pipe(queue, offerAll(as));
};
/** @internal */
const unsafePollAll = (queue) => {
	return pipe(queue, pollUpTo(Number.POSITIVE_INFINITY));
};
/** @internal */
const unsafePollN = (queue, max) => {
	return pipe(queue, pollUpTo(max));
};
/** @internal */
const unsafeRemove = (queue, a) => {
	unsafeOfferAll(queue, pipe(unsafePollAll(queue), filter$1((b) => a !== b)));
};
/** @internal */
const unsafeCompleteTakers = (strategy, queue, takers) => {
	let keepPolling = true;
	while (keepPolling && queue.length() !== 0) {
		const taker = pipe(takers, poll(EmptyMutableQueue));
		if (taker !== EmptyMutableQueue) {
			const element = queue.poll(EmptyMutableQueue);
			if (element !== EmptyMutableQueue) {
				unsafeCompleteDeferred(taker, element);
				strategy.unsafeOnQueueEmptySpace(queue, takers);
			} else unsafeOfferAll(takers, pipe(unsafePollAll(takers), prepend$1(taker)));
			keepPolling = true;
		} else keepPolling = false;
	}
	if (keepPolling && queue.length() === 0 && !isEmpty(takers)) strategy.onCompleteTakersWithEmptyQueue(takers);
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Queue.js
/**
* Makes a new bounded `Queue`. When the capacity of the queue is reached, any
* additional calls to `offer` will be suspended until there is more room in
* the queue.
*
* **Note**: When possible use only power of 2 capacities; this will provide
* better performance by utilising an optimised version of the underlying
* `RingBuffer`.
*
* @since 2.0.0
* @category constructors
*/
const bounded = bounded$1;
/**
* Makes a new bounded `Queue` with the dropping strategy.
*
* When the capacity of the queue is reached, new elements will be dropped and the
* old elements will remain.
*
* **Note**: When possible use only power of 2 capacities; this will provide
* better performance by utilising an optimised version of the underlying
* `RingBuffer`.
*
* @since 2.0.0
* @category constructors
*/
const dropping = dropping$1;
/**
* Makes a new bounded `Queue` with the sliding strategy.
*
* When the capacity of the queue is reached, new elements will be added and the
* old elements will be dropped.
*
* **Note**: When possible use only power of 2 capacities; this will provide
* better performance by utilising an optimised version of the underlying
* `RingBuffer`.
*
* @since 2.0.0
* @category constructors
*/
const sliding = sliding$1;
/**
* Creates a new unbounded `Queue`.
*
* @since 2.0.0
* @category constructors
*/
const unbounded = unbounded$1;
/**
* Retrieves the size of the queue, which is equal to the number of elements
* in the queue. This may be negative if fibers are suspended waiting for
* elements to be added to the queue.
*
* @since 2.0.0
* @category getters
*/
const size = size$1;
/**
* Interrupts any fibers that are suspended on `offer` or `take`. Future calls
* to `offer*` and `take*` will be interrupted immediately.
*
* @since 2.0.0
* @category utils
*/
const shutdown = shutdown$1;
/**
* Places one value in the queue.
*
* @since 2.0.0
* @category utils
*/
const offer = offer$1;
/**
* Takes the oldest value in the queue. If the queue is empty, this will return
* a computation that resumes when an item has been added to the queue.
*
* @since 2.0.0
* @category utils
*/
const take$2 = take$3;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/FiberRef.js
/**
* @since 2.0.0
* @category fiberRefs
*/
const currentContext = currentContext$1;
/**
* @since 2.0.0
* @category fiberRefs
*/
const currentLoggers = currentLoggers$1;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/opCodes/channelChildExecutorDecision.js
/** @internal */
const OP_CONTINUE = "Continue";
/** @internal */
const OP_CLOSE = "Close";
/** @internal */
const OP_YIELD = "Yield";
/** @internal */
const ChildExecutorDecisionTypeId = /*#__PURE__*/ Symbol.for("effect/ChannelChildExecutorDecision");
/** @internal */
const proto$7 = { [ChildExecutorDecisionTypeId]: ChildExecutorDecisionTypeId };
/** @internal */
const Continue = (_) => {
	const op = Object.create(proto$7);
	op._tag = OP_CONTINUE;
	return op;
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/opCodes/continuation.js
/** @internal */
const OP_CONTINUATION_K = "ContinuationK";
/** @internal */
const OP_CONTINUATION_FINALIZER = "ContinuationFinalizer";
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/channel/continuation.js
/** @internal */
const ContinuationTypeId = /*#__PURE__*/ Symbol.for("effect/ChannelContinuation");
const continuationVariance = {
	/* c8 ignore next */
	_Env: (_) => _,
	/* c8 ignore next */
	_InErr: (_) => _,
	/* c8 ignore next */
	_InElem: (_) => _,
	/* c8 ignore next */
	_InDone: (_) => _,
	/* c8 ignore next */
	_OutErr: (_) => _,
	/* c8 ignore next */
	_OutDone: (_) => _,
	/* c8 ignore next */
	_OutErr2: (_) => _,
	/* c8 ignore next */
	_OutElem: (_) => _,
	/* c8 ignore next */
	_OutDone2: (_) => _
};
/** @internal */
var ContinuationKImpl = class {
	onSuccess;
	onHalt;
	_tag = OP_CONTINUATION_K;
	[ContinuationTypeId] = continuationVariance;
	constructor(onSuccess, onHalt) {
		this.onSuccess = onSuccess;
		this.onHalt = onHalt;
	}
	onExit(exit) {
		return isFailure(exit) ? this.onHalt(exit.cause) : this.onSuccess(exit.value);
	}
};
/** @internal */
var ContinuationFinalizerImpl = class {
	finalizer;
	_tag = OP_CONTINUATION_FINALIZER;
	[ContinuationTypeId] = continuationVariance;
	constructor(finalizer) {
		this.finalizer = finalizer;
	}
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/opCodes/channelUpstreamPullStrategy.js
/** @internal */
const OP_PULL_AFTER_NEXT = "PullAfterNext";
/** @internal */
const OP_PULL_AFTER_ALL_ENQUEUED = "PullAfterAllEnqueued";
/** @internal */
const UpstreamPullStrategyTypeId = /*#__PURE__*/ Symbol.for("effect/ChannelUpstreamPullStrategy");
const upstreamPullStrategyVariance = { 
/* c8 ignore next */
_A: (_) => _ };
/** @internal */
const proto$6 = { [UpstreamPullStrategyTypeId]: upstreamPullStrategyVariance };
/** @internal */
const PullAfterNext = (emitSeparator) => {
	const op = Object.create(proto$6);
	op._tag = OP_PULL_AFTER_NEXT;
	op.emitSeparator = emitSeparator;
	return op;
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/opCodes/channel.js
/** @internal */
const OP_BRACKET_OUT = "BracketOut";
/** @internal */
const OP_BRIDGE = "Bridge";
/** @internal */
const OP_CONCAT_ALL = "ConcatAll";
/** @internal */
const OP_EMIT$2 = "Emit";
/** @internal */
const OP_ENSURING = "Ensuring";
/** @internal */
const OP_FAIL = "Fail";
/** @internal */
const OP_FOLD = "Fold";
/** @internal */
const OP_FROM_EFFECT$1 = "FromEffect";
/** @internal */
const OP_PIPE_TO = "PipeTo";
/** @internal */
const OP_PROVIDE = "Provide";
/** @internal */
const OP_READ$1 = "Read";
/** @internal */
const OP_SUCCEED = "Succeed";
/** @internal */
const OP_SUCCEED_NOW = "SucceedNow";
/** @internal */
const OP_SUSPEND = "Suspend";
/** @internal */
const ChannelTypeId = /*#__PURE__*/ Symbol.for("effect/Channel");
const channelVariance = {
	/* c8 ignore next */
	_Env: (_) => _,
	/* c8 ignore next */
	_InErr: (_) => _,
	/* c8 ignore next */
	_InElem: (_) => _,
	/* c8 ignore next */
	_InDone: (_) => _,
	/* c8 ignore next */
	_OutErr: (_) => _,
	/* c8 ignore next */
	_OutElem: (_) => _,
	/* c8 ignore next */
	_OutDone: (_) => _
};
/** @internal */
const proto$5 = {
	[ChannelTypeId]: channelVariance,
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const isChannel = (u) => hasProperty(u, ChannelTypeId) || isEffect(u);
/** @internal */
const acquireReleaseOut = /*#__PURE__*/ dual(2, (self, release) => {
	const op = Object.create(proto$5);
	op._tag = OP_BRACKET_OUT;
	op.acquire = () => self;
	op.finalizer = release;
	return op;
});
/** @internal */
const collectElements = (self) => {
	return suspend$4(() => {
		const builder = [];
		return flatMap$3(pipeTo$1(self, collectElementsReader(builder)), (value) => sync(() => [fromIterable$5(builder), value]));
	});
};
/** @internal */
const collectElementsReader = (builder) => readWith({
	onInput: (outElem) => flatMap$3(sync(() => {
		builder.push(outElem);
	}), () => collectElementsReader(builder)),
	onFailure: fail$1,
	onDone: succeedNow
});
/** @internal */
const concatAllWith = (channels, f, g) => {
	const op = Object.create(proto$5);
	op._tag = OP_CONCAT_ALL;
	op.combineInners = f;
	op.combineAll = g;
	op.onPull = () => PullAfterNext(none$4());
	op.onEmit = () => Continue;
	op.value = () => channels;
	op.k = identity;
	return op;
};
/** @internal */
const concatMapWith = /*#__PURE__*/ dual(4, (self, f, g, h) => {
	const op = Object.create(proto$5);
	op._tag = OP_CONCAT_ALL;
	op.combineInners = g;
	op.combineAll = h;
	op.onPull = () => PullAfterNext(none$4());
	op.onEmit = () => Continue;
	op.value = () => self;
	op.k = f;
	return op;
});
/** @internal */
const embedInput$1 = /*#__PURE__*/ dual(2, (self, input) => {
	const op = Object.create(proto$5);
	op._tag = OP_BRIDGE;
	op.input = input;
	op.channel = self;
	return op;
});
/** @internal */
const ensuringWith = /*#__PURE__*/ dual(2, (self, finalizer) => {
	const op = Object.create(proto$5);
	op._tag = OP_ENSURING;
	op.channel = self;
	op.finalizer = finalizer;
	return op;
});
/** @internal */
const fail$1 = (error) => failCause$1(fail$4(error));
/** @internal */
const failCause$1 = (cause) => failCauseSync(() => cause);
/** @internal */
const failCauseSync = (evaluate) => {
	const op = Object.create(proto$5);
	op._tag = OP_FAIL;
	op.error = evaluate;
	return op;
};
/** @internal */
const flatMap$3 = /*#__PURE__*/ dual(2, (self, f) => {
	const op = Object.create(proto$5);
	op._tag = OP_FOLD;
	op.channel = self;
	op.k = new ContinuationKImpl(f, failCause$1);
	return op;
});
/** @internal */
const fromEffect$4 = (effect) => {
	const op = Object.create(proto$5);
	op._tag = OP_FROM_EFFECT$1;
	op.effect = () => effect;
	return op;
};
/** @internal */
const pipeTo$1 = /*#__PURE__*/ dual(2, (self, that) => {
	const op = Object.create(proto$5);
	op._tag = OP_PIPE_TO;
	op.left = () => self;
	op.right = () => that;
	return op;
});
/** @internal */
const readWith = (options) => readWithCause({
	onInput: options.onInput,
	onFailure: (cause) => match$7(failureOrCause(cause), {
		onLeft: options.onFailure,
		onRight: failCause$1
	}),
	onDone: options.onDone
});
/** @internal */
const readWithCause = (options) => {
	const op = Object.create(proto$5);
	op._tag = OP_READ$1;
	op.more = options.onInput;
	op.done = new ContinuationKImpl(options.onDone, options.onFailure);
	return op;
};
/** @internal */
const succeed$1 = (value) => sync(() => value);
/** @internal */
const succeedNow = (result) => {
	const op = Object.create(proto$5);
	op._tag = OP_SUCCEED_NOW;
	op.terminal = result;
	return op;
};
/** @internal */
const suspend$4 = (evaluate) => {
	const op = Object.create(proto$5);
	op._tag = OP_SUSPEND;
	op.channel = evaluate;
	return op;
};
const sync = (evaluate) => {
	const op = Object.create(proto$5);
	op._tag = OP_SUCCEED;
	op.evaluate = evaluate;
	return op;
};
const void_$1 = /*#__PURE__*/ succeedNow(void 0);
/** @internal */
const write$1 = (out) => {
	const op = Object.create(proto$5);
	op._tag = OP_EMIT$2;
	op.out = out;
	return op;
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/opCodes/channelState.js
/** @internal */
const OP_DONE$1 = "Done";
/** @internal */
const OP_EMIT$1 = "Emit";
/** @internal */
const OP_FROM_EFFECT = "FromEffect";
/** @internal */
const OP_READ = "Read";
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/channel/channelState.js
/** @internal */
const ChannelStateTypeId = /*#__PURE__*/ Symbol.for("effect/ChannelState");
const channelStateVariance = {
	/* c8 ignore next */
	_E: (_) => _,
	/* c8 ignore next */
	_R: (_) => _
};
/** @internal */
const proto$4 = { [ChannelStateTypeId]: channelStateVariance };
/** @internal */
const Done = () => {
	const op = Object.create(proto$4);
	op._tag = OP_DONE$1;
	return op;
};
/** @internal */
const Emit$1 = () => {
	const op = Object.create(proto$4);
	op._tag = OP_EMIT$1;
	return op;
};
/** @internal */
const fromEffect$3 = (effect) => {
	const op = Object.create(proto$4);
	op._tag = OP_FROM_EFFECT;
	op.effect = effect;
	return op;
};
/** @internal */
const Read = (upstream, onEffect, onEmit, onDone) => {
	const op = Object.create(proto$4);
	op._tag = OP_READ;
	op.upstream = upstream;
	op.onEffect = onEffect;
	op.onEmit = onEmit;
	op.onDone = onDone;
	return op;
};
/** @internal */
const isFromEffect = (self) => self._tag === OP_FROM_EFFECT;
/** @internal */
const effect = (self) => isFromEffect(self) ? self.effect : _void;
/** @internal */
const effectOrUndefinedIgnored = (self) => isFromEffect(self) ? ignore(self.effect) : void 0;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/channel/subexecutor.js
/** @internal */
const OP_PULL_FROM_CHILD = "PullFromChild";
/** @internal */
const OP_PULL_FROM_UPSTREAM = "PullFromUpstream";
/** @internal */
const OP_DRAIN_CHILD_EXECUTORS = "DrainChildExecutors";
/** @internal */
const OP_EMIT = "Emit";
/**
* Execute the `childExecutor` and on each emitted value, decide what to do by
* `onEmit`.
*
* @internal
*/
var PullFromChild = class {
	childExecutor;
	parentSubexecutor;
	onEmit;
	_tag = OP_PULL_FROM_CHILD;
	constructor(childExecutor, parentSubexecutor, onEmit) {
		this.childExecutor = childExecutor;
		this.parentSubexecutor = parentSubexecutor;
		this.onEmit = onEmit;
	}
	close(exit$5) {
		const fin1 = this.childExecutor.close(exit$5);
		const fin2 = this.parentSubexecutor.close(exit$5);
		if (fin1 !== void 0 && fin2 !== void 0) return zipWith(exit(fin1), exit(fin2), (exit1, exit2) => pipe(exit1, zipRight$2(exit2)));
		else if (fin1 !== void 0) return fin1;
		else if (fin2 !== void 0) return fin2;
		else return;
	}
	enqueuePullFromChild(_child) {
		return this;
	}
};
/**
* Execute `upstreamExecutor` and for each emitted element, spawn a child
* channel and continue with processing it by `PullFromChild`.
*
* @internal
*/
var PullFromUpstream = class PullFromUpstream {
	upstreamExecutor;
	createChild;
	lastDone;
	activeChildExecutors;
	combineChildResults;
	combineWithChildResult;
	onPull;
	onEmit;
	_tag = OP_PULL_FROM_UPSTREAM;
	constructor(upstreamExecutor, createChild, lastDone, activeChildExecutors, combineChildResults, combineWithChildResult, onPull, onEmit) {
		this.upstreamExecutor = upstreamExecutor;
		this.createChild = createChild;
		this.lastDone = lastDone;
		this.activeChildExecutors = activeChildExecutors;
		this.combineChildResults = combineChildResults;
		this.combineWithChildResult = combineWithChildResult;
		this.onPull = onPull;
		this.onEmit = onEmit;
	}
	close(exit$4) {
		const fin1 = this.upstreamExecutor.close(exit$4);
		const result = [...this.activeChildExecutors.map((child) => child !== void 0 ? child.childExecutor.close(exit$4) : void 0), fin1].reduce((acc, next) => {
			if (acc !== void 0 && next !== void 0) return zipWith(acc, exit(next), (exit1, exit2) => zipRight$2(exit1, exit2));
			else if (acc !== void 0) return acc;
			else if (next !== void 0) return exit(next);
			else return;
		}, void 0);
		return result === void 0 ? result : result;
	}
	enqueuePullFromChild(child) {
		return new PullFromUpstream(this.upstreamExecutor, this.createChild, this.lastDone, [...this.activeChildExecutors, child], this.combineChildResults, this.combineWithChildResult, this.onPull, this.onEmit);
	}
};
/**
* Transformed from `PullFromUpstream` when upstream has finished but there
* are still active child executors.
*
* @internal
*/
var DrainChildExecutors = class DrainChildExecutors {
	upstreamExecutor;
	lastDone;
	activeChildExecutors;
	upstreamDone;
	combineChildResults;
	combineWithChildResult;
	onPull;
	_tag = OP_DRAIN_CHILD_EXECUTORS;
	constructor(upstreamExecutor, lastDone, activeChildExecutors, upstreamDone, combineChildResults, combineWithChildResult, onPull) {
		this.upstreamExecutor = upstreamExecutor;
		this.lastDone = lastDone;
		this.activeChildExecutors = activeChildExecutors;
		this.upstreamDone = upstreamDone;
		this.combineChildResults = combineChildResults;
		this.combineWithChildResult = combineWithChildResult;
		this.onPull = onPull;
	}
	close(exit$6) {
		const fin1 = this.upstreamExecutor.close(exit$6);
		const result = [...this.activeChildExecutors.map((child) => child !== void 0 ? child.childExecutor.close(exit$6) : void 0), fin1].reduce((acc, next) => {
			if (acc !== void 0 && next !== void 0) return zipWith(acc, exit(next), (exit1, exit2) => zipRight$2(exit1, exit2));
			else if (acc !== void 0) return acc;
			else if (next !== void 0) return exit(next);
			else return;
		}, void 0);
		return result === void 0 ? result : result;
	}
	enqueuePullFromChild(child) {
		return new DrainChildExecutors(this.upstreamExecutor, this.lastDone, [...this.activeChildExecutors, child], this.upstreamDone, this.combineChildResults, this.combineWithChildResult, this.onPull);
	}
};
/** @internal */
var Emit = class {
	value;
	next;
	_tag = OP_EMIT;
	constructor(value, next) {
		this.value = value;
		this.next = next;
	}
	close(exit) {
		const result = this.next.close(exit);
		return result === void 0 ? result : result;
	}
	enqueuePullFromChild(_child) {
		return this;
	}
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/opCodes/channelUpstreamPullRequest.js
/** @internal */
const OP_PULLED = "Pulled";
/** @internal */
const OP_NO_UPSTREAM = "NoUpstream";
/** @internal */
const UpstreamPullRequestTypeId = /*#__PURE__*/ Symbol.for("effect/ChannelUpstreamPullRequest");
const upstreamPullRequestVariance = { 
/* c8 ignore next */
_A: (_) => _ };
/** @internal */
const proto$3 = { [UpstreamPullRequestTypeId]: upstreamPullRequestVariance };
/** @internal */
const Pulled = (value) => {
	const op = Object.create(proto$3);
	op._tag = OP_PULLED;
	op.value = value;
	return op;
};
/** @internal */
const NoUpstream = (activeDownstreamCount) => {
	const op = Object.create(proto$3);
	op._tag = OP_NO_UPSTREAM;
	op.activeDownstreamCount = activeDownstreamCount;
	return op;
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/channel/channelExecutor.js
/** @internal */
var ChannelExecutor = class ChannelExecutor {
	_activeSubexecutor = void 0;
	_cancelled = void 0;
	_closeLastSubstream = void 0;
	_currentChannel;
	_done = void 0;
	_doneStack = [];
	_emitted = void 0;
	_executeCloseLastSubstream;
	_input = void 0;
	_inProgressFinalizer = void 0;
	_providedEnv;
	constructor(initialChannel, providedEnv, executeCloseLastSubstream) {
		this._currentChannel = initialChannel;
		this._executeCloseLastSubstream = executeCloseLastSubstream;
		this._providedEnv = providedEnv;
	}
	run() {
		let result = void 0;
		while (result === void 0) if (this._cancelled !== void 0) result = this.processCancellation();
		else if (this._activeSubexecutor !== void 0) result = this.runSubexecutor();
		else try {
			if (this._currentChannel === void 0) result = Done();
			else {
				if (isEffect(this._currentChannel)) this._currentChannel = fromEffect$4(this._currentChannel);
				switch (this._currentChannel._tag) {
					case OP_BRACKET_OUT:
						result = this.runBracketOut(this._currentChannel);
						break;
					case OP_BRIDGE: {
						const bridgeInput = this._currentChannel.input;
						this._currentChannel = this._currentChannel.channel;
						if (this._input !== void 0) {
							const inputExecutor = this._input;
							this._input = void 0;
							const drainer = () => flatMap$4(bridgeInput.awaitRead(), () => suspend$5(() => {
								const state = inputExecutor.run();
								switch (state._tag) {
									case OP_DONE$1: return match$3(inputExecutor.getDone(), {
										onFailure: (cause) => bridgeInput.error(cause),
										onSuccess: (value) => bridgeInput.done(value)
									});
									case OP_EMIT$1: return flatMap$4(bridgeInput.emit(inputExecutor.getEmit()), () => drainer());
									case OP_FROM_EFFECT: return matchCauseEffect(state.effect, {
										onFailure: (cause) => bridgeInput.error(cause),
										onSuccess: () => drainer()
									});
									case OP_READ: return readUpstream(state, () => drainer(), (cause) => bridgeInput.error(cause));
								}
							}));
							result = fromEffect$3(flatMap$4(forkDaemon(interruptible(drainer())), (fiber) => sync$1(() => this.addFinalizer((exit) => flatMap$4(interrupt$2(fiber), () => suspend$5(() => {
								const effect = this.restorePipe(exit, inputExecutor);
								return effect !== void 0 ? effect : _void;
							}))))));
						}
						break;
					}
					case OP_CONCAT_ALL: {
						const executor = new ChannelExecutor(this._currentChannel.value(), this._providedEnv, (effect) => sync$1(() => {
							const prevLastClose = this._closeLastSubstream === void 0 ? _void : this._closeLastSubstream;
							this._closeLastSubstream = pipe(prevLastClose, zipRight$1(effect));
						}));
						executor._input = this._input;
						const channel = this._currentChannel;
						this._activeSubexecutor = new PullFromUpstream(executor, (value) => channel.k(value), void 0, [], (x, y) => channel.combineInners(x, y), (x, y) => channel.combineAll(x, y), (request) => channel.onPull(request), (value) => channel.onEmit(value));
						this._closeLastSubstream = void 0;
						this._currentChannel = void 0;
						break;
					}
					case OP_EMIT$2:
						this._emitted = this._currentChannel.out;
						this._currentChannel = this._activeSubexecutor !== void 0 ? void 0 : void_$1;
						result = Emit$1();
						break;
					case OP_ENSURING:
						this.runEnsuring(this._currentChannel);
						break;
					case OP_FAIL:
						result = this.doneHalt(this._currentChannel.error());
						break;
					case OP_FOLD:
						this._doneStack.push(this._currentChannel.k);
						this._currentChannel = this._currentChannel.channel;
						break;
					case OP_FROM_EFFECT$1: {
						const effect = this._providedEnv === void 0 ? this._currentChannel.effect() : pipe(this._currentChannel.effect(), provide(this._providedEnv));
						result = fromEffect$3(matchCauseEffect(effect, {
							onFailure: (cause) => {
								const state = this.doneHalt(cause);
								return state !== void 0 && isFromEffect(state) ? state.effect : _void;
							},
							onSuccess: (value) => {
								const state = this.doneSucceed(value);
								return state !== void 0 && isFromEffect(state) ? state.effect : _void;
							}
						}));
						break;
					}
					case OP_PIPE_TO: {
						const previousInput = this._input;
						const leftExec = new ChannelExecutor(this._currentChannel.left(), this._providedEnv, (effect) => this._executeCloseLastSubstream(effect));
						leftExec._input = previousInput;
						this._input = leftExec;
						this.addFinalizer((exit) => {
							const effect = this.restorePipe(exit, previousInput);
							return effect !== void 0 ? effect : _void;
						});
						this._currentChannel = this._currentChannel.right();
						break;
					}
					case OP_PROVIDE: {
						const previousEnv = this._providedEnv;
						this._providedEnv = this._currentChannel.context();
						this._currentChannel = this._currentChannel.inner;
						this.addFinalizer(() => sync$1(() => {
							this._providedEnv = previousEnv;
						}));
						break;
					}
					case OP_READ$1: {
						const read = this._currentChannel;
						result = Read(this._input, identity, (emitted) => {
							try {
								this._currentChannel = read.more(emitted);
							} catch (error) {
								this._currentChannel = read.done.onExit(die$3(error));
							}
						}, (exit) => {
							const onExit = (exit) => {
								return read.done.onExit(exit);
							};
							this._currentChannel = onExit(exit);
						});
						break;
					}
					case OP_SUCCEED:
						result = this.doneSucceed(this._currentChannel.evaluate());
						break;
					case OP_SUCCEED_NOW:
						result = this.doneSucceed(this._currentChannel.terminal);
						break;
					case OP_SUSPEND: this._currentChannel = this._currentChannel.channel();
				}
			}
		} catch (error) {
			this._currentChannel = failCause$1(die$2(error));
		}
		return result;
	}
	getDone() {
		return this._done;
	}
	getEmit() {
		return this._emitted;
	}
	cancelWith(exit) {
		this._cancelled = exit;
	}
	clearInProgressFinalizer() {
		this._inProgressFinalizer = void 0;
	}
	storeInProgressFinalizer(finalizer) {
		this._inProgressFinalizer = finalizer;
	}
	popAllFinalizers(exit) {
		const finalizers = [];
		let next = this._doneStack.pop();
		while (next) {
			if (next._tag === "ContinuationFinalizer") finalizers.push(next.finalizer);
			next = this._doneStack.pop();
		}
		const effect = finalizers.length === 0 ? _void : runFinalizers(finalizers, exit);
		this.storeInProgressFinalizer(effect);
		return effect;
	}
	popNextFinalizers() {
		const builder = [];
		while (this._doneStack.length !== 0) {
			const cont = this._doneStack[this._doneStack.length - 1];
			if (cont._tag === "ContinuationK") return builder;
			builder.push(cont);
			this._doneStack.pop();
		}
		return builder;
	}
	restorePipe(exit, prev) {
		const currInput = this._input;
		this._input = prev;
		if (currInput !== void 0) return currInput.close(exit);
		return _void;
	}
	close(exit$2) {
		let runInProgressFinalizers = void 0;
		const finalizer = this._inProgressFinalizer;
		if (finalizer !== void 0) runInProgressFinalizers = pipe(finalizer, ensuring$2(sync$1(() => this.clearInProgressFinalizer())));
		let closeSelf = void 0;
		const selfFinalizers = this.popAllFinalizers(exit$2);
		if (selfFinalizers !== void 0) closeSelf = pipe(selfFinalizers, ensuring$2(sync$1(() => this.clearInProgressFinalizer())));
		const closeSubexecutors = this._activeSubexecutor === void 0 ? void 0 : this._activeSubexecutor.close(exit$2);
		if (closeSubexecutors === void 0 && runInProgressFinalizers === void 0 && closeSelf === void 0) return;
		return pipe(exit(ifNotNull(closeSubexecutors)), zip$1(exit(ifNotNull(runInProgressFinalizers))), zip$1(exit(ifNotNull(closeSelf))), map$2(([[exit1, exit2], exit3]) => pipe(exit1, zipRight$2(exit2), zipRight$2(exit3))), uninterruptible, flatMap$4((exit) => suspend$5(() => exit)));
	}
	doneSucceed(value) {
		if (this._doneStack.length === 0) {
			this._done = succeed$6(value);
			this._currentChannel = void 0;
			return Done();
		}
		const head = this._doneStack[this._doneStack.length - 1];
		if (head._tag === "ContinuationK") {
			this._doneStack.pop();
			this._currentChannel = head.onSuccess(value);
			return;
		}
		const finalizers = this.popNextFinalizers();
		if (this._doneStack.length === 0) {
			this._doneStack = finalizers.reverse();
			this._done = succeed$6(value);
			this._currentChannel = void 0;
			return Done();
		}
		const finalizerEffect = runFinalizers(finalizers.map((f) => f.finalizer), succeed$6(value));
		this.storeInProgressFinalizer(finalizerEffect);
		const effect = pipe(finalizerEffect, ensuring$2(sync$1(() => this.clearInProgressFinalizer())), uninterruptible, flatMap$4(() => sync$1(() => this.doneSucceed(value))));
		return fromEffect$3(effect);
	}
	doneHalt(cause) {
		if (this._doneStack.length === 0) {
			this._done = failCause$4(cause);
			this._currentChannel = void 0;
			return Done();
		}
		const head = this._doneStack[this._doneStack.length - 1];
		if (head._tag === "ContinuationK") {
			this._doneStack.pop();
			try {
				this._currentChannel = head.onHalt(cause);
			} catch (error) {
				this._currentChannel = failCause$1(die$2(error));
			}
			return;
		}
		const finalizers = this.popNextFinalizers();
		if (this._doneStack.length === 0) {
			this._doneStack = finalizers.reverse();
			this._done = failCause$4(cause);
			this._currentChannel = void 0;
			return Done();
		}
		const finalizerEffect = runFinalizers(finalizers.map((f) => f.finalizer), failCause$4(cause));
		this.storeInProgressFinalizer(finalizerEffect);
		const effect = pipe(finalizerEffect, ensuring$2(sync$1(() => this.clearInProgressFinalizer())), uninterruptible, flatMap$4(() => sync$1(() => this.doneHalt(cause))));
		return fromEffect$3(effect);
	}
	processCancellation() {
		this._currentChannel = void 0;
		this._done = this._cancelled;
		this._cancelled = void 0;
		return Done();
	}
	runBracketOut(bracketOut) {
		const effect = uninterruptible(matchCauseEffect(this.provide(bracketOut.acquire()), {
			onFailure: (cause) => sync$1(() => {
				this._currentChannel = failCause$1(cause);
			}),
			onSuccess: (out) => sync$1(() => {
				this.addFinalizer((exit) => this.provide(bracketOut.finalizer(out, exit)));
				this._currentChannel = write$1(out);
			})
		}));
		return fromEffect$3(effect);
	}
	provide(effect) {
		if (this._providedEnv === void 0) return effect;
		return pipe(effect, provide(this._providedEnv));
	}
	runEnsuring(ensuring) {
		this.addFinalizer(ensuring.finalizer);
		this._currentChannel = ensuring.channel;
	}
	addFinalizer(f) {
		this._doneStack.push(new ContinuationFinalizerImpl(f));
	}
	runSubexecutor() {
		const subexecutor = this._activeSubexecutor;
		switch (subexecutor._tag) {
			case OP_PULL_FROM_CHILD: return this.pullFromChild(subexecutor.childExecutor, subexecutor.parentSubexecutor, subexecutor.onEmit, subexecutor);
			case OP_PULL_FROM_UPSTREAM: return this.pullFromUpstream(subexecutor);
			case OP_DRAIN_CHILD_EXECUTORS: return this.drainChildExecutors(subexecutor);
			case OP_EMIT:
				this._emitted = subexecutor.value;
				this._activeSubexecutor = subexecutor.next;
				return Emit$1();
		}
	}
	replaceSubexecutor(nextSubExec) {
		this._currentChannel = void 0;
		this._activeSubexecutor = nextSubExec;
	}
	finishWithExit(exit) {
		const state = match$3(exit, {
			onFailure: (cause) => this.doneHalt(cause),
			onSuccess: (value) => this.doneSucceed(value)
		});
		this._activeSubexecutor = void 0;
		return state === void 0 ? _void : effect(state);
	}
	finishSubexecutorWithCloseEffect(subexecutorDone, ...closeFuncs) {
		this.addFinalizer(() => pipe(closeFuncs, forEach$2((closeFunc) => pipe(sync$1(() => closeFunc(subexecutorDone)), flatMap$4((closeEffect) => closeEffect !== void 0 ? closeEffect : _void)), { discard: true })));
		const state = pipe(subexecutorDone, match$3({
			onFailure: (cause) => this.doneHalt(cause),
			onSuccess: (value) => this.doneSucceed(value)
		}));
		this._activeSubexecutor = void 0;
		return state;
	}
	applyUpstreamPullStrategy(upstreamFinished, queue, strategy) {
		switch (strategy._tag) {
			case OP_PULL_AFTER_NEXT: {
				const shouldPrepend = !upstreamFinished || queue.some((subexecutor) => subexecutor !== void 0);
				return [strategy.emitSeparator, shouldPrepend ? [void 0, ...queue] : queue];
			}
			case OP_PULL_AFTER_ALL_ENQUEUED: {
				const shouldEnqueue = !upstreamFinished || queue.some((subexecutor) => subexecutor !== void 0);
				return [strategy.emitSeparator, shouldEnqueue ? [...queue, void 0] : queue];
			}
		}
	}
	pullFromChild(childExecutor, parentSubexecutor, onEmitted, subexecutor) {
		return Read(childExecutor, identity, (emitted) => {
			const childExecutorDecision = onEmitted(emitted);
			switch (childExecutorDecision._tag) {
				case OP_CONTINUE: break;
				case OP_CLOSE:
					this.finishWithDoneValue(childExecutor, parentSubexecutor, childExecutorDecision.value);
					break;
				case OP_YIELD: {
					const modifiedParent = parentSubexecutor.enqueuePullFromChild(subexecutor);
					this.replaceSubexecutor(modifiedParent);
					break;
				}
			}
			this._activeSubexecutor = new Emit(emitted, this._activeSubexecutor);
		}, match$3({
			onFailure: (cause) => {
				const state = this.handleSubexecutorFailure(childExecutor, parentSubexecutor, cause);
				return state === void 0 ? void 0 : effectOrUndefinedIgnored(state);
			},
			onSuccess: (doneValue) => {
				this.finishWithDoneValue(childExecutor, parentSubexecutor, doneValue);
			}
		}));
	}
	finishWithDoneValue(childExecutor, parentSubexecutor, doneValue) {
		const subexecutor = parentSubexecutor;
		switch (subexecutor._tag) {
			case OP_PULL_FROM_UPSTREAM: {
				const modifiedParent = new PullFromUpstream(subexecutor.upstreamExecutor, subexecutor.createChild, subexecutor.lastDone !== void 0 ? subexecutor.combineChildResults(subexecutor.lastDone, doneValue) : doneValue, subexecutor.activeChildExecutors, subexecutor.combineChildResults, subexecutor.combineWithChildResult, subexecutor.onPull, subexecutor.onEmit);
				this._closeLastSubstream = childExecutor.close(succeed$6(doneValue));
				this.replaceSubexecutor(modifiedParent);
				break;
			}
			case OP_DRAIN_CHILD_EXECUTORS: {
				const modifiedParent = new DrainChildExecutors(subexecutor.upstreamExecutor, subexecutor.lastDone !== void 0 ? subexecutor.combineChildResults(subexecutor.lastDone, doneValue) : doneValue, subexecutor.activeChildExecutors, subexecutor.upstreamDone, subexecutor.combineChildResults, subexecutor.combineWithChildResult, subexecutor.onPull);
				this._closeLastSubstream = childExecutor.close(succeed$6(doneValue));
				this.replaceSubexecutor(modifiedParent);
				break;
			}
		}
	}
	handleSubexecutorFailure(childExecutor, parentSubexecutor, cause) {
		return this.finishSubexecutorWithCloseEffect(failCause$4(cause), (exit) => parentSubexecutor.close(exit), (exit) => childExecutor.close(exit));
	}
	pullFromUpstream(subexecutor) {
		if (subexecutor.activeChildExecutors.length === 0) return this.performPullFromUpstream(subexecutor);
		const activeChild = subexecutor.activeChildExecutors[0];
		const parentSubexecutor = new PullFromUpstream(subexecutor.upstreamExecutor, subexecutor.createChild, subexecutor.lastDone, subexecutor.activeChildExecutors.slice(1), subexecutor.combineChildResults, subexecutor.combineWithChildResult, subexecutor.onPull, subexecutor.onEmit);
		if (activeChild === void 0) return this.performPullFromUpstream(parentSubexecutor);
		this.replaceSubexecutor(new PullFromChild(activeChild.childExecutor, parentSubexecutor, activeChild.onEmit));
	}
	performPullFromUpstream(subexecutor) {
		return Read(subexecutor.upstreamExecutor, (effect) => {
			const closeLastSubstream = this._closeLastSubstream === void 0 ? _void : this._closeLastSubstream;
			this._closeLastSubstream = void 0;
			return pipe(this._executeCloseLastSubstream(closeLastSubstream), zipRight$1(effect));
		}, (emitted) => {
			if (this._closeLastSubstream !== void 0) {
				const closeLastSubstream = this._closeLastSubstream;
				this._closeLastSubstream = void 0;
				return pipe(this._executeCloseLastSubstream(closeLastSubstream), map$2(() => {
					const childExecutor = new ChannelExecutor(subexecutor.createChild(emitted), this._providedEnv, this._executeCloseLastSubstream);
					childExecutor._input = this._input;
					const [emitSeparator, updatedChildExecutors] = this.applyUpstreamPullStrategy(false, subexecutor.activeChildExecutors, subexecutor.onPull(Pulled(emitted)));
					this._activeSubexecutor = new PullFromChild(childExecutor, new PullFromUpstream(subexecutor.upstreamExecutor, subexecutor.createChild, subexecutor.lastDone, updatedChildExecutors, subexecutor.combineChildResults, subexecutor.combineWithChildResult, subexecutor.onPull, subexecutor.onEmit), subexecutor.onEmit);
					if (isSome(emitSeparator)) this._activeSubexecutor = new Emit(emitSeparator.value, this._activeSubexecutor);
				}));
			}
			const childExecutor = new ChannelExecutor(subexecutor.createChild(emitted), this._providedEnv, this._executeCloseLastSubstream);
			childExecutor._input = this._input;
			const [emitSeparator, updatedChildExecutors] = this.applyUpstreamPullStrategy(false, subexecutor.activeChildExecutors, subexecutor.onPull(Pulled(emitted)));
			this._activeSubexecutor = new PullFromChild(childExecutor, new PullFromUpstream(subexecutor.upstreamExecutor, subexecutor.createChild, subexecutor.lastDone, updatedChildExecutors, subexecutor.combineChildResults, subexecutor.combineWithChildResult, subexecutor.onPull, subexecutor.onEmit), subexecutor.onEmit);
			if (isSome(emitSeparator)) this._activeSubexecutor = new Emit(emitSeparator.value, this._activeSubexecutor);
		}, (exit) => {
			if (subexecutor.activeChildExecutors.some((subexecutor) => subexecutor !== void 0)) {
				const drain = new DrainChildExecutors(subexecutor.upstreamExecutor, subexecutor.lastDone, [void 0, ...subexecutor.activeChildExecutors], subexecutor.upstreamExecutor.getDone(), subexecutor.combineChildResults, subexecutor.combineWithChildResult, subexecutor.onPull);
				if (this._closeLastSubstream !== void 0) {
					const closeLastSubstream = this._closeLastSubstream;
					this._closeLastSubstream = void 0;
					return pipe(this._executeCloseLastSubstream(closeLastSubstream), map$2(() => this.replaceSubexecutor(drain)));
				}
				this.replaceSubexecutor(drain);
				return;
			}
			const closeLastSubstream = this._closeLastSubstream;
			const state = this.finishSubexecutorWithCloseEffect(pipe(exit, map$5((a) => subexecutor.combineWithChildResult(subexecutor.lastDone, a))), () => closeLastSubstream, (exit) => subexecutor.upstreamExecutor.close(exit));
			return state === void 0 ? void 0 : effectOrUndefinedIgnored(state);
		});
	}
	drainChildExecutors(subexecutor) {
		if (subexecutor.activeChildExecutors.length === 0) {
			const lastClose = this._closeLastSubstream;
			if (lastClose !== void 0) this.addFinalizer(() => succeed$2(lastClose));
			return this.finishSubexecutorWithCloseEffect(subexecutor.upstreamDone, () => lastClose, (exit) => subexecutor.upstreamExecutor.close(exit));
		}
		const activeChild = subexecutor.activeChildExecutors[0];
		const rest = subexecutor.activeChildExecutors.slice(1);
		if (activeChild === void 0) {
			const [emitSeparator, remainingExecutors] = this.applyUpstreamPullStrategy(true, rest, subexecutor.onPull(NoUpstream(rest.reduce((n, curr) => curr !== void 0 ? n + 1 : n, 0))));
			this.replaceSubexecutor(new DrainChildExecutors(subexecutor.upstreamExecutor, subexecutor.lastDone, remainingExecutors, subexecutor.upstreamDone, subexecutor.combineChildResults, subexecutor.combineWithChildResult, subexecutor.onPull));
			if (isSome(emitSeparator)) {
				this._emitted = emitSeparator.value;
				return Emit$1();
			}
			return;
		}
		const parentSubexecutor = new DrainChildExecutors(subexecutor.upstreamExecutor, subexecutor.lastDone, rest, subexecutor.upstreamDone, subexecutor.combineChildResults, subexecutor.combineWithChildResult, subexecutor.onPull);
		this.replaceSubexecutor(new PullFromChild(activeChild.childExecutor, parentSubexecutor, activeChild.onEmit));
	}
};
const ifNotNull = (effect) => effect !== void 0 ? effect : _void;
const runFinalizers = (finalizers, exit$3) => {
	return pipe(forEach$2(finalizers, (fin) => exit(fin(exit$3))), map$2((exits) => pipe(all$2(exits), getOrElse(() => void_$2))), flatMap$4((exit) => suspend$5(() => exit)));
};
/**
* @internal
*/
const readUpstream = (r, onSuccess, onFailure) => {
	const readStack = [r];
	const read = () => {
		const current = readStack.pop();
		if (current === void 0 || current.upstream === void 0) return dieMessage("Unexpected end of input for channel execution");
		const state = current.upstream.run();
		switch (state._tag) {
			case OP_EMIT$1: {
				const emitEffect = current.onEmit(current.upstream.getEmit());
				if (readStack.length === 0) {
					if (emitEffect === void 0) return suspend$5(onSuccess);
					return pipe(emitEffect, matchCauseEffect({
						onFailure,
						onSuccess
					}));
				}
				if (emitEffect === void 0) return suspend$5(() => read());
				return pipe(emitEffect, matchCauseEffect({
					onFailure,
					onSuccess: () => read()
				}));
			}
			case OP_DONE$1: {
				const doneEffect = current.onDone(current.upstream.getDone());
				if (readStack.length === 0) {
					if (doneEffect === void 0) return suspend$5(onSuccess);
					return pipe(doneEffect, matchCauseEffect({
						onFailure,
						onSuccess
					}));
				}
				if (doneEffect === void 0) return suspend$5(() => read());
				return pipe(doneEffect, matchCauseEffect({
					onFailure,
					onSuccess: () => read()
				}));
			}
			case OP_FROM_EFFECT:
				readStack.push(current);
				return pipe(current.onEffect(state.effect), catchAllCause((cause) => suspend$5(() => {
					const doneEffect = current.onDone(failCause$4(cause));
					return doneEffect === void 0 ? _void : doneEffect;
				})), matchCauseEffect({
					onFailure,
					onSuccess: () => read()
				}));
			case OP_READ:
				readStack.push(current);
				readStack.push(state);
				return suspend$5(() => read());
		}
	};
	return read();
};
/** @internal */
const runIn = /*#__PURE__*/ dual(2, (self, scope) => {
	const run = (channelDeferred, scopeDeferred, scope) => acquireUseRelease$2(sync$1(() => new ChannelExecutor(self, void 0, identity)), (exec) => suspend$5(() => runScopedInterpret(exec.run(), exec).pipe(intoDeferred(channelDeferred), zipRight$1(_await(channelDeferred)), zipLeft(_await(scopeDeferred)))), (exec, exit) => {
		const finalize = exec.close(exit);
		if (finalize === void 0) return _void;
		return tapErrorCause(finalize, (cause) => addFinalizer$1(scope, failCause$2(cause)));
	});
	return uninterruptibleMask((restore) => all([
		fork(scope, sequential$1),
		make$16(),
		make$16()
	]).pipe(flatMap$4(([child, channelDeferred, scopeDeferred]) => restore(run(channelDeferred, scopeDeferred, child)).pipe(forkIn(scope), flatMap$4((fiber) => scope.addFinalizer((exit) => {
		const interruptors$2 = isFailure(exit) ? interruptors(exit.cause) : void 0;
		return isDone(channelDeferred).pipe(flatMap$4((isDone) => isDone ? succeed$4(scopeDeferred, void 0).pipe(zipRight$1(_await$1(fiber)), zipRight$1(inheritAll(fiber))) : succeed$4(scopeDeferred, void 0).pipe(zipRight$1(interruptors$2 && size$5(interruptors$2) > 0 ? interruptAs(fiber, combineAll(interruptors$2)) : interrupt$2(fiber)), zipRight$1(inheritAll(fiber)))));
	}).pipe(zipRight$1(restore(_await(channelDeferred)))))))));
});
/** @internal */
const runScopedInterpret = (channelState, exec) => {
	const op = channelState;
	switch (op._tag) {
		case OP_FROM_EFFECT: return pipe(op.effect, flatMap$4(() => runScopedInterpret(exec.run(), exec)));
		case OP_EMIT$1: return runScopedInterpret(exec.run(), exec);
		case OP_DONE$1: return suspend$5(() => exec.getDone());
		case OP_READ: return readUpstream(op, () => runScopedInterpret(exec.run(), exec), failCause$2);
	}
};
/** @internal */
const OP_AWAIT = "Await";
/** @internal */
const proto$2 = { [/* @__PURE__ */ Symbol.for("effect/ChannelMergeDecision")]: {
	_R: (_) => _,
	_E0: (_) => _,
	_Z0: (_) => _,
	_E: (_) => _,
	_Z: (_) => _
} };
/** @internal */
const Await = (f) => {
	const op = Object.create(proto$2);
	op._tag = OP_AWAIT;
	op.f = f;
	return op;
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/opCodes/channelMergeState.js
/** @internal */
const OP_BOTH_RUNNING = "BothRunning";
/** @internal */
const OP_LEFT_DONE = "LeftDone";
/** @internal */
const OP_RIGHT_DONE = "RightDone";
/** @internal */
const MergeStateTypeId = /*#__PURE__*/ Symbol.for("effect/ChannelMergeState");
/** @internal */
const proto$1 = { [MergeStateTypeId]: MergeStateTypeId };
/** @internal */
const BothRunning = (left, right) => {
	const op = Object.create(proto$1);
	op._tag = OP_BOTH_RUNNING;
	op.left = left;
	op.right = right;
	return op;
};
/** @internal */
const LeftDone = (f) => {
	const op = Object.create(proto$1);
	op._tag = OP_LEFT_DONE;
	op.f = f;
	return op;
};
/** @internal */
const RightDone = (f) => {
	const op = Object.create(proto$1);
	op._tag = OP_RIGHT_DONE;
	op.f = f;
	return op;
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/opCodes/channelMergeStrategy.js
/** @internal */
const OP_BACK_PRESSURE = "BackPressure";
/** @internal */
const OP_BUFFER_SLIDING = "BufferSliding";
/** @internal */
const MergeStrategyTypeId = /*#__PURE__*/ Symbol.for("effect/ChannelMergeStrategy");
/** @internal */
const proto = { [MergeStrategyTypeId]: MergeStrategyTypeId };
/** @internal */
const BackPressure = (_) => {
	const op = Object.create(proto);
	op._tag = OP_BACK_PRESSURE;
	return op;
};
/** @internal */
const BufferSliding = (_) => {
	const op = Object.create(proto);
	op._tag = OP_BUFFER_SLIDING;
	return op;
};
/** @internal */
const match$1 = /*#__PURE__*/ dual(2, (self, { onBackPressure, onBufferSliding }) => {
	switch (self._tag) {
		case OP_BACK_PRESSURE: return onBackPressure();
		case OP_BUFFER_SLIDING: return onBufferSliding();
	}
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/channel/singleProducerAsyncInput.js
/** @internal */
const OP_STATE_EMPTY = "Empty";
/** @internal */
const OP_STATE_EMIT = "Emit";
/** @internal */
const OP_STATE_ERROR = "Error";
/** @internal */
const OP_STATE_DONE = "Done";
/** @internal */
const stateEmpty$1 = (notifyProducer) => ({
	_tag: OP_STATE_EMPTY,
	notifyProducer
});
/** @internal */
const stateEmit = (notifyConsumers) => ({
	_tag: OP_STATE_EMIT,
	notifyConsumers
});
/** @internal */
const stateError = (cause) => ({
	_tag: OP_STATE_ERROR,
	cause
});
/** @internal */
const stateDone = (done) => ({
	_tag: OP_STATE_DONE,
	done
});
/** @internal */
var SingleProducerAsyncInputImpl = class {
	ref;
	constructor(ref) {
		this.ref = ref;
	}
	awaitRead() {
		return flatten$5(modify(this.ref, (state) => state._tag === OP_STATE_EMPTY ? [_await(state.notifyProducer), state] : [_void, state]));
	}
	get close() {
		return fiberIdWith((fiberId) => this.error(interrupt$3(fiberId)));
	}
	done(value) {
		return flatten$5(modify(this.ref, (state) => {
			switch (state._tag) {
				case OP_STATE_EMPTY: return [_await(state.notifyProducer), state];
				case OP_STATE_EMIT: return [forEach$2(state.notifyConsumers, (deferred) => succeed$4(deferred, left(value)), { discard: true }), stateDone(value)];
				case OP_STATE_ERROR: return [interrupt, state];
				case OP_STATE_DONE: return [interrupt, state];
			}
		}));
	}
	emit(element) {
		return flatMap$4(make$16(), (deferred) => flatten$5(modify(this.ref, (state) => {
			switch (state._tag) {
				case OP_STATE_EMPTY: return [_await(state.notifyProducer), state];
				case OP_STATE_EMIT: {
					const notifyConsumer = state.notifyConsumers[0];
					const notifyConsumers = state.notifyConsumers.slice(1);
					if (notifyConsumer !== void 0) return [succeed$4(notifyConsumer, right(element)), notifyConsumers.length === 0 ? stateEmpty$1(deferred) : stateEmit(notifyConsumers)];
					throw new Error("Bug: Channel.SingleProducerAsyncInput.emit - Queue was empty! please report an issue at https://github.com/Effect-TS/effect/issues");
				}
				case OP_STATE_ERROR: return [interrupt, state];
				case OP_STATE_DONE: return [interrupt, state];
			}
		})));
	}
	error(cause) {
		return flatten$5(modify(this.ref, (state) => {
			switch (state._tag) {
				case OP_STATE_EMPTY: return [_await(state.notifyProducer), state];
				case OP_STATE_EMIT: return [forEach$2(state.notifyConsumers, (deferred) => failCause$3(deferred, cause), { discard: true }), stateError(cause)];
				case OP_STATE_ERROR: return [interrupt, state];
				case OP_STATE_DONE: return [interrupt, state];
			}
		}));
	}
	get take() {
		return this.takeWith((cause) => failCause$4(map$4(cause, left)), (elem) => succeed$6(elem), (done) => fail$5(right(done)));
	}
	takeWith(onError, onElement, onDone) {
		return flatMap$4(make$16(), (deferred) => flatten$5(modify(this.ref, (state) => {
			switch (state._tag) {
				case OP_STATE_EMPTY: return [zipRight$1(succeed$4(state.notifyProducer, void 0), matchCause(_await(deferred), {
					onFailure: onError,
					onSuccess: match$7({
						onLeft: onDone,
						onRight: onElement
					})
				})), stateEmit([deferred])];
				case OP_STATE_EMIT: return [matchCause(_await(deferred), {
					onFailure: onError,
					onSuccess: match$7({
						onLeft: onDone,
						onRight: onElement
					})
				}), stateEmit([...state.notifyConsumers, deferred])];
				case OP_STATE_ERROR: return [succeed$2(onError(state.cause)), state];
				case OP_STATE_DONE: return [succeed$2(onDone(state.done)), state];
			}
		})));
	}
};
/** @internal */
const make$13 = () => pipe(make$16(), flatMap$4((deferred) => make$28(stateEmpty$1(deferred))), map$2((ref) => new SingleProducerAsyncInputImpl(ref)));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/channel.js
/** @internal */
const acquireUseRelease$1 = (acquire, use, release) => flatMap$3(fromEffect$4(make$28(() => _void)), (ref) => pipe(fromEffect$4(uninterruptible(tap(acquire, (a) => set$1(ref, (exit) => release(a, exit))))), flatMap$3(use), ensuringWith((exit) => flatMap$4(get$3(ref), (f) => f(exit)))));
/** @internal */
const as = /*#__PURE__*/ dual(2, (self, value) => map$1(self, () => value));
/** @internal */
const concatMap = /*#__PURE__*/ dual(2, (self, f) => concatMapWith(self, f, () => void 0, () => void 0));
/** @internal */
const drain$2 = (self) => {
	const drainer = readWithCause({
		onInput: () => drainer,
		onFailure: failCause$1,
		onDone: succeed$1
	});
	return pipeTo$1(self, drainer);
};
/** @internal */
const ensuring$1 = /*#__PURE__*/ dual(2, (self, finalizer) => ensuringWith(self, () => finalizer));
/** @internal */
const flatten$4 = (self) => flatMap$3(self, identity);
/** @internal */
const fromInput = (input) => unwrap$2(input.takeWith(failCause$1, (elem) => flatMap$3(write$1(elem), () => fromInput(input)), succeed$1));
/** @internal */
const identityChannel = () => readWith({
	onInput: (input) => flatMap$3(write$1(input), () => identityChannel()),
	onFailure: fail$1,
	onDone: succeedNow
});
/** @internal */
const map$1 = /*#__PURE__*/ dual(2, (self, f) => flatMap$3(self, (a) => sync(() => f(a))));
/** @internal */
const mapOut = /*#__PURE__*/ dual(2, (self, f) => {
	const reader = readWith({
		onInput: (outElem) => flatMap$3(write$1(f(outElem)), () => reader),
		onFailure: fail$1,
		onDone: succeedNow
	});
	return pipeTo$1(self, reader);
});
/** @internal */
const mapOutEffect = /*#__PURE__*/ dual(2, (self, f) => {
	const reader = readWithCause({
		onInput: (outElem) => pipe(fromEffect$4(f(outElem)), flatMap$3(write$1), flatMap$3(() => reader)),
		onFailure: failCause$1,
		onDone: succeedNow
	});
	return pipeTo$1(self, reader);
});
/** @internal */
const mergeAll = (options) => {
	return (channels) => mergeAllWith(options)(channels, constVoid);
};
/** @internal */
const mergeAllWith = ({ bufferSize = 16, concurrency, mergeStrategy = BackPressure() }) => (channels, f) => unwrapScopedWith((scope) => gen(function* () {
	const concurrencyN = concurrency === "unbounded" ? Number.MAX_SAFE_INTEGER : concurrency;
	const input = yield* make$13();
	const queueReader = fromInput(input);
	const queue = yield* bounded(bufferSize);
	yield* addFinalizer$1(scope, shutdown(queue));
	const cancelers = yield* unbounded();
	yield* addFinalizer$1(scope, shutdown(cancelers));
	const lastDone = yield* make$28(none$4());
	const errorSignal = yield* make$16();
	const withPermits = (yield* makeSemaphore(concurrencyN)).withPermits;
	const pull = yield* toPullIn(pipeTo$1(queueReader, channels), scope);
	function evaluatePull(pull) {
		return pull.pipe(flatMap$4(match$7({
			onLeft: (done) => succeed$2(some(done)),
			onRight: (outElem) => as$1(offer(queue, succeed$2(right(outElem))), none$4())
		})), repeat({ until: (_) => isSome(_) }), flatMap$4((outDone) => update$1(lastDone, match$9({
			onNone: () => some(outDone.value),
			onSome: (lastDone) => some(f(lastDone, outDone.value))
		}))), catchAllCause((cause) => isInterrupted(cause) ? failCause$2(cause) : offer(queue, failCause$2(cause)).pipe(zipRight$1(succeed$4(errorSignal, void 0)), asVoid)));
	}
	yield* pull.pipe(matchCauseEffect({
		onFailure: (cause) => offer(queue, failCause$2(cause)).pipe(zipRight$1(succeed$2(false))),
		onSuccess: match$7({
			onLeft: (outDone) => raceWith(interruptible(_await(errorSignal)), interruptible(withPermits(concurrencyN)(_void)), {
				onSelfDone: (_, permitAcquisition) => as$1(interrupt$2(permitAcquisition), false),
				onOtherDone: (_, failureAwait) => zipRight$1(interrupt$2(failureAwait), get$3(lastDone).pipe(flatMap$4(match$9({
					onNone: () => offer(queue, succeed$2(left(outDone))),
					onSome: (lastDone) => offer(queue, succeed$2(left(f(lastDone, outDone))))
				})), as$1(false)))
			}),
			onRight: (channel) => match$1(mergeStrategy, {
				onBackPressure: () => gen(function* () {
					const latch = yield* make$16();
					const raceEffects = scopedWith$1((scope) => toPullIn(pipeTo$1(queueReader, channel), scope).pipe(flatMap$4((pull) => race(exit(evaluatePull(pull)), exit(interruptible(_await(errorSignal))))), flatMap$4(identity)));
					yield* succeed$4(latch, void 0).pipe(zipRight$1(raceEffects), withPermits(1), forkIn(scope));
					yield* _await(latch);
					return !(yield* isDone(errorSignal));
				}),
				onBufferSliding: () => gen(function* () {
					const canceler = yield* make$16();
					const latch = yield* make$16();
					const size$8 = yield* size(cancelers);
					yield* take$2(cancelers).pipe(flatMap$4((canceler) => succeed$4(canceler, void 0)), when$2(() => size$8 >= concurrencyN));
					yield* offer(cancelers, canceler);
					const raceEffects = scopedWith$1((scope) => toPullIn(pipeTo$1(queueReader, channel), scope).pipe(flatMap$4((pull) => exit(evaluatePull(pull)).pipe(race(exit(interruptible(_await(errorSignal)))), race(exit(interruptible(_await(canceler)))))), flatMap$4(identity)));
					yield* succeed$4(latch, void 0).pipe(zipRight$1(raceEffects), withPermits(1), forkIn(scope));
					yield* _await(latch);
					return !(yield* isDone(errorSignal));
				})
			})
		})
	}), repeat({ while: (_) => _ }), forkIn(scope));
	const consumer = pipe(take$2(queue), flatten$5, matchCause({
		onFailure: failCause$1,
		onSuccess: match$7({
			onLeft: succeedNow,
			onRight: (outElem) => flatMap$3(write$1(outElem), () => consumer)
		})
	}), unwrap$2);
	return embedInput$1(consumer, input);
}));
/** @internal */
const mergeMap = /*#__PURE__*/ dual(3, (self, f, options) => mergeAll(options)(mapOut(self, f)));
/** @internal */
const mergeWith = /*#__PURE__*/ dual(2, (self, options) => {
	function merge(scope) {
		return gen(function* () {
			const input = yield* make$13();
			const queueReader = fromInput(input);
			const pullL = yield* toPullIn(pipeTo$1(queueReader, self), scope);
			const pullR = yield* toPullIn(pipeTo$1(queueReader, options.other), scope);
			function handleSide(exit, fiber, pull) {
				return (done, both, single) => {
					function onDecision(decision) {
						const op = decision;
						if (op._tag === "Done") return succeed$2(fromEffect$4(zipRight$1(interrupt$2(fiber), op.effect)));
						return map$2(_await$1(fiber), match$3({
							onFailure: (cause) => fromEffect$4(op.f(failCause$4(cause))),
							onSuccess: match$7({
								onLeft: (done) => fromEffect$4(op.f(succeed$6(done))),
								onRight: (elem) => zipRight(write$1(elem), go(single(op.f)))
							})
						}));
					}
					return match$3(exit, {
						onFailure: (cause) => onDecision(done(failCause$4(cause))),
						onSuccess: match$7({
							onLeft: (z) => onDecision(done(succeed$6(z))),
							onRight: (elem) => succeed$2(flatMap$3(write$1(elem), () => flatMap$3(fromEffect$4(forkIn(interruptible(pull), scope)), (leftFiber) => go(both(leftFiber, fiber)))))
						})
					});
				};
			}
			function go(state) {
				switch (state._tag) {
					case OP_BOTH_RUNNING: {
						const leftJoin = interruptible(join$1(state.left));
						const rightJoin = interruptible(join$1(state.right));
						return unwrap$2(raceWith(leftJoin, rightJoin, {
							onSelfDone: (leftExit, rf) => zipRight$1(interrupt$2(rf), handleSide(leftExit, state.right, pullL)(options.onSelfDone, BothRunning, (f) => LeftDone(f))),
							onOtherDone: (rightExit, lf) => zipRight$1(interrupt$2(lf), handleSide(rightExit, state.left, pullR)(options.onOtherDone, (left, right) => BothRunning(right, left), (f) => RightDone(f)))
						}));
					}
					case OP_LEFT_DONE: return unwrap$2(map$2(exit(pullR), match$3({
						onFailure: (cause) => fromEffect$4(state.f(failCause$4(cause))),
						onSuccess: match$7({
							onLeft: (done) => fromEffect$4(state.f(succeed$6(done))),
							onRight: (elem) => flatMap$3(write$1(elem), () => go(LeftDone(state.f)))
						})
					})));
					case OP_RIGHT_DONE: return unwrap$2(map$2(exit(pullL), match$3({
						onFailure: (cause) => fromEffect$4(state.f(failCause$4(cause))),
						onSuccess: match$7({
							onLeft: (done) => fromEffect$4(state.f(succeed$6(done))),
							onRight: (elem) => flatMap$3(write$1(elem), () => go(RightDone(state.f)))
						})
					})));
				}
			}
			return fromEffect$4(withFiberRuntime((parent) => {
				const inherit = withFiberRuntime((state) => {
					state.transferChildren(parent.scope());
					return _void;
				});
				const leftFiber = interruptible(pullL).pipe(ensuring$2(inherit), forkIn(scope));
				const rightFiber = interruptible(pullR).pipe(ensuring$2(inherit), forkIn(scope));
				return zipWith(leftFiber, rightFiber, (left, right) => BothRunning(left, right));
			})).pipe(flatMap$3(go), embedInput$1(input));
		});
	}
	return unwrapScopedWith(merge);
});
/** @internal */
const pipeToOrFail = /*#__PURE__*/ dual(2, (self, that) => suspend$4(() => {
	let channelException = void 0;
	const reader = readWith({
		onInput: (outElem) => flatMap$3(write$1(outElem), () => reader),
		onFailure: (outErr) => {
			channelException = ChannelException(outErr);
			return failCause$1(die$2(channelException));
		},
		onDone: succeedNow
	});
	const writer = readWithCause({
		onInput: (outElem) => pipe(write$1(outElem), flatMap$3(() => writer)),
		onFailure: (cause) => isDieType(cause) && isChannelException(cause.defect) && equals$2(cause.defect, channelException) ? fail$1(cause.defect.error) : failCause$1(cause),
		onDone: succeedNow
	});
	return pipeTo$1(pipeTo$1(pipeTo$1(self, reader), that), writer);
}));
/** @internal */
const run$2 = (self) => scopedWith$1((scope) => runIn(self, scope));
/** @internal */
const runDrain = (self) => run$2(drain$2(self));
/** @internal */
const runScoped = (self) => scopeWith((scope) => runIn(self, scope));
/** @internal */
const scoped$1 = (effect) => unwrap$2(uninterruptibleMask((restore) => map$2(make$18(), (scope) => acquireReleaseOut(tapErrorCause(restore(extend$1(effect, scope)), (cause) => close(scope, failCause$4(cause))), (_, exit) => close(scope, exit)))));
/** @internal */
const scopedWith = (f) => unwrapScoped$4(map$2(scope, (scope) => flatMap$3(fromEffect$4(f(scope)), write$1)));
/** @internal */
const splitLines$2 = () => suspend$4(() => {
	let stringBuilder = "";
	let midCRLF = false;
	const splitLinesChunk = (chunk) => {
		const chunkBuilder = [];
		map$10(chunk, (str) => {
			if (str.length !== 0) {
				let from = 0;
				let indexOfCR = str.indexOf("\r");
				let indexOfLF = str.indexOf("\n");
				if (midCRLF) {
					if (indexOfLF === 0) {
						chunkBuilder.push(stringBuilder);
						stringBuilder = "";
						from = 1;
						indexOfLF = str.indexOf("\n", from);
					} else stringBuilder = stringBuilder + "\r";
					midCRLF = false;
				}
				while (indexOfCR !== -1 || indexOfLF !== -1) if (indexOfCR === -1 || indexOfLF !== -1 && indexOfLF < indexOfCR) {
					if (stringBuilder.length === 0) chunkBuilder.push(str.substring(from, indexOfLF));
					else {
						chunkBuilder.push(stringBuilder + str.substring(from, indexOfLF));
						stringBuilder = "";
					}
					from = indexOfLF + 1;
					indexOfLF = str.indexOf("\n", from);
				} else if (str.length === indexOfCR + 1) {
					midCRLF = true;
					indexOfCR = -1;
				} else if (indexOfLF === indexOfCR + 1) {
					if (stringBuilder.length === 0) chunkBuilder.push(str.substring(from, indexOfCR));
					else {
						stringBuilder = stringBuilder + str.substring(from, indexOfCR);
						chunkBuilder.push(stringBuilder);
						stringBuilder = "";
					}
					from = indexOfCR + 2;
					indexOfCR = str.indexOf("\r", from);
					indexOfLF = str.indexOf("\n", from);
				} else indexOfCR = str.indexOf("\r", indexOfCR + 1);
				if (midCRLF) stringBuilder = stringBuilder + str.substring(from, str.length - 1);
				else stringBuilder = stringBuilder + str.substring(from, str.length);
			}
		});
		return unsafeFromArray(chunkBuilder);
	};
	const loop = readWithCause({
		onInput: (input) => {
			const out = splitLinesChunk(input);
			return isEmpty$7(out) ? loop : flatMap$3(write$1(out), () => loop);
		},
		onFailure: (cause) => stringBuilder.length === 0 ? failCause$1(cause) : flatMap$3(write$1(of$1(stringBuilder)), () => failCause$1(cause)),
		onDone: (done) => stringBuilder.length === 0 ? succeed$1(done) : flatMap$3(write$1(of$1(stringBuilder)), () => succeed$1(done))
	});
	return loop;
});
/** @internal */
const toPullIn = /*#__PURE__*/ dual(2, (self, scope) => zip$1(sync$1(() => new ChannelExecutor(self, void 0, identity)), runtime()).pipe(tap(([executor, runtime]) => addFinalizerExit(scope, (exit) => {
	const finalizer = executor.close(exit);
	return finalizer !== void 0 ? provide(finalizer, runtime) : _void;
})), uninterruptible, map$2(([executor]) => suspend$5(() => interpretToPull(executor.run(), executor)))));
/** @internal */
const interpretToPull = (channelState, exec) => {
	const state = channelState;
	switch (state._tag) {
		case OP_DONE$1: return match$3(exec.getDone(), {
			onFailure: failCause$2,
			onSuccess: (done) => succeed$2(left(done))
		});
		case OP_EMIT$1: return succeed$2(right(exec.getEmit()));
		case OP_FROM_EFFECT: return pipe(state.effect, flatMap$4(() => interpretToPull(exec.run(), exec)));
		case OP_READ: return readUpstream(state, () => interpretToPull(exec.run(), exec), (cause) => failCause$2(cause));
	}
};
/** @internal */
const unwrap$2 = (channel) => flatten$4(fromEffect$4(channel));
/** @internal */
const unwrapScoped$4 = (self) => concatAllWith(scoped$1(self), (d, _) => d, (d, _) => d);
/** @internal */
const unwrapScopedWith = (f) => concatAllWith(scopedWith(f), (d, _) => d, (d, _) => d);
/** @internal */
const writeChunk = (outs) => writeChunkWriter(0, outs.length, outs);
/** @internal */
const writeChunkWriter = (idx, len, chunk) => {
	return idx === len ? void_$1 : pipe(write$1(pipe(chunk, unsafeGet(idx))), flatMap$3(() => writeChunkWriter(idx + 1, len, chunk)));
};
/** @internal */
const zip = /*#__PURE__*/ dual((args) => isChannel(args[1]), (self, that, options) => options?.concurrent ? mergeWith(self, {
	other: that,
	onSelfDone: (exit1) => Await((exit2) => suspend$5(() => zip$2(exit1, exit2))),
	onOtherDone: (exit2) => Await((exit1) => suspend$5(() => zip$2(exit1, exit2)))
}) : flatMap$3(self, (a) => map$1(that, (b) => [a, b])));
/** @internal */
const zipRight = /*#__PURE__*/ dual((args) => isChannel(args[1]), (self, that, options) => options?.concurrent ? map$1(zip(self, that, { concurrent: true }), (tuple) => tuple[1]) : flatMap$3(self, () => that));
/** @internal */
const ChannelExceptionTypeId = /*#__PURE__*/ Symbol.for("effect/Channel/ChannelException");
/** @internal */
const ChannelException = (error) => ({
	_tag: "ChannelException",
	[ChannelExceptionTypeId]: ChannelExceptionTypeId,
	error
});
/** @internal */
const isChannelException = (u) => hasProperty(u, ChannelExceptionTypeId);
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/rcRef.js
/** @internal */
const TypeId$10 = /*#__PURE__*/ Symbol.for("effect/RcRef");
const stateEmpty = { _tag: "Empty" };
const stateClosed = { _tag: "Closed" };
const variance$1 = {
	_A: identity,
	_E: identity
};
var RcRefImpl = class extends Class$1 {
	acquire;
	context;
	scope;
	idleTimeToLive;
	[TypeId$10] = variance$1;
	[TypeId$16] = TypeId$16;
	state = stateEmpty;
	semaphore = /*#__PURE__*/ unsafeMakeSemaphore$1(1);
	constructor(acquire, context, scope, idleTimeToLive) {
		super();
		this.acquire = acquire;
		this.context = context;
		this.scope = scope;
		this.idleTimeToLive = idleTimeToLive;
		this.get = get$1(this);
	}
	get;
	commit() {
		return this.get;
	}
};
/** @internal */
const make$12 = (options) => withFiberRuntime$1((fiber) => {
	const context = fiber.getFiberRef(currentContext$1);
	const scope = get$11(context, scopeTag);
	const ref = new RcRefImpl(options.acquire, context, scope, options.idleTimeToLive ? decode(options.idleTimeToLive) : void 0);
	return as$2(scope.addFinalizer(() => ref.semaphore.withPermits(1)(suspend$7(() => {
		const close = ref.state._tag === "Acquired" ? scopeClose(ref.state.scope, exitVoid$1) : void_$4;
		ref.state = stateClosed;
		return close;
	}))), ref);
});
/** @internal */
const get$1 = (self_) => {
	const self = self_;
	const isInfinite = self.idleTimeToLive && !isFinite(self.idleTimeToLive);
	return uninterruptibleMask$2((restore) => suspend$7(() => {
		switch (self.state._tag) {
			case "Closed": return interrupt$4;
			case "Acquired":
				self.state.refCount++;
				return self.state.fiber ? as$2(interruptFiber(self.state.fiber), self.state) : succeed$8(self.state);
			case "Empty": return scopeMake().pipe(bindTo("scope"), bind("value", ({ scope }) => restore(fiberRefLocally(self.acquire, currentContext$1, add$2(self.context, scopeTag, scope)))), map$6(({ scope, value }) => {
				const state = {
					_tag: "Acquired",
					value,
					scope,
					fiber: void 0,
					refCount: 1
				};
				self.state = state;
				return state;
			}));
		}
	})).pipe(self.semaphore.withPermits(1), bindTo("state"), bind("scope", () => scopeTag), tap$1(({ scope, state }) => scope.addFinalizer(() => suspend$7(() => {
		state.refCount--;
		if (state.refCount > 0 || isInfinite) return void_$4;
		if (self.idleTimeToLive === void 0) {
			self.state = stateEmpty;
			return scopeClose(state.scope, exitVoid$1);
		}
		return sleep(self.idleTimeToLive).pipe(interruptible$2, zipRight$3(suspend$7(() => {
			if (self.state._tag === "Acquired" && self.state.refCount === 0) {
				self.state = stateEmpty;
				return scopeClose(state.scope, exitVoid$1);
			}
			return void_$4;
		})), ensuring$3(sync$2(() => {
			state.fiber = void 0;
		})), forkIn$1(self.scope), tap$1((fiber) => {
			state.fiber = fiber;
		}), self.semaphore.withPermits(1));
	}))), map$6(({ state }) => state.value));
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/RcRef.js
/**
* Create an `RcRef` from an acquire `Effect`.
*
* An RcRef wraps a reference counted resource that can be acquired and released
* multiple times.
*
* The resource is lazily acquired on the first call to `get` and released when
* the last reference is released.
*
* @since 3.5.0
* @category constructors
* @example
* ```ts
* import { Effect, RcRef } from "effect"
*
* Effect.gen(function*() {
*   const ref = yield* RcRef.make({
*     acquire: Effect.acquireRelease(
*       Effect.succeed("foo"),
*       () => Effect.log("release foo")
*     )
*   })
*
*   // will only acquire the resource once, and release it
*   // when the scope is closed
*   yield* RcRef.get(ref).pipe(
*     Effect.andThen(RcRef.get(ref)),
*     Effect.scoped
*   )
* })
* ```
*/
const make$11 = make$12;
/**
* @since 3.5.0
* @category combinators
*/
const get = get$1;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Runtime.js
/**
* Executes the effect using the provided Scheduler or using the global
* Scheduler if not provided
*
* @since 2.0.0
* @category execution
*/
const runFork = unsafeFork;
/**
* Runs the `Effect`, returning a JavaScript `Promise` that will be resolved
* with the `Exit` state of the effect once the effect has been executed.
*
* This method is effectful and should only be used at the edges of your
* program.
*
* @since 2.0.0
* @category execution
*/
const runPromiseExit = unsafeRunPromiseExit;
/**
* @since 2.0.0
* @category context
*/
const updateContext = updateContext$1;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Schedule.js
/**
* Returns a schedule that recurs continuously, with each repetition
* spaced by the specified `duration` from the last run.
*
* **Details**
*
* This schedule ensures that executions occur at a fixed interval,
* maintaining a consistent delay between repetitions. The delay starts
* from the end of the last execution, not from the schedule start time.
*
* @see {@link fixed} If you need to run at a fixed interval from the start.
*
* @since 2.0.0
* @category Constructors
*/
const spaced = spaced$1;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/sink.js
/** @internal */
const SinkTypeId = /*#__PURE__*/ Symbol.for("effect/Sink");
const sinkVariance = {
	/* c8 ignore next */
	_A: (_) => _,
	/* c8 ignore next */
	_In: (_) => _,
	/* c8 ignore next */
	_L: (_) => _,
	/* c8 ignore next */
	_E: (_) => _,
	/* c8 ignore next */
	_R: (_) => _
};
/** @internal */
var SinkImpl = class {
	channel;
	[SinkTypeId] = sinkVariance;
	constructor(channel) {
		this.channel = channel;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const suspend$3 = (evaluate) => new SinkImpl(suspend$4(() => toChannel$3(evaluate())));
/** @internal */
const collectAll = () => new SinkImpl(collectAllLoop(empty$22()));
/** @internal */
const collectAllLoop = (acc) => readWithCause({
	onInput: (chunk) => collectAllLoop(pipe(acc, appendAll$1(chunk))),
	onFailure: failCause$1,
	onDone: () => succeed$1(acc)
});
/** @internal */
const drain$1 = /*#__PURE__*/ new SinkImpl(/*#__PURE__*/ drain$2(/*#__PURE__*/ identityChannel()));
/** @internal */
const fold = (s, contFn, f) => suspend$3(() => new SinkImpl(foldReader(s, contFn, f)));
/** @internal */
const foldReader = (s, contFn, f) => {
	if (!contFn(s)) return succeedNow(s);
	return readWith({
		onInput: (input) => {
			const [nextS, leftovers] = foldChunkSplit(s, input, contFn, f, 0, input.length);
			if (isNonEmpty$4(leftovers)) return pipe(write$1(leftovers), as(nextS));
			return foldReader(nextS, contFn, f);
		},
		onFailure: fail$1,
		onDone: () => succeedNow(s)
	});
};
/** @internal */
const foldChunkSplit = (s, chunk, contFn, f, index, length) => {
	if (index === length) return [s, empty$22()];
	const s1 = f(s, pipe(chunk, unsafeGet(index)));
	if (contFn(s1)) return foldChunkSplit(s1, chunk, contFn, f, index + 1, length);
	return [s1, pipe(chunk, drop(index + 1))];
};
/** @internal */
const foldChunks = (s, contFn, f) => suspend$3(() => new SinkImpl(foldChunksReader(s, contFn, f)));
/** @internal */
const foldChunksReader = (s, contFn, f) => {
	if (!contFn(s)) return succeedNow(s);
	return readWith({
		onInput: (input) => foldChunksReader(f(s, input), contFn, f),
		onFailure: fail$1,
		onDone: () => succeedNow(s)
	});
};
/** @internal */
const foldLeftChunks$1 = (s, f) => foldChunks(s, constTrue, f);
/** @internal */
const forEach$1 = (f) => {
	const process = readWithCause({
		onInput: (input) => pipe(fromEffect$4(forEach$2(input, (v) => f(v), { discard: true })), flatMap$3(() => process)),
		onFailure: failCause$1,
		onDone: () => void_$1
	});
	return new SinkImpl(process);
};
/** @internal */
const fromChannel$3 = (channel) => new SinkImpl(channel);
/** @internal */
const fromEffect$2 = (effect) => new SinkImpl(fromEffect$4(effect));
/** @internal */
const toChannel$3 = (self) => isEffect(self) ? toChannel$3(fromEffect$2(self)) : self.channel;
/** @internal */
const unwrapScoped$3 = (effect) => new SinkImpl(unwrapScoped$4(effect.pipe(map$2((sink) => toChannel$3(sink)))));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/mailbox.js
/** @internal */
const TypeId$9 = /*#__PURE__*/ Symbol.for("effect/Mailbox");
/** @internal */
const ReadonlyTypeId = /*#__PURE__*/ Symbol.for("effect/Mailbox/ReadonlyMailbox");
const empty$1 = /*#__PURE__*/ empty$22();
const exitEmpty = /*#__PURE__*/ exitSucceed$1(empty$1);
const exitFalse = /*#__PURE__*/ exitSucceed$1(false);
const exitTrue = /*#__PURE__*/ exitSucceed$1(true);
const constDone = [empty$1, true];
var MailboxImpl = class extends Class$1 {
	scheduler;
	capacity;
	strategy;
	[TypeId$9] = TypeId$9;
	[ReadonlyTypeId] = ReadonlyTypeId;
	state = {
		_tag: "Open",
		takers: /*#__PURE__*/ new Set(),
		offers: /*#__PURE__*/ new Set(),
		awaiters: /*#__PURE__*/ new Set()
	};
	messages = [];
	messagesChunk = /*#__PURE__*/ empty$22();
	constructor(scheduler, capacity, strategy) {
		super();
		this.scheduler = scheduler;
		this.capacity = capacity;
		this.strategy = strategy;
	}
	offer(message) {
		return suspend$7(() => {
			if (this.state._tag !== "Open") return exitFalse;
			else if (this.messages.length + this.messagesChunk.length >= this.capacity) switch (this.strategy) {
				case "dropping": return exitFalse;
				case "suspend":
					if (this.capacity <= 0 && this.state.takers.size > 0) {
						this.messages.push(message);
						this.releaseTaker();
						return exitTrue;
					}
					return this.offerRemainingSingle(message);
				case "sliding":
					this.unsafeTake();
					this.messages.push(message);
					return exitTrue;
			}
			this.messages.push(message);
			this.scheduleReleaseTaker();
			return exitTrue;
		});
	}
	unsafeOffer(message) {
		if (this.state._tag !== "Open") return false;
		else if (this.messages.length + this.messagesChunk.length >= this.capacity) {
			if (this.strategy === "sliding") {
				this.unsafeTake();
				this.messages.push(message);
				return true;
			} else if (this.capacity <= 0 && this.state.takers.size > 0) {
				this.messages.push(message);
				this.releaseTaker();
				return true;
			}
			return false;
		}
		this.messages.push(message);
		this.scheduleReleaseTaker();
		return true;
	}
	offerAll(messages) {
		return suspend$7(() => {
			if (this.state._tag !== "Open") return succeed$8(fromIterable$5(messages));
			const remaining = this.unsafeOfferAllArray(messages);
			if (remaining.length === 0) return exitEmpty;
			else if (this.strategy === "dropping") return succeed$8(unsafeFromArray(remaining));
			return this.offerRemainingArray(remaining);
		});
	}
	unsafeOfferAll(messages) {
		return unsafeFromArray(this.unsafeOfferAllArray(messages));
	}
	unsafeOfferAllArray(messages) {
		if (this.state._tag !== "Open") return fromIterable$6(messages);
		else if (this.capacity === Number.POSITIVE_INFINITY || this.strategy === "sliding") {
			if (this.messages.length > 0) this.messagesChunk = appendAll$1(this.messagesChunk, unsafeFromArray(this.messages));
			if (this.strategy === "sliding") this.messagesChunk = this.messagesChunk.pipe(appendAll$1(fromIterable$5(messages)), takeRight(this.capacity));
			else if (isChunk(messages)) this.messagesChunk = appendAll$1(this.messagesChunk, messages);
			else this.messages = fromIterable$6(messages);
			this.scheduleReleaseTaker();
			return [];
		}
		const free = this.capacity <= 0 ? this.state.takers.size : this.capacity - this.messages.length - this.messagesChunk.length;
		if (free === 0) return fromIterable$6(messages);
		const remaining = [];
		let i = 0;
		for (const message of messages) {
			if (i < free) this.messages.push(message);
			else remaining.push(message);
			i++;
		}
		this.scheduleReleaseTaker();
		return remaining;
	}
	fail(error) {
		return this.done(exitFail(error));
	}
	failCause(cause) {
		return this.done(exitFailCause$1(cause));
	}
	unsafeDone(exit) {
		if (this.state._tag !== "Open") return false;
		else if (this.state.offers.size === 0 && this.messages.length === 0 && this.messagesChunk.length === 0) {
			this.finalize(exit);
			return true;
		}
		this.state = {
			...this.state,
			_tag: "Closing",
			exit
		};
		return true;
	}
	shutdown = /*#__PURE__*/ sync$2(() => {
		if (this.state._tag === "Done") return true;
		this.messages = [];
		this.messagesChunk = empty$1;
		const offers = this.state.offers;
		this.finalize(this.state._tag === "Open" ? exitVoid$1 : this.state.exit);
		if (offers.size > 0) {
			for (const entry of offers) if (entry._tag === "Single") entry.resume(exitFalse);
			else entry.resume(exitSucceed$1(unsafeFromArray(entry.remaining.slice(entry.offset))));
			offers.clear();
		}
		return true;
	});
	done(exit) {
		return sync$2(() => this.unsafeDone(exit));
	}
	end = /*#__PURE__*/ this.done(exitVoid$1);
	clear = /*#__PURE__*/ suspend$7(() => {
		if (this.state._tag === "Done") return exitAs(this.state.exit, empty$1);
		const messages = this.unsafeTakeAll();
		this.releaseCapacity();
		return succeed$8(messages);
	});
	takeAll = /*#__PURE__*/ suspend$7(() => {
		if (this.state._tag === "Done") return exitAs(this.state.exit, constDone);
		const messages = this.unsafeTakeAll();
		if (messages.length === 0) return zipRight$3(this.awaitTake, this.takeAll);
		return succeed$8([messages, this.releaseCapacity()]);
	});
	takeN(n) {
		return suspend$7(() => {
			if (this.state._tag === "Done") return exitAs(this.state.exit, constDone);
			else if (n <= 0) return succeed$8([empty$1, false]);
			else if (this.capacity <= 0 && this.messages.length === 0 && this.messagesChunk.length === 0 && this.state.offers.size > 0) {
				this.capacity = 1;
				this.releaseCapacity();
				this.capacity = 0;
				const messages = of$1(this.messages.pop());
				return succeed$8([messages, this.releaseCapacity()]);
			}
			n = Math.min(n, this.capacity || 1);
			let messages;
			if (n <= this.messagesChunk.length) {
				messages = take$4(this.messagesChunk, n);
				this.messagesChunk = drop(this.messagesChunk, n);
			} else if (n <= this.messages.length + this.messagesChunk.length) {
				this.messagesChunk = appendAll$1(this.messagesChunk, unsafeFromArray(this.messages));
				this.messages = [];
				messages = take$4(this.messagesChunk, n);
				this.messagesChunk = drop(this.messagesChunk, n);
			} else return zipRight$3(this.awaitTake, this.takeN(n));
			return succeed$8([messages, this.releaseCapacity()]);
		});
	}
	unsafeTake() {
		if (this.state._tag === "Done") return exitZipRight(this.state.exit, exitFail(new NoSuchElementException()));
		let message;
		if (this.messagesChunk.length > 0) {
			message = unsafeHead(this.messagesChunk);
			this.messagesChunk = drop(this.messagesChunk, 1);
		} else if (this.messages.length > 0) {
			message = this.messages[0];
			this.messagesChunk = drop(unsafeFromArray(this.messages), 1);
			this.messages = [];
		} else if (this.capacity <= 0 && this.state.offers.size > 0) {
			this.capacity = 1;
			this.releaseCapacity();
			this.capacity = 0;
			const message = this.messages.pop();
			this.releaseCapacity();
			return exitSucceed$1(message);
		} else return;
		this.releaseCapacity();
		return exitSucceed$1(message);
	}
	take = /*#__PURE__*/ suspend$7(() => this.unsafeTake() ?? zipRight$3(this.awaitTake, this.take));
	await = /*#__PURE__*/ asyncInterrupt((resume) => {
		if (this.state._tag === "Done") return resume(this.state.exit);
		this.state.awaiters.add(resume);
		return sync$2(() => {
			if (this.state._tag !== "Done") this.state.awaiters.delete(resume);
		});
	});
	unsafeSize() {
		const size = this.messages.length + this.messagesChunk.length;
		return this.state._tag === "Done" ? none$4() : some(size);
	}
	size = /*#__PURE__*/ sync$2(() => this.unsafeSize());
	commit() {
		return this.takeAll;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
	toJSON() {
		return {
			_id: "effect/Mailbox",
			state: this.state._tag,
			size: this.unsafeSize().toJSON()
		};
	}
	toString() {
		return format$4(this);
	}
	[NodeInspectSymbol]() {
		return format$4(this);
	}
	offerRemainingSingle(message) {
		return asyncInterrupt((resume) => {
			if (this.state._tag !== "Open") return resume(exitFalse);
			const entry = {
				_tag: "Single",
				message,
				resume
			};
			this.state.offers.add(entry);
			return sync$2(() => {
				if (this.state._tag === "Open") this.state.offers.delete(entry);
			});
		});
	}
	offerRemainingArray(remaining) {
		return asyncInterrupt((resume) => {
			if (this.state._tag !== "Open") return resume(exitSucceed$1(unsafeFromArray(remaining)));
			const entry = {
				_tag: "Array",
				remaining,
				offset: 0,
				resume
			};
			this.state.offers.add(entry);
			return sync$2(() => {
				if (this.state._tag === "Open") this.state.offers.delete(entry);
			});
		});
	}
	releaseCapacity() {
		if (this.state._tag === "Done") return this.state.exit._tag === "Success";
		else if (this.state.offers.size === 0) {
			if (this.state._tag === "Closing" && this.messages.length === 0 && this.messagesChunk.length === 0) {
				this.finalize(this.state.exit);
				return this.state.exit._tag === "Success";
			}
			return false;
		}
		let n = this.capacity - this.messages.length - this.messagesChunk.length;
		for (const entry of this.state.offers) if (n === 0) return false;
		else if (entry._tag === "Single") {
			this.messages.push(entry.message);
			n--;
			entry.resume(exitTrue);
			this.state.offers.delete(entry);
		} else {
			for (; entry.offset < entry.remaining.length; entry.offset++) {
				if (n === 0) return false;
				this.messages.push(entry.remaining[entry.offset]);
				n--;
			}
			entry.resume(exitEmpty);
			this.state.offers.delete(entry);
		}
		return false;
	}
	awaitTake = /*#__PURE__*/ asyncInterrupt((resume) => {
		if (this.state._tag === "Done") return resume(this.state.exit);
		this.state.takers.add(resume);
		return sync$2(() => {
			if (this.state._tag !== "Done") this.state.takers.delete(resume);
		});
	});
	scheduleRunning = false;
	scheduleReleaseTaker() {
		if (this.scheduleRunning) return;
		this.scheduleRunning = true;
		this.scheduler.scheduleTask(this.releaseTaker, 0);
	}
	releaseTaker = () => {
		this.scheduleRunning = false;
		if (this.state._tag === "Done") return;
		else if (this.state.takers.size === 0) return;
		for (const taker of this.state.takers) {
			this.state.takers.delete(taker);
			taker(exitVoid$1);
			if (this.messages.length + this.messagesChunk.length === 0) break;
		}
	};
	unsafeTakeAll() {
		if (this.messagesChunk.length > 0) {
			const messages = this.messages.length > 0 ? appendAll$1(this.messagesChunk, unsafeFromArray(this.messages)) : this.messagesChunk;
			this.messagesChunk = empty$1;
			this.messages = [];
			return messages;
		} else if (this.messages.length > 0) {
			const messages = unsafeFromArray(this.messages);
			this.messages = [];
			return messages;
		} else if (this.state._tag !== "Done" && this.state.offers.size > 0) {
			this.capacity = 1;
			this.releaseCapacity();
			this.capacity = 0;
			return of$1(this.messages.pop());
		}
		return empty$1;
	}
	finalize(exit) {
		if (this.state._tag === "Done") return;
		const openState = this.state;
		this.state = {
			_tag: "Done",
			exit
		};
		for (const taker of openState.takers) taker(exit);
		openState.takers.clear();
		for (const awaiter of openState.awaiters) awaiter(exit);
		openState.awaiters.clear();
	}
};
/** @internal */
const make$10 = (capacity) => withFiberRuntime$1((fiber) => succeed$8(new MailboxImpl(fiber.currentScheduler, typeof capacity === "number" ? capacity : capacity?.capacity ?? Number.POSITIVE_INFINITY, typeof capacity === "number" ? "suspend" : capacity?.strategy ?? "suspend")));
/** @internal */
const toChannel$2 = (self) => {
	const loop = flatMap$3(self.takeAll, ([messages, done]) => done ? messages.length === 0 ? void_$1 : write$1(messages) : zipRight(write$1(messages), loop));
	return loop;
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/stream/emit.js
/** @internal */
const make$9 = (emit) => {
	return Object.assign(emit, {
		chunk(as) {
			return this(succeed$2(as));
		},
		die(defect) {
			return this(die$1(defect));
		},
		dieMessage(message) {
			return this(dieMessage(message));
		},
		done(exit) {
			return this(suspend$5(() => mapBoth$2(exit, {
				onFailure: some,
				onSuccess: of$1
			})));
		},
		end() {
			return this(fail$2(none$4()));
		},
		fail(e) {
			return this(fail$2(some(e)));
		},
		fromEffect(effect) {
			return this(mapBoth$1(effect, {
				onFailure: some,
				onSuccess: of$1
			}));
		},
		fromEffectChunk(effect) {
			return this(pipe(effect, mapError$1(some)));
		},
		halt(cause) {
			return this(failCause$2(pipe(cause, map$4(some))));
		},
		single(value) {
			return this(succeed$2(of$1(value)));
		}
	});
};
/** @internal */
const TakeTypeId = /*#__PURE__*/ Symbol.for("effect/Take");
const takeVariance = {
	/* c8 ignore next */
	_A: (_) => _,
	/* c8 ignore next */
	_E: (_) => _
};
/** @internal */
var TakeImpl = class {
	exit;
	[TakeTypeId] = takeVariance;
	constructor(exit) {
		this.exit = exit;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const chunk = (chunk) => new TakeImpl(succeed$6(chunk));
/** @internal */
const done = (self) => suspend$5(() => self.exit);
/** @internal */
const end$1 = /*#__PURE__*/ new TakeImpl(/*#__PURE__*/ fail$5(/*#__PURE__*/ none$4()));
/** @internal */
const failCause = (cause) => new TakeImpl(failCause$4(pipe(cause, map$4(some))));
/** @internal */
const fromPull = (pull) => matchCause(pull, {
	onFailure: (cause) => match$9(flipCauseOption(cause), {
		onNone: () => end$1,
		onSome: failCause
	}),
	onSuccess: chunk
});
/** @internal */
const match = /*#__PURE__*/ dual(2, (self, { onEnd, onFailure, onSuccess }) => match$3(self.exit, {
	onFailure: (cause) => match$9(flipCauseOption(cause), {
		onNone: onEnd,
		onSome: onFailure
	}),
	onSuccess
}));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/stream/pull.js
/** @internal */
const end = () => fail$2(none$4());
/** @internal */
const StreamTypeId = /*#__PURE__*/ Symbol.for("effect/Stream");
/** @internal */
const streamVariance = {
	_R: (_) => _,
	_E: (_) => _,
	_A: (_) => _
};
/** @internal */
var StreamImpl = class {
	channel;
	[StreamTypeId] = streamVariance;
	constructor(channel) {
		this.channel = channel;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const isStream = (u) => hasProperty(u, StreamTypeId) || isEffect(u);
const queueFromBufferOptions = (bufferSize) => {
	if (bufferSize === "unbounded") return unbounded();
	else if (typeof bufferSize === "number" || bufferSize === void 0) return bounded(bufferSize ?? 16);
	switch (bufferSize.strategy) {
		case "dropping": return dropping(bufferSize.bufferSize ?? 16);
		case "sliding": return sliding(bufferSize.bufferSize ?? 16);
		default: return bounded(bufferSize.bufferSize ?? 16);
	}
};
/** @internal */
const asyncScoped$1 = (register, bufferSize) => pipe(acquireRelease(queueFromBufferOptions(bufferSize), (queue) => shutdown(queue)), flatMap$4((output) => pipe(runtime(), flatMap$4((runtime) => pipe(register(make$9((k) => pipe(fromPull(k), flatMap$4((take) => offer(output, take)), asVoid, runPromiseExit(runtime)).then((exit) => {
	if (isFailure(exit)) {
		if (!isInterrupted(exit.cause)) throw squash(exit.cause);
	}
}))), zipRight$1(make$28(false)), flatMap$4((ref) => pipe(get$3(ref), map$2((isDone) => isDone ? end() : pipe(take$2(output), flatMap$4(done), onError(() => pipe(set$1(ref, true), zipRight$1(shutdown(output)))))))))))), scoped, flatMap$2(repeatEffectChunkOption));
/** @internal */
const bufferChunks$1 = /*#__PURE__*/ dual(2, (self, options) => {
	if (options.strategy === "dropping") return bufferChunksDropping(self, options.capacity);
	else if (options.strategy === "sliding") return bufferChunksSliding(self, options.capacity);
	const queue = toQueue(self, options);
	return new StreamImpl(unwrapScoped$4(map$2(queue, (queue) => {
		const process = pipe(fromEffect$4(take$2(queue)), flatMap$3(match({
			onEnd: () => void_$1,
			onFailure: failCause$1,
			onSuccess: (value) => pipe(write$1(value), flatMap$3(() => process))
		})));
		return process;
	})));
});
const bufferChunksDropping = /*#__PURE__*/ dual(2, (self, capacity) => {
	const queue = acquireRelease(dropping(capacity), (queue) => shutdown(queue));
	return new StreamImpl(bufferSignal(queue, toChannel$1(self)));
});
const bufferChunksSliding = /*#__PURE__*/ dual(2, (self, capacity) => {
	const queue = acquireRelease(sliding(capacity), (queue) => shutdown(queue));
	return new StreamImpl(bufferSignal(queue, toChannel$1(self)));
});
const bufferSignal = (scoped, bufferChannel) => {
	const producer = (queue, ref) => {
		const terminate = (take) => pipe(get$3(ref), tap(_await), zipRight$1(make$16()), flatMap$4((deferred) => pipe(offer(queue, [take, deferred]), zipRight$1(set$1(ref, deferred)), zipRight$1(_await(deferred)))), asVoid, fromEffect$4);
		return readWithCause({
			onInput: (input) => pipe(make$16(), flatMap$4((deferred) => pipe(offer(queue, [chunk(input), deferred]), flatMap$4((added) => pipe(set$1(ref, deferred), when$2(() => added))))), asVoid, fromEffect$4, flatMap$3(() => producer(queue, ref))),
			onFailure: (error) => terminate(failCause(error)),
			onDone: () => terminate(end$1)
		});
	};
	const consumer = (queue) => {
		const process = pipe(fromEffect$4(take$2(queue)), flatMap$3(([take, deferred]) => zipRight(fromEffect$4(succeed$4(deferred, void 0)), match(take, {
			onEnd: () => void_$1,
			onFailure: failCause$1,
			onSuccess: (value) => pipe(write$1(value), flatMap$3(() => process))
		}))));
		return process;
	};
	return unwrapScoped$4(pipe(scoped, flatMap$4((queue) => pipe(make$16(), tap((start) => succeed$4(start, void 0)), flatMap$4((start) => pipe(make$28(start), flatMap$4((ref) => pipe(bufferChannel, pipeTo$1(producer(queue, ref)), runScoped, forkScoped)), as$1(consumer(queue))))))));
};
/** @internal */
const die = (defect) => fromEffect$1(die$1(defect));
/** @internal */
const flatMap$2 = /*#__PURE__*/ dual((args) => isStream(args[0]), (self, f, options) => {
	const bufferSize = options?.bufferSize ?? 16;
	if (options?.switch) return matchConcurrency(options?.concurrency, () => flatMapParSwitchBuffer(self, 1, bufferSize, f), (n) => flatMapParSwitchBuffer(self, n, bufferSize, f));
	return matchConcurrency(options?.concurrency, () => new StreamImpl(concatMap(toChannel$1(self), (as) => pipe(as, map$10((a) => toChannel$1(f(a))), reduce$8(void_$1, (left, right) => pipe(left, zipRight(right)))))), (_) => new StreamImpl(pipe(toChannel$1(self), concatMap(writeChunk), mergeMap((out) => toChannel$1(f(out)), options))));
});
/** @internal */
const matchConcurrency = (concurrency, sequential, bounded) => {
	switch (concurrency) {
		case void 0: return sequential();
		case "unbounded": return bounded(Number.MAX_SAFE_INTEGER);
		default: return concurrency > 1 ? bounded(concurrency) : sequential();
	}
};
const flatMapParSwitchBuffer = /*#__PURE__*/ dual(4, (self, n, bufferSize, f) => new StreamImpl(pipe(toChannel$1(self), concatMap(writeChunk), mergeMap((out) => toChannel$1(f(out)), {
	concurrency: n,
	mergeStrategy: BufferSliding(),
	bufferSize
}))));
/** @internal */
const flatten$3 = /*#__PURE__*/ dual((args) => isStream(args[0]), (self, options) => flatMap$2(self, identity, options));
/** @internal */
const fromChannel$2 = (channel) => new StreamImpl(channel);
/** @internal */
const toChannel$1 = (stream) => {
	if ("channel" in stream) return stream.channel;
	else if (isEffect(stream)) return toChannel$1(fromEffect$1(stream));
	else throw new TypeError(`Expected a Stream.`);
};
/** @internal */
const fromEffect$1 = (effect) => pipe(effect, mapError$1(some), fromEffectOption);
/** @internal */
const fromEffectOption = (effect) => new StreamImpl(unwrap$2(match$2(effect, {
	onFailure: match$9({
		onNone: () => void_$1,
		onSome: fail$1
	}),
	onSuccess: (a) => write$1(of$1(a))
})));
/** @internal */
const mapChunks$1 = /*#__PURE__*/ dual(2, (self, f) => new StreamImpl(pipe(toChannel$1(self), mapOut(f))));
/** @internal */
const pipeThroughChannel = /*#__PURE__*/ dual(2, (self, channel) => new StreamImpl(pipeTo$1(toChannel$1(self), channel)));
/** @internal */
const repeatEffectChunkOption = (effect) => unfoldChunkEffect(effect, (effect) => pipe(map$2(effect, (chunk) => some([chunk, effect])), catchAll(match$9({
	onNone: () => succeed$2(none$4()),
	onSome: fail$2
}))));
/** @internal */
const run$1 = /*#__PURE__*/ dual(2, (self, sink) => toChannel$1(self).pipe(pipeToOrFail(toChannel$3(sink)), runDrain));
/** @internal */
const runCollect$1 = (self) => run$1(self, collectAll());
/** @internal */
const runFold$1 = /*#__PURE__*/ dual(3, (self, s, f) => runFoldWhile(self, s, constTrue, f));
/** @internal */
const runFoldWhile = /*#__PURE__*/ dual(4, (self, s, cont, f) => run$1(self, fold(s, cont, f)));
/** @internal */
const runIntoQueueScoped = /*#__PURE__*/ dual(2, (self, queue) => {
	const writer = readWithCause({
		onInput: (input) => flatMap$3(write$1(chunk(input)), () => writer),
		onFailure: (cause) => write$1(failCause(cause)),
		onDone: () => write$1(end$1)
	});
	return pipe(pipeTo$1(toChannel$1(self), writer), mapOutEffect((take) => offer(queue, take)), drain$2, runScoped, asVoid);
});
/** @internal */
const scoped = (effect) => new StreamImpl(ensuring$1(scoped$1(pipe(effect, map$2(of$1))), _void));
/** @internal */
const splitLines$1 = (self) => pipeThroughChannel(self, splitLines$2());
/** @internal */
const suspend$2 = (stream) => new StreamImpl(suspend$4(() => toChannel$1(stream())));
/** @internal */
const take$1 = /*#__PURE__*/ dual(2, (self, n) => {
	if (!Number.isInteger(n)) return die(new IllegalArgumentException(`${n} must be an integer`));
	const loop = (n) => readWith({
		onInput: (input) => {
			const taken = pipe(input, take$4(Math.min(n, Number.POSITIVE_INFINITY)));
			const leftover = Math.max(0, n - taken.length);
			if (leftover > 0) return pipe(write$1(taken), flatMap$3(() => loop(leftover)));
			return write$1(taken);
		},
		onFailure: fail$1,
		onDone: succeed$1
	});
	return new StreamImpl(pipe(toChannel$1(self), pipeToOrFail(0 < n ? loop(n) : void_$1)));
});
/** @internal */
const toQueue = /*#__PURE__*/ dual((args) => isStream(args[0]), (self, options) => tap(acquireRelease(options?.strategy === "unbounded" ? unbounded() : options?.strategy === "dropping" ? dropping(options.capacity ?? 2) : options?.strategy === "sliding" ? sliding(options.capacity ?? 2) : bounded(options?.capacity ?? 2), (queue) => shutdown(queue)), (queue) => forkScoped(runIntoQueueScoped(self, queue))));
/** @internal */
const transduce$1 = /*#__PURE__*/ dual(2, (self, sink) => {
	return new StreamImpl(suspend$4(() => {
		const leftovers = { ref: empty$22() };
		const upstreamDone = { ref: false };
		const buffer = suspend$4(() => {
			const leftover = leftovers.ref;
			if (isEmpty$7(leftover)) return readWith({
				onInput: (input) => pipe(write$1(input), flatMap$3(() => buffer)),
				onFailure: fail$1,
				onDone: succeedNow
			});
			leftovers.ref = empty$22();
			return pipe(writeChunk(leftover), flatMap$3(() => buffer));
		});
		const concatAndGet = (chunk) => {
			const leftover = leftovers.ref;
			const concatenated = appendAll$1(leftover, filter$1(chunk, (chunk) => chunk.length !== 0));
			leftovers.ref = concatenated;
			return concatenated;
		};
		const upstreamMarker = readWith({
			onInput: (input) => flatMap$3(write$1(input), () => upstreamMarker),
			onFailure: fail$1,
			onDone: (done) => zipRight(sync(() => {
				upstreamDone.ref = true;
			}), succeedNow(done))
		});
		const transducer = pipe(sink, toChannel$3, collectElements, flatMap$3(([leftover, z]) => pipe(succeed$1([upstreamDone.ref, concatAndGet(leftover)]), flatMap$3(([done, newLeftovers]) => {
			const nextChannel = done && isEmpty$7(newLeftovers) ? void_$1 : transducer;
			return pipe(write$1(of$1(z)), flatMap$3(() => nextChannel));
		}))));
		return pipe(toChannel$1(self), pipeTo$1(upstreamMarker), pipeTo$1(buffer), pipeToOrFail(transducer));
	}));
});
/** @internal */
const unfoldChunkEffect = (s, f) => suspend$2(() => {
	const loop = (s) => unwrap$2(map$2(f(s), match$9({
		onNone: () => void_$1,
		onSome: ([chunk, s]) => flatMap$3(write$1(chunk), () => loop(s))
	})));
	return new StreamImpl(loop(s));
});
/** @internal */
const unwrap$1 = (effect) => flatten$3(fromEffect$1(effect));
/** @internal */
const unwrapScoped$2 = (effect) => flatten$3(scoped(effect));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Stream.js
/**
* Creates a stream from an asynchronous callback that can be called multiple
* times. The registration of the callback itself returns an a scoped
* resource. The optionality of the error type `E` can be used to signal the
* end of the stream, by setting it to `None`.
*
* @since 2.0.0
* @category constructors
*/
const asyncScoped = asyncScoped$1;
/**
* Allows a faster producer to progress independently of a slower consumer by
* buffering up to `capacity` chunks in a queue.
*
* @note Prefer capacities that are powers of 2 for better performance.
* @since 2.0.0
* @category utils
*/
const bufferChunks = bufferChunks$1;
/**
* Creates a stream from a `Channel`.
*
* @since 2.0.0
* @category constructors
*/
const fromChannel$1 = fromChannel$2;
/**
* Transforms the chunks emitted by this stream.
*
* @since 2.0.0
* @category mapping
*/
const mapChunks = mapChunks$1;
/**
* Runs the sink on the stream to produce either the sink's result or an error.
*
* @since 2.0.0
* @category destructors
*/
const run = run$1;
/**
* Runs the stream and collects all of its elements to a chunk.
*
* @since 2.0.0
* @category destructors
*/
const runCollect = runCollect$1;
/**
* Executes a pure fold over the stream of values - reduces all elements in
* the stream to a value of type `S`.
*
* @since 2.0.0
* @category destructors
*/
const runFold = runFold$1;
/**
* Splits strings on newlines. Handles both Windows newlines (`\r\n`) and UNIX
* newlines (`\n`).
*
* @since 2.0.0
* @category combinators
*/
const splitLines = splitLines$1;
/**
* Takes the specified number of elements from this stream.
*
* @example
* ```ts
* import { Effect, Stream } from "effect"
*
* const stream = Stream.take(Stream.iterate(0, (n) => n + 1), 5)
*
* Effect.runPromise(Stream.runCollect(stream)).then(console.log)
* // { _id: 'Chunk', values: [ 0, 1, 2, 3, 4 ] }
* ```
*
* @since 2.0.0
* @category utils
*/
const take = take$1;
/**
* Applies the transducer to the stream and emits its outputs.
*
* @since 2.0.0
* @category utils
*/
const transduce = transduce$1;
/**
* Creates a stream produced from an `Effect`.
*
* @since 2.0.0
* @category constructors
*/
const unwrap = unwrap$1;
/**
* Creates a stream produced from a scoped `Effect`.
*
* @since 2.0.0
* @category constructors
*/
const unwrapScoped$1 = unwrapScoped$2;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Brand.js
/**
* @since 2.0.0
* @category symbols
*/
const RefinedConstructorsTypeId = /*#__PURE__*/ Symbol.for("effect/Brand/Refined");
/**
* This function returns a `Brand.Constructor` that **does not apply any runtime checks**, it just returns the provided value.
* It can be used to create nominal types that allow distinguishing between two values of the same type but with different meanings.
*
* If you also want to perform some validation, see {@link refined}.
*
* **Example**
*
* ```ts
* import * as assert from "node:assert"
* import { Brand } from "effect"
*
* type UserId = number & Brand.Brand<"UserId">
*
* const UserId = Brand.nominal<UserId>()
*
* console.log(UserId(1))
* // 1
* ```
*
* @since 2.0.0
* @category constructors
*/
const nominal = () => {
	return Object.assign((args) => args, {
		[RefinedConstructorsTypeId]: RefinedConstructorsTypeId,
		option: (args) => some(args),
		either: (args) => right(args),
		is: (_args) => true
	});
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Sink.js
/**
* A sink that ignores its inputs.
*
* @since 2.0.0
* @category constructors
*/
const drain = drain$1;
/**
* A sink that folds its input chunks with the provided function and initial
* state. `f` must preserve chunking-invariance.
*
* @since 2.0.0
* @category constructors
*/
const foldLeftChunks = foldLeftChunks$1;
/**
* A sink that executes the provided effectful function for every element fed
* to it.
*
* @since 2.0.0
* @category constructors
*/
const forEach = forEach$1;
/**
* Creates a sink from a `Channel`.
*
* @since 2.0.0
* @category constructors
*/
const fromChannel = fromChannel$3;
/**
* Creates a sink produced from a scoped effect.
*
* @since 2.0.0
* @category constructors
*/
const unwrapScoped = unwrapScoped$3;
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform@0.97.1_effect@3.22.1/node_modules/@effect/platform/dist/esm/internal/commandExecutor.js
/** @internal */
const TypeId$8 = /*#__PURE__*/ Symbol.for("@effect/platform/CommandExecutor");
/** @internal */
const ProcessTypeId$1 = /*#__PURE__*/ Symbol.for("@effect/platform/Process");
/** @internal */
const ExitCode$1 = /*#__PURE__*/ nominal();
/** @internal */
const ProcessId$1 = /*#__PURE__*/ nominal();
/** @internal */
const CommandExecutor$1 = /*#__PURE__*/ GenericTag("@effect/platform/CommandExecutor");
/** @internal */
const makeExecutor$1 = (start) => {
	const stream = (command) => unwrapScoped$1(map$2(start(command), (process) => process.stdout));
	const streamLines = (command, encoding) => {
		const decoder = new TextDecoder(encoding);
		return splitLines(mapChunks(stream(command), map$10((bytes) => decoder.decode(bytes))));
	};
	return {
		[TypeId$8]: TypeId$8,
		start,
		exitCode: (command) => scoped$2(flatMap$4(start(command), (process) => process.exitCode)),
		stream,
		string: (command, encoding = "utf-8") => {
			const decoder = new TextDecoder(encoding);
			return pipe(start(command), flatMap$4((process) => run(process.stdout, collectUint8Array)), map$2((bytes) => decoder.decode(bytes)), scoped$2);
		},
		lines: (command, encoding = "utf-8") => {
			return pipe(streamLines(command, encoding), runCollect, map$2(toArray$1));
		},
		streamLines
	};
};
const collectUint8Array = /*#__PURE__*/ foldLeftChunks(/*#__PURE__*/ new Uint8Array(), (bytes, chunk) => reduce$8(chunk, bytes, (acc, curr) => {
	const newArray = new Uint8Array(acc.length + curr.length);
	newArray.set(acc);
	newArray.set(curr, acc.length);
	return newArray;
}));
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform@0.97.1_effect@3.22.1/node_modules/@effect/platform/dist/esm/internal/command.js
/** @internal */
const CommandTypeId = /*#__PURE__*/ Symbol.for("@effect/platform/Command");
/** @internal */
const isCommand = (u) => typeof u === "object" && u != null && CommandTypeId in u;
/** @internal */
const env$1 = /*#__PURE__*/ dual((args) => isCommand(args[0]), (self, environment, options) => {
	switch (self._tag) {
		case "StandardCommand": return makeStandard({
			...self,
			extendEnv: options?.extendEnv ?? self.extendEnv,
			env: union(self.env, fromIterable$1(Object.entries(environment).filter(([, value]) => value !== void 0)))
		});
		case "PipedCommand": return pipeTo(env$1(self.left, environment, options), env$1(self.right, environment, options));
	}
});
/** @internal */
const flatten$2 = (self) => Array.from(flattenLoop(self));
/** @internal */
const flattenLoop = (self) => {
	switch (self._tag) {
		case "StandardCommand": return of$1(self);
		case "PipedCommand": return appendAll$1(flattenLoop(self.left), flattenLoop(self.right));
	}
};
const Proto$1 = {
	[CommandTypeId]: CommandTypeId,
	pipe() {
		return pipeArguments(this, arguments);
	},
	...BaseProto
};
const StandardProto = {
	...Proto$1,
	_tag: "StandardCommand",
	toJSON() {
		return {
			_id: "@effect/platform/Command",
			_tag: this._tag,
			command: this.command,
			args: this.args,
			env: Object.fromEntries(this.env),
			extendEnv: this.extendEnv,
			cwd: this.cwd.toJSON(),
			shell: this.shell,
			gid: this.gid.toJSON(),
			uid: this.uid.toJSON()
		};
	}
};
const makeStandard = (options) => Object.assign(Object.create(StandardProto), options);
const PipedProto = {
	...Proto$1,
	_tag: "PipedCommand",
	toJSON() {
		return {
			_id: "@effect/platform/Command",
			_tag: this._tag,
			left: this.left.toJSON(),
			right: this.right.toJSON()
		};
	}
};
const makePiped = (options) => Object.assign(Object.create(PipedProto), options);
/** @internal */
const make$8 = (command, ...args) => makeStandard({
	command,
	args,
	env: empty$18(),
	extendEnv: true,
	cwd: none$4(),
	shell: false,
	stdin: "pipe",
	stdout: "pipe",
	stderr: "pipe",
	gid: none$4(),
	uid: none$4()
});
/** @internal */
const pipeTo = /*#__PURE__*/ dual(2, (self, into) => makePiped({
	left: self,
	right: into
}));
/** @internal */
const stdin$1 = /*#__PURE__*/ dual(2, (self, input) => {
	switch (self._tag) {
		case "StandardCommand": return makeStandard({
			...self,
			stdin: input
		});
		case "PipedCommand": return makePiped({
			...self,
			left: stdin$1(self.left, input)
		});
	}
});
/** @internal */
const workingDirectory$1 = /*#__PURE__*/ dual(2, (self, cwd) => {
	switch (self._tag) {
		case "StandardCommand": return makeStandard({
			...self,
			cwd: some(cwd)
		});
		case "PipedCommand": return pipeTo(workingDirectory$1(self.left, cwd), workingDirectory$1(self.right, cwd));
	}
});
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform@0.97.1_effect@3.22.1/node_modules/@effect/platform/dist/esm/Command.js
/**
* Specify the environment variables that will be used when running this command.
*
* By default, the configured variables extend the parent process environment.
* Set `extendEnv` to `false` to use only the configured variables.
*
* @since 1.0.0
* @category combinators
*/
const env = env$1;
/**
* Flatten this command to a non-empty array of standard commands.
*
* For a `StandardCommand`, this simply returns a `1` element array
* For a `PipedCommand`, all commands in the pipe will be extracted out into
* a array from left to right
*
* @since 1.0.0
* @category combinators
*/
const flatten$1 = flatten$2;
/**
* Create a command with the specified process name and an optional list of
* arguments.
*
* @since 1.0.0
* @category constructors
*/
const make$7 = make$8;
/**
* Specify the standard input stream for a command.
*
* @since 1.0.0
* @category combinators
*/
const stdin = stdin$1;
/**
* Set the working directory that will be used when this command will be run.
*
* For piped commands, the working directory of each command will be set to the
* specified working directory.
*
* @since 1.0.0
* @category combinators
*/
const workingDirectory = workingDirectory$1;
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform@0.97.1_effect@3.22.1/node_modules/@effect/platform/dist/esm/CommandExecutor.js
/**
* @since 1.0.0
* @category tags
*/
const CommandExecutor = CommandExecutor$1;
/**
* @since 1.0.0
* @category symbols
*/
const ProcessTypeId = ProcessTypeId$1;
/**
* @since 1.0.0
* @category constructors
*/
const ExitCode = ExitCode$1;
/**
* @since 1.0.0
* @category constructors
*/
const ProcessId = ProcessId$1;
/**
* @since 1.0.0
* @category constructors
*/
const makeExecutor = makeExecutor$1;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Channel.js
/**
* @since 2.0.0
* @category constructors
*/
const acquireUseRelease = acquireUseRelease$1;
/**
* Returns a new channel which connects the given `AsyncInputProducer` as
* this channel's input.
*
* @since 2.0.0
* @category utils
*/
const embedInput = embedInput$1;
/**
* Returns a new channel with an attached finalizer. The finalizer is
* guaranteed to be executed so long as the channel begins execution (and
* regardless of whether or not it completes).
*
* @since 2.0.0
* @category utils
*/
const ensuring = ensuring$1;
/**
* Returns a new channel, which sequentially combines this channel, together
* with the provided factory function, which creates a second channel based on
* the terminal value of this channel. The result is a channel that will first
* perform the functions of this channel, before performing the functions of
* the created channel (including yielding its terminal value).
*
* @since 2.0.0
* @category sequencing
*/
const flatMap$1 = flatMap$3;
/**
* Use an effect to end a channel.
*
* @since 2.0.0
* @category constructors
*/
const fromEffect = fromEffect$4;
/**
* Lazily constructs a channel from the given side effect.
*
* @since 2.0.0
* @category constructors
*/
const suspend$1 = suspend$4;
const void_ = void_$1;
/**
* Writes a single value to the channel.
*
* @since 2.0.0
* @category constructors
*/
const write = write$1;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/BigDecimal.js
/**
* This module provides utility functions and type class instances for working with the `BigDecimal` type in TypeScript.
* It includes functions for basic arithmetic operations, as well as type class instances for `Equivalence` and `Order`.
*
* A `BigDecimal` allows storing any real number to arbitrary precision; which avoids common floating point errors
* (such as 0.1 + 0.2 ≠ 0.3) at the cost of complexity.
*
* Internally, `BigDecimal` uses a `BigInt` object, paired with a 64-bit integer which determines the position of the
* decimal point. Therefore, the precision *is not* actually arbitrary, but limited to 2<sup>63</sup> decimal places.
*
* It is not recommended to convert a floating point number to a decimal directly, as the floating point representation
* may be unexpected.
*
* @module BigDecimal
* @since 2.0.0
* @see {@link module:BigInt} for more similar operations on `bigint` types
* @see {@link module:Number} for more similar operations on `number` types
*/
const FINITE_INT_REGEX = /^[+-]?\d+$/;
/**
* @since 2.0.0
* @category symbols
*/
const TypeId$7 = /*#__PURE__*/ Symbol.for("effect/BigDecimal");
const BigDecimalProto = {
	[TypeId$7]: TypeId$7,
	[symbol$1]() {
		const normalized = normalize(this);
		return pipe(hash(normalized.value), combine$7(number$2(normalized.scale)), cached(this));
	},
	[symbol](that) {
		return isBigDecimal(that) && equals(this, that);
	},
	toString() {
		return `BigDecimal(${format$1(this)})`;
	},
	toJSON() {
		return {
			_id: "BigDecimal",
			value: String(this.value),
			scale: this.scale
		};
	},
	[NodeInspectSymbol]() {
		return this.toJSON();
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/**
* Checks if a given value is a `BigDecimal`.
*
* @since 2.0.0
* @category guards
*/
const isBigDecimal = (u) => hasProperty(u, TypeId$7);
/**
* Creates a `BigDecimal` from a `bigint` value and a scale.
*
* @since 2.0.0
* @category constructors
*/
const make$6 = (value, scale) => {
	const o = Object.create(BigDecimalProto);
	o.value = value;
	o.scale = scale;
	return o;
};
/**
* Internal function used to create pre-normalized `BigDecimal`s.
*
* @internal
*/
const unsafeMakeNormalized = (value, scale) => {
	if (value !== bigint0 && value % bigint10 === bigint0) throw new RangeError("Value must be normalized");
	const o = make$6(value, scale);
	o.normalized = o;
	return o;
};
const bigint0 = /*#__PURE__*/ BigInt(0);
const bigint10 = /*#__PURE__*/ BigInt(10);
const zero = /*#__PURE__*/ unsafeMakeNormalized(bigint0, 0);
/**
* Normalizes a given `BigDecimal` by removing trailing zeros.
*
* **Example**
*
* ```ts
* import * as assert from "node:assert"
* import { normalize, make, unsafeFromString } from "effect/BigDecimal"
*
* assert.deepStrictEqual(normalize(unsafeFromString("123.00000")), normalize(make(123n, 0)))
* assert.deepStrictEqual(normalize(unsafeFromString("12300000")), normalize(make(123n, -5)))
* ```
*
* @since 2.0.0
* @category scaling
*/
const normalize = (self) => {
	if (self.normalized === void 0) {
		if (self.value === bigint0) self.normalized = zero;
		else {
			const digits = `${self.value}`;
			let trail = 0;
			for (let i = digits.length - 1; i >= 0; i--) if (digits[i] === "0") trail++;
			else break;
			if (trail === 0) self.normalized = self;
			const value = BigInt(digits.substring(0, digits.length - trail));
			const scale = self.scale - trail;
			self.normalized = unsafeMakeNormalized(value, scale);
		}
	}
	return self.normalized;
};
/**
* Scales a given `BigDecimal` to the specified scale.
*
* If the given scale is smaller than the current scale, the value will be rounded down to
* the nearest integer.
*
* @since 2.0.0
* @category scaling
*/
const scale = /*#__PURE__*/ dual(2, (self, scale) => {
	if (scale > self.scale) return make$6(self.value * bigint10 ** BigInt(scale - self.scale), scale);
	if (scale < self.scale) return make$6(self.value / bigint10 ** BigInt(self.scale - scale), scale);
	return self;
});
/**
* Determines the absolute value of a given `BigDecimal`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { abs, unsafeFromString } from "effect/BigDecimal"
*
* assert.deepStrictEqual(abs(unsafeFromString("-5")), unsafeFromString("5"))
* assert.deepStrictEqual(abs(unsafeFromString("0")), unsafeFromString("0"))
* assert.deepStrictEqual(abs(unsafeFromString("5")), unsafeFromString("5"))
* ```
*
* @since 2.0.0
* @category math
*/
const abs = (n) => n.value < bigint0 ? make$6(-n.value, n.scale) : n;
/**
* @category instances
* @since 2.0.0
*/
const Equivalence$1 = /*#__PURE__*/ make$47((self, that) => {
	if (self.scale > that.scale) return scale(that, self.scale).value === self.value;
	if (self.scale < that.scale) return scale(self, that.scale).value === that.value;
	return self.value === that.value;
});
/**
* Checks if two `BigDecimal`s are equal.
*
* @since 2.0.0
* @category predicates
*/
const equals = /*#__PURE__*/ dual(2, (self, that) => Equivalence$1(self, that));
/**
* Creates a `BigDecimal` from a `number` value.
*
* It is not recommended to convert a floating point number to a decimal directly,
* as the floating point representation may be unexpected.
*
* Throws a `RangeError` if the number is not finite (`NaN`, `+Infinity` or `-Infinity`).
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { unsafeFromNumber, make } from "effect/BigDecimal"
*
* assert.deepStrictEqual(unsafeFromNumber(123), make(123n, 0))
* assert.deepStrictEqual(unsafeFromNumber(123.456), make(123456n, 3))
* ```
*
* @since 3.11.0
* @category constructors
*/
const unsafeFromNumber = (n) => getOrThrowWith$1(safeFromNumber(n), () => /* @__PURE__ */ new RangeError(`Number must be finite, got ${n}`));
/**
* Creates a `BigDecimal` from a `number` value.
*
* It is not recommended to convert a floating point number to a decimal directly,
* as the floating point representation may be unexpected.
*
* Returns `None` if the number is not finite (`NaN`, `+Infinity` or `-Infinity`).
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { BigDecimal, Option } from "effect"
*
* assert.deepStrictEqual(BigDecimal.safeFromNumber(123), Option.some(BigDecimal.make(123n, 0)))
* assert.deepStrictEqual(BigDecimal.safeFromNumber(123.456), Option.some(BigDecimal.make(123456n, 3)))
* assert.deepStrictEqual(BigDecimal.safeFromNumber(Infinity), Option.none())
* ```
*
* @since 3.11.0
* @category constructors
*/
const safeFromNumber = (n) => {
	if (!Number.isFinite(n)) return none$4();
	const string = `${n}`;
	if (string.includes("e")) return fromString$1(string);
	const [lead, trail = ""] = string.split(".");
	return some(make$6(BigInt(`${lead}${trail}`), trail.length));
};
/**
* Parses a numerical `string` into a `BigDecimal`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { BigDecimal, Option } from "effect"
*
* assert.deepStrictEqual(BigDecimal.fromString("123"), Option.some(BigDecimal.make(123n, 0)))
* assert.deepStrictEqual(BigDecimal.fromString("123.456"), Option.some(BigDecimal.make(123456n, 3)))
* assert.deepStrictEqual(BigDecimal.fromString("123.abc"), Option.none())
* ```
*
* @since 2.0.0
* @category constructors
*/
const fromString$1 = (s) => {
	if (s === "") return some(zero);
	let base;
	let exp;
	const seperator = s.search(/[eE]/);
	if (seperator !== -1) {
		const trail = s.slice(seperator + 1);
		base = s.slice(0, seperator);
		exp = Number(trail);
		if (base === "" || !Number.isSafeInteger(exp) || !FINITE_INT_REGEX.test(trail)) return none$4();
	} else {
		base = s;
		exp = 0;
	}
	let digits;
	let offset;
	const dot = base.search(/\./);
	if (dot !== -1) {
		const lead = base.slice(0, dot);
		const trail = base.slice(dot + 1);
		digits = `${lead}${trail}`;
		offset = trail.length;
	} else {
		digits = base;
		offset = 0;
	}
	if (!FINITE_INT_REGEX.test(digits)) return none$4();
	const scale = offset - exp;
	if (!Number.isSafeInteger(scale)) return none$4();
	return some(make$6(BigInt(digits), scale));
};
/**
* Formats a given `BigDecimal` as a `string`.
*
* If the scale of the `BigDecimal` is greater than or equal to 16, the `BigDecimal` will
* be formatted in scientific notation.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { format, unsafeFromString } from "effect/BigDecimal"
*
* assert.deepStrictEqual(format(unsafeFromString("-5")), "-5")
* assert.deepStrictEqual(format(unsafeFromString("123.456")), "123.456")
* assert.deepStrictEqual(format(unsafeFromString("-0.00000123")), "-0.00000123")
* ```
*
* @since 2.0.0
* @category conversions
*/
const format$1 = (n) => {
	const normalized = normalize(n);
	if (Math.abs(normalized.scale) >= 16) return toExponential(normalized);
	const negative = normalized.value < bigint0;
	const absolute = negative ? `${normalized.value}`.substring(1) : `${normalized.value}`;
	let before;
	let after;
	if (normalized.scale >= absolute.length) {
		before = "0";
		after = "0".repeat(normalized.scale - absolute.length) + absolute;
	} else {
		const location = absolute.length - normalized.scale;
		if (location > absolute.length) {
			const zeros = location - absolute.length;
			before = `${absolute}${"0".repeat(zeros)}`;
			after = "";
		} else {
			after = absolute.slice(location);
			before = absolute.slice(0, location);
		}
	}
	const complete = after === "" ? before : `${before}.${after}`;
	return negative ? `-${complete}` : complete;
};
/**
* Formats a given `BigDecimal` as a `string` in scientific notation.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { toExponential, make } from "effect/BigDecimal"
*
* assert.deepStrictEqual(toExponential(make(123456n, -5)), "1.23456e+10")
* ```
*
* @since 3.11.0
* @category conversions
*/
const toExponential = (n) => {
	if (isZero(n)) return "0e+0";
	const normalized = normalize(n);
	const digits = `${abs(normalized).value}`;
	const head = digits.slice(0, 1);
	const tail = digits.slice(1);
	let output = `${isNegative(normalized) ? "-" : ""}${head}`;
	if (tail !== "") output += `.${tail}`;
	const exp = tail.length - normalized.scale;
	return `${output}e${exp >= 0 ? "+" : ""}${exp}`;
};
/**
* Converts a `BigDecimal` to a `number`.
*
* This function will produce incorrect results if the `BigDecimal` exceeds the 64-bit range of a `number`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { unsafeToNumber, unsafeFromString } from "effect/BigDecimal"
*
* assert.deepStrictEqual(unsafeToNumber(unsafeFromString("123.456")), 123.456)
* ```
*
* @since 2.0.0
* @category conversions
*/
const unsafeToNumber = (n) => Number(format$1(n));
/**
* Checks if a given `BigDecimal` is `0`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isZero, unsafeFromString } from "effect/BigDecimal"
*
* assert.deepStrictEqual(isZero(unsafeFromString("0")), true)
* assert.deepStrictEqual(isZero(unsafeFromString("1")), false)
* ```
*
* @since 2.0.0
* @category predicates
*/
const isZero = (n) => n.value === bigint0;
/**
* Checks if a given `BigDecimal` is negative.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { isNegative, unsafeFromString } from "effect/BigDecimal"
*
* assert.deepStrictEqual(isNegative(unsafeFromString("-1")), true)
* assert.deepStrictEqual(isNegative(unsafeFromString("0")), false)
* assert.deepStrictEqual(isNegative(unsafeFromString("1")), false)
* ```
*
* @since 2.0.0
* @category predicates
*/
const isNegative = (n) => n.value < bigint0;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/BigInt.js
/**
* Takes a `bigint` and returns an `Option` of `number`.
*
* If the `bigint` is outside the safe integer range for JavaScript (`Number.MAX_SAFE_INTEGER`
* and `Number.MIN_SAFE_INTEGER`), it returns `Option.none()`. Otherwise, it converts the `bigint`
* to a number and returns `Option.some(number)`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { BigInt as BI, Option } from "effect"
*
* assert.deepStrictEqual(BI.toNumber(BigInt(42)), Option.some(42))
* assert.deepStrictEqual(BI.toNumber(BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1)), Option.none())
* assert.deepStrictEqual(BI.toNumber(BigInt(Number.MIN_SAFE_INTEGER) - BigInt(1)), Option.none())
* ```
*
* @category conversions
* @since 2.0.0
*/
const toNumber = (b) => {
	if (b > BigInt(Number.MAX_SAFE_INTEGER) || b < BigInt(Number.MIN_SAFE_INTEGER)) return none$4();
	return some(Number(b));
};
/**
* Takes a string and returns an `Option` of `bigint`.
*
* If the string is empty or contains characters that cannot be converted into a `bigint`,
* it returns `Option.none()`, otherwise, it returns `Option.some(bigint)`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { BigInt as BI, Option } from "effect"
*
* assert.deepStrictEqual(BI.fromString("42"), Option.some(BigInt(42)))
* assert.deepStrictEqual(BI.fromString(" "), Option.none())
* assert.deepStrictEqual(BI.fromString("a"), Option.none())
* ```
*
* @category conversions
* @since 2.4.12
*/
const fromString = (s) => {
	try {
		return s.trim() === "" ? none$4() : some(BigInt(s));
	} catch {
		return none$4();
	}
};
/**
* Takes a number and returns an `Option` of `bigint`.
*
* If the number is outside the safe integer range for JavaScript (`Number.MAX_SAFE_INTEGER`
* and `Number.MIN_SAFE_INTEGER`), it returns `Option.none()`. Otherwise, it attempts to
* convert the number to a `bigint` and returns `Option.some(bigint)`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { BigInt as BI, Option } from "effect"
*
* assert.deepStrictEqual(BI.fromNumber(42), Option.some(BigInt(42)))
* assert.deepStrictEqual(BI.fromNumber(Number.MAX_SAFE_INTEGER + 1), Option.none())
* assert.deepStrictEqual(BI.fromNumber(Number.MIN_SAFE_INTEGER - 1), Option.none())
* ```
*
* @category conversions
* @since 2.4.12
*/
const fromNumber = (n) => {
	if (n > Number.MAX_SAFE_INTEGER || n < Number.MIN_SAFE_INTEGER) return none$4();
	try {
		return some(BigInt(n));
	} catch {
		return none$4();
	}
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/DateTime.js
/**
* @since 3.6.0
* @category guards
*/
const isDateTime = isDateTime$1;
/**
* @since 3.6.0
* @category guards
*/
const isTimeZoneOffset = isTimeZoneOffset$1;
/**
* @since 3.6.0
* @category guards
*/
const isTimeZoneNamed = isTimeZoneNamed$1;
/**
* @since 3.6.0
* @category guards
*/
const isUtc = isUtc$1;
/**
* @since 3.6.0
* @category guards
*/
const isZoned = isZoned$1;
/**
* @since 3.6.0
* @category instances
*/
const Equivalence = Equivalence$2;
/**
* Create a `DateTime` from a `Date`.
*
* If the `Date` is invalid, an `IllegalArgumentException` will be thrown.
*
* @since 3.6.0
* @category constructors
*/
const unsafeFromDate = unsafeFromDate$1;
/**
* Create a `DateTime` from one of the following:
*
* - A `DateTime`
* - A `Date` instance (invalid dates will throw an `IllegalArgumentException`)
* - The `number` of milliseconds since the Unix epoch
* - An object with the parts of a date
* - A `string` that can be parsed by `Date.parse`
*
* @since 3.6.0
* @category constructors
* @example
* ```ts
* import { DateTime } from "effect"
*
* // from Date
* DateTime.unsafeMake(new Date())
*
* // from parts
* DateTime.unsafeMake({ year: 2024 })
*
* // from string
* DateTime.unsafeMake("2024-01-01")
* ```
*/
const unsafeMake$1 = unsafeMake$3;
/**
* Create a `DateTime.Zoned` using `DateTime.unsafeMake` and a time zone.
*
* The input is treated as UTC and then the time zone is attached, unless
* `adjustForTimeZone` is set to `true`. In that case, the input is treated as
* already in the time zone.
*
* When `adjustForTimeZone` is true and ambiguous times occur during DST transitions,
* the `disambiguation` option controls how to resolve the ambiguity:
* - `compatible` (default): Choose earlier time for repeated times, later for gaps
* - `earlier`: Always choose the earlier of two possible times
* - `later`: Always choose the later of two possible times
* - `reject`: Throw an error when ambiguous times are encountered
*
* @since 3.6.0
* @category constructors
* @example
* ```ts
* import { DateTime } from "effect"
*
* DateTime.unsafeMakeZoned(new Date(), { timeZone: "Europe/London" })
* ```
*/
const unsafeMakeZoned = unsafeMakeZoned$1;
/**
* Create a `DateTime.Zoned` from a string.
*
* It uses the format: `YYYY-MM-DDTHH:mm:ss.sss+HH:MM[Time/Zone]`.
*
* @since 3.6.0
* @category constructors
*/
const makeZonedFromString = makeZonedFromString$1;
/**
* Attempt to create a named time zone from a IANA time zone identifier.
*
* If the time zone is invalid, an `IllegalArgumentException` will be thrown.
*
* @since 3.6.0
* @category time zones
*/
const zoneUnsafeMakeNamed = zoneUnsafeMakeNamed$1;
/**
* Create a fixed offset time zone.
*
* @since 3.6.0
* @category time zones
*/
const zoneMakeOffset = zoneMakeOffset$1;
/**
* Try parse a TimeZone from a string
*
* @since 3.6.0
* @category time zones
*/
const zoneFromString = zoneFromString$1;
/**
* Format a `TimeZone` as a string.
*
* @since 3.6.0
* @category time zones
* @example
* ```ts
* import { DateTime, Effect } from "effect"
*
* // Outputs "+03:00"
* DateTime.zoneToString(DateTime.zoneMakeOffset(3 * 60 * 60 * 1000))
*
* // Outputs "Europe/London"
* DateTime.zoneToString(DateTime.zoneUnsafeMakeNamed("Europe/London"))
* ```
*/
const zoneToString = zoneToString$1;
/**
* Get the UTC `Date` of a `DateTime`.
*
* @since 3.6.0
* @category conversions
*/
const toDateUtc = toDateUtc$1;
/**
* Get the milliseconds since the Unix epoch of a `DateTime`.
*
* @since 3.6.0
* @category conversions
*/
const toEpochMillis = toEpochMillis$1;
Tag("effect/DateTime/CurrentTimeZone")();
/**
* Format a `DateTime` as a UTC ISO string.
*
* @since 3.6.0
* @category formatting
*/
const formatIso = formatIso$1;
/**
* Format a `DateTime.Zoned` as a string.
*
* It uses the format: `YYYY-MM-DDTHH:mm:ss.sss+HH:MM[Time/Zone]`.
*
* @since 3.6.0
* @category formatting
*/
const formatIsoZoned = formatIsoZoned$1;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/schema/util.js
/** @internal */
const getKeysForIndexSignature = (input, parameter) => {
	switch (parameter._tag) {
		case "StringKeyword":
		case "TemplateLiteral": return Object.keys(input);
		case "SymbolKeyword": return Object.getOwnPropertySymbols(input);
		case "Refinement": return getKeysForIndexSignature(input, parameter.from);
	}
};
/** @internal */
const memoizeThunk = (f) => {
	let done = false;
	let a;
	return () => {
		if (done) return a;
		a = f();
		done = true;
		return a;
	};
};
/** @internal */
const isNonEmpty = (x) => Array.isArray(x);
/** @internal */
const isSingle = (x) => !Array.isArray(x);
/** @internal */
const formatPathKey = (key) => `[${formatPropertyKey$1(key)}]`;
/** @internal */
const formatPath = (path) => isNonEmpty(path) ? path.map(formatPathKey).join("") : formatPathKey(path);
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/schema/errors.js
const getErrorMessage$1 = (reason, details, path, ast) => {
	let out = reason;
	if (path && isNonEmptyReadonlyArray(path)) out += `\nat path: ${formatPath(path)}`;
	if (details !== void 0) out += `\ndetails: ${details}`;
	if (ast) out += `\nschema (${ast._tag}): ${ast}`;
	return out;
};
/** @internal */
const getSchemaExtendErrorMessage = (x, y, path) => getErrorMessage$1("Unsupported schema or overlapping types", `cannot extend ${x} with ${y}`, path);
/** @internal */
const getASTUnsupportedKeySchemaErrorMessage = (ast) => getErrorMessage$1("Unsupported key schema", void 0, void 0, ast);
/** @internal */
const getASTUnsupportedLiteralErrorMessage = (literal) => getErrorMessage$1("Unsupported literal", `literal value: ${formatUnknown(literal)}`);
/** @internal */
const getASTDuplicateIndexSignatureErrorMessage = (type) => getErrorMessage$1("Duplicate index signature", `${type} index signature`);
/** @internal */
const getASTIndexSignatureParameterErrorMessage = /*#__PURE__*/ getErrorMessage$1("Unsupported index signature parameter", "An index signature parameter type must be `string`, `symbol`, a template literal type or a refinement of the previous types");
/** @internal */
const getASTRequiredElementFollowinAnOptionalElementErrorMessage = /*#__PURE__*/ getErrorMessage$1("Invalid element", "A required element cannot follow an optional element. ts(1257)");
/** @internal */
const getASTDuplicatePropertySignatureTransformationErrorMessage = (key) => getErrorMessage$1("Duplicate property signature transformation", `Duplicate key ${formatUnknown(key)}`);
/** @internal */
const getASTDuplicatePropertySignatureErrorMessage = (key) => getErrorMessage$1("Duplicate property signature", `Duplicate key ${formatUnknown(key)}`);
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/internal/schema/schemaId.js
/** @internal */
const DateFromSelfSchemaId$1 = /*#__PURE__*/ Symbol.for("effect/SchemaId/DateFromSelf");
/** @internal */
const GreaterThanSchemaId$1 = /*#__PURE__*/ Symbol.for("effect/SchemaId/GreaterThan");
/** @internal */
const GreaterThanOrEqualToSchemaId$1 = /*#__PURE__*/ Symbol.for("effect/SchemaId/GreaterThanOrEqualTo");
/** @internal */
const LessThanSchemaId$1 = /*#__PURE__*/ Symbol.for("effect/SchemaId/LessThan");
/** @internal */
const LessThanOrEqualToSchemaId$1 = /*#__PURE__*/ Symbol.for("effect/SchemaId/LessThanOrEqualTo");
/** @internal */
const IntSchemaId$1 = /*#__PURE__*/ Symbol.for("effect/SchemaId/Int");
/** @internal */
const NonNaNSchemaId$1 = /*#__PURE__*/ Symbol.for("effect/SchemaId/NonNaN");
/** @internal */
const FiniteSchemaId$1 = /*#__PURE__*/ Symbol.for("effect/SchemaId/Finite");
/** @internal */
const JsonNumberSchemaId$1 = /*#__PURE__*/ Symbol.for("effect/SchemaId/JsonNumber");
/** @internal */
const BetweenSchemaId$1 = /*#__PURE__*/ Symbol.for("effect/SchemaId/Between");
/** @internal */
const GreaterThanOrEqualToBigIntSchemaId$1 = /*#__PURE__*/ Symbol.for("effect/SchemaId/GreaterThanOrEqualToBigint");
/** @internal */
const BetweenBigintSchemaId = /*#__PURE__*/ Symbol.for("effect/SchemaId/BetweenBigint");
/** @internal */
const MinLengthSchemaId$1 = /*#__PURE__*/ Symbol.for("effect/SchemaId/MinLength");
/** @internal */
const LengthSchemaId$1 = /*#__PURE__*/ Symbol.for("effect/SchemaId/Length");
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/SchemaAST.js
/**
* @since 3.10.0
*/
/**
* @category annotations
* @since 3.19.0
* @experimental
*/
const TypeConstructorAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/TypeConstructor");
/**
* @category annotations
* @since 3.10.0
*/
const BrandAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/Brand");
/**
* @category annotations
* @since 3.10.0
*/
const SchemaIdAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/SchemaId");
/**
* @category annotations
* @since 3.10.0
*/
const MessageAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/Message");
/**
* @category annotations
* @since 3.10.0
*/
const MissingMessageAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/MissingMessage");
/**
* @category annotations
* @since 3.10.0
*/
const IdentifierAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/Identifier");
/**
* @category annotations
* @since 3.10.0
*/
const TitleAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/Title");
/** @internal */
const AutoTitleAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/AutoTitle");
/**
* @category annotations
* @since 3.10.0
*/
const DescriptionAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/Description");
/**
* @category annotations
* @since 3.10.0
*/
const ExamplesAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/Examples");
/**
* @category annotations
* @since 3.10.0
*/
const DefaultAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/Default");
/**
* @category annotations
* @since 3.10.0
*/
const JSONSchemaAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/JSONSchema");
/**
* @category annotations
* @since 3.10.0
*/
const ArbitraryAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/Arbitrary");
/**
* @category annotations
* @since 3.10.0
*/
const PrettyAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/Pretty");
/**
* @category annotations
* @since 3.10.0
*/
const EquivalenceAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/Equivalence");
/**
* @category annotations
* @since 3.10.0
*/
const DocumentationAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/Documentation");
/**
* @category annotations
* @since 3.10.0
*/
const ConcurrencyAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/Concurrency");
/**
* @category annotations
* @since 3.10.0
*/
const BatchingAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/Batching");
/**
* @category annotations
* @since 3.10.0
*/
const ParseIssueTitleAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/ParseIssueTitle");
/**
* @category annotations
* @since 3.10.0
*/
const ParseOptionsAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/ParseOptions");
/**
* @category annotations
* @since 3.10.0
*/
const DecodingFallbackAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/DecodingFallback");
/**
* @category annotations
* @since 3.10.0
*/
const SurrogateAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/Surrogate");
/** @internal */
const StableFilterAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/StableFilter");
/**
* @category annotations
* @since 3.10.0
*/
const getAnnotation = /*#__PURE__*/ dual(2, (annotated, key) => Object.prototype.hasOwnProperty.call(annotated.annotations, key) ? some(annotated.annotations[key]) : none$4());
/**
* @category annotations
* @since 3.10.0
*/
const getBrandAnnotation = /*#__PURE__*/ getAnnotation(BrandAnnotationId);
/**
* @category annotations
* @since 3.10.0
*/
const getMessageAnnotation = /*#__PURE__*/ getAnnotation(MessageAnnotationId);
/**
* @category annotations
* @since 3.10.0
*/
const getMissingMessageAnnotation = /*#__PURE__*/ getAnnotation(MissingMessageAnnotationId);
/**
* @category annotations
* @since 3.10.0
*/
const getTitleAnnotation = /*#__PURE__*/ getAnnotation(TitleAnnotationId);
/** @internal */
const getAutoTitleAnnotation = /*#__PURE__*/ getAnnotation(AutoTitleAnnotationId);
/**
* @category annotations
* @since 3.10.0
*/
const getIdentifierAnnotation = /*#__PURE__*/ getAnnotation(IdentifierAnnotationId);
/**
* @category annotations
* @since 3.10.0
*/
const getDescriptionAnnotation = /*#__PURE__*/ getAnnotation(DescriptionAnnotationId);
/**
* @category annotations
* @since 3.10.0
*/
const getConcurrencyAnnotation = /*#__PURE__*/ getAnnotation(ConcurrencyAnnotationId);
/**
* @category annotations
* @since 3.10.0
*/
const getBatchingAnnotation = /*#__PURE__*/ getAnnotation(BatchingAnnotationId);
/**
* @category annotations
* @since 3.10.0
*/
const getParseIssueTitleAnnotation$1 = /*#__PURE__*/ getAnnotation(ParseIssueTitleAnnotationId);
/**
* @category annotations
* @since 3.10.0
*/
const getParseOptionsAnnotation = /*#__PURE__*/ getAnnotation(ParseOptionsAnnotationId);
/**
* @category annotations
* @since 3.10.0
*/
const getDecodingFallbackAnnotation = /*#__PURE__*/ getAnnotation(DecodingFallbackAnnotationId);
/**
* @category annotations
* @since 3.10.0
*/
const getSurrogateAnnotation = /*#__PURE__*/ getAnnotation(SurrogateAnnotationId);
const getStableFilterAnnotation = /*#__PURE__*/ getAnnotation(StableFilterAnnotationId);
/** @internal */
const hasStableFilter = (annotated) => exists(getStableFilterAnnotation(annotated), (b) => b === true);
/**
* @category annotations
* @since 3.10.0
*/
const JSONIdentifierAnnotationId = /*#__PURE__*/ Symbol.for("effect/annotation/JSONIdentifier");
/**
* @category annotations
* @since 3.10.0
*/
const getJSONIdentifierAnnotation = /*#__PURE__*/ getAnnotation(JSONIdentifierAnnotationId);
/**
* @category annotations
* @since 3.10.0
*/
const getJSONIdentifier = (annotated) => orElse$5(getJSONIdentifierAnnotation(annotated), () => getIdentifierAnnotation(annotated));
/**
* @category schema id
* @since 3.10.0
*/
const ParseJsonSchemaId = /*#__PURE__*/ Symbol.for("effect/schema/ParseJson");
/**
* @category model
* @since 3.10.0
*/
var Declaration = class {
	typeParameters;
	decodeUnknown;
	encodeUnknown;
	annotations;
	/**
	* @since 3.10.0
	*/
	_tag = "Declaration";
	constructor(typeParameters, decodeUnknown, encodeUnknown, annotations = {}) {
		this.typeParameters = typeParameters;
		this.decodeUnknown = decodeUnknown;
		this.encodeUnknown = encodeUnknown;
		this.annotations = annotations;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return getOrElse(getExpected(this), () => "<declaration schema>");
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			_tag: this._tag,
			typeParameters: this.typeParameters.map((ast) => ast.toJSON()),
			annotations: toJSONAnnotations(this.annotations)
		};
	}
};
const createASTGuard = (tag) => (ast) => ast._tag === tag;
/**
* @category model
* @since 3.10.0
*/
var Literal$1 = class {
	literal;
	annotations;
	/**
	* @since 3.10.0
	*/
	_tag = "Literal";
	constructor(literal, annotations = {}) {
		this.literal = literal;
		this.annotations = annotations;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return getOrElse(getExpected(this), () => formatUnknown(this.literal));
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			_tag: this._tag,
			literal: isBigInt(this.literal) ? String(this.literal) : this.literal,
			annotations: toJSONAnnotations(this.annotations)
		};
	}
};
/**
* @category guards
* @since 3.10.0
*/
const isLiteral = /*#__PURE__*/ createASTGuard("Literal");
/**
* @category model
* @since 3.10.0
*/
var UniqueSymbol = class {
	symbol;
	annotations;
	/**
	* @since 3.10.0
	*/
	_tag = "UniqueSymbol";
	constructor(symbol, annotations = {}) {
		this.symbol = symbol;
		this.annotations = annotations;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return getOrElse(getExpected(this), () => formatUnknown(this.symbol));
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			_tag: this._tag,
			symbol: String(this.symbol),
			annotations: toJSONAnnotations(this.annotations)
		};
	}
};
/**
* @category model
* @since 3.10.0
*/
var UndefinedKeyword = class {
	annotations;
	/**
	* @since 3.10.0
	*/
	_tag = "UndefinedKeyword";
	constructor(annotations = {}) {
		this.annotations = annotations;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return formatKeyword(this);
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			_tag: this._tag,
			annotations: toJSONAnnotations(this.annotations)
		};
	}
};
/**
* @category constructors
* @since 3.10.0
*/
const undefinedKeyword = /*#__PURE__*/ new UndefinedKeyword({ [TitleAnnotationId]: "undefined" });
/**
* @category model
* @since 3.10.0
*/
var NeverKeyword = class {
	annotations;
	/**
	* @since 3.10.0
	*/
	_tag = "NeverKeyword";
	constructor(annotations = {}) {
		this.annotations = annotations;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return formatKeyword(this);
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			_tag: this._tag,
			annotations: toJSONAnnotations(this.annotations)
		};
	}
};
/**
* @category constructors
* @since 3.10.0
*/
const neverKeyword = /*#__PURE__*/ new NeverKeyword({ [TitleAnnotationId]: "never" });
/**
* @category model
* @since 3.10.0
*/
var UnknownKeyword = class {
	annotations;
	/**
	* @since 3.10.0
	*/
	_tag = "UnknownKeyword";
	constructor(annotations = {}) {
		this.annotations = annotations;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return formatKeyword(this);
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			_tag: this._tag,
			annotations: toJSONAnnotations(this.annotations)
		};
	}
};
/**
* @category constructors
* @since 3.10.0
*/
const unknownKeyword = /*#__PURE__*/ new UnknownKeyword({ [TitleAnnotationId]: "unknown" });
/**
* @category model
* @since 3.10.0
*/
var AnyKeyword = class {
	annotations;
	/**
	* @since 3.10.0
	*/
	_tag = "AnyKeyword";
	constructor(annotations = {}) {
		this.annotations = annotations;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return formatKeyword(this);
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			_tag: this._tag,
			annotations: toJSONAnnotations(this.annotations)
		};
	}
};
/**
* @category constructors
* @since 3.10.0
*/
const anyKeyword = /*#__PURE__*/ new AnyKeyword({ [TitleAnnotationId]: "any" });
/**
* @category model
* @since 3.10.0
*/
var StringKeyword = class {
	annotations;
	/**
	* @since 3.10.0
	*/
	_tag = "StringKeyword";
	constructor(annotations = {}) {
		this.annotations = annotations;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return formatKeyword(this);
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			_tag: this._tag,
			annotations: toJSONAnnotations(this.annotations)
		};
	}
};
/**
* @category constructors
* @since 3.10.0
*/
const stringKeyword = /*#__PURE__*/ new StringKeyword({
	[TitleAnnotationId]: "string",
	[DescriptionAnnotationId]: "a string"
});
/**
* @category guards
* @since 3.10.0
*/
const isStringKeyword = /*#__PURE__*/ createASTGuard("StringKeyword");
/**
* @category model
* @since 3.10.0
*/
var NumberKeyword = class {
	annotations;
	/**
	* @since 3.10.0
	*/
	_tag = "NumberKeyword";
	constructor(annotations = {}) {
		this.annotations = annotations;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return formatKeyword(this);
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			_tag: this._tag,
			annotations: toJSONAnnotations(this.annotations)
		};
	}
};
/**
* @category constructors
* @since 3.10.0
*/
const numberKeyword = /*#__PURE__*/ new NumberKeyword({
	[TitleAnnotationId]: "number",
	[DescriptionAnnotationId]: "a number"
});
/**
* @category guards
* @since 3.10.0
*/
const isNumberKeyword = /*#__PURE__*/ createASTGuard("NumberKeyword");
/**
* @category model
* @since 3.10.0
*/
var BooleanKeyword = class {
	annotations;
	/**
	* @since 3.10.0
	*/
	_tag = "BooleanKeyword";
	constructor(annotations = {}) {
		this.annotations = annotations;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return formatKeyword(this);
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			_tag: this._tag,
			annotations: toJSONAnnotations(this.annotations)
		};
	}
};
/**
* @category constructors
* @since 3.10.0
*/
const booleanKeyword = /*#__PURE__*/ new BooleanKeyword({
	[TitleAnnotationId]: "boolean",
	[DescriptionAnnotationId]: "a boolean"
});
/**
* @category guards
* @since 3.10.0
*/
const isBooleanKeyword = /*#__PURE__*/ createASTGuard("BooleanKeyword");
/**
* @category model
* @since 3.10.0
*/
var BigIntKeyword = class {
	annotations;
	/**
	* @since 3.10.0
	*/
	_tag = "BigIntKeyword";
	constructor(annotations = {}) {
		this.annotations = annotations;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return formatKeyword(this);
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			_tag: this._tag,
			annotations: toJSONAnnotations(this.annotations)
		};
	}
};
/**
* @category constructors
* @since 3.10.0
*/
const bigIntKeyword = /*#__PURE__*/ new BigIntKeyword({
	[TitleAnnotationId]: "bigint",
	[DescriptionAnnotationId]: "a bigint"
});
/**
* @category model
* @since 3.10.0
*/
var SymbolKeyword = class {
	annotations;
	/**
	* @since 3.10.0
	*/
	_tag = "SymbolKeyword";
	constructor(annotations = {}) {
		this.annotations = annotations;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return formatKeyword(this);
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			_tag: this._tag,
			annotations: toJSONAnnotations(this.annotations)
		};
	}
};
/**
* @category constructors
* @since 3.10.0
*/
const symbolKeyword = /*#__PURE__*/ new SymbolKeyword({
	[TitleAnnotationId]: "symbol",
	[DescriptionAnnotationId]: "a symbol"
});
/**
* @category guards
* @since 3.10.0
*/
const isSymbolKeyword = /*#__PURE__*/ createASTGuard("SymbolKeyword");
/**
* @category model
* @since 3.10.0
*/
var Type$1 = class {
	type;
	annotations;
	constructor(type, annotations = {}) {
		this.type = type;
		this.annotations = annotations;
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			type: this.type.toJSON(),
			annotations: toJSONAnnotations(this.annotations)
		};
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return String(this.type);
	}
};
/**
* @category model
* @since 3.10.0
*/
var OptionalType = class extends Type$1 {
	isOptional;
	constructor(type, isOptional, annotations = {}) {
		super(type, annotations);
		this.isOptional = isOptional;
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			type: this.type.toJSON(),
			isOptional: this.isOptional,
			annotations: toJSONAnnotations(this.annotations)
		};
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return String(this.type) + (this.isOptional ? "?" : "");
	}
};
const getRestASTs = (rest) => rest.map((annotatedAST) => annotatedAST.type);
/**
* @category model
* @since 3.10.0
*/
var TupleType = class {
	elements;
	rest;
	isReadonly;
	annotations;
	/**
	* @since 3.10.0
	*/
	_tag = "TupleType";
	constructor(elements, rest, isReadonly, annotations = {}) {
		this.elements = elements;
		this.rest = rest;
		this.isReadonly = isReadonly;
		this.annotations = annotations;
		let hasOptionalElement = false;
		let hasIllegalRequiredElement = false;
		for (const e of elements) if (e.isOptional) hasOptionalElement = true;
		else if (hasOptionalElement) {
			hasIllegalRequiredElement = true;
			break;
		}
		if (hasIllegalRequiredElement || hasOptionalElement && rest.length > 1) throw new Error(getASTRequiredElementFollowinAnOptionalElementErrorMessage);
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return getOrElse(getExpected(this), () => formatTuple(this));
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			_tag: this._tag,
			elements: this.elements.map((e) => e.toJSON()),
			rest: this.rest.map((ast) => ast.toJSON()),
			isReadonly: this.isReadonly,
			annotations: toJSONAnnotations(this.annotations)
		};
	}
};
const formatTuple = (ast) => {
	const formattedElements = ast.elements.map(String).join(", ");
	return matchLeft(ast.rest, {
		onEmpty: () => `readonly [${formattedElements}]`,
		onNonEmpty: (head, tail) => {
			const formattedHead = String(head);
			const wrappedHead = formattedHead.includes(" | ") ? `(${formattedHead})` : formattedHead;
			if (tail.length > 0) {
				const formattedTail = tail.map(String).join(", ");
				if (ast.elements.length > 0) return `readonly [${formattedElements}, ...${wrappedHead}[], ${formattedTail}]`;
				else return `readonly [...${wrappedHead}[], ${formattedTail}]`;
			} else if (ast.elements.length > 0) return `readonly [${formattedElements}, ...${wrappedHead}[]]`;
			else return `ReadonlyArray<${formattedHead}>`;
		}
	});
};
/**
* @category model
* @since 3.10.0
*/
var PropertySignature = class extends OptionalType {
	name;
	isReadonly;
	constructor(name, type, isOptional, isReadonly, annotations) {
		super(type, isOptional, annotations);
		this.name = name;
		this.isReadonly = isReadonly;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return (this.isReadonly ? "readonly " : "") + String(this.name) + (this.isOptional ? "?" : "") + ": " + this.type;
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			name: String(this.name),
			type: this.type.toJSON(),
			isOptional: this.isOptional,
			isReadonly: this.isReadonly,
			annotations: toJSONAnnotations(this.annotations)
		};
	}
};
/**
* @since 3.10.0
*/
const isParameter = (ast) => {
	switch (ast._tag) {
		case "StringKeyword":
		case "SymbolKeyword":
		case "TemplateLiteral": return true;
		case "Refinement": return isParameter(ast.from);
	}
	return false;
};
/**
* @category model
* @since 3.10.0
*/
var IndexSignature = class {
	type;
	isReadonly;
	/**
	* @since 3.10.0
	*/
	parameter;
	constructor(parameter, type, isReadonly) {
		this.type = type;
		this.isReadonly = isReadonly;
		if (isParameter(parameter)) this.parameter = parameter;
		else throw new Error(getASTIndexSignatureParameterErrorMessage);
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return (this.isReadonly ? "readonly " : "") + `[x: ${this.parameter}]: ${this.type}`;
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			parameter: this.parameter.toJSON(),
			type: this.type.toJSON(),
			isReadonly: this.isReadonly
		};
	}
};
/**
* @category model
* @since 3.10.0
*/
var TypeLiteral = class {
	annotations;
	/**
	* @since 3.10.0
	*/
	_tag = "TypeLiteral";
	/**
	* @since 3.10.0
	*/
	propertySignatures;
	/**
	* @since 3.10.0
	*/
	indexSignatures;
	constructor(propertySignatures, indexSignatures, annotations = {}) {
		this.annotations = annotations;
		const keys = {};
		for (let i = 0; i < propertySignatures.length; i++) {
			const name = propertySignatures[i].name;
			if (Object.prototype.hasOwnProperty.call(keys, name)) throw new Error(getASTDuplicatePropertySignatureErrorMessage(name));
			keys[name] = null;
		}
		const parameters = {
			string: false,
			symbol: false
		};
		for (let i = 0; i < indexSignatures.length; i++) {
			const encodedParameter = getEncodedParameter(indexSignatures[i].parameter);
			if (isStringKeyword(encodedParameter)) {
				if (parameters.string) throw new Error(getASTDuplicateIndexSignatureErrorMessage("string"));
				parameters.string = true;
			} else if (isSymbolKeyword(encodedParameter)) {
				if (parameters.symbol) throw new Error(getASTDuplicateIndexSignatureErrorMessage("symbol"));
				parameters.symbol = true;
			}
		}
		this.propertySignatures = propertySignatures;
		this.indexSignatures = indexSignatures;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return getOrElse(getExpected(this), () => formatTypeLiteral(this));
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			_tag: this._tag,
			propertySignatures: this.propertySignatures.map((ps) => ps.toJSON()),
			indexSignatures: this.indexSignatures.map((ps) => ps.toJSON()),
			annotations: toJSONAnnotations(this.annotations)
		};
	}
};
const formatIndexSignatures = (iss) => iss.map(String).join("; ");
const formatTypeLiteral = (ast) => {
	if (ast.propertySignatures.length > 0) {
		const pss = ast.propertySignatures.map(String).join("; ");
		if (ast.indexSignatures.length > 0) return `{ ${pss}; ${formatIndexSignatures(ast.indexSignatures)} }`;
		else return `{ ${pss} }`;
	} else if (ast.indexSignatures.length > 0) return `{ ${formatIndexSignatures(ast.indexSignatures)} }`;
	else return "{}";
};
/**
* @category guards
* @since 3.10.0
*/
const isTypeLiteral = /*#__PURE__*/ createASTGuard("TypeLiteral");
const sortCandidates = /*#__PURE__*/ sort(/*#__PURE__*/ mapInput(Order$1, (ast) => {
	switch (ast._tag) {
		case "AnyKeyword": return 0;
		case "UnknownKeyword": return 1;
		case "ObjectKeyword": return 2;
		case "StringKeyword":
		case "NumberKeyword":
		case "BooleanKeyword":
		case "BigIntKeyword":
		case "SymbolKeyword": return 3;
	}
	return 4;
}));
const literalMap = {
	string: "StringKeyword",
	number: "NumberKeyword",
	boolean: "BooleanKeyword",
	bigint: "BigIntKeyword"
};
/** @internal */
const flatten = (candidates) => flatMap$8(candidates, (ast) => isUnion(ast) ? flatten(ast.types) : [ast]);
/** @internal */
const unify = (candidates) => {
	const cs = sortCandidates(candidates);
	const out = [];
	const uniques = {};
	const literals = [];
	for (const ast of cs) switch (ast._tag) {
		case "NeverKeyword": break;
		case "AnyKeyword": return [anyKeyword];
		case "UnknownKeyword": return [unknownKeyword];
		case "ObjectKeyword":
		case "UndefinedKeyword":
		case "VoidKeyword":
		case "StringKeyword":
		case "NumberKeyword":
		case "BooleanKeyword":
		case "BigIntKeyword":
		case "SymbolKeyword":
			if (!uniques[ast._tag]) {
				uniques[ast._tag] = ast;
				out.push(ast);
			}
			break;
		case "Literal": {
			const type = typeof ast.literal;
			switch (type) {
				case "string":
				case "number":
				case "bigint":
				case "boolean":
					if (!uniques[literalMap[type]] && !literals.includes(ast.literal)) {
						literals.push(ast.literal);
						out.push(ast);
					}
					break;
				case "object": if (!literals.includes(ast.literal)) {
					literals.push(ast.literal);
					out.push(ast);
				}
			}
			break;
		}
		case "UniqueSymbol":
			if (!uniques["SymbolKeyword"] && !literals.includes(ast.symbol)) {
				literals.push(ast.symbol);
				out.push(ast);
			}
			break;
		case "TupleType":
			if (!uniques["ObjectKeyword"]) out.push(ast);
			break;
		case "TypeLiteral":
			if (ast.propertySignatures.length === 0 && ast.indexSignatures.length === 0) {
				if (!uniques["{}"]) {
					uniques["{}"] = ast;
					out.push(ast);
				}
			} else if (!uniques["ObjectKeyword"]) out.push(ast);
			break;
		default: out.push(ast);
	}
	return out;
};
/**
* @category model
* @since 3.10.0
*/
var Union$1 = class Union$1 {
	types;
	annotations;
	static make = (types, annotations) => {
		return isMembers(types) ? new Union$1(types, annotations) : types.length === 1 ? types[0] : neverKeyword;
	};
	/** @internal */
	static unify = (candidates, annotations) => {
		return Union$1.make(unify(flatten(candidates)), annotations);
	};
	/**
	* @since 3.10.0
	*/
	_tag = "Union";
	constructor(types, annotations = {}) {
		this.types = types;
		this.annotations = annotations;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return getOrElse(getExpected(this), () => this.types.map(String).join(" | "));
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			_tag: this._tag,
			types: this.types.map((ast) => ast.toJSON()),
			annotations: toJSONAnnotations(this.annotations)
		};
	}
};
/** @internal */
const mapMembers = (members, f) => members.map(f);
/** @internal */
const isMembers = (as) => as.length > 1;
/**
* @category guards
* @since 3.10.0
*/
const isUnion = /*#__PURE__*/ createASTGuard("Union");
const toJSONMemoMap = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/Schema/AST/toJSONMemoMap"), () => /* @__PURE__ */ new WeakMap());
/**
* @category model
* @since 3.10.0
*/
var Suspend = class {
	f;
	annotations;
	/**
	* @since 3.10.0
	*/
	_tag = "Suspend";
	constructor(f, annotations = {}) {
		this.f = f;
		this.annotations = annotations;
		this.f = memoizeThunk(f);
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return getExpected(this).pipe(orElse$5(() => flatMap$9(liftThrowable(this.f)(), (ast) => getExpected(ast))), getOrElse(() => "<suspended schema>"));
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		const ast = this.f();
		let out = toJSONMemoMap.get(ast);
		if (out) return out;
		toJSONMemoMap.set(ast, { _tag: this._tag });
		out = {
			_tag: this._tag,
			ast: ast.toJSON(),
			annotations: toJSONAnnotations(this.annotations)
		};
		toJSONMemoMap.set(ast, out);
		return out;
	}
};
/**
* @category model
* @since 3.10.0
*/
var Refinement$1 = class {
	from;
	filter;
	annotations;
	/**
	* @since 3.10.0
	*/
	_tag = "Refinement";
	constructor(from, filter, annotations = {}) {
		this.from = from;
		this.filter = filter;
		this.annotations = annotations;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return getIdentifierAnnotation(this).pipe(getOrElse(() => match$9(getOrElseExpected(this), {
			onNone: () => `{ ${this.from} | filter }`,
			onSome: (expected) => isRefinement$1(this.from) ? String(this.from) + " & " + expected : expected
		})));
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			_tag: this._tag,
			from: this.from.toJSON(),
			annotations: toJSONAnnotations(this.annotations)
		};
	}
};
/**
* @category guards
* @since 3.10.0
*/
const isRefinement$1 = /*#__PURE__*/ createASTGuard("Refinement");
/**
* @since 3.10.0
*/
const defaultParseOption = {};
/**
* @category model
* @since 3.10.0
*/
var Transformation$1 = class {
	from;
	to;
	transformation;
	annotations;
	/**
	* @since 3.10.0
	*/
	_tag = "Transformation";
	constructor(from, to, transformation, annotations = {}) {
		this.from = from;
		this.to = to;
		this.transformation = transformation;
		this.annotations = annotations;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return getOrElse(getExpected(this), () => `(${String(this.from)} <-> ${String(this.to)})`);
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			_tag: this._tag,
			from: this.from.toJSON(),
			to: this.to.toJSON(),
			annotations: toJSONAnnotations(this.annotations)
		};
	}
};
/**
* @category guards
* @since 3.10.0
*/
const isTransformation$1 = /*#__PURE__*/ createASTGuard("Transformation");
/**
* @category model
* @since 3.10.0
*/
var FinalTransformation = class {
	decode;
	encode;
	/**
	* @since 3.10.0
	*/
	_tag = "FinalTransformation";
	constructor(decode, encode) {
		this.decode = decode;
		this.encode = encode;
	}
};
const createTransformationGuard = (tag) => (ast) => ast._tag === tag;
/**
* @category model
* @since 3.10.0
*/
var ComposeTransformation = class {
	/**
	* @since 3.10.0
	*/
	_tag = "ComposeTransformation";
};
/**
* @category constructors
* @since 3.10.0
*/
const composeTransformation = /*#__PURE__*/ new ComposeTransformation();
/**
* Represents a `PropertySignature -> PropertySignature` transformation
*
* The semantic of `decode` is:
* - `none()` represents the absence of the key/value pair
* - `some(value)` represents the presence of the key/value pair
*
* The semantic of `encode` is:
* - `none()` you don't want to output the key/value pair
* - `some(value)` you want to output the key/value pair
*
* @category model
* @since 3.10.0
*/
var PropertySignatureTransformation$1 = class {
	from;
	to;
	decode;
	encode;
	constructor(from, to, decode, encode) {
		this.from = from;
		this.to = to;
		this.decode = decode;
		this.encode = encode;
	}
};
/**
* @category model
* @since 3.10.0
*/
var TypeLiteralTransformation = class {
	propertySignatureTransformations;
	/**
	* @since 3.10.0
	*/
	_tag = "TypeLiteralTransformation";
	constructor(propertySignatureTransformations) {
		this.propertySignatureTransformations = propertySignatureTransformations;
		const fromKeys = {};
		const toKeys = {};
		for (const pst of propertySignatureTransformations) {
			const from = pst.from;
			if (fromKeys[from]) throw new Error(getASTDuplicatePropertySignatureTransformationErrorMessage(from));
			fromKeys[from] = true;
			const to = pst.to;
			if (toKeys[to]) throw new Error(getASTDuplicatePropertySignatureTransformationErrorMessage(to));
			toKeys[to] = true;
		}
	}
};
/**
* @category guards
* @since 3.10.0
*/
const isTypeLiteralTransformation = /*#__PURE__*/ createTransformationGuard("TypeLiteralTransformation");
/**
* Merges a set of new annotations with existing ones, potentially overwriting
* any duplicates.
*
* Any previously existing identifier annotations are deleted.
*
* @since 3.10.0
*/
const annotations = (ast, overrides) => {
	const d = Object.getOwnPropertyDescriptors(ast);
	const base = { ...ast.annotations };
	delete base[IdentifierAnnotationId];
	const value = {
		...base,
		...overrides
	};
	const surrogate = getSurrogateAnnotation(ast);
	if (isSome(surrogate)) value[SurrogateAnnotationId] = annotations(surrogate.value, overrides);
	d.annotations.value = value;
	return Object.create(Object.getPrototypeOf(ast), d);
};
const STRING_KEYWORD_PATTERN = "[\\s\\S]*?";
const NUMBER_KEYWORD_PATTERN = "[+-]?\\d*\\.?\\d+(?:[Ee][+-]?\\d+)?";
const getTemplateLiteralSpanTypePattern = (type, capture) => {
	switch (type._tag) {
		case "Literal": return escape(String(type.literal));
		case "StringKeyword": return STRING_KEYWORD_PATTERN;
		case "NumberKeyword": return NUMBER_KEYWORD_PATTERN;
		case "TemplateLiteral": return getTemplateLiteralPattern(type, capture, false);
		case "Union": return type.types.map((type) => getTemplateLiteralSpanTypePattern(type, capture)).join("|");
	}
};
const handleTemplateLiteralSpanTypeParens = (type, s, capture, top) => {
	if (isUnion(type)) {
		if (capture && !top) return `(?:${s})`;
	} else if (!capture || !top) return s;
	return `(${s})`;
};
const getTemplateLiteralPattern = (ast, capture, top) => {
	let pattern = ``;
	if (ast.head !== "") {
		const head = escape(ast.head);
		pattern += capture && top ? `(${head})` : head;
	}
	for (const span of ast.spans) {
		const spanPattern = getTemplateLiteralSpanTypePattern(span.type, capture);
		pattern += handleTemplateLiteralSpanTypeParens(span.type, spanPattern, capture, top);
		if (span.literal !== "") {
			const literal = escape(span.literal);
			pattern += capture && top ? `(${literal})` : literal;
		}
	}
	return pattern;
};
/**
* Generates a regular expression from a `TemplateLiteral` AST node.
*
* @see {@link getTemplateLiteralCapturingRegExp} for a variant that captures the pattern.
*
* @since 3.10.0
*/
const getTemplateLiteralRegExp = (ast) => new RegExp(`^${getTemplateLiteralPattern(ast, false, true)}$`);
/** @internal */
const record = (key, value) => {
	const propertySignatures = [];
	const indexSignatures = [];
	const go = (key) => {
		switch (key._tag) {
			case "NeverKeyword": break;
			case "StringKeyword":
			case "SymbolKeyword":
			case "TemplateLiteral":
			case "Refinement":
				indexSignatures.push(new IndexSignature(key, value, true));
				break;
			case "Literal":
				if (isString(key.literal) || isNumber(key.literal)) propertySignatures.push(new PropertySignature(key.literal, value, false, true));
				else throw new Error(getASTUnsupportedLiteralErrorMessage(key.literal));
				break;
			case "Enums":
				for (const [_, name] of key.enums) propertySignatures.push(new PropertySignature(name, value, false, true));
				break;
			case "UniqueSymbol":
				propertySignatures.push(new PropertySignature(key.symbol, value, false, true));
				break;
			case "Union":
				key.types.forEach(go);
				break;
			default: throw new Error(getASTUnsupportedKeySchemaErrorMessage(key));
		}
	};
	go(key);
	return {
		propertySignatures,
		indexSignatures
	};
};
/** @internal */
const pickAnnotations = (annotationIds) => (annotated) => {
	let out = void 0;
	for (const id of annotationIds) if (Object.prototype.hasOwnProperty.call(annotated.annotations, id)) {
		if (out === void 0) out = {};
		out[id] = annotated.annotations[id];
	}
	return out;
};
/** @internal */
const omitAnnotations = (annotationIds) => (annotated) => {
	const out = { ...annotated.annotations };
	for (const id of annotationIds) delete out[id];
	return out;
};
const preserveTransformationAnnotations = /*#__PURE__*/ pickAnnotations([
	ExamplesAnnotationId,
	DefaultAnnotationId,
	JSONSchemaAnnotationId,
	ArbitraryAnnotationId,
	PrettyAnnotationId,
	EquivalenceAnnotationId
]);
/**
* @since 3.10.0
*/
const typeAST = (ast) => {
	switch (ast._tag) {
		case "Declaration": {
			const typeParameters = changeMap(ast.typeParameters, typeAST);
			return typeParameters === ast.typeParameters ? ast : new Declaration(typeParameters, ast.decodeUnknown, ast.encodeUnknown, ast.annotations);
		}
		case "TupleType": {
			const elements = changeMap(ast.elements, (e) => {
				const type = typeAST(e.type);
				return type === e.type ? e : new OptionalType(type, e.isOptional);
			});
			const restASTs = getRestASTs(ast.rest);
			const rest = changeMap(restASTs, typeAST);
			return elements === ast.elements && rest === restASTs ? ast : new TupleType(elements, rest.map((type) => new Type$1(type)), ast.isReadonly, ast.annotations);
		}
		case "TypeLiteral": {
			const propertySignatures = changeMap(ast.propertySignatures, (p) => {
				const type = typeAST(p.type);
				return type === p.type ? p : new PropertySignature(p.name, type, p.isOptional, p.isReadonly);
			});
			const indexSignatures = changeMap(ast.indexSignatures, (is) => {
				const type = typeAST(is.type);
				return type === is.type ? is : new IndexSignature(is.parameter, type, is.isReadonly);
			});
			return propertySignatures === ast.propertySignatures && indexSignatures === ast.indexSignatures ? ast : new TypeLiteral(propertySignatures, indexSignatures, ast.annotations);
		}
		case "Union": {
			const types = changeMap(ast.types, typeAST);
			return types === ast.types ? ast : Union$1.make(types, ast.annotations);
		}
		case "Suspend": return new Suspend(() => typeAST(ast.f()), ast.annotations);
		case "Refinement": {
			const from = typeAST(ast.from);
			return from === ast.from ? ast : new Refinement$1(from, ast.filter, ast.annotations);
		}
		case "Transformation": {
			const preserve = preserveTransformationAnnotations(ast);
			return typeAST(preserve !== void 0 ? annotations(ast.to, preserve) : ast.to);
		}
	}
	return ast;
};
function changeMap(as, f) {
	let changed = false;
	const out = allocate(as.length);
	for (let i = 0; i < as.length; i++) {
		const a = as[i];
		const fa = f(a);
		if (fa !== a) changed = true;
		out[i] = fa;
	}
	return changed ? out : as;
}
/**
* Returns the from part of a transformation if it exists
*
* @internal
*/
const getTransformationFrom = (ast) => {
	switch (ast._tag) {
		case "Transformation": return ast.from;
		case "Refinement": return getTransformationFrom(ast.from);
		case "Suspend": return getTransformationFrom(ast.f());
	}
};
const encodedAST_ = (ast, isBound) => {
	switch (ast._tag) {
		case "Declaration": {
			const typeParameters = changeMap(ast.typeParameters, (ast) => encodedAST_(ast, isBound));
			return typeParameters === ast.typeParameters ? ast : new Declaration(typeParameters, ast.decodeUnknown, ast.encodeUnknown);
		}
		case "TupleType": {
			const elements = changeMap(ast.elements, (e) => {
				const type = encodedAST_(e.type, isBound);
				return type === e.type ? e : new OptionalType(type, e.isOptional);
			});
			const restASTs = getRestASTs(ast.rest);
			const rest = changeMap(restASTs, (ast) => encodedAST_(ast, isBound));
			return elements === ast.elements && rest === restASTs ? ast : new TupleType(elements, rest.map((ast) => new Type$1(ast)), ast.isReadonly);
		}
		case "TypeLiteral": {
			const propertySignatures = changeMap(ast.propertySignatures, (ps) => {
				const type = encodedAST_(ps.type, isBound);
				return type === ps.type ? ps : new PropertySignature(ps.name, type, ps.isOptional, ps.isReadonly);
			});
			const indexSignatures = changeMap(ast.indexSignatures, (is) => {
				const type = encodedAST_(is.type, isBound);
				return type === is.type ? is : new IndexSignature(is.parameter, type, is.isReadonly);
			});
			return propertySignatures === ast.propertySignatures && indexSignatures === ast.indexSignatures ? ast : new TypeLiteral(propertySignatures, indexSignatures);
		}
		case "Union": {
			const types = changeMap(ast.types, (ast) => encodedAST_(ast, isBound));
			return types === ast.types ? ast : Union$1.make(types);
		}
		case "Suspend": {
			let borrowedAnnotations = void 0;
			const identifier = getJSONIdentifier(ast);
			if (isSome(identifier)) {
				const suffix = isBound ? "Bound" : "";
				borrowedAnnotations = { [JSONIdentifierAnnotationId]: `${identifier.value}Encoded${suffix}` };
			}
			return new Suspend(() => encodedAST_(ast.f(), isBound), borrowedAnnotations);
		}
		case "Refinement": {
			const from = encodedAST_(ast.from, isBound);
			if (isBound) {
				if (from === ast.from) return ast;
				if (getTransformationFrom(ast.from) === void 0 && hasStableFilter(ast)) return new Refinement$1(from, ast.filter, ast.annotations);
				return from;
			} else return from;
		}
		case "Transformation": return encodedAST_(ast.from, isBound);
	}
	return ast;
};
/**
* @since 3.10.0
*/
const encodedAST = (ast) => encodedAST_(ast, false);
const toJSONAnnotations = (annotations) => {
	const out = {};
	for (const k of Object.getOwnPropertySymbols(annotations)) out[String(k)] = annotations[k];
	return out;
};
/** @internal */
const getEncodedParameter = (ast) => {
	switch (ast._tag) {
		case "StringKeyword":
		case "SymbolKeyword":
		case "TemplateLiteral": return ast;
		case "Refinement": return getEncodedParameter(ast.from);
	}
};
/** @internal */
const compose$1 = (ab, cd) => new Transformation$1(ab, cd, composeTransformation);
const formatKeyword = (ast) => getOrElse(getExpected(ast), () => ast._tag);
function getBrands(ast) {
	return match$9(getBrandAnnotation(ast), {
		onNone: () => "",
		onSome: (brands) => brands.map((brand) => ` & Brand<${formatUnknown(brand)}>`).join("")
	});
}
const getOrElseExpected = (ast) => getTitleAnnotation(ast).pipe(orElse$5(() => getDescriptionAnnotation(ast)), orElse$5(() => getAutoTitleAnnotation(ast)), map$13((s) => s + getBrands(ast)));
const getExpected = (ast) => orElse$5(getIdentifierAnnotation(ast), () => getOrElseExpected(ast));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/ParseResult.js
/**
* @since 3.10.0
*/
/**
* @category model
* @since 3.10.0
*/
var Pointer = class {
	path;
	actual;
	issue;
	/**
	* @since 3.10.0
	*/
	_tag = "Pointer";
	constructor(path, actual, issue) {
		this.path = path;
		this.actual = actual;
		this.issue = issue;
	}
};
/**
* Error that occurs when an unexpected key or index is present.
*
* @category model
* @since 3.10.0
*/
var Unexpected = class {
	actual;
	message;
	/**
	* @since 3.10.0
	*/
	_tag = "Unexpected";
	constructor(actual, message) {
		this.actual = actual;
		this.message = message;
	}
};
/**
* Error that occurs when a required key or index is missing.
*
* @category model
* @since 3.10.0
*/
var Missing = class {
	ast;
	message;
	/**
	* @since 3.10.0
	*/
	_tag = "Missing";
	/**
	* @since 3.10.0
	*/
	actual = void 0;
	constructor(ast, message) {
		this.ast = ast;
		this.message = message;
	}
};
/**
* Error that contains multiple issues.
*
* @category model
* @since 3.10.0
*/
var Composite = class {
	ast;
	actual;
	issues;
	output;
	/**
	* @since 3.10.0
	*/
	_tag = "Composite";
	constructor(ast, actual, issues, output) {
		this.ast = ast;
		this.actual = actual;
		this.issues = issues;
		this.output = output;
	}
};
/**
* Error that occurs when a refinement has an error.
*
* @category model
* @since 3.10.0
*/
var Refinement = class {
	ast;
	actual;
	kind;
	issue;
	/**
	* @since 3.10.0
	*/
	_tag = "Refinement";
	constructor(ast, actual, kind, issue) {
		this.ast = ast;
		this.actual = actual;
		this.kind = kind;
		this.issue = issue;
	}
};
/**
* Error that occurs when a transformation has an error.
*
* @category model
* @since 3.10.0
*/
var Transformation = class {
	ast;
	actual;
	kind;
	issue;
	/**
	* @since 3.10.0
	*/
	_tag = "Transformation";
	constructor(ast, actual, kind, issue) {
		this.ast = ast;
		this.actual = actual;
		this.kind = kind;
		this.issue = issue;
	}
};
/**
* The `Type` variant of the `ParseIssue` type represents an error that occurs when the `actual` value is not of the expected type.
* The `ast` field specifies the expected type, and the `actual` field contains the value that caused the error.
*
* @category model
* @since 3.10.0
*/
var Type = class {
	ast;
	actual;
	message;
	/**
	* @since 3.10.0
	*/
	_tag = "Type";
	constructor(ast, actual, message) {
		this.ast = ast;
		this.actual = actual;
		this.message = message;
	}
};
/**
* The `Forbidden` variant of the `ParseIssue` type represents a forbidden operation, such as when encountering an Effect that is not allowed to execute (e.g., using `runSync`).
*
* @category model
* @since 3.10.0
*/
var Forbidden = class {
	ast;
	actual;
	message;
	/**
	* @since 3.10.0
	*/
	_tag = "Forbidden";
	constructor(ast, actual, message) {
		this.ast = ast;
		this.actual = actual;
		this.message = message;
	}
};
/**
* @category type id
* @since 3.10.0
*/
const ParseErrorTypeId = /*#__PURE__*/ Symbol.for("effect/Schema/ParseErrorTypeId");
/**
* @since 3.10.0
*/
var ParseError = class extends TaggedError$1("ParseError") {
	/**
	* @since 3.10.0
	*/
	[ParseErrorTypeId] = ParseErrorTypeId;
	get message() {
		return this.toString();
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return TreeFormatter.formatIssueSync(this.issue);
	}
	/**
	* @since 3.10.0
	*/
	toJSON() {
		return {
			_id: "ParseError",
			message: this.toString()
		};
	}
	/**
	* @since 3.10.0
	*/
	[NodeInspectSymbol]() {
		return this.toJSON();
	}
};
/**
* @category constructors
* @since 3.10.0
*/
const parseError = (issue) => new ParseError({ issue });
/**
* @category constructors
* @since 3.10.0
*/
const succeed = right;
/**
* @category constructors
* @since 3.10.0
*/
const fail = left;
const _try = try_$2;
/**
* @category constructors
* @since 3.10.0
*/
const fromOption = fromOption$1;
const isEither = isEither$1;
/**
* @category optimisation
* @since 3.10.0
*/
const flatMap = /*#__PURE__*/ dual(2, (self, f) => {
	return isEither(self) ? match$7(self, {
		onLeft: left,
		onRight: f
	}) : flatMap$4(self, f);
});
/**
* @category optimisation
* @since 3.10.0
*/
const map = /*#__PURE__*/ dual(2, (self, f) => {
	return isEither(self) ? map$12(self, f) : map$2(self, f);
});
/**
* @category optimisation
* @since 3.10.0
*/
const mapError = /*#__PURE__*/ dual(2, (self, f) => {
	return isEither(self) ? mapLeft(self, f) : mapError$1(self, f);
});
/**
* @category optimisation
* @since 3.10.0
*/
const mapBoth = /*#__PURE__*/ dual(2, (self, options) => {
	return isEither(self) ? mapBoth$4(self, {
		onLeft: options.onFailure,
		onRight: options.onSuccess
	}) : mapBoth$1(self, options);
});
/**
* @category optimisation
* @since 3.10.0
*/
const orElse$2 = /*#__PURE__*/ dual(2, (self, f) => {
	return isEither(self) ? match$7(self, {
		onLeft: f,
		onRight: right
	}) : catchAll(self, f);
});
/** @internal */
const mergeInternalOptions = (options, overrideOptions) => {
	if (overrideOptions === void 0 || isNumber(overrideOptions)) return options;
	if (options === void 0) return overrideOptions;
	return {
		...options,
		...overrideOptions
	};
};
const getEither = (ast, isDecoding, options) => {
	const parser = goMemo(ast, isDecoding);
	return (u, overrideOptions) => parser(u, mergeInternalOptions(options, overrideOptions));
};
const getSync = (ast, isDecoding, options) => {
	const parser = getEither(ast, isDecoding, options);
	return (input, overrideOptions) => getOrThrowWith(parser(input, overrideOptions), parseError);
};
const getEffect = (ast, isDecoding, options) => {
	const parser = goMemo(ast, isDecoding);
	return (input, overrideOptions) => parser(input, {
		...mergeInternalOptions(options, overrideOptions),
		isEffectAllowed: true
	});
};
/**
* @throws `ParseError`
* @category decoding
* @since 3.10.0
*/
const decodeUnknownSync = (schema, options) => getSync(schema.ast, true, options);
/**
* @category decoding
* @since 3.10.0
*/
const decodeUnknownEither$1 = (schema, options) => getEither(schema.ast, true, options);
/**
* @category decoding
* @since 3.10.0
*/
const decodeUnknown = (schema, options) => getEffect(schema.ast, true, options);
/**
* @throws `ParseError`
* @category encoding
* @since 3.10.0
*/
const encodeUnknownSync = (schema, options) => getSync(schema.ast, false, options);
/**
* @category encoding
* @since 3.10.0
*/
const encodeUnknown = (schema, options) => getEffect(schema.ast, false, options);
/**
* @category decoding
* @since 3.10.0
*/
const decodeSync = decodeUnknownSync;
/**
* @throws `ParseError`
* @category validation
* @since 3.10.0
*/
const validateSync = (schema, options) => getSync(typeAST(schema.ast), true, options);
/**
* By default the option `exact` is set to `true`.
*
* @category validation
* @since 3.10.0
*/
const is = (schema, options) => {
	const parser = goMemo(typeAST(schema.ast), true);
	return (u, overrideOptions) => isRight(parser(u, {
		exact: true,
		...mergeInternalOptions(options, overrideOptions)
	}));
};
/**
* @category encoding
* @since 3.10.0
*/
const encodeSync = encodeUnknownSync;
const decodeMemoMap = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/ParseResult/decodeMemoMap"), () => /* @__PURE__ */ new WeakMap());
const encodeMemoMap = /*#__PURE__*/ globalValue(/*#__PURE__*/ Symbol.for("effect/ParseResult/encodeMemoMap"), () => /* @__PURE__ */ new WeakMap());
const goMemo = (ast, isDecoding) => {
	const memoMap = isDecoding ? decodeMemoMap : encodeMemoMap;
	const memo = memoMap.get(ast);
	if (memo) return memo;
	const raw = go(ast, isDecoding);
	const parseOptionsAnnotation = getParseOptionsAnnotation(ast);
	const parserWithOptions = isSome(parseOptionsAnnotation) ? (i, options) => raw(i, mergeInternalOptions(options, parseOptionsAnnotation.value)) : raw;
	const decodingFallbackAnnotation = getDecodingFallbackAnnotation(ast);
	const parser = isDecoding && isSome(decodingFallbackAnnotation) ? (i, options) => handleForbidden(orElse$2(parserWithOptions(i, options), decodingFallbackAnnotation.value), ast, i, options) : parserWithOptions;
	memoMap.set(ast, parser);
	return parser;
};
const getConcurrency = (ast) => getOrUndefined(getConcurrencyAnnotation(ast));
const getBatching = (ast) => getOrUndefined(getBatchingAnnotation(ast));
const go = (ast, isDecoding) => {
	switch (ast._tag) {
		case "Refinement": if (isDecoding) {
			const from = goMemo(ast.from, true);
			return (i, options) => {
				options = options ?? defaultParseOption;
				const allErrors = options?.errors === "all";
				const result = flatMap(orElse$2(from(i, options), (ef) => {
					const issue = new Refinement(ast, i, "From", ef);
					if (allErrors && hasStableFilter(ast) && isComposite(ef)) return match$9(ast.filter(i, options, ast), {
						onNone: () => left(issue),
						onSome: (ep) => left(new Composite(ast, i, [issue, new Refinement(ast, i, "Predicate", ep)]))
					});
					return left(issue);
				}), (a) => match$9(ast.filter(a, options, ast), {
					onNone: () => right(a),
					onSome: (ep) => left(new Refinement(ast, i, "Predicate", ep))
				}));
				return handleForbidden(result, ast, i, options);
			};
		} else {
			const from = goMemo(typeAST(ast), true);
			const to = goMemo(dropRightRefinement(ast.from), false);
			return (i, options) => handleForbidden(flatMap(from(i, options), (a) => to(a, options)), ast, i, options);
		}
		case "Transformation": {
			const transform = getFinalTransformation(ast.transformation, isDecoding);
			const from = isDecoding ? goMemo(ast.from, true) : goMemo(ast.to, false);
			const to = isDecoding ? goMemo(ast.to, true) : goMemo(ast.from, false);
			return (i, options) => handleForbidden(flatMap(mapError(from(i, options), (e) => new Transformation(ast, i, isDecoding ? "Encoded" : "Type", e)), (a) => flatMap(mapError(transform(a, options ?? defaultParseOption, ast, i), (e) => new Transformation(ast, i, "Transformation", e)), (i2) => mapError(to(i2, options), (e) => new Transformation(ast, i, isDecoding ? "Type" : "Encoded", e)))), ast, i, options);
		}
		case "Declaration": {
			const parse = isDecoding ? ast.decodeUnknown(...ast.typeParameters) : ast.encodeUnknown(...ast.typeParameters);
			return (i, options) => handleForbidden(parse(i, options ?? defaultParseOption, ast), ast, i, options);
		}
		case "Literal": return fromRefinement(ast, (u) => u === ast.literal);
		case "UniqueSymbol": return fromRefinement(ast, (u) => u === ast.symbol);
		case "UndefinedKeyword": return fromRefinement(ast, isUndefined);
		case "NeverKeyword": return fromRefinement(ast, isNever);
		case "UnknownKeyword":
		case "AnyKeyword":
		case "VoidKeyword": return right;
		case "StringKeyword": return fromRefinement(ast, isString);
		case "NumberKeyword": return fromRefinement(ast, isNumber);
		case "BooleanKeyword": return fromRefinement(ast, isBoolean);
		case "BigIntKeyword": return fromRefinement(ast, isBigInt);
		case "SymbolKeyword": return fromRefinement(ast, isSymbol);
		case "ObjectKeyword": return fromRefinement(ast, isObject);
		case "Enums": return fromRefinement(ast, (u) => ast.enums.some(([_, value]) => value === u));
		case "TemplateLiteral": {
			if (ast.spans.every((span) => isStringKeyword(span.type))) return fromRefinement(ast, (u) => {
				if (!isString(u) || !u.startsWith(ast.head)) return false;
				let position = ast.head.length;
				for (let i = 0; i < ast.spans.length - 1; i++) {
					const literal = ast.spans[i].literal;
					const index = u.indexOf(literal, position);
					if (index === -1) return false;
					position = index + literal.length;
				}
				const literal = ast.spans[ast.spans.length - 1].literal;
				return u.endsWith(literal) && u.length - literal.length >= position;
			});
			const regex = getTemplateLiteralRegExp(ast);
			return fromRefinement(ast, (u) => isString(u) && regex.test(u));
		}
		case "TupleType": {
			const elements = ast.elements.map((e) => goMemo(e.type, isDecoding));
			const rest = ast.rest.map((annotatedAST) => goMemo(annotatedAST.type, isDecoding));
			let requiredTypes = ast.elements.filter((e) => !e.isOptional);
			if (ast.rest.length > 0) requiredTypes = requiredTypes.concat(ast.rest.slice(1));
			const requiredLen = requiredTypes.length;
			const expectedIndexes = ast.elements.length > 0 ? ast.elements.map((_, i) => i).join(" | ") : "never";
			const concurrency = getConcurrency(ast);
			const batching = getBatching(ast);
			return (input, options) => {
				if (!isArray(input)) return left(new Type(ast, input));
				const allErrors = options?.errors === "all";
				const es = [];
				let stepKey = 0;
				const output = [];
				const len = input.length;
				for (let i = len; i <= requiredLen - 1; i++) {
					const e = new Pointer(i, input, new Missing(requiredTypes[i - len]));
					if (allErrors) {
						es.push([stepKey++, e]);
						continue;
					} else return left(new Composite(ast, input, e, output));
				}
				if (ast.rest.length === 0) for (let i = ast.elements.length; i <= len - 1; i++) {
					const e = new Pointer(i, input, new Unexpected(input[i], `is unexpected, expected: ${expectedIndexes}`));
					if (allErrors) {
						es.push([stepKey++, e]);
						continue;
					} else return left(new Composite(ast, input, e, output));
				}
				let i = 0;
				let queue = void 0;
				for (; i < elements.length; i++) if (len < i + 1) {
					if (ast.elements[i].isOptional) continue;
				} else {
					const parser = elements[i];
					const te = parser(input[i], options);
					if (isEither(te)) {
						if (isLeft(te)) {
							const e = new Pointer(i, input, te.left);
							if (allErrors) {
								es.push([stepKey++, e]);
								continue;
							} else return left(new Composite(ast, input, e, sortByIndex(output)));
						}
						output.push([stepKey++, te.right]);
					} else {
						const nk = stepKey++;
						const index = i;
						if (!queue) queue = [];
						queue.push(({ es, output }) => flatMap$4(either$1(te), (t) => {
							if (isLeft(t)) {
								const e = new Pointer(index, input, t.left);
								if (allErrors) {
									es.push([nk, e]);
									return _void;
								} else return left(new Composite(ast, input, e, sortByIndex(output)));
							}
							output.push([nk, t.right]);
							return _void;
						}));
					}
				}
				if (isNonEmptyReadonlyArray(rest)) {
					const [head, ...tail] = rest;
					for (; i < len - tail.length; i++) {
						const te = head(input[i], options);
						if (isEither(te)) {
							if (isLeft(te)) {
								const e = new Pointer(i, input, te.left);
								if (allErrors) {
									es.push([stepKey++, e]);
									continue;
								} else return left(new Composite(ast, input, e, sortByIndex(output)));
							} else output.push([stepKey++, te.right]);
						} else {
							const nk = stepKey++;
							const index = i;
							if (!queue) queue = [];
							queue.push(({ es, output }) => flatMap$4(either$1(te), (t) => {
								if (isLeft(t)) {
									const e = new Pointer(index, input, t.left);
									if (allErrors) {
										es.push([nk, e]);
										return _void;
									} else return left(new Composite(ast, input, e, sortByIndex(output)));
								} else {
									output.push([nk, t.right]);
									return _void;
								}
							}));
						}
					}
					for (let j = 0; j < tail.length; j++) {
						const index = i + j;
						if (len < index + 1) continue;
						else {
							const te = tail[j](input[index], options);
							if (isEither(te)) {
								if (isLeft(te)) {
									const e = new Pointer(index, input, te.left);
									if (allErrors) {
										es.push([stepKey++, e]);
										continue;
									} else return left(new Composite(ast, input, e, sortByIndex(output)));
								}
								output.push([stepKey++, te.right]);
							} else {
								const nk = stepKey++;
								if (!queue) queue = [];
								queue.push(({ es, output }) => flatMap$4(either$1(te), (t) => {
									if (isLeft(t)) {
										const e = new Pointer(index, input, t.left);
										if (allErrors) {
											es.push([nk, e]);
											return _void;
										} else return left(new Composite(ast, input, e, sortByIndex(output)));
									}
									output.push([nk, t.right]);
									return _void;
								}));
							}
						}
					}
				}
				const computeResult = ({ es, output }) => isNonEmptyArray(es) ? left(new Composite(ast, input, sortByIndex(es), sortByIndex(output))) : right(sortByIndex(output));
				if (queue && queue.length > 0) {
					const cqueue = queue;
					return suspend$5(() => {
						const state = {
							es: copy$2(es),
							output: copy$2(output)
						};
						return flatMap$4(forEach$2(cqueue, (f) => f(state), {
							concurrency,
							batching,
							discard: true
						}), () => computeResult(state));
					});
				}
				return computeResult({
					output,
					es
				});
			};
		}
		case "TypeLiteral": {
			if (ast.propertySignatures.length === 0 && ast.indexSignatures.length === 0) return fromRefinement(ast, isNotNullable);
			const propertySignatures = [];
			const expectedKeysMap = {};
			const expectedKeys = [];
			for (const ps of ast.propertySignatures) {
				propertySignatures.push([goMemo(ps.type, isDecoding), ps]);
				expectedKeysMap[ps.name] = null;
				expectedKeys.push(ps.name);
			}
			const indexSignatures = ast.indexSignatures.map((is) => [
				goMemo(is.parameter, isDecoding),
				goMemo(is.type, isDecoding),
				is.parameter
			]);
			const expectedAST = Union$1.make(ast.indexSignatures.map((is) => is.parameter).concat(expectedKeys.map((key) => isSymbol(key) ? new UniqueSymbol(key) : new Literal$1(key))));
			const expected = goMemo(expectedAST, isDecoding);
			const concurrency = getConcurrency(ast);
			const batching = getBatching(ast);
			return (input, options) => {
				if (!isRecord(input)) return left(new Type(ast, input));
				const allErrors = options?.errors === "all";
				const es = [];
				let stepKey = 0;
				const onExcessPropertyError = options?.onExcessProperty === "error";
				const onExcessPropertyPreserve = options?.onExcessProperty === "preserve";
				const output = {};
				let inputKeys;
				if (onExcessPropertyError || onExcessPropertyPreserve) {
					inputKeys = Reflect.ownKeys(input);
					for (const key of inputKeys) {
						const te = expected(key, options);
						if (isEither(te) && isLeft(te)) {
							if (onExcessPropertyError) {
								const e = new Pointer(key, input, new Unexpected(input[key], `is unexpected, expected: ${String(expectedAST)}`));
								if (allErrors) {
									es.push([stepKey++, e]);
									continue;
								} else return left(new Composite(ast, input, e, output));
							} else output[key] = input[key];
						}
					}
				}
				let queue = void 0;
				const isExact = options?.exact === true;
				for (let i = 0; i < propertySignatures.length; i++) {
					const ps = propertySignatures[i][1];
					const name = ps.name;
					const hasKey = Object.prototype.hasOwnProperty.call(input, name);
					if (!hasKey) {
						if (ps.isOptional) continue;
						else if (isExact) {
							const e = new Pointer(name, input, new Missing(ps));
							if (allErrors) {
								es.push([stepKey++, e]);
								continue;
							} else return left(new Composite(ast, input, e, output));
						}
					}
					const parser = propertySignatures[i][0];
					const te = parser(input[name], options);
					if (isEither(te)) {
						if (isLeft(te)) {
							const e = new Pointer(name, input, hasKey ? te.left : new Missing(ps));
							if (allErrors) {
								es.push([stepKey++, e]);
								continue;
							} else return left(new Composite(ast, input, e, output));
						}
						output[name] = te.right;
					} else {
						const nk = stepKey++;
						const index = name;
						if (!queue) queue = [];
						queue.push(({ es, output }) => flatMap$4(either$1(te), (t) => {
							if (isLeft(t)) {
								const e = new Pointer(index, input, hasKey ? t.left : new Missing(ps));
								if (allErrors) {
									es.push([nk, e]);
									return _void;
								} else return left(new Composite(ast, input, e, output));
							}
							output[index] = t.right;
							return _void;
						}));
					}
				}
				for (let i = 0; i < indexSignatures.length; i++) {
					const indexSignature = indexSignatures[i];
					const parameter = indexSignature[0];
					const type = indexSignature[1];
					const keys = getKeysForIndexSignature(input, indexSignature[2]);
					for (const key of keys) {
						const keu = parameter(key, options);
						if (isEither(keu) && isRight(keu)) {
							const vpr = type(input[key], options);
							if (isEither(vpr)) {
								if (isLeft(vpr)) {
									const e = new Pointer(key, input, vpr.left);
									if (allErrors) {
										es.push([stepKey++, e]);
										continue;
									} else return left(new Composite(ast, input, e, output));
								} else if (!Object.prototype.hasOwnProperty.call(expectedKeysMap, key)) output[key] = vpr.right;
							} else {
								const nk = stepKey++;
								const index = key;
								if (!queue) queue = [];
								queue.push(({ es, output }) => flatMap$4(either$1(vpr), (tv) => {
									if (isLeft(tv)) {
										const e = new Pointer(index, input, tv.left);
										if (allErrors) {
											es.push([nk, e]);
											return _void;
										} else return left(new Composite(ast, input, e, output));
									} else {
										if (!Object.prototype.hasOwnProperty.call(expectedKeysMap, key)) output[key] = tv.right;
										return _void;
									}
								}));
							}
						}
					}
				}
				const computeResult = ({ es, output }) => {
					if (isNonEmptyArray(es)) return left(new Composite(ast, input, sortByIndex(es), output));
					if (options?.propertyOrder === "original") {
						const keys = inputKeys || Reflect.ownKeys(input);
						for (const name of expectedKeys) if (keys.indexOf(name) === -1) keys.push(name);
						const out = {};
						for (const key of keys) if (Object.prototype.hasOwnProperty.call(output, key)) out[key] = output[key];
						return right(out);
					}
					return right(output);
				};
				if (queue && queue.length > 0) {
					const cqueue = queue;
					return suspend$5(() => {
						const state = {
							es: copy$2(es),
							output: Object.assign({}, output)
						};
						return flatMap$4(forEach$2(cqueue, (f) => f(state), {
							concurrency,
							batching,
							discard: true
						}), () => computeResult(state));
					});
				}
				return computeResult({
					es,
					output
				});
			};
		}
		case "Union": {
			const searchTree = getSearchTree(ast.types, isDecoding);
			const ownKeys = Reflect.ownKeys(searchTree.keys);
			const ownKeysLen = ownKeys.length;
			const astTypesLen = ast.types.length;
			const map = /* @__PURE__ */ new Map();
			for (let i = 0; i < astTypesLen; i++) map.set(ast.types[i], goMemo(ast.types[i], isDecoding));
			const concurrency = getConcurrency(ast) ?? 1;
			const batching = getBatching(ast);
			return (input, options) => {
				const es = [];
				let stepKey = 0;
				let candidates = [];
				if (ownKeysLen > 0) {
					if (isRecordOrArray(input)) for (let i = 0; i < ownKeysLen; i++) {
						const name = ownKeys[i];
						const buckets = searchTree.keys[name].buckets;
						if (Object.prototype.hasOwnProperty.call(input, name)) {
							const literal = String(input[name]);
							if (Object.prototype.hasOwnProperty.call(buckets, literal)) candidates = candidates.concat(buckets[literal]);
							else {
								const { candidates, literals } = searchTree.keys[name];
								const literalsUnion = Union$1.make(literals);
								const errorAst = candidates.length === astTypesLen ? new TypeLiteral([new PropertySignature(name, literalsUnion, false, true)], []) : Union$1.make(candidates);
								es.push([stepKey++, new Composite(errorAst, input, new Pointer(name, input, new Type(literalsUnion, input[name])))]);
							}
						} else {
							const { candidates, literals } = searchTree.keys[name];
							const fakePropertySignature = new PropertySignature(name, Union$1.make(literals), false, true);
							const errorAst = candidates.length === astTypesLen ? new TypeLiteral([fakePropertySignature], []) : Union$1.make(candidates);
							es.push([stepKey++, new Composite(errorAst, input, new Pointer(name, input, new Missing(fakePropertySignature)))]);
						}
					}
					else {
						const errorAst = searchTree.candidates.length === astTypesLen ? ast : Union$1.make(searchTree.candidates);
						es.push([stepKey++, new Type(errorAst, input)]);
					}
				}
				if (searchTree.otherwise.length > 0) candidates = candidates.concat(searchTree.otherwise);
				let queue = void 0;
				for (let i = 0; i < candidates.length; i++) {
					const candidate = candidates[i];
					const pr = map.get(candidate)(input, options);
					if (isEither(pr) && (!queue || queue.length === 0)) {
						if (isRight(pr)) return pr;
						else es.push([stepKey++, pr.left]);
					} else {
						const nk = stepKey++;
						if (!queue) queue = [];
						queue.push((state) => suspend$5(() => {
							if ("finalResult" in state) return _void;
							else return flatMap$4(either$1(pr), (t) => {
								if (isRight(t)) state.finalResult = t;
								else state.es.push([nk, t.left]);
								return _void;
							});
						}));
					}
				}
				const computeResult = (es) => isNonEmptyArray(es) ? es.length === 1 && es[0][1]._tag === "Type" ? left(es[0][1]) : left(new Composite(ast, input, sortByIndex(es))) : left(new Type(ast, input));
				if (queue && queue.length > 0) {
					const cqueue = queue;
					return suspend$5(() => {
						const state = { es: copy$2(es) };
						return flatMap$4(forEach$2(cqueue, (f) => f(state), {
							concurrency,
							batching,
							discard: true
						}), () => {
							if ("finalResult" in state) return state.finalResult;
							return computeResult(state.es);
						});
					});
				}
				return computeResult(es);
			};
		}
		case "Suspend": {
			const get = memoizeThunk(() => goMemo(ast.f(), isDecoding));
			return (a, options) => get()(a, options);
		}
	}
};
const fromRefinement = (ast, refinement) => (u) => refinement(u) ? right(u) : left(new Type(ast, u));
/** @internal */
const getLiterals = (ast, isDecoding) => {
	switch (ast._tag) {
		case "Declaration": {
			const annotation = getSurrogateAnnotation(ast);
			if (isSome(annotation)) return getLiterals(annotation.value, isDecoding);
			break;
		}
		case "TypeLiteral": {
			const out = [];
			for (let i = 0; i < ast.propertySignatures.length; i++) {
				const propertySignature = ast.propertySignatures[i];
				const type = isDecoding ? encodedAST(propertySignature.type) : typeAST(propertySignature.type);
				if (isLiteral(type) && !propertySignature.isOptional) out.push([propertySignature.name, type]);
			}
			return out;
		}
		case "TupleType": {
			const out = [];
			for (let i = 0; i < ast.elements.length; i++) {
				const element = ast.elements[i];
				const type = isDecoding ? encodedAST(element.type) : typeAST(element.type);
				if (isLiteral(type) && !element.isOptional) out.push([i, type]);
			}
			return out;
		}
		case "Refinement": return getLiterals(ast.from, isDecoding);
		case "Suspend": return getLiterals(ast.f(), isDecoding);
		case "Transformation": return getLiterals(isDecoding ? ast.from : ast.to, isDecoding);
	}
	return [];
};
/**
* The purpose of the algorithm is to narrow down the pool of possible
* candidates for decoding as much as possible.
*
* This function separates the schemas into two groups, `keys` and `otherwise`:
*
* - `keys`: the schema has at least one property with a literal value
* - `otherwise`: the schema has no properties with a literal value
*
* If a schema has at least one property with a literal value, so it ends up in
* `keys`, first a namespace is created for the name of the property containing
* the literal, and then within this namespace a "bucket" is created for the
* literal value in which to store all the schemas that have the same property
* and literal value.
*
* @internal
*/
const getSearchTree = (members, isDecoding) => {
	const keys = {};
	const otherwise = [];
	const candidates = [];
	for (let i = 0; i < members.length; i++) {
		const member = members[i];
		const tags = getLiterals(member, isDecoding);
		if (tags.length > 0) {
			candidates.push(member);
			for (let j = 0; j < tags.length; j++) {
				const [key, literal] = tags[j];
				const hash = String(literal.literal);
				keys[key] = keys[key] || {
					buckets: {},
					literals: [],
					candidates: []
				};
				const buckets = keys[key].buckets;
				if (Object.prototype.hasOwnProperty.call(buckets, hash)) {
					if (j < tags.length - 1) continue;
					buckets[hash].push(member);
					keys[key].literals.push(literal);
					keys[key].candidates.push(member);
				} else {
					buckets[hash] = [member];
					keys[key].literals.push(literal);
					keys[key].candidates.push(member);
					break;
				}
			}
		} else otherwise.push(member);
	}
	return {
		keys,
		otherwise,
		candidates
	};
};
const dropRightRefinement = (ast) => isRefinement$1(ast) ? dropRightRefinement(ast.from) : ast;
const handleForbidden = (effect, ast, actual, options) => {
	if (options?.isEffectAllowed === true) return effect;
	if (isEither(effect)) return effect;
	const scheduler = new SyncScheduler();
	const fiber = runFork$1(effect, { scheduler });
	scheduler.flush();
	const exit = fiber.unsafePoll();
	if (exit) {
		if (isSuccess(exit)) return right(exit.value);
		const cause = exit.cause;
		if (isFailType(cause)) return left(cause.error);
		return left(new Forbidden(ast, actual, pretty(cause)));
	}
	return left(new Forbidden(ast, actual, "cannot be be resolved synchronously, this is caused by using runSync on an effect that performs async work"));
};
const compare = ([a], [b]) => a > b ? 1 : a < b ? -1 : 0;
function sortByIndex(es) {
	return es.sort(compare).map((t) => t[1]);
}
/** @internal */
const getFinalTransformation = (transformation, isDecoding) => {
	switch (transformation._tag) {
		case "FinalTransformation": return isDecoding ? transformation.decode : transformation.encode;
		case "ComposeTransformation": return right;
		case "TypeLiteralTransformation": return (input) => {
			let out = right(input);
			for (const pst of transformation.propertySignatureTransformations) {
				const [from, to] = isDecoding ? [pst.from, pst.to] : [pst.to, pst.from];
				const transformation = isDecoding ? pst.decode : pst.encode;
				const f = (input) => {
					const o = transformation(Object.prototype.hasOwnProperty.call(input, from) ? some(input[from]) : none$4());
					delete input[from];
					if (isSome(o)) input[to] = o.value;
					return input;
				};
				out = map(out, f);
			}
			return out;
		};
	}
};
const makeTree = (value, forest = []) => ({
	value,
	forest
});
/**
* @category formatting
* @since 3.10.0
*/
const TreeFormatter = {
	formatIssue: (issue) => map(formatTree(issue), drawTree),
	formatIssueSync: (issue) => {
		const e = TreeFormatter.formatIssue(issue);
		return isEither(e) ? getOrThrow(e) : runSync(e);
	},
	formatError: (error) => TreeFormatter.formatIssue(error.issue),
	formatErrorSync: (error) => TreeFormatter.formatIssueSync(error.issue)
};
const drawTree = (tree) => tree.value + draw("\n", tree.forest);
const draw = (indentation, forest) => {
	let r = "";
	const len = forest.length;
	let tree;
	for (let i = 0; i < len; i++) {
		tree = forest[i];
		const isLast = i === len - 1;
		r += indentation + (isLast ? "└" : "├") + "─ " + tree.value;
		r += draw(indentation + (len > 1 && !isLast ? "│  " : "   "), tree.forest);
	}
	return r;
};
const formatTransformationKind = (kind) => {
	switch (kind) {
		case "Encoded": return "Encoded side transformation failure";
		case "Transformation": return "Transformation process failure";
		case "Type": return "Type side transformation failure";
	}
};
const formatRefinementKind = (kind) => {
	switch (kind) {
		case "From": return "From side refinement failure";
		case "Predicate": return "Predicate refinement failure";
	}
};
const getAnnotated = (issue) => "ast" in issue ? some(issue.ast) : none$4();
const Either_void = /*#__PURE__*/ right(void 0);
const getCurrentMessage = (issue) => getAnnotated(issue).pipe(flatMap$9(getMessageAnnotation), match$9({
	onNone: () => Either_void,
	onSome: (messageAnnotation) => {
		const union = messageAnnotation(issue);
		if (isString(union)) return right({
			message: union,
			override: false
		});
		if (isEffect(union)) return map$2(union, (message) => ({
			message,
			override: false
		}));
		if (isString(union.message)) return right({
			message: union.message,
			override: union.override
		});
		return map$2(union.message, (message) => ({
			message,
			override: union.override
		}));
	}
}));
const createParseIssueGuard = (tag) => (issue) => issue._tag === tag;
/**
* Returns `true` if the value is a `Composite`.
*
* @category guards
* @since 3.10.0
*/
const isComposite = /*#__PURE__*/ createParseIssueGuard("Composite");
const isRefinement = /*#__PURE__*/ createParseIssueGuard("Refinement");
const isTransformation = /*#__PURE__*/ createParseIssueGuard("Transformation");
const getMessage = (issue) => flatMap(getCurrentMessage(issue), (currentMessage) => {
	if (currentMessage !== void 0) return !currentMessage.override && (isComposite(issue) || isRefinement(issue) && issue.kind === "From" || isTransformation(issue) && issue.kind !== "Transformation") ? isTransformation(issue) || isRefinement(issue) ? getMessage(issue.issue) : Either_void : right(currentMessage.message);
	return Either_void;
});
const getParseIssueTitleAnnotation = (issue) => getAnnotated(issue).pipe(flatMap$9(getParseIssueTitleAnnotation$1), flatMapNullable((annotation) => annotation(issue)), getOrUndefined);
/** @internal */
function getRefinementExpected(ast) {
	return getDescriptionAnnotation(ast).pipe(orElse$5(() => getTitleAnnotation(ast)), orElse$5(() => getAutoTitleAnnotation(ast)), orElse$5(() => getIdentifierAnnotation(ast)), getOrElse(() => `{ ${ast.from} | filter }`));
}
function getDefaultTypeMessage(issue) {
	if (issue.message !== void 0) return issue.message;
	return `Expected ${isRefinement$1(issue.ast) ? getRefinementExpected(issue.ast) : String(issue.ast)}, actual ${formatUnknown(issue.actual)}`;
}
const formatTypeMessage = (issue) => map(getMessage(issue), (message) => message ?? getParseIssueTitleAnnotation(issue) ?? getDefaultTypeMessage(issue));
const getParseIssueTitle = (issue) => getParseIssueTitleAnnotation(issue) ?? String(issue.ast);
const formatForbiddenMessage = (issue) => issue.message ?? "is forbidden";
const formatUnexpectedMessage = (issue) => issue.message ?? "is unexpected";
const formatMissingMessage = (issue) => {
	const missingMessageAnnotation = getMissingMessageAnnotation(issue.ast);
	if (isSome(missingMessageAnnotation)) {
		const annotation = missingMessageAnnotation.value();
		return isString(annotation) ? right(annotation) : annotation;
	}
	return right(issue.message ?? "is missing");
};
const formatTree = (issue) => {
	switch (issue._tag) {
		case "Type": return map(formatTypeMessage(issue), makeTree);
		case "Forbidden": return right(makeTree(getParseIssueTitle(issue), [makeTree(formatForbiddenMessage(issue))]));
		case "Unexpected": return right(makeTree(formatUnexpectedMessage(issue)));
		case "Missing": return map(formatMissingMessage(issue), makeTree);
		case "Transformation": return flatMap(getMessage(issue), (message) => {
			if (message !== void 0) return right(makeTree(message));
			return map(formatTree(issue.issue), (tree) => makeTree(getParseIssueTitle(issue), [makeTree(formatTransformationKind(issue.kind), [tree])]));
		});
		case "Refinement": return flatMap(getMessage(issue), (message) => {
			if (message !== void 0) return right(makeTree(message));
			return map(formatTree(issue.issue), (tree) => makeTree(getParseIssueTitle(issue), [makeTree(formatRefinementKind(issue.kind), [tree])]));
		});
		case "Pointer": return map(formatTree(issue.issue), (tree) => makeTree(formatPath(issue.path), [tree]));
		case "Composite": return flatMap(getMessage(issue), (message) => {
			if (message !== void 0) return right(makeTree(message));
			const parseIssueTitle = getParseIssueTitle(issue);
			return isNonEmpty(issue.issues) ? map(forEach$2(issue.issues, formatTree), (forest) => makeTree(parseIssueTitle, forest)) : map(formatTree(issue.issues), (tree) => makeTree(parseIssueTitle, [tree]));
		});
	}
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Struct.js
/**
* Create a new object by picking properties of an existing object.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { pipe, Struct } from "effect"
*
* assert.deepStrictEqual(pipe({ a: "a", b: 1, c: true }, Struct.pick("a", "b")), { a: "a", b: 1 })
* assert.deepStrictEqual(Struct.pick({ a: "a", b: 1, c: true }, "a", "b"), { a: "a", b: 1 })
* ```
*
* @since 2.0.0
*/
const pick = /*#__PURE__*/ dual((args) => isObject(args[0]), (s, ...keys) => {
	const out = {};
	for (const k of keys) if (k in s) out[k] = s[k];
	return out;
});
/**
* Create a new object by omitting properties of an existing object.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { pipe, Struct } from "effect"
*
* assert.deepStrictEqual(pipe({ a: "a", b: 1, c: true }, Struct.omit("c")), { a: "a", b: 1 })
* assert.deepStrictEqual(Struct.omit({ a: "a", b: 1, c: true }, "c"), { a: "a", b: 1 })
* ```
*
* @since 2.0.0
*/
const omit = /*#__PURE__*/ dual((args) => isObject(args[0]), (s, ...keys) => {
	const out = { ...s };
	for (const k of keys) delete out[k];
	return out;
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Schema.js
/**
* @since 3.10.0
*/
/**
* @since 3.10.0
* @category symbol
*/
const TypeId$6 = /*#__PURE__*/ Symbol.for("effect/Schema");
/**
* @category constructors
* @since 3.10.0
*/
function make$5(ast) {
	return class SchemaClass {
		[TypeId$6] = variance;
		static ast = ast;
		static annotations(annotations) {
			return make$5(mergeSchemaAnnotations(this.ast, annotations));
		}
		static pipe() {
			return pipeArguments(this, arguments);
		}
		static toString() {
			return String(ast);
		}
		static Type;
		static Encoded;
		static Context;
		static [TypeId$6] = variance;
	};
}
const variance = {
	/* c8 ignore next */
	_A: (_) => _,
	/* c8 ignore next */
	_I: (_) => _,
	/* c8 ignore next */
	_R: (_) => _
};
const builtInAnnotations = {
	typeConstructor: TypeConstructorAnnotationId,
	schemaId: SchemaIdAnnotationId,
	message: MessageAnnotationId,
	missingMessage: MissingMessageAnnotationId,
	identifier: IdentifierAnnotationId,
	title: TitleAnnotationId,
	description: DescriptionAnnotationId,
	examples: ExamplesAnnotationId,
	default: DefaultAnnotationId,
	documentation: DocumentationAnnotationId,
	jsonSchema: JSONSchemaAnnotationId,
	arbitrary: ArbitraryAnnotationId,
	pretty: PrettyAnnotationId,
	equivalence: EquivalenceAnnotationId,
	concurrency: ConcurrencyAnnotationId,
	batching: BatchingAnnotationId,
	parseIssueTitle: ParseIssueTitleAnnotationId,
	parseOptions: ParseOptionsAnnotationId,
	decodingFallback: DecodingFallbackAnnotationId
};
const toASTAnnotations = (annotations) => {
	if (!annotations) return {};
	const out = { ...annotations };
	for (const key in builtInAnnotations) if (key in annotations) {
		const id = builtInAnnotations[key];
		out[id] = annotations[key];
		delete out[key];
	}
	return out;
};
const mergeSchemaAnnotations = (ast, annotations$1) => annotations(ast, toASTAnnotations(annotations$1));
/**
* @since 3.10.0
*/
function asSchema(schema) {
	return schema;
}
/**
* @category formatting
* @since 3.10.0
*/
const format = (schema) => String(schema.ast);
/**
* The `encodedSchema` function allows you to extract the `Encoded` portion of a
* schema, creating a new schema that conforms to the properties defined in the
* original schema without retaining any refinements or transformations that
* were applied previously.
*
* @since 3.10.0
*/
const encodedSchema = (schema) => make$5(encodedAST(schema.ast));
/**
* The `typeSchema` function allows you to extract the `Type` portion of a
* schema, creating a new schema that conforms to the properties defined in the
* original schema without considering the initial encoding or transformation
* processes.
*
* @since 3.10.0
*/
const typeSchema = (schema) => make$5(typeAST(schema.ast));
/**
* @category decoding
* @since 3.10.0
*/
const decodeUnknownEither = (schema, options) => {
	const decodeUnknownEither = decodeUnknownEither$1(schema, options);
	return (u, overrideOptions) => mapLeft(decodeUnknownEither(u, overrideOptions), parseError);
};
/**
* Tests if a value is a `Schema`.
*
* @category guards
* @since 3.10.0
*/
const isSchema = (u) => hasProperty(u, TypeId$6) && isObject(u[TypeId$6]);
function getDefaultLiteralAST(literals) {
	return isMembers(literals) ? Union$1.make(mapMembers(literals, (literal) => new Literal$1(literal))) : new Literal$1(literals[0]);
}
function makeLiteralClass(literals, ast = getDefaultLiteralAST(literals)) {
	return class LiteralClass extends make$5(ast) {
		static annotations(annotations) {
			return makeLiteralClass(this.literals, mergeSchemaAnnotations(this.ast, annotations));
		}
		static literals = [...literals];
	};
}
function Literal(...literals) {
	return isNonEmptyReadonlyArray(literals) ? makeLiteralClass(literals) : Never;
}
const declareConstructor = (typeParameters, options, annotations) => makeDeclareClass(typeParameters, new Declaration(typeParameters.map((tp) => tp.ast), (...typeParameters) => options.decode(...typeParameters.map(make$5)), (...typeParameters) => options.encode(...typeParameters.map(make$5)), toASTAnnotations(annotations)));
const declarePrimitive = (is, annotations) => {
	const decodeUnknown = () => (input, _, ast) => is(input) ? succeed(input) : fail(new Type(ast, input));
	return makeDeclareClass([], new Declaration([], decodeUnknown, decodeUnknown, toASTAnnotations(annotations)));
};
function makeDeclareClass(typeParameters, ast) {
	return class DeclareClass extends make$5(ast) {
		static annotations(annotations) {
			return makeDeclareClass(this.typeParameters, mergeSchemaAnnotations(this.ast, annotations));
		}
		static typeParameters = [...typeParameters];
	};
}
/**
* The constraint `R extends Schema.Context<P[number]>` enforces dependencies solely from `typeParameters`.
* This ensures that when you call `Schema.to` or `Schema.from`, you receive a schema with a `never` context.
*
* @category constructors
* @since 3.10.0
*/
const declare = function() {
	if (Array.isArray(arguments[0])) {
		const typeParameters = arguments[0];
		const options = arguments[1];
		const annotations = arguments[2];
		return declareConstructor(typeParameters, options, annotations);
	}
	const is = arguments[0];
	const annotations = arguments[1];
	return declarePrimitive(is, annotations);
};
/**
* @category schema id
* @since 3.10.0
*/
const InstanceOfSchemaId = /*#__PURE__*/ Symbol.for("effect/SchemaId/InstanceOf");
/**
* @category constructors
* @since 3.10.0
*/
const instanceOf = (constructor, annotations) => declare((u) => u instanceof constructor, {
	title: constructor.name,
	description: `an instance of ${constructor.name}`,
	pretty: () => String,
	schemaId: InstanceOfSchemaId,
	[InstanceOfSchemaId]: { constructor },
	...annotations
});
/**
* @category primitives
* @since 3.10.0
*/
var Undefined = class extends make$5(undefinedKeyword) {};
/**
* @category primitives
* @since 3.10.0
*/
var Never = class extends make$5(neverKeyword) {};
/**
* @category primitives
* @since 3.10.0
*/
var Unknown = class extends make$5(unknownKeyword) {};
/**
* @category primitives
* @since 3.10.0
*/
var BigIntFromSelf = class extends make$5(bigIntKeyword) {};
/**
* @category primitives
* @since 3.10.0
*/
var SymbolFromSelf = class extends make$5(symbolKeyword) {};
/** @ignore */
var String$ = class extends make$5(stringKeyword) {};
/** @ignore */
var Number$ = class extends make$5(numberKeyword) {};
/** @ignore */
var Boolean$ = class extends make$5(booleanKeyword) {};
const getDefaultUnionAST = (members) => Union$1.make(members.map((m) => m.ast));
function makeUnionClass(members, ast = getDefaultUnionAST(members)) {
	return class UnionClass extends make$5(ast) {
		static annotations(annotations) {
			return makeUnionClass(this.members, mergeSchemaAnnotations(this.ast, annotations));
		}
		static members = [...members];
	};
}
function Union(...members) {
	return isMembers(members) ? makeUnionClass(members) : isNonEmptyReadonlyArray(members) ? members[0] : Never;
}
/**
* @category combinators
* @since 3.10.0
*/
const UndefinedOr = (self) => Union(self, Undefined);
/**
* @since 3.10.0
*/
const element = (self) => new ElementImpl(new OptionalType(self.ast, false), self);
var ElementImpl = class ElementImpl {
	ast;
	from;
	[TypeId$6];
	_Token;
	constructor(ast, from) {
		this.ast = ast;
		this.from = from;
	}
	annotations(annotations) {
		return new ElementImpl(new OptionalType(this.ast.type, this.ast.isOptional, {
			...this.ast.annotations,
			...toASTAnnotations(annotations)
		}), this.from);
	}
	toString() {
		return `${this.ast.type}${this.ast.isOptional ? "?" : ""}`;
	}
};
const getDefaultTupleTypeAST = (elements, rest) => new TupleType(elements.map((el) => isSchema(el) ? new OptionalType(el.ast, false) : el.ast), rest.map((el) => isSchema(el) ? new Type$1(el.ast) : el.ast), true);
function makeTupleTypeClass(elements, rest, ast = getDefaultTupleTypeAST(elements, rest)) {
	return class TupleTypeClass extends make$5(ast) {
		static annotations(annotations) {
			return makeTupleTypeClass(this.elements, this.rest, mergeSchemaAnnotations(this.ast, annotations));
		}
		static elements = [...elements];
		static rest = [...rest];
	};
}
function Tuple(...args) {
	return Array.isArray(args[0]) ? makeTupleTypeClass(args[0], args.slice(1)) : makeTupleTypeClass(args, []);
}
function makeArrayClass(value, ast) {
	return class ArrayClass extends makeTupleTypeClass([], [value], ast) {
		static annotations(annotations) {
			return makeArrayClass(this.value, mergeSchemaAnnotations(this.ast, annotations));
		}
		static value = value;
	};
}
const Array$ = (value) => makeArrayClass(value);
const formatPropertySignatureToken = (isOptional) => isOptional ? "\"?:\"" : "\":\"";
/**
* @category PropertySignature
* @since 3.10.0
*/
var PropertySignatureDeclaration = class extends OptionalType {
	isReadonly;
	defaultValue;
	/**
	* @since 3.10.0
	*/
	_tag = "PropertySignatureDeclaration";
	constructor(type, isOptional, isReadonly, annotations, defaultValue) {
		super(type, isOptional, annotations);
		this.isReadonly = isReadonly;
		this.defaultValue = defaultValue;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		const token = formatPropertySignatureToken(this.isOptional);
		const type = String(this.type);
		return `PropertySignature<${token}, ${type}, never, ${token}, ${type}>`;
	}
};
/**
* @category PropertySignature
* @since 3.10.0
*/
var ToPropertySignature = class extends OptionalType {
	isReadonly;
	defaultValue;
	constructor(type, isOptional, isReadonly, annotations, defaultValue) {
		super(type, isOptional, annotations);
		this.isReadonly = isReadonly;
		this.defaultValue = defaultValue;
	}
};
const formatPropertyKey = (p) => {
	if (p === void 0) return "never";
	if (isString(p)) return JSON.stringify(p);
	return String(p);
};
/**
* @category PropertySignature
* @since 3.10.0
*/
var PropertySignatureTransformation = class {
	from;
	to;
	decode;
	encode;
	/**
	* @since 3.10.0
	*/
	_tag = "PropertySignatureTransformation";
	constructor(from, to, decode, encode) {
		this.from = from;
		this.to = to;
		this.decode = decode;
		this.encode = encode;
	}
	/**
	* @since 3.10.0
	*/
	toString() {
		return `PropertySignature<${formatPropertySignatureToken(this.to.isOptional)}, ${this.to.type}, ${formatPropertyKey(this.from.fromKey)}, ${formatPropertySignatureToken(this.from.isOptional)}, ${this.from.type}>`;
	}
};
const mergeSignatureAnnotations = (ast, annotations) => {
	switch (ast._tag) {
		case "PropertySignatureDeclaration": return new PropertySignatureDeclaration(ast.type, ast.isOptional, ast.isReadonly, {
			...ast.annotations,
			...annotations
		}, ast.defaultValue);
		case "PropertySignatureTransformation": return new PropertySignatureTransformation(ast.from, new ToPropertySignature(ast.to.type, ast.to.isOptional, ast.to.isReadonly, {
			...ast.to.annotations,
			...annotations
		}, ast.to.defaultValue), ast.decode, ast.encode);
	}
};
/**
* @since 3.10.0
* @category symbol
*/
const PropertySignatureTypeId = /*#__PURE__*/ Symbol.for("effect/PropertySignature");
/**
* @since 3.10.0
* @category guards
*/
const isPropertySignature = (u) => hasProperty(u, PropertySignatureTypeId);
var PropertySignatureImpl = class PropertySignatureImpl {
	ast;
	[TypeId$6];
	[PropertySignatureTypeId] = null;
	_TypeToken;
	_Key;
	_EncodedToken;
	_HasDefault;
	constructor(ast) {
		this.ast = ast;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
	annotations(annotations) {
		return new PropertySignatureImpl(mergeSignatureAnnotations(this.ast, toASTAnnotations(annotations)));
	}
	toString() {
		return String(this.ast);
	}
};
/**
* @category PropertySignature
* @since 3.10.0
*/
const makePropertySignature = (ast) => new PropertySignatureImpl(ast);
var PropertySignatureWithFromImpl = class PropertySignatureWithFromImpl extends PropertySignatureImpl {
	from;
	constructor(ast, from) {
		super(ast);
		this.from = from;
	}
	annotations(annotations) {
		return new PropertySignatureWithFromImpl(mergeSignatureAnnotations(this.ast, toASTAnnotations(annotations)), this.from);
	}
};
/**
* Lifts a `Schema` into a `PropertySignature`.
*
* @category PropertySignature
* @since 3.10.0
*/
const propertySignature = (self) => new PropertySignatureWithFromImpl(new PropertySignatureDeclaration(self.ast, false, true, {}, void 0), self);
/**
* Enhances a property signature with a default constructor value.
*
* @category PropertySignature
* @since 3.10.0
*/
const withConstructorDefault = /*#__PURE__*/ dual(2, (self, defaultValue) => {
	const ast = self.ast;
	switch (ast._tag) {
		case "PropertySignatureDeclaration": return makePropertySignature(new PropertySignatureDeclaration(ast.type, ast.isOptional, ast.isReadonly, ast.annotations, defaultValue));
		case "PropertySignatureTransformation": return makePropertySignature(new PropertySignatureTransformation(ast.from, new ToPropertySignature(ast.to.type, ast.to.isOptional, ast.to.isReadonly, ast.to.annotations, defaultValue), ast.decode, ast.encode));
	}
});
/**
* @category PropertySignature
* @since 3.10.0
*/
const optional = (self) => {
	return new PropertySignatureWithFromImpl(new PropertySignatureDeclaration(self.ast === undefinedKeyword || self.ast === neverKeyword ? undefinedKeyword : UndefinedOr(self).ast, true, true, {}, void 0), self);
};
const preserveMissingMessageAnnotation = /*#__PURE__*/ pickAnnotations([MissingMessageAnnotationId]);
const getDefaultTypeLiteralAST = (fields, records) => {
	const ownKeys = Reflect.ownKeys(fields);
	const pss = [];
	if (ownKeys.length > 0) {
		const from = [];
		const to = [];
		const transformations = [];
		for (let i = 0; i < ownKeys.length; i++) {
			const key = ownKeys[i];
			const field = fields[key];
			if (isPropertySignature(field)) {
				const ast = field.ast;
				switch (ast._tag) {
					case "PropertySignatureDeclaration": {
						const type = ast.type;
						const isOptional = ast.isOptional;
						const toAnnotations = ast.annotations;
						from.push(new PropertySignature(key, type, isOptional, true, preserveMissingMessageAnnotation(ast)));
						to.push(new PropertySignature(key, typeAST(type), isOptional, true, toAnnotations));
						pss.push(new PropertySignature(key, type, isOptional, true, toAnnotations));
						break;
					}
					case "PropertySignatureTransformation": {
						const fromKey = ast.from.fromKey ?? key;
						from.push(new PropertySignature(fromKey, ast.from.type, ast.from.isOptional, true, ast.from.annotations));
						to.push(new PropertySignature(key, ast.to.type, ast.to.isOptional, true, ast.to.annotations));
						transformations.push(new PropertySignatureTransformation$1(fromKey, key, ast.decode, ast.encode));
						break;
					}
				}
			} else {
				from.push(new PropertySignature(key, field.ast, false, true));
				to.push(new PropertySignature(key, typeAST(field.ast), false, true));
				pss.push(new PropertySignature(key, field.ast, false, true));
			}
		}
		if (isNonEmptyReadonlyArray(transformations)) {
			const issFrom = [];
			const issTo = [];
			for (const r of records) {
				const { indexSignatures, propertySignatures } = record(r.key.ast, r.value.ast);
				propertySignatures.forEach((ps) => {
					from.push(ps);
					to.push(new PropertySignature(ps.name, typeAST(ps.type), ps.isOptional, ps.isReadonly, ps.annotations));
				});
				indexSignatures.forEach((is) => {
					issFrom.push(is);
					issTo.push(new IndexSignature(is.parameter, typeAST(is.type), is.isReadonly));
				});
			}
			return new Transformation$1(new TypeLiteral(from, issFrom, { [AutoTitleAnnotationId]: "Struct (Encoded side)" }), new TypeLiteral(to, issTo, { [AutoTitleAnnotationId]: "Struct (Type side)" }), new TypeLiteralTransformation(transformations));
		}
	}
	const iss = [];
	for (const r of records) {
		const { indexSignatures, propertySignatures } = record(r.key.ast, r.value.ast);
		propertySignatures.forEach((ps) => pss.push(ps));
		indexSignatures.forEach((is) => iss.push(is));
	}
	return new TypeLiteral(pss, iss);
};
const lazilyMergeDefaults = (fields, out) => {
	const ownKeys = Reflect.ownKeys(fields);
	for (const key of ownKeys) {
		const field = fields[key];
		if (out[key] === void 0 && isPropertySignature(field)) {
			const ast = field.ast;
			const defaultValue = ast._tag === "PropertySignatureDeclaration" ? ast.defaultValue : ast.to.defaultValue;
			if (defaultValue !== void 0) out[key] = defaultValue();
		}
	}
	return out;
};
function makeTypeLiteralClass(fields, records, ast = getDefaultTypeLiteralAST(fields, records)) {
	return class TypeLiteralClass extends make$5(ast) {
		static annotations(annotations) {
			return makeTypeLiteralClass(this.fields, this.records, mergeSchemaAnnotations(this.ast, annotations));
		}
		static fields = { ...fields };
		static records = [...records];
		static make = (props, options) => {
			const propsWithDefaults = lazilyMergeDefaults(fields, { ...props });
			return getDisableValidationMakeOption(options) ? propsWithDefaults : validateSync(this)(propsWithDefaults);
		};
		static pick(...keys) {
			return Struct(pick(fields, ...keys));
		}
		static omit(...keys) {
			return Struct(omit(fields, ...keys));
		}
	};
}
function Struct(fields, ...records) {
	return makeTypeLiteralClass(fields, records);
}
/**
* Returns a property signature that represents a tag.
* A tag is a literal value that is used to distinguish between different types of objects.
* The tag is optional when using the `make` method.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Schema } from "effect"
*
* const User = Schema.Struct({
*   _tag: Schema.tag("User"),
*   name: Schema.String,
*   age: Schema.Number
* })
*
* assert.deepStrictEqual(User.make({ name: "John", age: 44 }), { _tag: "User", name: "John", age: 44 })
* ```
*
* @see {@link TaggedStruct}
*
* @since 3.10.0
*/
const tag$4 = (tag) => Literal(tag).pipe(propertySignature, withConstructorDefault(() => tag));
/**
* A tagged struct is a struct that has a tag property that is used to distinguish between different types of objects.
*
* The tag is optional when using the `make` method.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import { Schema } from "effect"
*
* const User = Schema.TaggedStruct("User", {
*   name: Schema.String,
*   age: Schema.Number
* })
*
* assert.deepStrictEqual(User.make({ name: "John", age: 44 }), { _tag: "User", name: "John", age: 44 })
* ```
*
* @category constructors
* @since 3.10.0
*/
const TaggedStruct = (value, fields) => Struct({
	_tag: tag$4(value),
	...fields
});
function makeRecordClass(key, value, ast) {
	return class RecordClass extends makeTypeLiteralClass({}, [{
		key,
		value
	}], ast) {
		static annotations(annotations) {
			return makeRecordClass(key, value, mergeSchemaAnnotations(this.ast, annotations));
		}
		static key = key;
		static value = value;
	};
}
/**
* @category constructors
* @since 3.10.0
*/
const Record = (options) => makeRecordClass(options.key, options.value);
function makeBrandClass(from, ast) {
	return class BrandClass extends make$5(ast) {
		static annotations(annotations) {
			return makeBrandClass(this.from, mergeSchemaAnnotations(this.ast, annotations));
		}
		static make = (a, options) => {
			return getDisableValidationMakeOption(options) ? a : validateSync(this)(a);
		};
		static from = from;
	};
}
/**
* Returns a nominal branded schema by applying a brand to a given schema.
*
* ```
* Schema<A> + B -> Schema<A & Brand<B>>
* ```
*
* @example
* ```ts
* import * as Schema from "effect/Schema"
*
* const Int = Schema.Number.pipe(Schema.int(), Schema.brand("Int"))
* type Int = Schema.Schema.Type<typeof Int> // number & Brand<"Int">
* ```
*
* @category branding
* @since 3.10.0
*/
const brand = (brand, annotations$3) => (self) => {
	const annotation = match$9(getBrandAnnotation(self.ast), {
		onNone: () => [brand],
		onSome: (brands) => [...brands, brand]
	});
	return makeBrandClass(self, annotations(self.ast, toASTAnnotations({
		[BrandAnnotationId]: annotation,
		...annotations$3
	})));
};
const intersectTypeLiterals = (x, y, path) => {
	if (isTypeLiteral(x) && isTypeLiteral(y)) {
		const propertySignatures = [...x.propertySignatures];
		for (const ps of y.propertySignatures) {
			const name = ps.name;
			const i = propertySignatures.findIndex((ps) => ps.name === name);
			if (i === -1) propertySignatures.push(ps);
			else {
				const { isOptional, type } = propertySignatures[i];
				propertySignatures[i] = new PropertySignature(name, extendAST(type, ps.type, path.concat(name)), isOptional, true);
			}
		}
		return new TypeLiteral(propertySignatures, x.indexSignatures.concat(y.indexSignatures));
	}
	throw new Error(getSchemaExtendErrorMessage(x, y, path));
};
const preserveRefinementAnnotations = /*#__PURE__*/ omitAnnotations([IdentifierAnnotationId]);
const addRefinementToMembers = (refinement, asts) => asts.map((ast) => new Refinement$1(ast, refinement.filter, preserveRefinementAnnotations(refinement)));
const extendAST = (x, y, path) => Union$1.make(intersectUnionMembers([x], [y], path));
const getTypes = (ast) => isUnion(ast) ? ast.types : [ast];
const intersectUnionMembers = (xs, ys, path) => flatMap$8(xs, (x) => flatMap$8(ys, (y) => {
	switch (y._tag) {
		case "Literal":
			if (isString(y.literal) && isStringKeyword(x) || isNumber(y.literal) && isNumberKeyword(x) || isBoolean(y.literal) && isBooleanKeyword(x)) return [y];
			break;
		case "StringKeyword":
			if (y === stringKeyword) {
				if (isStringKeyword(x) || isLiteral(x) && isString(x.literal)) return [x];
				else if (isRefinement$1(x)) return addRefinementToMembers(x, intersectUnionMembers(getTypes(x.from), [y], path));
			} else if (x === stringKeyword) return [y];
			break;
		case "NumberKeyword":
			if (y === numberKeyword) {
				if (isNumberKeyword(x) || isLiteral(x) && isNumber(x.literal)) return [x];
				else if (isRefinement$1(x)) return addRefinementToMembers(x, intersectUnionMembers(getTypes(x.from), [y], path));
			} else if (x === numberKeyword) return [y];
			break;
		case "BooleanKeyword":
			if (y === booleanKeyword) {
				if (isBooleanKeyword(x) || isLiteral(x) && isBoolean(x.literal)) return [x];
				else if (isRefinement$1(x)) return addRefinementToMembers(x, intersectUnionMembers(getTypes(x.from), [y], path));
			} else if (x === booleanKeyword) return [y];
			break;
		case "Union": return intersectUnionMembers(getTypes(x), y.types, path);
		case "Suspend": return [new Suspend(() => extendAST(x, y.f(), path))];
		case "Refinement": return addRefinementToMembers(y, intersectUnionMembers(getTypes(x), getTypes(y.from), path));
		case "TypeLiteral":
			switch (x._tag) {
				case "Union": return intersectUnionMembers(x.types, [y], path);
				case "Suspend": return [new Suspend(() => extendAST(x.f(), y, path))];
				case "Refinement": return addRefinementToMembers(x, intersectUnionMembers(getTypes(x.from), [y], path));
				case "TypeLiteral": return [intersectTypeLiterals(x, y, path)];
				case "Transformation": {
					const transformation = x.transformation;
					const from = intersectTypeLiterals(x.from, y, path);
					const to = intersectTypeLiterals(x.to, typeAST(y), path);
					switch (transformation._tag) {
						case "TypeLiteralTransformation": return [new Transformation$1(from, to, new TypeLiteralTransformation(transformation.propertySignatureTransformations))];
						case "ComposeTransformation": return [new Transformation$1(from, to, composeTransformation)];
						case "FinalTransformation": return [new Transformation$1(from, to, new FinalTransformation((fromA, options, ast, fromI) => map(transformation.decode(fromA, options, ast, fromI), (partial) => ({
							...fromA,
							...partial
						})), (toI, options, ast, toA) => map(transformation.encode(toI, options, ast, toA), (partial) => ({
							...toI,
							...partial
						}))))];
					}
				}
			}
			break;
		case "Transformation": if (isTransformation$1(x)) {
			if (isTypeLiteralTransformation(y.transformation) && isTypeLiteralTransformation(x.transformation)) return [new Transformation$1(intersectTypeLiterals(x.from, y.from, path), intersectTypeLiterals(x.to, y.to, path), new TypeLiteralTransformation(y.transformation.propertySignatureTransformations.concat(x.transformation.propertySignatureTransformations)))];
		} else return intersectUnionMembers([y], [x], path);
	}
	throw new Error(getSchemaExtendErrorMessage(x, y, path));
}));
/**
* Extends a schema with another schema.
*
* Not all extensions are supported, and their support depends on the nature of
* the involved schemas.
*
* Possible extensions include:
* - `Schema.String` with another `Schema.String` refinement or a string literal
* - `Schema.Number` with another `Schema.Number` refinement or a number literal
* - `Schema.Boolean` with another `Schema.Boolean` refinement or a boolean
*   literal
* - A struct with another struct where overlapping fields support extension
* - A struct with in index signature
* - A struct with a union of supported schemas
* - A refinement of a struct with a supported schema
* - A suspend of a struct with a supported schema
* - A transformation between structs where the “from” and “to” sides have no
*   overlapping fields with the target struct
*
* @example
* ```ts
* import * as Schema from "effect/Schema"
*
* const schema = Schema.Struct({
*   a: Schema.String,
*   b: Schema.String
* })
*
* // const extended: Schema<
* //   {
* //     readonly a: string
* //     readonly b: string
* //   } & {
* //     readonly c: string
* //   } & {
* //     readonly [x: string]: string
* //   }
* // >
* const extended = Schema.asSchema(schema.pipe(
*   Schema.extend(Schema.Struct({ c: Schema.String })), // <= you can add more fields
*   Schema.extend(Schema.Record({ key: Schema.String, value: Schema.String })) // <= you can add index signatures
* ))
* ```
*
* @category combinators
* @since 3.10.0
*/
const extend = /*#__PURE__*/ dual(2, (self, that) => make$5(extendAST(self.ast, that.ast, [])));
/**
* @category combinators
* @since 3.10.0
*/
const compose = /*#__PURE__*/ dual((args) => isSchema(args[1]), (from, to) => makeTransformationClass(from, to, compose$1(from.ast, to.ast)));
/**
* @category constructors
* @since 3.10.0
*/
const suspend = (f) => make$5(new Suspend(() => f().ast));
/**
* @since 3.10.0
* @category symbol
*/
const RefineSchemaId = /*#__PURE__*/ Symbol.for("effect/SchemaId/Refine");
function makeRefineClass(from, filter, ast) {
	return class RefineClass extends make$5(ast) {
		static annotations(annotations) {
			return makeRefineClass(this.from, this.filter, mergeSchemaAnnotations(this.ast, annotations));
		}
		static [RefineSchemaId] = from;
		static from = from;
		static filter = filter;
		static make = (a, options) => {
			return getDisableValidationMakeOption(options) ? a : validateSync(this)(a);
		};
	};
}
const fromFilterPredicateReturnTypeItem = (item, ast, input) => {
	if (isBoolean(item)) return item ? none$4() : some(new Type(ast, input));
	if (isString(item)) return some(new Type(ast, input, item));
	if (item !== void 0) {
		if ("_tag" in item) return some(item);
		const issue = new Type(ast, input, item.message);
		return some(isNonEmptyReadonlyArray(item.path) ? new Pointer(item.path, input, issue) : issue);
	}
	return none$4();
};
const toFilterParseIssue = (out, ast, input) => {
	if (isSingle(out)) return fromFilterPredicateReturnTypeItem(out, ast, input);
	if (isNonEmptyReadonlyArray(out)) {
		const issues = filterMap(out, (issue) => fromFilterPredicateReturnTypeItem(issue, ast, input));
		if (isNonEmptyReadonlyArray(issues)) return some(issues.length === 1 ? issues[0] : new Composite(ast, input, issues));
	}
	return none$4();
};
function filter(predicate, annotations) {
	return (self) => {
		function filter(input, options, ast) {
			return toFilterParseIssue(predicate(input, options, ast), ast, input);
		}
		return makeRefineClass(self, filter, new Refinement$1(self.ast, filter, toASTAnnotations(annotations)));
	};
}
function makeTransformationClass(from, to, ast) {
	return class TransformationClass extends make$5(ast) {
		static annotations(annotations) {
			return makeTransformationClass(this.from, this.to, mergeSchemaAnnotations(this.ast, annotations));
		}
		static from = from;
		static to = to;
	};
}
/**
* Create a new `Schema` by transforming the input and output of an existing `Schema`
* using the provided decoding functions.
*
* @category transformations
* @since 3.10.0
*/
const transformOrFail = /*#__PURE__*/ dual((args) => isSchema(args[0]) && isSchema(args[1]), (from, to, options) => makeTransformationClass(from, to, new Transformation$1(from.ast, to.ast, new FinalTransformation(options.decode, options.encode))));
/**
* Create a new `Schema` by transforming the input and output of an existing `Schema`
* using the provided mapping functions.
*
* @category transformations
* @since 3.10.0
*/
const transform = /*#__PURE__*/ dual((args) => isSchema(args[0]) && isSchema(args[1]), (from, to, options) => transformOrFail(from, to, {
	strict: true,
	decode: (fromA, _options, _ast, toA) => succeed(options.decode(fromA, toA)),
	encode: (toI, _options, _ast, toA) => succeed(options.encode(toI, toA))
}));
/**
* @category schema id
* @since 3.10.0
*/
const TrimmedSchemaId = /*#__PURE__*/ Symbol.for("effect/SchemaId/Trimmed");
/**
* Verifies that a string contains no leading or trailing whitespaces.
*
* Note. This combinator does not make any transformations, it only validates.
* If what you were looking for was a combinator to trim strings, then check out the `trim` combinator.
*
* @category string filters
* @since 3.10.0
*/
const trimmed = (annotations) => (self) => self.pipe(filter((a) => a === a.trim(), {
	schemaId: TrimmedSchemaId,
	title: "trimmed",
	description: "a string with no leading or trailing whitespace",
	jsonSchema: { pattern: "^\\S[\\s\\S]*\\S$|^\\S$|^$" },
	...annotations
}));
/**
* @category schema id
* @since 3.10.0
*/
const MinLengthSchemaId = MinLengthSchemaId$1;
/**
* @category string filters
* @since 3.10.0
*/
const minLength = (minLength, annotations) => (self) => self.pipe(filter((a) => a.length >= minLength, {
	schemaId: MinLengthSchemaId,
	title: `minLength(${minLength})`,
	description: `a string at least ${minLength} character(s) long`,
	jsonSchema: { minLength },
	...annotations
}));
/**
* @category schema id
* @since 3.10.0
*/
const LengthSchemaId = LengthSchemaId$1;
/**
* @category string filters
* @since 3.10.0
*/
const length = (length, annotations) => (self) => {
	const minLength = isObject(length) ? Math.max(0, Math.floor(length.min)) : Math.max(0, Math.floor(length));
	const maxLength = isObject(length) ? Math.max(minLength, Math.floor(length.max)) : minLength;
	if (minLength !== maxLength) return self.pipe(filter((a) => a.length >= minLength && a.length <= maxLength, {
		schemaId: LengthSchemaId,
		title: `length({ min: ${minLength}, max: ${maxLength})`,
		description: `a string at least ${minLength} character(s) and at most ${maxLength} character(s) long`,
		jsonSchema: {
			minLength,
			maxLength
		},
		...annotations
	}));
	return self.pipe(filter((a) => a.length === minLength, {
		schemaId: LengthSchemaId,
		title: `length(${minLength})`,
		description: minLength === 1 ? `a single character` : `a string ${minLength} character(s) long`,
		jsonSchema: {
			minLength,
			maxLength: minLength
		},
		...annotations
	}));
};
/**
* @category schema id
* @since 3.10.0
*/
const PatternSchemaId = /*#__PURE__*/ Symbol.for("effect/SchemaId/Pattern");
/**
* @category string filters
* @since 3.10.0
*/
const pattern = (regex, annotations) => (self) => {
	const source = regex.source;
	return self.pipe(filter((a) => {
		regex.lastIndex = 0;
		return regex.test(a);
	}, {
		schemaId: PatternSchemaId,
		[PatternSchemaId]: { regex },
		description: `a string matching the pattern ${source}`,
		jsonSchema: { pattern: source },
		...annotations
	}));
};
/**
* @category schema id
* @since 3.10.0
*/
const LowercasedSchemaId = /*#__PURE__*/ Symbol.for("effect/SchemaId/Lowercased");
/**
* Verifies that a string is lowercased.
*
* @category string filters
* @since 3.10.0
*/
const lowercased = (annotations) => (self) => self.pipe(filter((a) => a === a.toLowerCase(), {
	schemaId: LowercasedSchemaId,
	title: "lowercased",
	description: "a lowercase string",
	jsonSchema: { pattern: "^[^A-Z]*$" },
	...annotations
}));
/**
* @category string constructors
* @since 3.10.0
*/
var Lowercased = class extends String$.pipe(/*#__PURE__*/ lowercased({ identifier: "Lowercased" })) {};
/**
* @category schema id
* @since 3.10.0
*/
const UppercasedSchemaId = /*#__PURE__*/ Symbol.for("effect/SchemaId/Uppercased");
/**
* Verifies that a string is uppercased.
*
* @category string filters
* @since 3.10.0
*/
const uppercased = (annotations) => (self) => self.pipe(filter((a) => a === a.toUpperCase(), {
	schemaId: UppercasedSchemaId,
	title: "uppercased",
	description: "an uppercase string",
	jsonSchema: { pattern: "^[^a-z]*$" },
	...annotations
}));
/**
* @category string constructors
* @since 3.10.0
*/
var Uppercased = class extends String$.pipe(/*#__PURE__*/ uppercased({ identifier: "Uppercased" })) {};
/**
* @category schema id
* @since 3.10.0
*/
const CapitalizedSchemaId = /*#__PURE__*/ Symbol.for("effect/SchemaId/Capitalized");
/**
* Verifies that a string is capitalized.
*
* @category string filters
* @since 3.10.0
*/
const capitalized = (annotations) => (self) => self.pipe(filter((a) => a[0]?.toUpperCase() === a[0], {
	schemaId: CapitalizedSchemaId,
	title: "capitalized",
	description: "a capitalized string",
	jsonSchema: { pattern: "^[^a-z]?.*$" },
	...annotations
}));
/**
* @category string constructors
* @since 3.10.0
*/
var Capitalized = class extends String$.pipe(/*#__PURE__*/ capitalized({ identifier: "Capitalized" })) {};
/**
* @category schema id
* @since 3.10.0
*/
const UncapitalizedSchemaId = /*#__PURE__*/ Symbol.for("effect/SchemaId/Uncapitalized");
/**
* Verifies that a string is uncapitalized.
*
* @category string filters
* @since 3.10.0
*/
const uncapitalized = (annotations) => (self) => self.pipe(filter((a) => a[0]?.toLowerCase() === a[0], {
	schemaId: UncapitalizedSchemaId,
	title: "uncapitalized",
	description: "a uncapitalized string",
	jsonSchema: { pattern: "^[^A-Z]?.*$" },
	...annotations
}));
/**
* @category string constructors
* @since 3.10.0
*/
var Uncapitalized = class extends String$.pipe(/*#__PURE__*/ uncapitalized({ identifier: "Uncapitalized" })) {};
String$.pipe(/*#__PURE__*/ length(1, { identifier: "Char" }));
/**
* @category string filters
* @since 3.10.0
*/
const nonEmptyString = (annotations) => minLength(1, {
	title: "nonEmptyString",
	description: "a non empty string",
	...annotations
});
transform(String$.annotations({ description: "a string that will be converted to lowercase" }), Lowercased, {
	strict: true,
	decode: (i) => i.toLowerCase(),
	encode: identity
}).annotations({ identifier: "Lowercase" });
transform(String$.annotations({ description: "a string that will be converted to uppercase" }), Uppercased, {
	strict: true,
	decode: (i) => i.toUpperCase(),
	encode: identity
}).annotations({ identifier: "Uppercase" });
transform(String$.annotations({ description: "a string that will be converted to a capitalized format" }), Capitalized, {
	strict: true,
	decode: (i) => capitalize(i),
	encode: identity
}).annotations({ identifier: "Capitalize" });
transform(String$.annotations({ description: "a string that will be converted to an uncapitalized format" }), Uncapitalized, {
	strict: true,
	decode: (i) => uncapitalize(i),
	encode: identity
}).annotations({ identifier: "Uncapitalize" });
/**
* @category string constructors
* @since 3.10.0
*/
var Trimmed = class extends String$.pipe(/*#__PURE__*/ trimmed({ identifier: "Trimmed" })) {};
/**
* Useful for validating strings that must contain meaningful characters without
* leading or trailing whitespace.
*
* @example
* ```ts
* import { Schema } from "effect"
*
* console.log(Schema.decodeOption(Schema.NonEmptyTrimmedString)("")) // Option.none()
* console.log(Schema.decodeOption(Schema.NonEmptyTrimmedString)(" a ")) // Option.none()
* console.log(Schema.decodeOption(Schema.NonEmptyTrimmedString)("a")) // Option.some("a")
* ```
*
* @category string constructors
* @since 3.10.0
*/
var NonEmptyTrimmedString = class extends Trimmed.pipe(/*#__PURE__*/ nonEmptyString({ identifier: "NonEmptyTrimmedString" })) {};
transform(String$.annotations({ description: "a string that will be trimmed" }), Trimmed, {
	strict: true,
	decode: (i) => i.trim(),
	encode: identity
}).annotations({ identifier: "Trim" });
const getErrorMessage = (e) => e instanceof Error ? e.message : String(e);
const getParseJsonTransformation = (options) => transformOrFail(String$.annotations({ description: "a string to be decoded into JSON" }), Unknown, {
	strict: true,
	decode: (i, _, ast) => _try({
		try: () => JSON.parse(i, options?.reviver),
		catch: (e) => new Type(ast, i, getErrorMessage(e))
	}),
	encode: (a, _, ast) => _try({
		try: () => JSON.stringify(a, options?.replacer, options?.space),
		catch: (e) => new Type(ast, a, getErrorMessage(e))
	})
}).annotations({
	title: "parseJson",
	schemaId: ParseJsonSchemaId
});
/**
* The `ParseJson` combinator provides a method to convert JSON strings into the `unknown` type using the underlying
* functionality of `JSON.parse`. It also utilizes `JSON.stringify` for encoding.
*
* You can optionally provide a `ParseJsonOptions` to configure both `JSON.parse` and `JSON.stringify` executions.
*
* Optionally, you can pass a schema `Schema<A, I, R>` to obtain an `A` type instead of `unknown`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import * as Schema from "effect/Schema"
*
* assert.deepStrictEqual(Schema.decodeUnknownSync(Schema.parseJson())(`{"a":"1"}`), { a: "1" })
* assert.deepStrictEqual(Schema.decodeUnknownSync(Schema.parseJson(Schema.Struct({ a: Schema.NumberFromString })))(`{"a":"1"}`), { a: 1 })
* ```
*
* @category string transformations
* @since 3.10.0
*/
const parseJson = (schemaOrOptions, o) => isSchema(schemaOrOptions) ? compose(parseJson(o), schemaOrOptions) : getParseJsonTransformation(schemaOrOptions);
/**
* @category string constructors
* @since 3.10.0
*/
var NonEmptyString = class extends String$.pipe(/*#__PURE__*/ nonEmptyString({ identifier: "NonEmptyString" })) {};
/**
* @category schema id
* @since 3.10.0
*/
const UUIDSchemaId = /*#__PURE__*/ Symbol.for("effect/SchemaId/UUID");
const uuidRegexp = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;
String$.pipe(/*#__PURE__*/ pattern(uuidRegexp, {
	schemaId: UUIDSchemaId,
	identifier: "UUID",
	jsonSchema: {
		format: "uuid",
		pattern: uuidRegexp.source
	},
	description: "a Universally Unique Identifier",
	arbitrary: () => (fc) => fc.uuid()
}));
/**
* @category schema id
* @since 3.10.0
*/
const ULIDSchemaId = /*#__PURE__*/ Symbol.for("effect/SchemaId/ULID");
String$.pipe(/*#__PURE__*/ pattern(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i, {
	schemaId: ULIDSchemaId,
	identifier: "ULID",
	description: "a Universally Unique Lexicographically Sortable Identifier",
	arbitrary: () => (fc) => fc.ulid()
}));
/**
* Defines a schema that represents a `URL` object.
*
* @category URL constructors
* @since 3.11.0
*/
var URLFromSelf = class extends instanceOf(URL, {
	typeConstructor: { _tag: "URL" },
	identifier: "URLFromSelf",
	arbitrary: () => (fc) => fc.webUrl().map((s) => new URL(s)),
	pretty: () => (url) => url.toString()
}) {};
transformOrFail(String$.annotations({ description: "a string to be decoded into a URL" }), URLFromSelf, {
	strict: true,
	decode: (i, _, ast) => _try({
		try: () => new URL(i),
		catch: (e) => new Type(ast, i, `Unable to decode ${JSON.stringify(i)} into a URL. ${getErrorMessage(e)}`)
	}),
	encode: (a) => succeed(a.toString())
}).annotations({
	identifier: "URL",
	pretty: () => (url) => url.toString()
});
/**
* @category schema id
* @since 3.10.0
*/
const FiniteSchemaId = FiniteSchemaId$1;
/**
* Ensures that the provided value is a finite number (excluding NaN, +Infinity, and -Infinity).
*
* @category number filters
* @since 3.10.0
*/
const finite = (annotations) => (self) => self.pipe(filter(Number.isFinite, {
	schemaId: FiniteSchemaId,
	title: "finite",
	description: "a finite number",
	jsonSchema: {},
	...annotations
}));
/**
* @category schema id
* @since 3.10.0
*/
const GreaterThanSchemaId = GreaterThanSchemaId$1;
/**
* This filter checks whether the provided number is greater than the specified minimum.
*
* @category number filters
* @since 3.10.0
*/
const greaterThan = (exclusiveMinimum, annotations) => (self) => self.pipe(filter((a) => a > exclusiveMinimum, {
	schemaId: GreaterThanSchemaId,
	title: `greaterThan(${exclusiveMinimum})`,
	description: exclusiveMinimum === 0 ? "a positive number" : `a number greater than ${exclusiveMinimum}`,
	jsonSchema: { exclusiveMinimum },
	...annotations
}));
/**
* @category schema id
* @since 3.10.0
*/
const GreaterThanOrEqualToSchemaId = GreaterThanOrEqualToSchemaId$1;
/**
* This filter checks whether the provided number is greater than or equal to the specified minimum.
*
* @category number filters
* @since 3.10.0
*/
const greaterThanOrEqualTo = (minimum, annotations) => (self) => self.pipe(filter((a) => a >= minimum, {
	schemaId: GreaterThanOrEqualToSchemaId,
	title: `greaterThanOrEqualTo(${minimum})`,
	description: minimum === 0 ? "a non-negative number" : `a number greater than or equal to ${minimum}`,
	jsonSchema: { minimum },
	...annotations
}));
/**
* @category schema id
* @since 3.10.0
*/
const IntSchemaId = IntSchemaId$1;
/**
* Ensures that the provided value is an integer number (excluding NaN, +Infinity, and -Infinity).
*
* @category number filters
* @since 3.10.0
*/
const int = (annotations) => (self) => self.pipe(filter((a) => Number.isSafeInteger(a), {
	schemaId: IntSchemaId,
	title: "int",
	description: "an integer",
	jsonSchema: { type: "integer" },
	...annotations
}));
/**
* @category schema id
* @since 3.10.0
*/
const LessThanSchemaId = LessThanSchemaId$1;
/**
* This filter checks whether the provided number is less than the specified maximum.
*
* @category number filters
* @since 3.10.0
*/
const lessThan = (exclusiveMaximum, annotations) => (self) => self.pipe(filter((a) => a < exclusiveMaximum, {
	schemaId: LessThanSchemaId,
	title: `lessThan(${exclusiveMaximum})`,
	description: exclusiveMaximum === 0 ? "a negative number" : `a number less than ${exclusiveMaximum}`,
	jsonSchema: { exclusiveMaximum },
	...annotations
}));
/**
* @category schema id
* @since 3.10.0
*/
const LessThanOrEqualToSchemaId = LessThanOrEqualToSchemaId$1;
/**
* This schema checks whether the provided number is less than or equal to the specified maximum.
*
* @category number filters
* @since 3.10.0
*/
const lessThanOrEqualTo = (maximum, annotations) => (self) => self.pipe(filter((a) => a <= maximum, {
	schemaId: LessThanOrEqualToSchemaId,
	title: `lessThanOrEqualTo(${maximum})`,
	description: maximum === 0 ? "a non-positive number" : `a number less than or equal to ${maximum}`,
	jsonSchema: { maximum },
	...annotations
}));
/**
* @category schema id
* @since 3.10.0
*/
const BetweenSchemaId = BetweenSchemaId$1;
/**
* This filter checks whether the provided number falls within the specified minimum and maximum values.
*
* @category number filters
* @since 3.10.0
*/
const between = (minimum, maximum, annotations) => (self) => self.pipe(filter((a) => a >= minimum && a <= maximum, {
	schemaId: BetweenSchemaId,
	title: `between(${minimum}, ${maximum})`,
	description: `a number between ${minimum} and ${maximum}`,
	jsonSchema: {
		minimum,
		maximum
	},
	...annotations
}));
/**
* @category schema id
* @since 3.10.0
*/
const NonNaNSchemaId = NonNaNSchemaId$1;
/**
* @category number filters
* @since 3.10.0
*/
const nonNaN = (annotations) => (self) => self.pipe(filter((a) => !Number.isNaN(a), {
	schemaId: NonNaNSchemaId,
	title: "nonNaN",
	description: "a number excluding NaN",
	...annotations
}));
/**
* @category number filters
* @since 3.10.0
*/
const positive = (annotations) => greaterThan(0, {
	title: "positive",
	...annotations
});
/**
* @category number filters
* @since 3.10.0
*/
const negative = (annotations) => lessThan(0, {
	title: "negative",
	...annotations
});
/**
* @category number filters
* @since 3.10.0
*/
const nonPositive = (annotations) => lessThanOrEqualTo(0, {
	title: "nonPositive",
	...annotations
});
/**
* @category number filters
* @since 3.10.0
*/
const nonNegative = (annotations) => greaterThanOrEqualTo(0, {
	title: "nonNegative",
	...annotations
});
/**
* Transforms a `string` into a `number` by parsing the string using the `parse`
* function of the `effect/Number` module.
*
* It returns an error if the value can't be converted (for example when
* non-numeric characters are provided).
*
* The following special string values are supported: "NaN", "Infinity",
* "-Infinity".
*
* @category number transformations
* @since 3.10.0
*/
function parseNumber(self) {
	return transformOrFail(self, Number$, {
		strict: false,
		decode: (i, _, ast) => fromOption(parse(i), () => new Type(ast, i, `Unable to decode ${JSON.stringify(i)} into a number`)),
		encode: (a) => succeed(String(a))
	});
}
parseNumber(String$.annotations({ description: "a string to be decoded into a number" })).annotations({ identifier: "NumberFromString" });
Number$.pipe(/*#__PURE__*/ finite({ identifier: "Finite" }));
/**
* @category number constructors
* @since 3.10.0
*/
var Int = class extends Number$.pipe(/*#__PURE__*/ int({ identifier: "Int" })) {};
Number$.pipe(/*#__PURE__*/ nonNaN({ identifier: "NonNaN" }));
Number$.pipe(/*#__PURE__*/ positive({ identifier: "Positive" }));
Number$.pipe(/*#__PURE__*/ negative({ identifier: "Negative" }));
Number$.pipe(/*#__PURE__*/ nonPositive({ identifier: "NonPositive" }));
/**
* @category number constructors
* @since 3.10.0
*/
var NonNegative = class extends Number$.pipe(/*#__PURE__*/ nonNegative({ identifier: "NonNegative" })) {};
/**
* @category schema id
* @since 3.10.0
*/
const JsonNumberSchemaId = JsonNumberSchemaId$1;
Number$.pipe(/*#__PURE__*/ finite({
	schemaId: JsonNumberSchemaId,
	identifier: "JsonNumber"
}));
transform(/*#__PURE__*/ Boolean$.annotations({ description: "a boolean that will be negated" }), Boolean$, {
	strict: true,
	decode: (i) => not(i),
	encode: (a) => not(a)
});
const encodeSymbol = (sym, ast) => {
	const key = Symbol.keyFor(sym);
	return key === void 0 ? fail(new Type(ast, sym, `Unable to encode a unique symbol ${String(sym)} into a string`)) : succeed(key);
};
const decodeSymbol = (s) => succeed(Symbol.for(s));
transformOrFail(String$.annotations({ description: "a string to be decoded into a globally shared symbol" }), SymbolFromSelf, {
	strict: false,
	decode: (i) => decodeSymbol(i),
	encode: (a, _, ast) => encodeSymbol(a, ast)
}).annotations({ identifier: "Symbol" });
/**
* @category schema id
* @since 3.10.0
*/
const GreaterThanOrEqualToBigIntSchemaId = GreaterThanOrEqualToBigIntSchemaId$1;
/**
* @category bigint filters
* @since 3.10.0
*/
const greaterThanOrEqualToBigInt = (min, annotations) => (self) => self.pipe(filter((a) => a >= min, {
	schemaId: GreaterThanOrEqualToBigIntSchemaId,
	[GreaterThanOrEqualToBigIntSchemaId]: { min },
	title: `greaterThanOrEqualToBigInt(${min})`,
	description: min === 0n ? "a non-negative bigint" : `a bigint greater than or equal to ${min}n`,
	...annotations
}));
/**
* @category schema id
* @since 3.10.0
*/
const BetweenBigIntSchemaId = BetweenBigintSchemaId;
/**
* @category bigint filters
* @since 3.10.0
*/
const betweenBigInt = (min, max, annotations) => (self) => self.pipe(filter((a) => a >= min && a <= max, {
	schemaId: BetweenBigIntSchemaId,
	[BetweenBigIntSchemaId]: {
		min,
		max
	},
	title: `betweenBigInt(${min}, ${max})`,
	description: `a bigint between ${min}n and ${max}n`,
	...annotations
}));
/**
* @category bigint filters
* @since 3.10.0
*/
const nonNegativeBigInt = (annotations) => greaterThanOrEqualToBigInt(0n, {
	title: "nonNegativeBigInt",
	...annotations
});
/** @ignore */
var BigInt$ = class extends transformOrFail(String$.annotations({ description: "a string to be decoded into a bigint" }), BigIntFromSelf, {
	strict: true,
	decode: (i, _, ast) => fromOption(fromString(i), () => new Type(ast, i, `Unable to decode ${JSON.stringify(i)} into a bigint`)),
	encode: (a) => succeed(String(a))
}).annotations({ identifier: "BigInt" }) {};
/**
* @category bigint constructors
* @since 3.10.0
*/
const NonNegativeBigIntFromSelf = /*#__PURE__*/ BigIntFromSelf.pipe(/*#__PURE__*/ nonNegativeBigInt({ identifier: "NonNegativeBigintFromSelf" }));
transformOrFail(Number$.annotations({ description: "a number to be decoded into a bigint" }), BigIntFromSelf.pipe(betweenBigInt(BigInt(Number.MIN_SAFE_INTEGER), BigInt(Number.MAX_SAFE_INTEGER))), {
	strict: true,
	decode: (i, _, ast) => fromOption(fromNumber(i), () => new Type(ast, i, `Unable to decode ${i} into a bigint`)),
	encode: (a, _, ast) => fromOption(toNumber(a), () => new Type(ast, a, `Unable to encode ${a}n into a number`))
}).annotations({ identifier: "BigIntFromNumber" });
const toComposite = (eff, onSuccess, ast, actual) => mapBoth(eff, {
	onFailure: (e) => new Composite(ast, actual, e),
	onSuccess
});
/**
* @category Duration constructors
* @since 3.10.0
*/
var DurationFromSelf = class extends declare(isDuration, {
	typeConstructor: { _tag: "effect/Duration" },
	identifier: "DurationFromSelf",
	pretty: () => String,
	arbitrary: () => (fc) => fc.oneof(fc.constant(infinity), fc.bigInt({ min: 0n }).map((_) => nanos(_)), fc.maxSafeNat().map((_) => millis(_))),
	equivalence: () => Equivalence$3
}) {};
transformOrFail(NonNegativeBigIntFromSelf.annotations({ description: "a bigint to be decoded into a Duration" }), DurationFromSelf.pipe(filter((duration) => isFinite(duration), { description: "a finite duration" })), {
	strict: true,
	decode: (i) => succeed(nanos(i)),
	encode: (a, _, ast) => match$9(toNanos(a), {
		onNone: () => fail(new Type(ast, a, `Unable to encode ${a} into a bigint`)),
		onSome: (nanos) => succeed(nanos)
	})
}).annotations({ identifier: "DurationFromNanos" });
/**
* A non-negative integer. +Infinity is excluded.
*
* @category number constructors
* @since 3.11.10
*/
const NonNegativeInt = /*#__PURE__*/ NonNegative.pipe(int()).annotations({ identifier: "NonNegativeInt" });
transform(NonNegative.annotations({ description: "a non-negative number to be decoded into a Duration" }), DurationFromSelf, {
	strict: true,
	decode: (i) => millis(i),
	encode: (a) => toMillis(a)
}).annotations({ identifier: "DurationFromMillis" });
const DurationValueMillis = /*#__PURE__*/ TaggedStruct("Millis", { millis: NonNegativeInt });
const DurationValueNanos = /*#__PURE__*/ TaggedStruct("Nanos", { nanos: BigInt$ });
const DurationValueInfinity = /*#__PURE__*/ TaggedStruct("Infinity", {});
const durationValueInfinity = /*#__PURE__*/ DurationValueInfinity.make({});
const DurationValue = /*#__PURE__*/ Union(DurationValueMillis, DurationValueNanos, DurationValueInfinity).annotations({
	identifier: "DurationValue",
	description: "an JSON-compatible tagged union to be decoded into a Duration"
});
const HRTime = /*#__PURE__*/ Union(/* @__PURE__ */ Tuple(element(NonNegativeInt).annotations({ title: "seconds" }), element(NonNegativeInt).annotations({ title: "nanos" })).annotations({ identifier: "FiniteHRTime" }), /* @__PURE__ */ Tuple(Literal(-1), Literal(0)).annotations({ identifier: "InfiniteHRTime" })).annotations({
	identifier: "HRTime",
	description: "a tuple of seconds and nanos to be decoded into a Duration"
});
const isDurationValue = (u) => typeof u === "object";
transform(Union(DurationValue, HRTime), DurationFromSelf, {
	strict: true,
	decode: (i) => {
		if (isDurationValue(i)) switch (i._tag) {
			case "Millis": return millis(i.millis);
			case "Nanos": return nanos(i.nanos);
			case "Infinity": return infinity;
		}
		const [seconds, nanos$1] = i;
		return seconds === -1 ? infinity : nanos(BigInt(seconds) * BigInt(1e9) + BigInt(nanos$1));
	},
	encode: (a) => {
		switch (a.value._tag) {
			case "Millis": return DurationValueMillis.make({ millis: a.value.millis });
			case "Nanos": return DurationValueNanos.make({ nanos: a.value.nanos });
			case "Infinity": return durationValueInfinity;
		}
	}
}).annotations({ identifier: "Duration" });
/**
* @category Uint8Array constructors
* @since 3.10.0
*/
var Uint8ArrayFromSelf = class extends declare(isUint8Array, {
	typeConstructor: { _tag: "Uint8Array" },
	identifier: "Uint8ArrayFromSelf",
	pretty: () => (u8arr) => `new Uint8Array(${JSON.stringify(Array.from(u8arr))})`,
	arbitrary: () => (fc) => fc.uint8Array(),
	equivalence: () => getEquivalence$2(equals$2)
}) {};
/**
* @category number constructors
* @since 3.11.10
*/
var Uint8 = class extends Number$.pipe(/*#__PURE__*/ between(0, 255, {
	identifier: "Uint8",
	description: "a 8-bit unsigned integer"
})) {};
transform(Array$(Uint8).annotations({ description: "an array of 8-bit unsigned integers to be decoded into a Uint8Array" }), Uint8ArrayFromSelf, {
	strict: true,
	decode: (i) => Uint8Array.from(i),
	encode: (a) => Array.from(a)
}).annotations({ identifier: "Uint8Array" });
/**
* @category schema id
* @since 3.10.0
*/
const ValidDateSchemaId = /*#__PURE__*/ Symbol.for("effect/SchemaId/ValidDate");
/**
* Defines a filter that specifically rejects invalid dates, such as `new
* Date("Invalid Date")`. This filter ensures that only properly formatted and
* valid date objects are accepted, enhancing data integrity by preventing
* erroneous date values from being processed.
*
* @category Date filters
* @since 3.10.0
*/
const validDate = (annotations) => (self) => self.pipe(filter((a) => !Number.isNaN(a.getTime()), {
	schemaId: ValidDateSchemaId,
	[ValidDateSchemaId]: { noInvalidDate: true },
	title: "validDate",
	description: "a valid Date",
	...annotations
}));
/**
* @category schema id
* @since 3.11.8
*/
const DateFromSelfSchemaId = DateFromSelfSchemaId$1;
/**
* Describes a schema that accommodates potentially invalid `Date` instances,
* such as `new Date("Invalid Date")`, without rejection.
*
* @category Date constructors
* @since 3.10.0
*/
var DateFromSelf = class extends declare(isDate, {
	typeConstructor: { _tag: "Date" },
	identifier: "DateFromSelf",
	schemaId: DateFromSelfSchemaId,
	[DateFromSelfSchemaId]: { noInvalidDate: false },
	description: "a potentially invalid Date instance",
	pretty: () => (date) => `new Date(${JSON.stringify(date)})`,
	arbitrary: () => (fc) => fc.date({ noInvalidDate: false }),
	equivalence: () => Date$1
}) {};
DateFromSelf.pipe(/*#__PURE__*/ validDate({
	identifier: "ValidDateFromSelf",
	description: "a valid Date instance"
}));
/**
* Defines a schema that attempts to convert a `string` to a `Date` object using
* the `new Date` constructor. This conversion is lenient, meaning it does not
* reject strings that do not form valid dates (e.g., using `new Date("Invalid
* Date")` results in a `Date` object, despite being invalid).
*
* @category Date transformations
* @since 3.10.0
*/
var DateFromString = class extends transform(String$.annotations({ description: "a string to be decoded into a Date" }), DateFromSelf, {
	strict: true,
	decode: (i) => new Date(i),
	encode: (a) => formatDate(a)
}).annotations({ identifier: "DateFromString" }) {};
DateFromString.pipe(/*#__PURE__*/ validDate({ identifier: "Date" }));
transform(Number$.annotations({ description: "a number to be decoded into a Date" }), DateFromSelf, {
	strict: true,
	decode: (i) => new Date(i),
	encode: (a) => a.getTime()
}).annotations({ identifier: "DateFromNumber" });
/**
* Describes a schema that represents a `DateTime.Utc` instance.
*
* @category DateTime.Utc constructors
* @since 3.10.0
*/
var DateTimeUtcFromSelf = class extends declare((u) => isDateTime(u) && isUtc(u), {
	typeConstructor: { _tag: "effect/DateTime.Utc" },
	identifier: "DateTimeUtcFromSelf",
	description: "a DateTime.Utc instance",
	pretty: () => (dateTime) => dateTime.toString(),
	arbitrary: () => (fc) => fc.date({ noInvalidDate: true }).map((date) => unsafeFromDate(date)),
	equivalence: () => Equivalence
}) {};
const decodeDateTimeUtc = (input, ast) => _try({
	try: () => unsafeMake$1(input),
	catch: () => new Type(ast, input, `Unable to decode ${formatUnknown(input)} into a DateTime.Utc`)
});
transformOrFail(Number$.annotations({ description: "a number to be decoded into a DateTime.Utc" }), DateTimeUtcFromSelf, {
	strict: true,
	decode: (i, _, ast) => decodeDateTimeUtc(i, ast),
	encode: (a) => succeed(toEpochMillis(a))
}).annotations({ identifier: "DateTimeUtcFromNumber" });
transformOrFail(DateFromSelf.annotations({ description: "a Date to be decoded into a DateTime.Utc" }), DateTimeUtcFromSelf, {
	strict: true,
	decode: (i, _, ast) => decodeDateTimeUtc(i, ast),
	encode: (a) => succeed(toDateUtc(a))
}).annotations({ identifier: "DateTimeUtcFromDate" });
transformOrFail(String$.annotations({ description: "a string to be decoded into a DateTime.Utc" }), DateTimeUtcFromSelf, {
	strict: true,
	decode: (i, _, ast) => decodeDateTimeUtc(i, ast),
	encode: (a) => succeed(formatIso(a))
}).annotations({ identifier: "DateTimeUtc" });
const timeZoneOffsetArbitrary = () => (fc) => fc.integer({
	min: -432e5,
	max: 504e5
}).map(zoneMakeOffset);
/**
* Describes a schema that represents a `TimeZone.Offset` instance.
*
* @category TimeZone constructors
* @since 3.10.0
*/
var TimeZoneOffsetFromSelf = class extends declare(isTimeZoneOffset, {
	typeConstructor: { _tag: "effect/DateTime.TimeZone.Offset" },
	identifier: "TimeZoneOffsetFromSelf",
	description: "a TimeZone.Offset instance",
	pretty: () => (zone) => zone.toString(),
	arbitrary: timeZoneOffsetArbitrary
}) {};
transform(Number$.annotations({ description: "a number to be decoded into a TimeZone.Offset" }), TimeZoneOffsetFromSelf, {
	strict: true,
	decode: (i) => zoneMakeOffset(i),
	encode: (a) => a.offset
}).annotations({ identifier: "TimeZoneOffset" });
const timeZoneNamedArbitrary = () => (fc) => fc.constantFrom(...Intl.supportedValuesOf("timeZone")).map(zoneUnsafeMakeNamed);
/**
* Describes a schema that represents a `TimeZone.Named` instance.
*
* @category TimeZone constructors
* @since 3.10.0
*/
var TimeZoneNamedFromSelf = class extends declare(isTimeZoneNamed, {
	typeConstructor: { _tag: "effect/DateTime.TimeZone.Named" },
	identifier: "TimeZoneNamedFromSelf",
	description: "a TimeZone.Named instance",
	pretty: () => (zone) => zone.toString(),
	arbitrary: timeZoneNamedArbitrary
}) {};
transformOrFail(String$.annotations({ description: "a string to be decoded into a TimeZone.Named" }), TimeZoneNamedFromSelf, {
	strict: true,
	decode: (i, _, ast) => _try({
		try: () => zoneUnsafeMakeNamed(i),
		catch: () => new Type(ast, i, `Unable to decode ${JSON.stringify(i)} into a TimeZone.Named`)
	}),
	encode: (a) => succeed(a.id)
}).annotations({ identifier: "TimeZoneNamed" });
/**
* @category TimeZone constructors
* @since 3.10.0
*/
var TimeZoneFromSelf = class extends Union(TimeZoneOffsetFromSelf, TimeZoneNamedFromSelf) {};
transformOrFail(String$.annotations({ description: "a string to be decoded into a TimeZone" }), TimeZoneFromSelf, {
	strict: true,
	decode: (i, _, ast) => match$9(zoneFromString(i), {
		onNone: () => fail(new Type(ast, i, `Unable to decode ${JSON.stringify(i)} into a TimeZone`)),
		onSome: succeed
	}),
	encode: (a) => succeed(zoneToString(a))
}).annotations({ identifier: "TimeZone" });
const timeZoneArbitrary = (fc) => fc.oneof(timeZoneOffsetArbitrary()(fc), timeZoneNamedArbitrary()(fc));
/**
* Describes a schema that represents a `DateTime.Zoned` instance.
*
* @category DateTime.Zoned constructors
* @since 3.10.0
*/
var DateTimeZonedFromSelf = class extends declare((u) => isDateTime(u) && isZoned(u), {
	typeConstructor: { _tag: "effect/DateTime.Zoned" },
	identifier: "DateTimeZonedFromSelf",
	description: "a DateTime.Zoned instance",
	pretty: () => (dateTime) => dateTime.toString(),
	arbitrary: () => (fc) => fc.tuple(fc.integer({
		min: -31536e9,
		max: 31536e9
	}), timeZoneArbitrary(fc)).map(([millis, timeZone]) => unsafeMakeZoned(millis, { timeZone })),
	equivalence: () => Equivalence
}) {};
transformOrFail(String$.annotations({ description: "a string to be decoded into a DateTime.Zoned" }), DateTimeZonedFromSelf, {
	strict: true,
	decode: (i, _, ast) => match$9(makeZonedFromString(i), {
		onNone: () => fail(new Type(ast, i, `Unable to decode ${JSON.stringify(i)} into a DateTime.Zoned`)),
		onSome: succeed
	}),
	encode: (a) => succeed(formatIsoZoned(a))
}).annotations({ identifier: "DateTimeZoned" });
const optionDecode = (input) => input._tag === "None" ? none$4() : some(input.value);
const optionArbitrary = (value, ctx) => (fc) => fc.oneof(ctx, fc.record({ _tag: fc.constant("None") }), fc.record({
	_tag: fc.constant("Some"),
	value: value(fc)
})).map(optionDecode);
const optionPretty = (value) => match$9({
	onNone: () => "none()",
	onSome: (a) => `some(${value(a)})`
});
const optionParse = (decodeUnknown) => (u, options, ast) => isOption(u) ? isNone(u) ? succeed(none$4()) : toComposite(decodeUnknown(u.value, options), some, ast, u) : fail(new Type(ast, u));
const OptionFromSelf_ = (value) => {
	return declare([value], {
		decode: (value) => optionParse(decodeUnknown(value)),
		encode: (value) => optionParse(encodeUnknown(value))
	}, {
		typeConstructor: { _tag: "effect/Option" },
		pretty: optionPretty,
		arbitrary: optionArbitrary,
		equivalence: getEquivalence$3
	});
};
/**
* @category Option transformations
* @since 3.10.0
*/
const OptionFromSelf = (value) => {
	return OptionFromSelf_(value).annotations({ description: `Option<${format(value)}>` });
};
transform(String$, /*#__PURE__*/ OptionFromSelf(NonEmptyTrimmedString), {
	strict: true,
	decode: (i) => filter$3(some(i.trim()), isNonEmpty$1),
	encode: (a) => getOrElse(a, () => "")
});
const bigDecimalPretty = () => (val) => `BigDecimal(${format$1(normalize(val))})`;
const bigDecimalArbitrary = () => (fc) => fc.tuple(fc.bigInt(), fc.integer({
	min: -18,
	max: 18
})).map(([value, scale]) => make$6(value, scale));
/**
* @category BigDecimal constructors
* @since 3.10.0
*/
var BigDecimalFromSelf = class extends declare(isBigDecimal, {
	typeConstructor: { _tag: "effect/BigDecimal" },
	identifier: "BigDecimalFromSelf",
	pretty: bigDecimalPretty,
	arbitrary: bigDecimalArbitrary,
	equivalence: () => Equivalence$1
}) {};
transformOrFail(String$.annotations({ description: "a string to be decoded into a BigDecimal" }), BigDecimalFromSelf, {
	strict: true,
	decode: (i, _, ast) => fromString$1(i).pipe(match$9({
		onNone: () => fail(new Type(ast, i, `Unable to decode ${JSON.stringify(i)} into a BigDecimal`)),
		onSome: (val) => succeed(normalize(val))
	})),
	encode: (a) => succeed(format$1(normalize(a)))
}).annotations({ identifier: "BigDecimal" });
transform(Number$.annotations({ description: "a number to be decoded into a BigDecimal" }), BigDecimalFromSelf, {
	strict: true,
	decode: (i) => unsafeFromNumber(i),
	encode: (a) => unsafeToNumber(a)
}).annotations({ identifier: "BigDecimalFromNumber" });
const isField = (u) => isSchema(u) || isPropertySignature(u);
const isFields = (fields) => Reflect.ownKeys(fields).every((key) => isField(fields[key]));
const getFields = (hasFields) => "fields" in hasFields ? hasFields.fields : getFields(hasFields[RefineSchemaId]);
const getSchemaFromFieldsOr = (fieldsOr) => isFields(fieldsOr) ? Struct(fieldsOr) : isSchema(fieldsOr) ? fieldsOr : Struct(getFields(fieldsOr));
const getFieldsFromFieldsOr = (fieldsOr) => isFields(fieldsOr) ? fieldsOr : getFields(fieldsOr);
/** @internal */
const getClassTag = (tag) => withConstructorDefault(propertySignature(Literal(tag)), () => tag);
/**
* @example
* ```ts
* import { Schema } from "effect"
*
* class MyClass extends Schema.TaggedClass<MyClass>("MyClass")("MyClass", {
*  a: Schema.String
* }) {}
* ```
*
* @category classes
* @since 3.10.0
*/
const TaggedClass = (identifier) => (tag, fieldsOr, annotations) => {
	const fields = getFieldsFromFieldsOr(fieldsOr);
	const schema = getSchemaFromFieldsOr(fieldsOr);
	const newFields = { _tag: getClassTag(tag) };
	const taggedFields = extendFields(newFields, fields);
	return class TaggedClass extends makeClass({
		kind: "TaggedClass",
		identifier: identifier ?? tag,
		schema: extend(schema, Struct(newFields)),
		fields: taggedFields,
		Base: Class,
		annotations
	}) {
		static _tag = tag;
	};
};
/**
* @example
* ```ts
* import { Schema } from "effect"
*
* class MyError extends Schema.TaggedError<MyError>("MyError")(
*   "MyError",
*   {
*     module: Schema.String,
*     method: Schema.String,
*     description: Schema.String
*   }
* ) {
*   get message(): string {
*     return `${this.module}.${this.method}: ${this.description}`
*   }
* }
* ```
* @category classes
* @since 3.10.0
*/
const TaggedError = (identifier) => (tag, fieldsOr, annotations) => {
	class Base extends Error$1 {}
	Base.prototype.name = tag;
	const fields = getFieldsFromFieldsOr(fieldsOr);
	const schema = getSchemaFromFieldsOr(fieldsOr);
	const newFields = { _tag: getClassTag(tag) };
	const taggedFields = extendFields(newFields, fields);
	const hasMessageField = "message" in taggedFields;
	class TaggedErrorClass extends makeClass({
		kind: "TaggedError",
		identifier: identifier ?? tag,
		schema: extend(schema, Struct(newFields)),
		fields: taggedFields,
		Base,
		annotations,
		disableToString: true
	}) {
		static _tag = tag;
	}
	if (!hasMessageField) Object.defineProperty(TaggedErrorClass.prototype, "message", {
		get() {
			return `{ ${Reflect.ownKeys(fields).map((p) => `${formatPropertyKey$1(p)}: ${formatUnknown(this[p])}`).join(", ")} }`;
		},
		enumerable: false,
		configurable: true
	});
	return TaggedErrorClass;
};
const extendFields = (a, b) => {
	const out = { ...a };
	for (const key of Reflect.ownKeys(b)) {
		if (key in a) throw new Error(getASTDuplicatePropertySignatureErrorMessage(key));
		out[key] = b[key];
	}
	return out;
};
function getDisableValidationMakeOption(options) {
	return isBoolean(options) ? options : options?.disableValidation ?? false;
}
const astCache = /*#__PURE__*/ globalValue("effect/Schema/astCache", () => /* @__PURE__ */ new WeakMap());
const getClassAnnotations = (annotations) => {
	if (annotations === void 0) return [];
	else if (Array.isArray(annotations)) return annotations;
	else return [annotations];
};
const makeClass = ({ Base, annotations, disableToString, fields, identifier, kind, schema }) => {
	const classSymbol = Symbol.for(`effect/Schema/${kind}/${identifier}`);
	const [typeAnnotations, transformationAnnotations, encodedAnnotations] = getClassAnnotations(annotations);
	const typeSchema_ = typeSchema(schema);
	const declarationSurrogate = typeSchema_.annotations({
		identifier,
		...typeAnnotations
	});
	const typeSide = typeSchema_.annotations({
		[AutoTitleAnnotationId]: `${identifier} (Type side)`,
		...typeAnnotations
	});
	const constructorSchema = schema.annotations({
		[AutoTitleAnnotationId]: `${identifier} (Constructor)`,
		...typeAnnotations
	});
	const encodedSide = schema.annotations({
		[AutoTitleAnnotationId]: `${identifier} (Encoded side)`,
		...encodedAnnotations
	});
	const transformationSurrogate = schema.annotations({
		...encodedAnnotations,
		...typeAnnotations,
		...transformationAnnotations
	});
	const fallbackInstanceOf = (u) => hasProperty(u, classSymbol) && is(typeSide)(u);
	const klass = class extends Base {
		constructor(props = {}, options = false) {
			props = { ...props };
			if (kind !== "Class") delete props["_tag"];
			props = lazilyMergeDefaults(fields, props);
			if (!getDisableValidationMakeOption(options)) props = validateSync(constructorSchema)(props);
			super(props, true);
		}
		static [TypeId$6] = variance;
		static get ast() {
			let out = astCache.get(this);
			if (out) return out;
			const declaration = declare([schema], {
				decode: () => (input, _, ast) => input instanceof this || fallbackInstanceOf(input) ? succeed(input) : fail(new Type(ast, input)),
				encode: () => (input, options) => input instanceof this ? succeed(input) : map(encodeUnknown(typeSide)(input, options), (props) => new this(props, true))
			}, {
				identifier,
				pretty: (pretty) => (self) => `${identifier}(${pretty(self)})`,
				arbitrary: (arb) => (fc) => arb(fc).map((props) => new this(props)),
				equivalence: identity,
				[SurrogateAnnotationId]: declarationSurrogate.ast,
				...typeAnnotations
			});
			out = transform(encodedSide, declaration, {
				strict: true,
				decode: (i) => new this(i, true),
				encode: identity
			}).annotations({
				[SurrogateAnnotationId]: transformationSurrogate.ast,
				...transformationAnnotations
			}).ast;
			astCache.set(this, out);
			return out;
		}
		static pipe() {
			return pipeArguments(this, arguments);
		}
		static annotations(annotations) {
			return make$5(this.ast).annotations(annotations);
		}
		static toString() {
			return `(${String(encodedSide)} <-> ${identifier})`;
		}
		static make(...args) {
			return new this(...args);
		}
		static fields = { ...fields };
		static identifier = identifier;
		static extend(identifier) {
			return (newFieldsOr, annotations) => {
				const newFields = getFieldsFromFieldsOr(newFieldsOr);
				const newSchema = getSchemaFromFieldsOr(newFieldsOr);
				const extendedFields = extendFields(fields, newFields);
				return makeClass({
					kind,
					identifier,
					schema: extend(schema, newSchema),
					fields: extendedFields,
					Base: this,
					annotations
				});
			};
		}
		static transformOrFail(identifier) {
			return (newFieldsOr, options, annotations) => {
				const transformedFields = extendFields(fields, newFieldsOr);
				return makeClass({
					kind,
					identifier,
					schema: transformOrFail(schema, typeSchema(Struct(transformedFields)), options),
					fields: transformedFields,
					Base: this,
					annotations
				});
			};
		}
		static transformOrFailFrom(identifier) {
			return (newFields, options, annotations) => {
				const transformedFields = extendFields(fields, newFields);
				return makeClass({
					kind,
					identifier,
					schema: transformOrFail(encodedSchema(schema), Struct(transformedFields), options),
					fields: transformedFields,
					Base: this,
					annotations
				});
			};
		}
		get [classSymbol]() {
			return classSymbol;
		}
	};
	if (disableToString !== true) Object.defineProperty(klass.prototype, "toString", {
		value() {
			return `${identifier}({ ${Reflect.ownKeys(fields).map((p) => `${formatPropertyKey$1(p)}: ${formatUnknown(this[p])}`).join(", ")} })`;
		},
		configurable: true,
		writable: true
	});
	return klass;
};
const FiberIdEncoded = /*#__PURE__*/ Union(/* @__PURE__ */ Struct({ _tag: Literal("None") }).annotations({ identifier: "FiberIdNoneEncoded" }), /* @__PURE__ */ Struct({
	_tag: Literal("Runtime"),
	id: Int,
	startTimeMillis: Int
}).annotations({ identifier: "FiberIdRuntimeEncoded" }), /* @__PURE__ */ Struct({
	_tag: Literal("Composite"),
	left: suspend(() => FiberIdEncoded),
	right: suspend(() => FiberIdEncoded)
}).annotations({ identifier: "FiberIdCompositeEncoded" })).annotations({ identifier: "FiberIdEncoded" });
const fiberIdArbitrary = (fc) => fc.letrec((tie) => ({
	None: fc.record({ _tag: fc.constant("None") }),
	Runtime: fc.record({
		_tag: fc.constant("Runtime"),
		id: fc.integer(),
		startTimeMillis: fc.integer()
	}),
	Composite: fc.record({
		_tag: fc.constant("Composite"),
		left: tie("FiberId"),
		right: tie("FiberId")
	}),
	FiberId: fc.oneof(tie("None"), tie("Runtime"), tie("Composite"))
})).FiberId.map(fiberIdDecode);
const fiberIdPretty = (fiberId) => {
	switch (fiberId._tag) {
		case "None": return "FiberId.none";
		case "Runtime": return `FiberId.runtime(${fiberId.id}, ${fiberId.startTimeMillis})`;
		case "Composite": return `FiberId.composite(${fiberIdPretty(fiberId.right)}, ${fiberIdPretty(fiberId.left)})`;
	}
};
/**
* @category FiberId constructors
* @since 3.10.0
*/
var FiberIdFromSelf = class extends declare(isFiberId, {
	typeConstructor: { _tag: "effect/FiberId" },
	identifier: "FiberIdFromSelf",
	pretty: () => fiberIdPretty,
	arbitrary: () => fiberIdArbitrary
}) {};
const fiberIdDecode = (input) => {
	switch (input._tag) {
		case "None": return none$2;
		case "Runtime": return runtime$2(input.id, input.startTimeMillis);
		case "Composite": return composite(fiberIdDecode(input.left), fiberIdDecode(input.right));
	}
};
const fiberIdEncode = (input) => {
	switch (input._tag) {
		case "None": return { _tag: "None" };
		case "Runtime": return {
			_tag: "Runtime",
			id: input.id,
			startTimeMillis: input.startTimeMillis
		};
		case "Composite": return {
			_tag: "Composite",
			left: fiberIdEncode(input.left),
			right: fiberIdEncode(input.right)
		};
	}
};
transform(FiberIdEncoded, FiberIdFromSelf, {
	strict: true,
	decode: (i) => fiberIdDecode(i),
	encode: (a) => fiberIdEncode(a)
}).annotations({ identifier: "FiberId" });
const causeDieEncoded = (defect) => Struct({
	_tag: Literal("Die"),
	defect
});
const CauseEmptyEncoded = /*#__PURE__*/ Struct({ _tag: /*#__PURE__*/ Literal("Empty") });
const causeFailEncoded = (error) => Struct({
	_tag: Literal("Fail"),
	error
});
const CauseInterruptEncoded = /*#__PURE__*/ Struct({
	_tag: /*#__PURE__*/ Literal("Interrupt"),
	fiberId: FiberIdEncoded
});
let causeEncodedId = 0;
const causeEncoded = (error, defect) => {
	const error_ = asSchema(error);
	const defect_ = asSchema(defect);
	const suspended = suspend(() => out);
	const out = Union(CauseEmptyEncoded, causeFailEncoded(error_), causeDieEncoded(defect_), CauseInterruptEncoded, Struct({
		_tag: Literal("Sequential"),
		left: suspended,
		right: suspended
	}), Struct({
		_tag: Literal("Parallel"),
		left: suspended,
		right: suspended
	})).annotations({
		title: `CauseEncoded<${format(error)}>`,
		[JSONIdentifierAnnotationId]: `CauseEncoded${causeEncodedId++}`
	});
	return out;
};
const causeArbitrary = (error, defect) => (fc) => fc.letrec((tie) => ({
	Empty: fc.record({ _tag: fc.constant("Empty") }),
	Fail: fc.record({
		_tag: fc.constant("Fail"),
		error: error(fc)
	}),
	Die: fc.record({
		_tag: fc.constant("Die"),
		defect: defect(fc)
	}),
	Interrupt: fc.record({
		_tag: fc.constant("Interrupt"),
		fiberId: fiberIdArbitrary(fc)
	}),
	Sequential: fc.record({
		_tag: fc.constant("Sequential"),
		left: tie("Cause"),
		right: tie("Cause")
	}),
	Parallel: fc.record({
		_tag: fc.constant("Parallel"),
		left: tie("Cause"),
		right: tie("Cause")
	}),
	Cause: fc.oneof(tie("Empty"), tie("Fail"), tie("Die"), tie("Interrupt"), tie("Sequential"), tie("Parallel"))
})).Cause.map(causeDecode);
const causePretty = (error) => (cause) => {
	const f = (cause) => {
		switch (cause._tag) {
			case "Empty": return "Cause.empty";
			case "Fail": return `Cause.fail(${error(cause.error)})`;
			case "Die": return `Cause.die(${pretty(cause)})`;
			case "Interrupt": return `Cause.interrupt(${fiberIdPretty(cause.fiberId)})`;
			case "Sequential": return `Cause.sequential(${f(cause.left)}, ${f(cause.right)})`;
			case "Parallel": return `Cause.parallel(${f(cause.left)}, ${f(cause.right)})`;
		}
	};
	return f(cause);
};
const causeParse = (decodeUnknown) => (u, options, ast) => isCause(u) ? toComposite(decodeUnknown(causeEncode(u), options), causeDecode, ast, u) : fail(new Type(ast, u));
/**
* @category Cause transformations
* @since 3.10.0
*/
const CauseFromSelf = ({ defect, error }) => {
	return declare([error, defect], {
		decode: (error, defect) => causeParse(decodeUnknown(causeEncoded(error, defect))),
		encode: (error, defect) => causeParse(encodeUnknown(causeEncoded(error, defect)))
	}, {
		typeConstructor: { _tag: "effect/Cause" },
		title: `Cause<${error.ast}>`,
		pretty: causePretty,
		arbitrary: causeArbitrary
	});
};
function causeDecode(cause) {
	switch (cause._tag) {
		case "Empty": return empty$5;
		case "Fail": return fail$4(cause.error);
		case "Die": return die$2(cause.defect);
		case "Interrupt": return interrupt$3(fiberIdDecode(cause.fiberId));
		case "Sequential": return sequential(causeDecode(cause.left), causeDecode(cause.right));
		case "Parallel": return parallel(causeDecode(cause.left), causeDecode(cause.right));
	}
}
function causeEncode(cause) {
	switch (cause._tag) {
		case "Empty": return { _tag: "Empty" };
		case "Fail": return {
			_tag: "Fail",
			error: cause.error
		};
		case "Die": return {
			_tag: "Die",
			defect: cause.defect
		};
		case "Interrupt": return {
			_tag: "Interrupt",
			fiberId: cause.fiberId
		};
		case "Sequential": return {
			_tag: "Sequential",
			left: causeEncode(cause.left),
			right: causeEncode(cause.right)
		};
		case "Parallel": return {
			_tag: "Parallel",
			left: causeEncode(cause.left),
			right: causeEncode(cause.right)
		};
	}
}
/**
* @category Cause transformations
* @since 3.10.0
*/
const Cause = ({ defect, error }) => {
	const error_ = asSchema(error);
	const defect_ = asSchema(defect);
	return transform(causeEncoded(error_, defect_), CauseFromSelf({
		error: typeSchema(error_),
		defect: typeSchema(defect_)
	}), {
		strict: false,
		decode: (i) => causeDecode(i),
		encode: (a) => causeEncode(a)
	});
};
/**
* Defines a schema for handling JavaScript errors (`Error` instances) and other types of defects.
* It decodes objects into Error instances if they match the expected structure (i.e., have a `message` and optionally a `name` and `stack`),
* or converts other values to their string representations.
*
* When encoding, it converts `Error` instances back into plain objects containing only the error's name and message,
* or other values into their string forms.
*
* This is useful for serializing and deserializing errors across network boundaries where error objects do not natively serialize.
*
* @category defect
* @since 3.10.0
*/
var Defect = class extends transform(Unknown, Unknown, {
	strict: true,
	decode: (i) => {
		if (isObject(i) && "message" in i && typeof i.message === "string") {
			const err = new Error(i.message, { cause: i });
			if ("name" in i && typeof i.name === "string") err.name = i.name;
			err.stack = "stack" in i && typeof i.stack === "string" ? i.stack : "";
			return err;
		}
		return prettyErrorMessage(i);
	},
	encode: (a) => {
		if (a instanceof Error) return {
			name: a.name,
			message: a.message
		};
		return prettyErrorMessage(a);
	}
}).annotations({ identifier: "Defect" }) {};
transform(Unknown, Boolean$, {
	strict: true,
	decode: (i) => isTruthy(i),
	encode: identity
}).annotations({ identifier: "BooleanFromUnknown" });
transform(Literal("true", "false").annotations({ description: "a string to be decoded into a boolean" }), Boolean$, {
	strict: true,
	decode: (i) => i === "true",
	encode: (a) => a ? "true" : "false"
}).annotations({ identifier: "BooleanFromString" });
const SymbolStruct = /*#__PURE__*/ TaggedStruct("symbol", { key: String$ }).annotations({ description: "an object to be decoded into a globally shared symbol" });
const SymbolFromStruct = /*#__PURE__*/ transformOrFail(SymbolStruct, SymbolFromSelf, {
	strict: true,
	decode: (i) => decodeSymbol(i.key),
	encode: (a, _, ast) => map(encodeSymbol(a, ast), (key) => SymbolStruct.make({ key }))
});
/** @ignore */
var PropertyKey$ = class extends Union(String$, Number$, SymbolFromStruct).annotations({ identifier: "PropertyKey" }) {};
Struct({
	_tag: propertySignature(Literal("Pointer", "Unexpected", "Missing", "Composite", "Refinement", "Transformation", "Type", "Forbidden")).annotations({ description: "The tag identifying the type of parse issue" }),
	path: propertySignature(Array$(PropertyKey$)).annotations({ description: "The path to the property where the issue occurred" }),
	message: propertySignature(String$).annotations({ description: "A descriptive message explaining the issue" })
}).annotations({
	identifier: "ArrayFormatterIssue",
	description: "Represents an issue returned by the ArrayFormatter formatter"
});
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform@0.97.1_effect@3.22.1/node_modules/@effect/platform/dist/esm/Error.js
/**
* @since 1.0.0
* @category type id
*/
const TypeId$5 = /*#__PURE__*/ Symbol.for("@effect/platform/Error");
/**
* @since 1.0.0
* @category Models
*/
const Module = /*#__PURE__*/ Literal("Clipboard", "Command", "FileSystem", "KeyValueStore", "Path", "Stream", "Terminal");
/**
* @since 1.0.0
* @category Models
*/
var BadArgument = class extends TaggedError("@effect/platform/Error/BadArgument")("BadArgument", {
	module: Module,
	method: String$,
	description: /*#__PURE__*/ optional(String$),
	cause: /*#__PURE__*/ optional(Defect)
}) {
	/**
	* @since 1.0.0
	*/
	[TypeId$5] = TypeId$5;
	/**
	* @since 1.0.0
	*/
	get message() {
		return `${this.module}.${this.method}${this.description ? `: ${this.description}` : ""}`;
	}
};
/**
* @since 1.0.0
* @category Model
*/
const SystemErrorReason = /*#__PURE__*/ Literal("AlreadyExists", "BadResource", "Busy", "InvalidData", "NotFound", "PermissionDenied", "TimedOut", "UnexpectedEof", "Unknown", "WouldBlock", "WriteZero");
/**
* @since 1.0.0
* @category models
*/
var SystemError = class extends TaggedError("@effect/platform/Error/SystemError")("SystemError", {
	reason: SystemErrorReason,
	module: Module,
	method: String$,
	description: /*#__PURE__*/ optional(String$),
	syscall: /*#__PURE__*/ optional(String$),
	pathOrDescriptor: /*#__PURE__*/ optional(/*#__PURE__*/ Union(String$, Number$)),
	cause: /*#__PURE__*/ optional(Defect)
}) {
	/**
	* @since 1.0.0
	*/
	[TypeId$5] = TypeId$5;
	/**
	* @since 1.0.0
	*/
	get message() {
		return `${this.reason}: ${this.module}.${this.method}${this.pathOrDescriptor !== void 0 ? ` (${this.pathOrDescriptor})` : ""}${this.description ? `: ${this.description}` : ""}`;
	}
};
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform@0.97.1_effect@3.22.1/node_modules/@effect/platform/dist/esm/internal/fileSystem.js
/** @internal */
const tag$3 = /*#__PURE__*/ GenericTag("@effect/platform/FileSystem");
/** @internal */
const Size$1 = (bytes) => typeof bytes === "bigint" ? bytes : BigInt(bytes);
const bigint1024 = /*#__PURE__*/ BigInt(1024);
bigint1024 * bigint1024 * bigint1024 * bigint1024 * bigint1024;
/** @internal */
const make$4 = (impl) => {
	return tag$3.of({
		...impl,
		exists: (path) => pipe(impl.access(path), as$1(true), catchTag("SystemError", (e) => e.reason === "NotFound" ? succeed$2(false) : fail$2(e))),
		readFileString: (path, encoding) => tryMap(impl.readFile(path), {
			try: (_) => new TextDecoder(encoding).decode(_),
			catch: (cause) => new BadArgument({
				module: "FileSystem",
				method: "readFileString",
				description: "invalid encoding",
				cause
			})
		}),
		stream: (path, options) => pipe(impl.open(path, { flag: "r" }), options?.offset ? tap((file) => file.seek(options.offset, "start")) : identity, map$2((file) => stream(file, options)), unwrapScoped$1),
		sink: (path, options) => pipe(impl.open(path, {
			flag: "w",
			...options
		}), map$2((file) => forEach((_) => file.writeAll(_))), unwrapScoped),
		writeFileString: (path, data, options) => flatMap$4(try_({
			try: () => new TextEncoder().encode(data),
			catch: (cause) => new BadArgument({
				module: "FileSystem",
				method: "writeFileString",
				description: "could not encode string",
				cause
			})
		}), (_) => impl.writeFile(path, _, options))
	});
};
/** @internal */
const stream = (file, { bufferSize = 16, bytesToRead: bytesToRead_, chunkSize: chunkSize_ = Size$1(65536) } = {}) => {
	const bytesToRead = bytesToRead_ !== void 0 ? Size$1(bytesToRead_) : void 0;
	const chunkSize = Size$1(chunkSize_);
	function loop(totalBytesRead) {
		if (bytesToRead !== void 0 && bytesToRead <= totalBytesRead) return void_;
		const toRead = bytesToRead !== void 0 && bytesToRead - totalBytesRead < chunkSize ? bytesToRead - totalBytesRead : chunkSize;
		return flatMap$1(file.readAlloc(toRead), match$9({
			onNone: () => void_,
			onSome: (buf) => flatMap$1(write(of$1(buf)), (_) => loop(totalBytesRead + BigInt(buf.length)))
		}));
	}
	return bufferChunks(fromChannel$1(loop(BigInt(0))), { capacity: bufferSize });
};
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform@0.97.1_effect@3.22.1/node_modules/@effect/platform/dist/esm/FileSystem.js
/**
* @since 1.0.0
*/
/**
* @since 1.0.0
* @category sizes
*/
const Size = Size$1;
/**
* @since 1.0.0
* @category tag
*/
const FileSystem = tag$3;
/**
* @since 1.0.0
* @category constructor
*/
const make$3 = make$4;
/**
* @since 1.0.0
* @category type id
*/
const FileTypeId = /*#__PURE__*/ Symbol.for("@effect/platform/FileSystem/File");
/**
* @since 1.0.0
* @category constructor
*/
const FileDescriptor = /*#__PURE__*/ nominal();
/**
* @since 1.0.0
* @category constructor
*/
const WatchEventCreate = /*#__PURE__*/ tagged("Create");
/**
* @since 1.0.0
* @category constructor
*/
const WatchEventUpdate = /*#__PURE__*/ tagged("Update");
/**
* @since 1.0.0
* @category constructor
*/
const WatchEventRemove = /*#__PURE__*/ tagged("Remove");
/**
* @since 1.0.0
* @category file watcher
*/
var WatchBackend = class extends Tag("@effect/platform/FileSystem/WatchBackend")() {};
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform-node-shared@0.61.1_@effect+cluster@0.60.2_@effect+platform@0.97.1_effe_d4ef128a009d382f95e6e1a2e11e2a47/node_modules/@effect/platform-node-shared/dist/esm/internal/error.js
/** @internal */
const handleErrnoException = (module, method) => (err, [path]) => {
	let reason = "Unknown";
	switch (err.code) {
		case "ENOENT":
			reason = "NotFound";
			break;
		case "EACCES":
			reason = "PermissionDenied";
			break;
		case "EEXIST":
			reason = "AlreadyExists";
			break;
		case "EISDIR":
			reason = "BadResource";
			break;
		case "ENOTDIR":
			reason = "BadResource";
			break;
		case "EBUSY":
			reason = "Busy";
			break;
		case "ELOOP": reason = "BadResource";
	}
	return new SystemError({
		reason,
		module,
		method,
		pathOrDescriptor: path,
		syscall: err.syscall,
		description: err.message,
		cause: err
	});
};
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform-node-shared@0.61.1_@effect+cluster@0.60.2_@effect+platform@0.97.1_effe_d4ef128a009d382f95e6e1a2e11e2a47/node_modules/@effect/platform-node-shared/dist/esm/internal/stream.js
/** @internal */
const fromReadable = (evaluate, onError, options) => fromChannel$1(fromReadableChannel(evaluate, onError, options));
/** @internal */
const fromReadableChannel = (evaluate, onError, options) => suspend$1(() => unsafeReadableRead(evaluate(), onError, make$39(void 0), options));
/** @internal */
const writeInput = (writable, onFailure, { encoding, endOnDone = true } = {}, onDone = _void) => {
	const write = writeEffect(writable, encoding);
	const close = endOnDone ? async((resume) => {
		if ("closed" in writable && writable.closed) resume(_void);
		else {
			writable.once("finish", () => resume(_void));
			writable.end();
		}
	}) : _void;
	return {
		awaitRead: () => _void,
		emit: write,
		error: (cause) => zipRight$1(close, onFailure(cause)),
		done: (_) => zipRight$1(close, onDone)
	};
};
/** @internal */
const writeEffect = (writable, encoding) => (chunk) => chunk.length === 0 ? _void : async((resume) => {
	const iterator = chunk[Symbol.iterator]();
	let next = iterator.next();
	function loop() {
		const item = next;
		next = iterator.next();
		const success = writable.write(item.value, encoding);
		if (next.done) resume(_void);
		else if (success) loop();
		else writable.once("drain", loop);
	}
	loop();
});
const unsafeReadableRead = (readable, onError, exit, options) => {
	if (!readable.readable) return void_;
	const latch = unsafeMakeLatch(false);
	function onReadable() {
		latch.unsafeOpen();
	}
	function onErr(err) {
		exit.current = fail$5(onError(err));
		latch.unsafeOpen();
	}
	function onEnd() {
		exit.current = void_$2;
		latch.unsafeOpen();
	}
	readable.on("readable", onReadable);
	readable.on("error", onErr);
	readable.on("end", onEnd);
	const chunkSize = options?.chunkSize ? Number(options.chunkSize) : void 0;
	const read = suspend$1(function loop() {
		let item = readable.read(chunkSize);
		if (item === null) {
			if (exit.current) return fromEffect(exit.current);
			latch.unsafeClose();
			return flatMap$1(latch.await, loop);
		}
		const arr = [item];
		while (true) {
			item = readable.read(chunkSize);
			if (item === null) return flatMap$1(write(unsafeFromArray(arr)), loop);
			arr.push(item);
		}
	});
	return ensuring(read, sync$1(() => {
		readable.off("readable", onReadable);
		readable.off("error", onErr);
		readable.off("end", onEnd);
		if (options?.closeOnDone !== false && "closed" in readable && !readable.closed) readable.destroy();
	}));
};
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform-node-shared@0.61.1_@effect+cluster@0.60.2_@effect+platform@0.97.1_effe_d4ef128a009d382f95e6e1a2e11e2a47/node_modules/@effect/platform-node-shared/dist/esm/internal/sink.js
/** @internal */
const fromWritable = (evaluate, onError, options) => fromChannel(fromWritableChannel(evaluate, onError, options));
/** @internal */
const fromWritableChannel = (writable, onError, options) => flatMap$1(zip$1(sync$1(() => writable()), make$16()), ([writable, deferred]) => embedInput(writableOutput(writable, deferred, onError), writeInput(writable, (cause) => failCause$3(deferred, cause), options, complete(deferred, _void))));
const writableOutput = (writable, deferred, onError) => suspend$5(() => {
	function handleError(err) {
		unsafeDone(deferred, fail$2(onError(err)));
	}
	writable.on("error", handleError);
	return ensuring$2(_await(deferred), sync$1(() => {
		writable.removeListener("error", handleError);
	}));
});
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform-node-shared@0.61.1_@effect+cluster@0.60.2_@effect+platform@0.97.1_effe_d4ef128a009d382f95e6e1a2e11e2a47/node_modules/@effect/platform-node-shared/dist/esm/internal/commandExecutor.js
const inputToStdioOption = (stdin) => typeof stdin === "string" ? stdin : "pipe";
const outputToStdioOption = (output) => typeof output === "string" ? output : "pipe";
const toError = (err) => err instanceof globalThis.Error ? err : new globalThis.Error(String(err));
const toPlatformError = (method, error, command) => {
	const flattened = flatten$1(command).reduce((acc, curr) => {
		const command = `${curr.command} ${curr.args.join(" ")}`;
		return acc.length === 0 ? command : `${acc} | ${command}`;
	}, "");
	return handleErrnoException("Command", method)(error, [flattened]);
};
const ProcessProto = {
	[ProcessTypeId]: ProcessTypeId,
	...BaseProto,
	toJSON() {
		return {
			_id: "@effect/platform/CommandExecutor/Process",
			pid: this.pid
		};
	}
};
const runCommand = (fileSystem) => (command) => {
	switch (command._tag) {
		case "StandardCommand": {
			const spawn = flatMap$4(make$16(), (exitCode) => async((resume) => {
				const handle = ChildProcess.spawn(command.command, command.args, {
					stdio: [
						inputToStdioOption(command.stdin),
						outputToStdioOption(command.stdout),
						outputToStdioOption(command.stderr)
					],
					cwd: getOrElse(command.cwd, constUndefined),
					shell: command.shell,
					env: command.extendEnv ? {
						...process.env,
						...Object.fromEntries(command.env)
					} : Object.fromEntries(command.env),
					detached: process.platform !== "win32"
				});
				handle.on("error", (err) => {
					resume(fail$2(toPlatformError("spawn", err, command)));
				});
				handle.on("exit", (...args) => {
					unsafeDone(exitCode, succeed$2(args));
				});
				handle.on("spawn", () => {
					resume(succeed$2([handle, exitCode]));
				});
				return sync$1(() => {
					handle.kill("SIGTERM");
				});
			}));
			const killProcessGroup = process.platform === "win32" ? (handle, _) => async((resume) => {
				ChildProcess.exec(`taskkill /pid ${handle.pid} /T /F`, (error) => {
					if (error) resume(fail$2(toPlatformError("kill", toError(error), command)));
					else resume(_void);
				});
			}) : (handle, signal) => try_({
				try: () => process.kill(-handle.pid, signal),
				catch: (error) => toPlatformError("kill", toError(error), command)
			});
			const killProcess = (handle, signal) => suspend$5(() => handle.kill(signal) ? _void : fail$2(toPlatformError("kill", new globalThis.Error("Failed to kill process"), command)));
			return pipe(match$9(command.cwd, {
				onNone: () => _void,
				onSome: (dir) => fileSystem.access(dir)
			}), zipRight$1(acquireRelease(spawn, ([handle, exitCode]) => flatMap$4(isDone(exitCode), (done) => {
				if (!done) return killProcessGroup(handle, "SIGTERM").pipe(orElse$3(() => killProcess(handle, "SIGTERM")), zipRight$1(_await(exitCode)), ignore);
				return flatMap$4(_await(exitCode), ([code]) => {
					if (code !== 0 && code !== null) return killProcessGroup(handle, "SIGTERM").pipe(ignore);
					return _void;
				});
			}))), map$2(([handle, exitCodeDeferred]) => {
				let stdin = drain;
				if (handle.stdin !== null) stdin = fromWritable(() => handle.stdin, (err) => toPlatformError("toWritable", toError(err), command));
				const exitCode = flatMap$4(_await(exitCodeDeferred), ([code, signal]) => {
					if (code !== null) return succeed$2(ExitCode(code));
					return fail$2(toPlatformError("exitCode", new globalThis.Error(`Process interrupted due to receipt of signal: ${signal}`), command));
				});
				const isRunning = negate(isDone(exitCodeDeferred));
				const kill = (signal = "SIGTERM") => killProcessGroup(handle, signal).pipe(orElse$3(() => killProcess(handle, signal)), zipRight$1(asVoid(_await(exitCodeDeferred))));
				const pid = ProcessId(handle.pid);
				const stderr = fromReadable(() => handle.stderr, (err) => toPlatformError("fromReadable(stderr)", toError(err), command));
				let stdout = fromReadable(() => handle.stdout, (err) => toPlatformError("fromReadable(stdout)", toError(err), command));
				if (typeof command.stdout !== "string") stdout = transduce(stdout, command.stdout);
				return Object.assign(Object.create(ProcessProto), {
					pid,
					exitCode,
					isRunning,
					kill,
					stdin,
					stderr,
					stdout
				});
			}), typeof command.stdin === "string" ? identity : tap((process) => forkDaemon(run(command.stdin, process.stdin))));
		}
		case "PipedCommand": {
			const flattened = flatten$1(command);
			if (flattened.length === 1) return pipe(flattened[0], runCommand(fileSystem));
			const head = flattened[0];
			const tail = flattened.slice(1);
			const initial = tail.slice(0, tail.length - 1);
			const last = tail[tail.length - 1];
			const stream = initial.reduce((stdin$2, command) => pipe(stdin(command, stdin$2), runCommand(fileSystem), map$2((process) => process.stdout), unwrapScoped$1), pipe(runCommand(fileSystem)(head), map$2((process) => process.stdout), unwrapScoped$1));
			return pipe(stdin(last, stream), runCommand(fileSystem));
		}
	}
};
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform-bun@0.91.2_@effect+cluster@0.60.2_@effect+platform@0.97.1_effect@3.22._b18ffd96f84aa74287d9f7a4f42aa04c/node_modules/@effect/platform-bun/dist/esm/BunCommandExecutor.js
/**
* @since 1.0.0
*/
/**
* @since 1.0.0
* @category layer
*/
const layer$11 = /* @__PURE__ */ effect$1(CommandExecutor, /*#__PURE__*/ pipe(FileSystem, /*#__PURE__*/ map$2((fileSystem) => makeExecutor(runCommand(fileSystem)))));
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform@0.97.1_effect@3.22.1/node_modules/@effect/platform/dist/esm/internal/effectify.js
/** @internal */
const effectify$1 = (fn, onError, onSyncError) => (...args) => async((resume) => {
	try {
		fn(...args, (err, result) => {
			if (err) resume(fail$2(onError ? onError(err, args) : err));
			else resume(succeed$2(result));
		});
	} catch (err) {
		resume(onSyncError ? fail$2(onSyncError(err, args)) : die$1(err));
	}
});
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform@0.97.1_effect@3.22.1/node_modules/@effect/platform/dist/esm/Effectify.js
/**
* @since 1.0.0
*/
const effectify = effectify$1;
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform-node-shared@0.61.1_@effect+cluster@0.60.2_@effect+platform@0.97.1_effe_d4ef128a009d382f95e6e1a2e11e2a47/node_modules/@effect/platform-node-shared/dist/esm/internal/fileSystem.js
const handleBadArgument = (method) => (cause) => new BadArgument({
	module: "FileSystem",
	method,
	cause
});
const access = /*#__PURE__*/ (() => {
	const nodeAccess = /*#__PURE__*/ effectify(NFS.access, /*#__PURE__*/ handleErrnoException("FileSystem", "access"), /*#__PURE__*/ handleBadArgument("access"));
	return (path, options) => {
		let mode = NFS.constants.F_OK;
		if (options?.readable) mode |= NFS.constants.R_OK;
		if (options?.writable) mode |= NFS.constants.W_OK;
		return nodeAccess(path, mode);
	};
})();
const copy = /*#__PURE__*/ (() => {
	const nodeCp = /*#__PURE__*/ effectify(NFS.cp, /*#__PURE__*/ handleErrnoException("FileSystem", "copy"), /*#__PURE__*/ handleBadArgument("copy"));
	return (fromPath, toPath, options) => nodeCp(fromPath, toPath, {
		force: options?.overwrite ?? false,
		preserveTimestamps: options?.preserveTimestamps ?? false,
		recursive: true
	});
})();
const copyFile = /*#__PURE__*/ (() => {
	const nodeCopyFile = /*#__PURE__*/ effectify(NFS.copyFile, /*#__PURE__*/ handleErrnoException("FileSystem", "copyFile"), /*#__PURE__*/ handleBadArgument("copyFile"));
	return (fromPath, toPath) => nodeCopyFile(fromPath, toPath);
})();
const chmod = /*#__PURE__*/ (() => {
	const nodeChmod = /*#__PURE__*/ effectify(NFS.chmod, /*#__PURE__*/ handleErrnoException("FileSystem", "chmod"), /*#__PURE__*/ handleBadArgument("chmod"));
	return (path, mode) => nodeChmod(path, mode);
})();
const chown = /*#__PURE__*/ (() => {
	const nodeChown = /*#__PURE__*/ effectify(NFS.chown, /*#__PURE__*/ handleErrnoException("FileSystem", "chown"), /*#__PURE__*/ handleBadArgument("chown"));
	return (path, uid, gid) => nodeChown(path, uid, gid);
})();
const link = /*#__PURE__*/ (() => {
	const nodeLink = /*#__PURE__*/ effectify(NFS.link, /*#__PURE__*/ handleErrnoException("FileSystem", "link"), /*#__PURE__*/ handleBadArgument("link"));
	return (existingPath, newPath) => nodeLink(existingPath, newPath);
})();
const makeDirectory = /*#__PURE__*/ (() => {
	const nodeMkdir = /*#__PURE__*/ effectify(NFS.mkdir, /*#__PURE__*/ handleErrnoException("FileSystem", "makeDirectory"), /*#__PURE__*/ handleBadArgument("makeDirectory"));
	return (path, options) => nodeMkdir(path, {
		recursive: options?.recursive ?? false,
		mode: options?.mode
	});
})();
const makeTempDirectoryFactory = (method) => {
	const nodeMkdtemp = effectify(NFS.mkdtemp, handleErrnoException("FileSystem", method), handleBadArgument(method));
	return (options) => suspend$5(() => {
		const prefix = options?.prefix ?? "";
		const directory = typeof options?.directory === "string" ? Path$2.join(options.directory, ".") : OS.tmpdir();
		return nodeMkdtemp(prefix ? Path$2.join(directory, prefix) : directory + "/");
	});
};
const makeTempDirectory = /*#__PURE__*/ makeTempDirectoryFactory("makeTempDirectory");
const removeFactory = (method) => {
	const nodeRm = effectify(NFS.rm, handleErrnoException("FileSystem", method), handleBadArgument(method));
	return (path, options) => nodeRm(path, {
		recursive: options?.recursive ?? false,
		force: options?.force ?? false
	});
};
const remove = /*#__PURE__*/ removeFactory("remove");
const makeTempDirectoryScoped = /*#__PURE__*/ (() => {
	const makeDirectory = /*#__PURE__*/ makeTempDirectoryFactory("makeTempDirectoryScoped");
	const removeDirectory = /*#__PURE__*/ removeFactory("makeTempDirectoryScoped");
	return (options) => acquireRelease(makeDirectory(options), (directory) => orDie(removeDirectory(directory, { recursive: true })));
})();
const openFactory = (method) => {
	const nodeOpen = effectify(NFS.open, handleErrnoException("FileSystem", method), handleBadArgument(method));
	const nodeClose = effectify(NFS.close, handleErrnoException("FileSystem", method), handleBadArgument(method));
	return (path, options) => pipe(acquireRelease(nodeOpen(path, options?.flag ?? "r", options?.mode), (fd) => orDie(nodeClose(fd))), map$2((fd) => makeFile(FileDescriptor(fd), options?.flag?.startsWith("a") ?? false)));
};
const open = /*#__PURE__*/ openFactory("open");
const makeFile = /*#__PURE__*/ (() => {
	const nodeReadFactory = (method) => effectify(NFS.read, handleErrnoException("FileSystem", method), handleBadArgument(method));
	const nodeRead = /*#__PURE__*/ nodeReadFactory("read");
	const nodeReadAlloc = /*#__PURE__*/ nodeReadFactory("readAlloc");
	const nodeStat = /*#__PURE__*/ effectify(NFS.fstat, /*#__PURE__*/ handleErrnoException("FileSystem", "stat"), /*#__PURE__*/ handleBadArgument("stat"));
	const nodeTruncate = /*#__PURE__*/ effectify(NFS.ftruncate, /*#__PURE__*/ handleErrnoException("FileSystem", "truncate"), /*#__PURE__*/ handleBadArgument("truncate"));
	const nodeSync = /*#__PURE__*/ effectify(NFS.fsync, /*#__PURE__*/ handleErrnoException("FileSystem", "sync"), /*#__PURE__*/ handleBadArgument("sync"));
	const nodeWriteFactory = (method) => effectify(NFS.write, handleErrnoException("FileSystem", method), handleBadArgument(method));
	const nodeWrite = /*#__PURE__*/ nodeWriteFactory("write");
	const nodeWriteAll = /*#__PURE__*/ nodeWriteFactory("writeAll");
	class FileImpl {
		fd;
		append;
		[FileTypeId];
		semaphore = /*#__PURE__*/ unsafeMakeSemaphore(1);
		position = 0n;
		constructor(fd, append) {
			this.fd = fd;
			this.append = append;
			this[FileTypeId] = FileTypeId;
		}
		get stat() {
			return map$2(nodeStat(this.fd), makeFileInfo);
		}
		get sync() {
			return nodeSync(this.fd);
		}
		seek(offset, from) {
			const offsetSize = Size(offset);
			return this.semaphore.withPermits(1)(sync$1(() => {
				if (from === "start") this.position = offsetSize;
				else if (from === "current") this.position = this.position + offsetSize;
				return this.position;
			}));
		}
		read(buffer) {
			return this.semaphore.withPermits(1)(map$2(suspend$5(() => nodeRead(this.fd, {
				buffer,
				position: this.position
			})), (bytesRead) => {
				const sizeRead = Size(bytesRead);
				this.position = this.position + sizeRead;
				return sizeRead;
			}));
		}
		readAlloc(size) {
			const sizeNumber = Number(size);
			return this.semaphore.withPermits(1)(flatMap$4(sync$1(() => Buffer.allocUnsafeSlow(sizeNumber)), (buffer) => map$2(nodeReadAlloc(this.fd, {
				buffer,
				position: this.position
			}), (bytesRead) => {
				if (bytesRead === 0) return none$4();
				this.position = this.position + BigInt(bytesRead);
				if (bytesRead === sizeNumber) return some(buffer);
				const dst = Buffer.allocUnsafeSlow(bytesRead);
				buffer.copy(dst, 0, 0, bytesRead);
				return some(dst);
			})));
		}
		truncate(length) {
			return this.semaphore.withPermits(1)(map$2(nodeTruncate(this.fd, length ? Number(length) : void 0), () => {
				if (!this.append) {
					const len = BigInt(length ?? 0);
					if (this.position > len) this.position = len;
				}
			}));
		}
		write(buffer) {
			return this.semaphore.withPermits(1)(map$2(suspend$5(() => nodeWrite(this.fd, buffer, void 0, void 0, this.append ? void 0 : Number(this.position))), (bytesWritten) => {
				const sizeWritten = Size(bytesWritten);
				if (!this.append) this.position = this.position + sizeWritten;
				return sizeWritten;
			}));
		}
		writeAllChunk(buffer) {
			return flatMap$4(suspend$5(() => nodeWriteAll(this.fd, buffer, void 0, void 0, this.append ? void 0 : Number(this.position))), (bytesWritten) => {
				if (bytesWritten === 0) return fail$2(new SystemError({
					module: "FileSystem",
					method: "writeAll",
					reason: "WriteZero",
					pathOrDescriptor: this.fd,
					description: "write returned 0 bytes written"
				}));
				if (!this.append) this.position = this.position + BigInt(bytesWritten);
				return bytesWritten < buffer.length ? this.writeAllChunk(buffer.subarray(bytesWritten)) : _void;
			});
		}
		writeAll(buffer) {
			return this.semaphore.withPermits(1)(this.writeAllChunk(buffer));
		}
	}
	return (fd, append) => new FileImpl(fd, append);
})();
const makeTempFileFactory = (method) => {
	const makeDirectory = makeTempDirectoryFactory(method);
	const open = openFactory(method);
	const randomHexString = (bytes) => sync$1(() => Crypto.randomBytes(bytes).toString("hex"));
	return (options) => pipe(zip$1(makeDirectory(options), randomHexString(6)), map$2(([directory, random]) => Path$2.join(directory, random + (options?.suffix ?? ""))), tap((path) => scoped$2(open(path, { flag: "w+" }))));
};
const makeTempFile = /*#__PURE__*/ makeTempFileFactory("makeTempFile");
const makeTempFileScoped = /*#__PURE__*/ (() => {
	const makeFile = /*#__PURE__*/ makeTempFileFactory("makeTempFileScoped");
	const removeDirectory = /*#__PURE__*/ removeFactory("makeTempFileScoped");
	return (options) => acquireRelease(makeFile(options), (file) => orDie(removeDirectory(Path$2.dirname(file), { recursive: true })));
})();
const readDirectory = (path, options) => tryPromise({
	try: () => NFS.promises.readdir(path, options),
	catch: (err) => handleErrnoException("FileSystem", "readDirectory")(err, [path])
});
const readFile = (path) => async((resume, signal) => {
	try {
		NFS.readFile(path, { signal }, (err, data) => {
			if (err) resume(fail$2(handleErrnoException("FileSystem", "readFile")(err, [path])));
			else resume(succeed$2(data));
		});
	} catch (err) {
		resume(fail$2(handleBadArgument("readFile")(err)));
	}
});
const readLink = /*#__PURE__*/ (() => {
	const nodeReadLink = /*#__PURE__*/ effectify(NFS.readlink, /*#__PURE__*/ handleErrnoException("FileSystem", "readLink"), /*#__PURE__*/ handleBadArgument("readLink"));
	return (path) => nodeReadLink(path);
})();
const realPath = /*#__PURE__*/ (() => {
	const nodeRealPath = /*#__PURE__*/ effectify(NFS.realpath, /*#__PURE__*/ handleErrnoException("FileSystem", "realPath"), /*#__PURE__*/ handleBadArgument("realPath"));
	return (path) => nodeRealPath(path);
})();
const rename = /*#__PURE__*/ (() => {
	const nodeRename = /*#__PURE__*/ effectify(NFS.rename, /*#__PURE__*/ handleErrnoException("FileSystem", "rename"), /*#__PURE__*/ handleBadArgument("rename"));
	return (oldPath, newPath) => nodeRename(oldPath, newPath);
})();
const makeFileInfo = (stat) => ({
	type: stat.isFile() ? "File" : stat.isDirectory() ? "Directory" : stat.isSymbolicLink() ? "SymbolicLink" : stat.isBlockDevice() ? "BlockDevice" : stat.isCharacterDevice() ? "CharacterDevice" : stat.isFIFO() ? "FIFO" : stat.isSocket() ? "Socket" : "Unknown",
	mtime: fromNullable(stat.mtime),
	atime: fromNullable(stat.atime),
	birthtime: fromNullable(stat.birthtime),
	dev: stat.dev,
	rdev: fromNullable(stat.rdev),
	ino: fromNullable(stat.ino),
	mode: stat.mode,
	nlink: fromNullable(stat.nlink),
	uid: fromNullable(stat.uid),
	gid: fromNullable(stat.gid),
	size: Size(stat.size),
	blksize: map$13(fromNullable(stat.blksize), Size),
	blocks: fromNullable(stat.blocks)
});
const stat = /*#__PURE__*/ (() => {
	const nodeStat = /*#__PURE__*/ effectify(NFS.stat, /*#__PURE__*/ handleErrnoException("FileSystem", "stat"), /*#__PURE__*/ handleBadArgument("stat"));
	return (path) => map$2(nodeStat(path), makeFileInfo);
})();
const symlink = /*#__PURE__*/ (() => {
	const nodeSymlink = /*#__PURE__*/ effectify(NFS.symlink, /*#__PURE__*/ handleErrnoException("FileSystem", "symlink"), /*#__PURE__*/ handleBadArgument("symlink"));
	return (target, path) => nodeSymlink(target, path);
})();
const truncate = /*#__PURE__*/ (() => {
	const nodeTruncate = /*#__PURE__*/ effectify(NFS.truncate, /*#__PURE__*/ handleErrnoException("FileSystem", "truncate"), /*#__PURE__*/ handleBadArgument("truncate"));
	return (path, length) => nodeTruncate(path, length !== void 0 ? Number(length) : void 0);
})();
const utimes = /*#__PURE__*/ (() => {
	const nodeUtimes = /*#__PURE__*/ effectify(NFS.utimes, /*#__PURE__*/ handleErrnoException("FileSystem", "utime"), /*#__PURE__*/ handleBadArgument("utime"));
	return (path, atime, mtime) => nodeUtimes(path, atime, mtime);
})();
const watchNode = (path, options) => asyncScoped((emit) => acquireRelease(sync$1(() => {
	const watcher = NFS.watch(path, { recursive: options?.recursive }, (event, path) => {
		if (!path) return;
		switch (event) {
			case "rename":
				emit.fromEffect(matchEffect(stat(path), {
					onSuccess: (_) => succeed$2(WatchEventCreate({ path })),
					onFailure: (err) => err._tag === "SystemError" && err.reason === "NotFound" ? succeed$2(WatchEventRemove({ path })) : fail$2(err)
				}));
				return;
			case "change":
				emit.single(WatchEventUpdate({ path }));
				return;
		}
	});
	watcher.on("error", (error) => {
		emit.fail(new SystemError({
			module: "FileSystem",
			reason: "Unknown",
			method: "watch",
			pathOrDescriptor: path,
			cause: error
		}));
	});
	watcher.on("close", () => {
		emit.end();
	});
	return watcher;
}), (watcher) => sync$1(() => watcher.close())));
const watch = (backend, path, options) => stat(path).pipe(map$2((stat) => backend.pipe(flatMap$9((_) => _.register(path, stat, options)), getOrElse(() => watchNode(path, options)))), unwrap);
const writeFile = (path, data, options) => async((resume, signal) => {
	try {
		NFS.writeFile(path, data, {
			signal,
			flag: options?.flag,
			mode: options?.mode
		}, (err) => {
			if (err) resume(fail$2(handleErrnoException("FileSystem", "writeFile")(err, [path])));
			else resume(_void);
		});
	} catch (err) {
		resume(fail$2(handleBadArgument("writeFile")(err)));
	}
});
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform-bun@0.91.2_@effect+cluster@0.60.2_@effect+platform@0.97.1_effect@3.22._b18ffd96f84aa74287d9f7a4f42aa04c/node_modules/@effect/platform-bun/dist/esm/BunFileSystem.js
/**
* @since 1.0.0
*/
/**
* @since 1.0.0
* @category layer
*/
const layer$8 = /* @__PURE__ */ effect$1(FileSystem, /* @__PURE__ */ map$2(/*#__PURE__*/ serviceOption(WatchBackend), (backend) => make$3({
	access,
	chmod,
	chown,
	copy,
	copyFile,
	link,
	makeDirectory,
	makeTempDirectory,
	makeTempDirectoryScoped,
	makeTempFile,
	makeTempFileScoped,
	open,
	readDirectory,
	readFile,
	readLink,
	realPath,
	remove,
	rename,
	stat,
	symlink,
	truncate,
	utimes,
	watch(path, options) {
		return watch(backend, path, options);
	},
	writeFile
})));
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform@0.97.1_effect@3.22.1/node_modules/@effect/platform/dist/esm/internal/path.js
/** @internal */
const TypeId$4 = /*#__PURE__*/ Symbol.for("@effect/platform/Path");
/** @internal */
const Path$1 = /*#__PURE__*/ GenericTag("@effect/platform/Path");
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform@0.97.1_effect@3.22.1/node_modules/@effect/platform/dist/esm/Path.js
/**
* @since 1.0.0
*/
/**
* @since 1.0.0
* @category type ids
*/
const TypeId$3 = TypeId$4;
/**
* @since 1.0.0
* @category tag
*/
const Path = Path$1;
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform-node-shared@0.61.1_@effect+cluster@0.60.2_@effect+platform@0.97.1_effe_d4ef128a009d382f95e6e1a2e11e2a47/node_modules/@effect/platform-node-shared/dist/esm/internal/path.js
const fromFileUrl = (url) => try_({
	try: () => NodeUrl.fileURLToPath(url),
	catch: (error) => new BadArgument({
		module: "Path",
		method: "fromFileUrl",
		description: `Invalid file URL: ${url}`,
		cause: error
	})
});
const toFileUrl = (path) => try_({
	try: () => NodeUrl.pathToFileURL(path),
	catch: (error) => new BadArgument({
		module: "Path",
		method: "toFileUrl",
		description: `Invalid path: ${path}`,
		cause: error
	})
});
({ ...Path$2.posix });
({ ...Path$2.win32 });
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform-bun@0.91.2_@effect+cluster@0.60.2_@effect+platform@0.97.1_effect@3.22._b18ffd96f84aa74287d9f7a4f42aa04c/node_modules/@effect/platform-bun/dist/esm/BunPath.js
/**
* @since 1.0.0
*/
/**
* @since 1.0.0
* @category layer
*/
const layer$5 = /* @__PURE__ */ succeed$3(Path, /*#__PURE__*/ Path.of({
	[TypeId$3]: TypeId$3,
	...Path$2,
	fromFileUrl,
	toFileUrl
}));
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform@0.97.1_effect@3.22.1/node_modules/@effect/platform/dist/esm/internal/terminal.js
/** @internal */
const tag$2 = /*#__PURE__*/ GenericTag("@effect/platform/Terminal");
TaggedError$1("QuitException");
/**
* @since 1.0.0
* @category tag
*/
const Terminal = tag$2;
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Mailbox.js
/**
* @since 3.8.0
* @experimental
* @category type ids
*/
const TypeId$2 = TypeId$9;
/**
* @since 3.8.0
* @experimental
* @category guards
*/
const isMailbox = (u) => hasProperty(u, TypeId$2);
/**
* A `Mailbox` is a queue that can be signaled to be done or failed.
*
* @since 3.8.0
* @experimental
* @category constructors
* @example
* ```ts
* import * as assert from "node:assert"
* import { Effect, Mailbox } from "effect"
*
* Effect.gen(function*() {
*   const mailbox = yield* Mailbox.make<number, string>()
*
*   // add messages to the mailbox
*   yield* mailbox.offer(1)
*   yield* mailbox.offer(2)
*   yield* mailbox.offerAll([3, 4, 5])
*
*   // take messages from the mailbox
*   const [messages, done] = yield* mailbox.takeAll
*   assert.deepStrictEqual(messages, [1, 2, 3, 4, 5])
*   assert.strictEqual(done, false)
*
*   // signal that the mailbox is done
*   yield* mailbox.end
*   const [messages2, done2] = yield* mailbox.takeAll
*   assert.deepStrictEqual(messages2, [])
*   assert.strictEqual(done2, true)
*
*   // signal that the mailbox has failed
*   yield* mailbox.fail("boom")
* })
* ```
*/
const make$2 = make$10;
/**
* Create a `Channel` from a `Mailbox`.
*
* @since 3.8.0
* @experimental
* @category conversions
*/
const toChannel = toChannel$2;
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform-node-shared@0.61.1_@effect+cluster@0.60.2_@effect+platform@0.97.1_effe_d4ef128a009d382f95e6e1a2e11e2a47/node_modules/@effect/platform-node-shared/dist/esm/internal/terminal.js
const defaultShouldQuit = (input) => input.key.ctrl && (input.key.name === "c" || input.key.name === "d");
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform-bun@0.91.2_@effect+cluster@0.60.2_@effect+platform@0.97.1_effect@3.22._b18ffd96f84aa74287d9f7a4f42aa04c/node_modules/@effect/platform-bun/dist/esm/BunTerminal.js
/**
* @since 1.0.0
*/
/**
* @since 1.0.0
* @category layer
*/
const layer$2 = /* @__PURE__ */ scoped$3(Terminal, /*#__PURE__*/ (/* @__PURE__ */ fnUntraced(function* (shouldQuit = defaultShouldQuit) {
	const stdin = process.stdin;
	const stdout = process.stdout;
	const rlRef = yield* make$11({ acquire: acquireRelease(sync$1(() => {
		const rl = readline.createInterface({
			input: stdin,
			escapeCodeTimeout: 50
		});
		readline.emitKeypressEvents(stdin, rl);
		if (stdin.isTTY) stdin.setRawMode(true);
		return rl;
	}), (rl) => sync$1(() => {
		if (stdin.isTTY) stdin.setRawMode(false);
		rl.close();
	})) });
	const columns = sync$1(() => stdout.columns ?? 0);
	const rows = sync$1(() => stdout.rows ?? 0);
	const isTTY = sync$1(() => Boolean(stdout.isTTY));
	const readInput = gen(function* () {
		yield* get(rlRef);
		const mailbox = yield* make$2();
		const handleKeypress = (s, k) => {
			const userInput = {
				input: fromNullable(s),
				key: {
					name: k.name ?? "",
					ctrl: !!k.ctrl,
					meta: !!k.meta,
					shift: !!k.shift
				}
			};
			mailbox.unsafeOffer(userInput);
			if (shouldQuit(userInput)) mailbox.unsafeDone(void_$2);
		};
		yield* addFinalizer(() => sync$1(() => stdin.off("keypress", handleKeypress)));
		stdin.on("keypress", handleKeypress);
		return mailbox;
	});
	const readLine = get(rlRef).pipe(flatMap$4((readlineInterface) => async((resume) => {
		const onLine = (line) => resume(succeed$2(line));
		readlineInterface.once("line", onLine);
		return sync$1(() => readlineInterface.off("line", onLine));
	})), scoped$2);
	const display = (prompt) => uninterruptible(async((resume) => {
		stdout.write(prompt, (err) => err ? resume(fail$2(new BadArgument({
			module: "Terminal",
			method: "display",
			description: "Failed to write prompt to stdout",
			cause: err
		}))) : resume(_void));
	}));
	return Terminal.of({
		columns,
		rows,
		isTTY,
		readInput,
		readLine,
		display
	});
}))(defaultShouldQuit));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/FiberSet.js
/**
* @since 2.0.0
*/
/**
* @since 2.0.0
* @categories type ids
*/
const TypeId$1 = /*#__PURE__*/ Symbol.for("effect/FiberSet");
/**
* @since 2.0.0
* @categories refinements
*/
const isFiberSet = (u) => hasProperty(u, TypeId$1);
const Proto = {
	[TypeId$1]: TypeId$1,
	[Symbol.iterator]() {
		if (this.state._tag === "Closed") return empty$24();
		return this.state.backing[Symbol.iterator]();
	},
	toString() {
		return format$4(this.toJSON());
	},
	toJSON() {
		return {
			_id: "FiberMap",
			state: this.state
		};
	},
	[NodeInspectSymbol]() {
		return this.toJSON();
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
const unsafeMake = (backing, deferred) => {
	const self = Object.create(Proto);
	self.state = {
		_tag: "Open",
		backing
	};
	self.deferred = deferred;
	return self;
};
/**
* A FiberSet can be used to store a collection of fibers.
* When the associated Scope is closed, all fibers in the set will be interrupted.
*
* You can add fibers to the set using `FiberSet.add` or `FiberSet.run`, and the fibers will
* be automatically removed from the FiberSet when they complete.
*
* @example
* ```ts
* import { Effect, FiberSet } from "effect"
*
* Effect.gen(function*() {
*   const set = yield* FiberSet.make()
*
*   // run some effects and add the fibers to the set
*   yield* FiberSet.run(set, Effect.never)
*   yield* FiberSet.run(set, Effect.never)
*
*   yield* Effect.sleep(1000)
* }).pipe(
*   Effect.scoped // The fibers will be interrupted when the scope is closed
* )
* ```
*
* @since 2.0.0
* @categories constructors
*/
const make = () => acquireRelease(map$2(make$16(), (deferred) => unsafeMake(/* @__PURE__ */ new Set(), deferred)), (set) => withFiberRuntime((parent) => {
	const state = set.state;
	if (state._tag === "Closed") return _void;
	set.state = { _tag: "Closed" };
	const fibers = state.backing;
	return interruptAllAs(fibers, combine$5(parent.id(), internalFiberId)).pipe(intoDeferred(set.deferred));
}));
const internalFiberIdId = -1;
const internalFiberId = /*#__PURE__*/ make$37(internalFiberIdId, 0);
const isInternalInterruption = /*#__PURE__*/ reduceWithContext(void 0, {
	emptyCase: constFalse,
	failCase: constFalse,
	dieCase: constFalse,
	interruptCase: (_, fiberId) => has$1(ids(fiberId), internalFiberIdId),
	sequentialCase: (_, left, right) => left || right,
	parallelCase: (_, left, right) => left || right
});
/**
* Add a fiber to the FiberSet. When the fiber completes, it will be removed.
*
* @since 2.0.0
* @categories combinators
*/
const unsafeAdd = /*#__PURE__*/ dual((args) => isFiberSet(args[0]), (self, fiber, options) => {
	if (self.state._tag === "Closed") {
		fiber.unsafeInterruptAsFork(combine$5(options?.interruptAs ?? none$2, internalFiberId));
		return;
	} else if (self.state.backing.has(fiber)) return;
	self.state.backing.add(fiber);
	fiber.addObserver((exit) => {
		if (self.state._tag === "Closed") return;
		self.state.backing.delete(fiber);
		if (isFailure(exit) && (options?.propagateInterruption === true ? !isInternalInterruption(exit.cause) : !isInterruptedOnly(exit.cause))) unsafeDone(self.deferred, exit);
	});
});
/**
* Join all fibers in the FiberSet. If any of the Fiber's in the set terminate with a failure,
* the returned Effect will terminate with the first failure that occurred.
*
* @since 2.0.0
* @categories combinators
* @example
* ```ts
* import { Effect, FiberSet } from "effect";
*
* Effect.gen(function* (_) {
*   const set = yield* _(FiberSet.make());
*   yield* _(FiberSet.add(set, Effect.runFork(Effect.fail("error"))));
*
*   // parent fiber will fail with "error"
*   yield* _(FiberSet.join(set));
* });
* ```
*/
const join = (self) => _await(self.deferred);
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform@0.97.1_effect@3.22.1/node_modules/@effect/platform/dist/esm/Transferable.js
/**
* @since 1.0.0
*/
/**
* @since 1.0.0
* @category tags
*/
var Collector = class extends Tag("@effect/platform/Transferable/Collector")() {};
/**
* @since 1.0.0
* @category constructors
*/
const unsafeMakeCollector = () => {
	let tranferables = [];
	const unsafeAddAll = (transfers) => {
		tranferables.push(...transfers);
	};
	const unsafeRead = () => tranferables;
	const unsafeClear = () => {
		const prev = tranferables;
		tranferables = [];
		return prev;
	};
	return Collector.of({
		unsafeAddAll,
		addAll: (transferables) => sync$1(() => unsafeAddAll(transferables)),
		unsafeRead,
		read: sync$1(unsafeRead),
		unsafeClear,
		clear: sync$1(unsafeClear)
	});
};
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform@0.97.1_effect@3.22.1/node_modules/@effect/platform/dist/esm/WorkerError.js
/**
* @since 1.0.0
* @category type ids
*/
const WorkerErrorTypeId = /* @__PURE__ */ Symbol.for("@effect/platform/WorkerError");
/**
* @since 1.0.0
* @category errors
*/
var WorkerError = class extends TaggedError()("WorkerError", {
	reason: /*#__PURE__*/ Literal("spawn", "decode", "send", "unknown", "encode"),
	cause: Defect
}) {
	/**
	* @since 1.0.0
	*/
	[WorkerErrorTypeId] = WorkerErrorTypeId;
	/**
	* @since 1.0.0
	*/
	static Cause = /*#__PURE__*/ Cause({
		error: this,
		defect: Defect
	});
	/**
	* @since 1.0.0
	*/
	static encodeCause = /*#__PURE__*/ encodeSync(this.Cause);
	/**
	* @since 1.0.0
	*/
	static decodeCause = /*#__PURE__*/ decodeSync(this.Cause);
	/**
	* @since 1.0.0
	*/
	get message() {
		switch (this.reason) {
			case "send": return "An error occurred calling .postMessage";
			case "spawn": return "An error occurred while spawning a worker";
			case "decode": return "An error occurred during decoding";
			case "encode": return "An error occurred during encoding";
			case "unknown": return "An unexpected error occurred";
		}
	}
};
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform@0.97.1_effect@3.22.1/node_modules/@effect/platform/dist/esm/internal/worker.js
/** @internal */
const PlatformWorkerTypeId = /*#__PURE__*/ Symbol.for("@effect/platform/Worker/PlatformWorker");
/** @internal */
const PlatformWorker$1 = /*#__PURE__*/ GenericTag("@effect/platform/Worker/PlatformWorker");
/** @internal */
const WorkerManagerTypeId = /*#__PURE__*/ Symbol.for("@effect/platform/Worker/WorkerManager");
/** @internal */
const WorkerManager = /*#__PURE__*/ GenericTag("@effect/platform/Worker/WorkerManager");
/** @internal */
const Spawner = /*#__PURE__*/ GenericTag("@effect/platform/Worker/Spawner");
/** @internal */
const layerManager$3 = /*#__PURE__*/ effect$1(WorkerManager, /* @__PURE__ */ gen(function* () {
	const platform = yield* PlatformWorker$1;
	let idCounter = 0;
	return WorkerManager.of({
		[WorkerManagerTypeId]: WorkerManagerTypeId,
		spawn({ encode, initialMessage }) {
			return gen(function* () {
				const id = idCounter++;
				let requestIdCounter = 0;
				const requestMap = /* @__PURE__ */ new Map();
				const collector = unsafeMakeCollector();
				const wrappedEncode = encode ? (message) => zipRight$1(collector.clear, provideService(encode(message), Collector, collector)) : succeed$2;
				const readyLatch = yield* make$16();
				const backing = yield* platform.spawn(id);
				yield* backing.run((message) => {
					if (message[0] === 0) return complete(readyLatch, _void);
					return handleMessage(message[1]);
				}).pipe(onError((cause) => forEach$2(requestMap.values(), (mailbox) => DeferredTypeId in mailbox ? failCause$3(mailbox, cause) : mailbox.failCause(cause))), tapErrorCause(logWarning), retry(spaced(1e3)), annotateLogs({
					package: "@effect/platform",
					module: "Worker"
				}), interruptible, forkScoped);
				yield* addFinalizer(() => zipRight$1(forEach$2(requestMap.values(), (mailbox) => DeferredTypeId in mailbox ? interrupt$1(mailbox) : mailbox.end, { discard: true }), sync$1(() => requestMap.clear())));
				const handleMessage = (response) => suspend$5(() => {
					const mailbox = requestMap.get(response[0]);
					if (!mailbox) return _void;
					switch (response[1]) {
						case 0: return DeferredTypeId in mailbox ? succeed$4(mailbox, response[2][0]) : mailbox.offerAll(response[2]);
						case 1:
							if (response.length === 2) return DeferredTypeId in mailbox ? interrupt$1(mailbox) : mailbox.end;
							return DeferredTypeId in mailbox ? succeed$4(mailbox, response[2][0]) : zipRight$1(mailbox.offerAll(response[2]), mailbox.end);
						case 2:
						case 3: {
							if (response[1] === 2) return DeferredTypeId in mailbox ? fail$3(mailbox, response[2]) : mailbox.fail(response[2]);
							const cause = WorkerError.decodeCause(response[2]);
							return DeferredTypeId in mailbox ? failCause$3(mailbox, cause) : mailbox.failCause(cause);
						}
					}
				});
				const executeAcquire = (request, makeMailbox) => withFiberRuntime((fiber) => {
					const context = fiber.getFiberRef(currentContext);
					const span = getOption(context, ParentSpan).pipe(filter$3((span) => span._tag === "Span"));
					const id = requestIdCounter++;
					return makeMailbox.pipe(tap((mailbox) => {
						requestMap.set(id, mailbox);
						return wrappedEncode(request).pipe(tap((payload) => backing.send([
							id,
							0,
							payload,
							span._tag === "Some" ? [
								span.value.traceId,
								span.value.spanId,
								span.value.sampled
							] : void 0
						], collector.unsafeRead())), catchAllCause((cause) => isMailbox(mailbox) ? mailbox.failCause(cause) : failCause$3(mailbox, cause)));
					}), map$2((mailbox) => ({
						id,
						mailbox
					})));
				});
				const executeRelease = ({ id }, exit) => {
					const release = sync$1(() => requestMap.delete(id));
					return isFailure(exit) ? zipRight$1(orDie(backing.send([id, 1])), release) : release;
				};
				const execute = (request) => fromChannel$1(acquireUseRelease(executeAcquire(request, make$2()), ({ mailbox }) => toChannel(mailbox), executeRelease));
				const executeEffect = (request) => acquireUseRelease$2(executeAcquire(request, make$16()), ({ mailbox }) => _await(mailbox), executeRelease);
				yield* _await(readyLatch);
				if (initialMessage) yield* sync$1(initialMessage).pipe(flatMap$4(executeEffect), mapError$1((cause) => new WorkerError({
					reason: "spawn",
					cause
				})));
				return {
					id,
					execute,
					executeEffect
				};
			});
		}
	});
}));
/** @internal */
const makePlatform$1 = () => (options) => PlatformWorker$1.of({
	[PlatformWorkerTypeId]: PlatformWorkerTypeId,
	spawn(id) {
		return gen(function* () {
			const spawn = yield* Spawner;
			let currentPort;
			const buffer = [];
			const run = (handler) => uninterruptibleMask((restore) => gen(function* () {
				const scope$2 = yield* scope;
				const port = yield* options.setup({
					worker: spawn(id),
					scope: scope$2
				});
				currentPort = port;
				yield* addFinalizer$1(scope$2, sync$1(() => {
					currentPort = void 0;
				}));
				const runtime$4 = (yield* runtime()).pipe(updateContext(omit$1(Scope)));
				const fiberSet = yield* make();
				const runFork$3 = runFork(runtime$4);
				yield* options.listen({
					port,
					scope: scope$2,
					emit(data) {
						unsafeAdd(fiberSet, runFork$3(handler(data)));
					},
					deferred: fiberSet.deferred
				});
				if (buffer.length > 0) {
					for (const [message, transfers] of buffer) port.postMessage([0, message], transfers);
					buffer.length = 0;
				}
				return yield* restore(join(fiberSet));
			}).pipe(scoped$2));
			const send = (message, transfers) => try_({
				try: () => {
					if (currentPort === void 0) buffer.push([message, transfers]);
					else currentPort.postMessage([0, message], transfers);
				},
				catch: (cause) => new WorkerError({
					reason: "send",
					cause
				})
			});
			return {
				run,
				send
			};
		});
	}
});
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform-bun@0.91.2_@effect+cluster@0.60.2_@effect+platform@0.97.1_effect@3.22._b18ffd96f84aa74287d9f7a4f42aa04c/node_modules/@effect/platform-bun/dist/esm/BunContext.js
/**
* @since 1.0.0
* @category layer
*/
const layer$1 = /*#__PURE__*/ pipe(/*#__PURE__*/ mergeAll$1(layer$5, layer$11, layer$2, /* @__PURE__ */ provide$1(layerManager$3, /* @__PURE__ */ succeed$3(PlatformWorker$1, /* @__PURE__ */ makePlatform$1()({
	setup({ scope, worker }) {
		return flatMap$4(make$16(), (closeDeferred) => {
			worker.addEventListener("close", () => {
				unsafeDone(closeDeferred, void_$2);
			});
			return as$1(addFinalizer$1(scope, suspend$5(() => {
				worker.postMessage([1]);
				return _await(closeDeferred);
			}).pipe(interruptible, timeout(5e3), catchAllCause(() => sync$1(() => worker.terminate())))), worker);
		});
	},
	listen({ deferred, emit, port, scope }) {
		function onMessage(event) {
			emit(event.data);
		}
		function onError(event) {
			unsafeDone(deferred, new WorkerError({
				reason: "unknown",
				cause: event.error ?? event.message
			}));
		}
		port.addEventListener("message", onMessage);
		port.addEventListener("error", onError);
		return addFinalizer$1(scope, sync$1(() => {
			port.removeEventListener("message", onMessage);
			port.removeEventListener("error", onError);
		}));
	}
})))), /*#__PURE__*/ provideMerge(layer$8));
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Logger.js
/**
* @since 2.0.0
* @category constructors
*/
const defaultLogger = defaultLogger$1;
/**
* A default version of the pretty logger.
*
* @since 3.8.0
* @category constructors
*/
const prettyLoggerDefault = prettyLoggerDefault$1;
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform@0.97.1_effect@3.22.1/node_modules/@effect/platform/dist/esm/Runtime.js
/**
* @since 1.0.0
*/
/**
* @category teardown
* @since 1.0.0
*/
const defaultTeardown = (exit, onExit) => {
	onExit(isFailure(exit) && !isInterruptedOnly(exit.cause) ? 1 : 0);
};
const addPrettyLogger = (refs, fiberId) => {
	const loggers = getOrDefault(refs, currentLoggers);
	if (!has$1(loggers, defaultLogger)) return refs;
	return updateAs(refs, {
		fiberId,
		fiberRef: currentLoggers,
		value: loggers.pipe(remove$2(defaultLogger), add(prettyLoggerDefault))
	});
};
/**
* @category constructors
* @since 1.0.0
*/
const makeRunMain = (f) => dual((args) => isEffect(args[0]), (effect, options) => {
	return f({
		fiber: options?.disableErrorReporting === true ? runFork$1(effect, { updateRefs: options?.disablePrettyLogger === true ? void 0 : addPrettyLogger }) : runFork$1(tapErrorCause(effect, (cause) => {
			if (isInterruptedOnly(cause)) return _void;
			return logError(cause);
		}), { updateRefs: options?.disablePrettyLogger === true ? void 0 : addPrettyLogger }),
		teardown: options?.teardown ?? defaultTeardown
	});
});
//#endregion
//#region ../../node_modules/.pnpm/@effect+platform-bun@0.91.2_@effect+cluster@0.60.2_@effect+platform@0.97.1_effect@3.22._b18ffd96f84aa74287d9f7a4f42aa04c/node_modules/@effect/platform-bun/dist/esm/BunRuntime.js
/**
* @since 1.0.0
*/
/**
* @since 1.0.0
* @category runtime
*/
const runMain = /* @__PURE__ */ makeRunMain(({ fiber, teardown }) => {
	const keepAlive = setInterval(constVoid, 2 ** 31 - 1);
	let receivedSignal = false;
	fiber.addObserver((exit) => {
		if (!receivedSignal) {
			process.removeListener("SIGINT", onSigint);
			process.removeListener("SIGTERM", onSigint);
		}
		clearInterval(keepAlive);
		teardown(exit, (code) => {
			if (receivedSignal || code !== 0) process.exit(code);
		});
	});
	function onSigint() {
		receivedSignal = true;
		process.removeListener("SIGINT", onSigint);
		process.removeListener("SIGTERM", onSigint);
		fiber.unsafeInterruptAsFork(fiber.id());
	}
	process.on("SIGINT", onSigint);
	process.on("SIGTERM", onSigint);
});
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Console.js
/**
* @since 2.0.0
* @category accessor
*/
const error = error$1;
//#endregion
//#region src/edit-command.schema.ts
const ToolName = NonEmptyString.pipe(brand("ToolName"));
const FilePath = NonEmptyString.pipe(brand("FilePath"));
const ToolInput = Record({
	key: String$,
	value: Unknown
});
const EditToolName = Literal("Write", "Edit", "Update", "MultiEdit", "Create", "morph_mcp_edit-file", "morph_edit");
const OxlintConfigBasename = Literal("oxlint.config.ts", "oxlint.config.js", "oxlint.config.mjs", "oxlint.config.cjs", ".oxlintrc.json", "oxlint.json");
const LintableExtension = Literal("ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs");
var EditCommand = class extends TaggedClass()("EditCommand", {
	toolName: ToolName,
	filePath: FilePath,
	toolInput: ToolInput
}) {};
const ValueMatcherProto = {
	[/* @__PURE__ */ Symbol.for("@effect/matcher/Matcher")]: {
		_input: identity,
		_filters: identity,
		_remaining: identity,
		_result: identity,
		_provided: identity,
		_return: identity
	},
	_tag: "ValueMatcher",
	add(_case) {
		if (this.value._tag === "Right") return this;
		if (_case._tag === "When" && _case.guard(this.provided) === true) return makeValueMatcher(this.provided, right(_case.evaluate(this.provided)));
		else if (_case._tag === "Not" && _case.guard(this.provided) === false) return makeValueMatcher(this.provided, right(_case.evaluate(this.provided)));
		return this;
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
function makeValueMatcher(provided, value) {
	const matcher = Object.create(ValueMatcherProto);
	matcher.provided = provided;
	matcher.value = value;
	return matcher;
}
const makeWhen = (guard, evaluate) => ({
	_tag: "When",
	guard,
	evaluate
});
const makePredicate = (pattern) => {
	if (typeof pattern === "function") return pattern;
	else if (Array.isArray(pattern)) {
		const predicates = pattern.map(makePredicate);
		const len = predicates.length;
		return (u) => {
			if (!Array.isArray(u)) return false;
			for (let i = 0; i < len; i++) if (predicates[i](u[i]) === false) return false;
			return true;
		};
	} else if (pattern !== null && typeof pattern === "object") {
		const keysAndPredicates = Object.entries(pattern).map(([k, p]) => [k, makePredicate(p)]);
		const len = keysAndPredicates.length;
		return (u) => {
			if (typeof u !== "object" || u === null) return false;
			for (let i = 0; i < len; i++) {
				const [key, predicate] = keysAndPredicates[i];
				if (!(key in u) || predicate(u[key]) === false) return false;
			}
			return true;
		};
	}
	return (u) => u === pattern;
};
/** @internal */
const value$1 = (i) => makeValueMatcher(i, left(i));
/** @internal */
const when$1 = (pattern, f) => (self) => self.add(makeWhen(makePredicate(pattern), f));
/** @internal */
const discriminator = (field) => (...pattern) => {
	const f = pattern[pattern.length - 1];
	const values = pattern.slice(0, -1);
	const pred = values.length === 1 ? (_) => _ != null && _[field] === values[0] : (_) => _ != null && values.includes(_[field]);
	return (self) => self.add(makeWhen(pred, f));
};
/** @internal */
const tag$1 = /*#__PURE__*/ discriminator("_tag");
/** @internal */
const orElse$1 = (f) => (self) => {
	const result = either(self);
	if (isEither$1(result)) return result._tag === "Right" ? result.right : f(result.left);
	return (input) => {
		const a = result(input);
		return a._tag === "Right" ? a.right : f(a.left);
	};
};
/** @internal */
const either = (self) => {
	if (self._tag === "ValueMatcher") return self.value;
	const len = self.cases.length;
	if (len === 1) {
		const _case = self.cases[0];
		return (input) => {
			if (_case._tag === "When" && _case.guard(input) === true) return right(_case.evaluate(input));
			else if (_case._tag === "Not" && _case.guard(input) === false) return right(_case.evaluate(input));
			return left(input);
		};
	}
	return (input) => {
		for (let i = 0; i < len; i++) {
			const _case = self.cases[i];
			if (_case._tag === "When" && _case.guard(input) === true) return right(_case.evaluate(input));
			else if (_case._tag === "Not" && _case.guard(input) === false) return right(_case.evaluate(input));
		}
		return left(input);
	};
};
const getExhaustiveAbsurdErrorMessage = "effect/Match/exhaustive: absurd";
/** @internal */
const exhaustive$1 = (self) => {
	const toEither = either(self);
	if (isEither$1(toEither)) {
		if (toEither._tag === "Right") return toEither.right;
		throw new Error(getExhaustiveAbsurdErrorMessage);
	}
	return (u) => {
		const result = toEither(u);
		if (result._tag === "Right") return result.right;
		throw new Error(getExhaustiveAbsurdErrorMessage);
	};
};
//#endregion
//#region ../../node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/esm/Match.js
/**
* Creates a matcher from a specific value.
*
* **Details**
*
* This function allows you to define a `Matcher` directly from a given value,
* rather than from a type. This is useful when working with known values,
* enabling structured pattern matching on objects, primitives, or any data
* structure.
*
* Once the matcher is created, you can use pattern-matching functions like
* {@link when} to define how different cases should be handled.
*
* **Example** (Matching an Object by Property)
*
* ```ts
* import { Match } from "effect"
*
* const input = { name: "John", age: 30 }
*
* // Create a matcher for the specific object
* const result = Match.value(input).pipe(
*   // Match when the 'name' property is "John"
*   Match.when(
*     { name: "John" },
*     (user) => `${user.name} is ${user.age} years old`
*   ),
*   // Provide a fallback if no match is found
*   Match.orElse(() => "Oh, not John")
* )
*
* console.log(result)
* // Output: "John is 30 years old"
* ```
*
* @see {@link type} for creating a matcher from a specific type.
*
* @category Creating a matcher
* @since 1.0.0
*/
const value = value$1;
/**
* Defines a condition for matching values.
*
* **Details**
*
* This function enables pattern matching by checking whether a given value
* satisfies a condition. It supports both direct value comparisons and
* predicate functions. If the condition is met, the associated function is
* executed.
*
* This function is useful when defining matchers that need to check for
* specific values or apply logical conditions to determine a match. It works
* well with structured objects and primitive types.
*
* **Example** (Matching with Values and Predicates)
*
* ```ts
* import { Match } from "effect"
*
* // Create a matcher for objects with an "age" property
* const match = Match.type<{ age: number }>().pipe(
*   // Match when age is greater than 18
*   Match.when({ age: (age) => age > 18 }, (user) => `Age: ${user.age}`),
*   // Match when age is exactly 18
*   Match.when({ age: 18 }, () => "You can vote"),
*   // Fallback case for all other ages
*   Match.orElse((user) => `${user.age} is too young`)
* )
*
* console.log(match({ age: 20 }))
* // Output: "Age: 20"
*
* console.log(match({ age: 18 }))
* // Output: "You can vote"
*
* console.log(match({ age: 4 }))
* // Output: "4 is too young"
* ```
*
* @see {@link whenOr} Use this when multiple patterns should match in a single
* condition.
* @see {@link whenAnd} Use this when a value must match all provided patterns.
* @see {@link orElse} Provides a fallback when no patterns match.
*
* @category Defining patterns
* @since 1.0.0
*/
const when = when$1;
/**
* The `Match.tag` function allows pattern matching based on the `_tag` field in
* a [Discriminated Union](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes-func.html#discriminated-unions).
* You can specify multiple tags to match within a single pattern.
*
* **Note**
*
* The `Match.tag` function relies on the convention within the Effect ecosystem
* of naming the tag field as `"_tag"`. Ensure that your discriminated unions
* follow this naming convention for proper functionality.
*
* **Example** (Matching a Discriminated Union by Tag)
*
* ```ts
* import { Match } from "effect"
*
* type Event =
*   | { readonly _tag: "fetch" }
*   | { readonly _tag: "success"; readonly data: string }
*   | { readonly _tag: "error"; readonly error: Error }
*   | { readonly _tag: "cancel" }
*
* // Create a Matcher for Either<number, string>
* const match = Match.type<Event>().pipe(
*   // Match either "fetch" or "success"
*   Match.tag("fetch", "success", () => `Ok!`),
*   // Match "error" and extract the error message
*   Match.tag("error", (event) => `Error: ${event.error.message}`),
*   // Match "cancel"
*   Match.tag("cancel", () => "Cancelled"),
*   Match.exhaustive
* )
*
* console.log(match({ _tag: "success", data: "Hello" }))
* // Output: "Ok!"
*
* console.log(match({ _tag: "error", error: new Error("Oops!") }))
* // Output: "Error: Oops!"
* ```
*
* @category Defining patterns
* @since 1.0.0
*/
const tag = tag$1;
/**
* Provides a fallback value when no patterns match.
*
* **Details**
*
* This function ensures that a matcher always returns a valid result, even if
* no defined patterns match. It acts as a default case, similar to the
* `default` clause in a `switch` statement or the final `else` in an `if-else`
* chain.
*
* **Example** (Providing a Default Value When No Patterns Match)
*
* ```ts
* import { Match } from "effect"
*
* // Create a matcher for string or number values
* const match = Match.type<string | number>().pipe(
*   // Match when the value is "a"
*   Match.when("a", () => "ok"),
*   // Fallback when no patterns match
*   Match.orElse(() => "fallback")
* )
*
* console.log(match("a"))
* // Output: "ok"
*
* console.log(match("b"))
* // Output: "fallback"
* ```
*
* @category Completion
* @since 1.0.0
*/
const orElse = orElse$1;
/**
* The `Match.exhaustive` method finalizes the pattern matching process by
* ensuring that all possible cases are accounted for. If any case is missing,
* TypeScript will produce a type error. This is particularly useful when
* working with unions, as it helps prevent unintended gaps in pattern matching.
*
* **Example** (Ensuring All Cases Are Covered)
*
* ```ts
* import { Match } from "effect"
*
* // Create a matcher for string or number values
* const match = Match.type<string | number>().pipe(
*   // Match when the value is a number
*   Match.when(Match.number, (n) => `number: ${n}`),
*   // Mark the match as exhaustive, ensuring all cases are handled
*   // TypeScript will throw an error if any case is missing
*   // @ts-expect-error Type 'string' is not assignable to type 'never'
*   Match.exhaustive
* )
* ```
*
* @category Completion
* @since 1.0.0
*/
const exhaustive = exhaustive$1;
//#endregion
//#region src/hook-payload.shape.ts
const HookPayload = Struct({
	tool_name: NonEmptyString,
	tool_input: optional(Record({
		key: String$,
		value: Unknown
	}))
});
//#endregion
//#region src/hook-payload.acl.ts
const editedPath = (toolInput) => {
	const value = toolInput?.["file_path"];
	return typeof value === "string" && value.length > 0 ? value : void 0;
};
const HookPayloadToEditCommand = transformOrFail(HookPayload, EditCommand, {
	strict: true,
	decode: (payload, _options, ast) => {
		const filePath = editedPath(payload.tool_input);
		return is(EditToolName)(payload.tool_name) && filePath !== void 0 ? succeed({
			_tag: "EditCommand",
			toolName: payload.tool_name,
			filePath,
			toolInput: payload.tool_input ?? {}
		}) : fail(new Type(ast, payload, "not an edit tool call carrying a non-empty tool_input.file_path"));
	},
	encode: (command, _options, ast) => fail(new Forbidden(ast, command, "EditCommand is never encoded to a hook payload"))
});
//#endregion
//#region src/lint-guard/lint-outcome.workflow.ts
const NO_FILES_FOUND = /No files found to lint/i;
const PATH_OUTSIDE_ROOT = /path is expected to be under the root/i;
const TSGOLINT_MISSING = /tsgolint|oxlint-tsgolint/i;
const combinedOutput = (result) => result.stdout + "\n" + result.stderr;
const stderrOrStdout$1 = (result) => result.stderr !== "" ? result.stderr : result.stdout;
const LintOutcomeTypeId = Symbol.for("@systemfsoftware/oxlint-guard/LintOutcome");
var Clean = class extends TaggedClass()("Clean", {}) {
	[LintOutcomeTypeId] = LintOutcomeTypeId;
};
var BenignNoFiles = class extends TaggedClass()("BenignNoFiles", {}) {
	[LintOutcomeTypeId] = LintOutcomeTypeId;
};
var IgnoredPath = class extends TaggedClass()("IgnoredPath", {}) {
	[LintOutcomeTypeId] = LintOutcomeTypeId;
};
var RetryWithoutTypeAware = class extends TaggedClass()("RetryWithoutTypeAware", {}) {
	[LintOutcomeTypeId] = LintOutcomeTypeId;
};
Union(Clean, BenignNoFiles, IgnoredPath, RetryWithoutTypeAware);
const LintViolationTypeId = Symbol.for("@systemfsoftware/oxlint-guard/LintViolation");
var LintViolation = class extends TaggedError()("LintViolation", { output: String$ }) {
	[LintViolationTypeId] = LintViolationTypeId;
};
const classifyLintResult = Workflow.make((command) => value(command).pipe(when({ result: { exitCode: 0 } }, () => right(new Clean())), when((command) => NO_FILES_FOUND.test(combinedOutput(command.result)), () => right(new BenignNoFiles())), when((command) => PATH_OUTSIDE_ROOT.test(combinedOutput(command.result)), () => right(new IgnoredPath())), when((command) => command.canRetry && TSGOLINT_MISSING.test(combinedOutput(command.result)), () => right(new RetryWithoutTypeAware())), orElse((command) => left(new LintViolation({ output: stderrOrStdout$1(command.result) })))));
//#endregion
//#region src/lint-guard/lint-plan.workflow.ts
const LOCKFILE_INSTALL_COMMANDS = /* @__PURE__ */ new Map([
	["pnpm-lock.yaml", "pnpm add -D oxlint"],
	["package-lock.json", "npm install -D oxlint"],
	["yarn.lock", "yarn add -D oxlint"],
	["bun.lockb", "bun add -d oxlint"],
	["bun.lock", "bun add -d oxlint"]
]);
const NO_LOCKFILE_HINT = "install oxlint as a dev dependency of this project";
const installHintFor = (lockfile) => match$9(lockfile, {
	onNone: () => NO_LOCKFILE_HINT,
	onSome: (name) => LOCKFILE_INSTALL_COMMANDS.get(name) ?? NO_LOCKFILE_HINT
});
const LintPlanTypeId = Symbol.for("@systemfsoftware/oxlint-guard/LintPlan");
var Skip = class extends TaggedClass()("Skip", { reason: String$ }) {
	[LintPlanTypeId] = LintPlanTypeId;
};
var RunDeno = class extends TaggedClass()("RunDeno", { filePath: String$ }) {
	[LintPlanTypeId] = LintPlanTypeId;
};
var RunOxlint = class extends TaggedClass()("RunOxlint", {
	filePath: String$,
	configPath: String$,
	oxlintBinary: String$
}) {
	[LintPlanTypeId] = LintPlanTypeId;
};
Union(Skip, RunDeno, RunOxlint);
const LintFailureTypeId = Symbol.for("@systemfsoftware/oxlint-guard/LintFailure");
var NoOxlintConfig = class extends TaggedError()("NoOxlintConfig", { installHint: String$ }) {
	[LintFailureTypeId] = LintFailureTypeId;
};
var NoOxlintBinary = class extends TaggedError()("NoOxlintBinary", { installHint: String$ }) {
	[LintFailureTypeId] = LintFailureTypeId;
};
Union(NoOxlintConfig, NoOxlintBinary);
const isLintableExtension = (extension) => is(LintableExtension)(extension.toLowerCase());
const isDenoShebang = (firstLine) => exists(firstLine, (line) => /^#!.*\bdeno\b/.test(line));
const decideLintPlan = Workflow.make((facts) => value(facts).pipe(when({ exists: false }, () => right(new Skip({ reason: "file-missing" }))), when((facts) => !isLintableExtension(facts.extension), () => right(new Skip({ reason: "not-lintable-extension" }))), when((facts) => isDenoShebang(facts.firstLine), (facts) => right(new RunDeno({ filePath: facts.resolvedPath }))), when((facts) => isSome(facts.configPath) && isSome(facts.oxlintBinary), (facts) => right(new RunOxlint({
	filePath: facts.resolvedPath,
	configPath: facts.configPath.value,
	oxlintBinary: facts.oxlintBinary.value
}))), when((facts) => isNone(facts.configPath), (facts) => left(new NoOxlintConfig({ installHint: installHintFor(facts.lockfile) }))), orElse((facts) => left(new NoOxlintBinary({ installHint: installHintFor(facts.lockfile) })))));
//#endregion
//#region src/lint-guard/lint-guard.executor.ts
var SpawnFailure = class extends TaggedError()("SpawnFailure", {
	program: String$,
	reason: Literal("not-found", "not-executable", "unknown"),
	message: String$
}) {};
var OxlintBinaryNotExecutable = class extends TaggedError()("OxlintBinaryNotExecutable", { path: String$ }) {};
const LintGuardAdapter = GenericTag("@oxlint-guard/LintGuardAdapter");
const LINT_COMMAND_TIMEOUT = seconds(30);
const TRUNCATION_MARKER = "\n[output truncated at 65536 bytes; run the linter directly for full output]";
const ACCEPTED_CONFIG_NAMES = "oxlint.config.ts, oxlint.config.js, oxlint.config.mjs, oxlint.config.cjs, .oxlintrc.json, or oxlint.json";
const describeLintFailure = (failure) => value(failure).pipe(tag("NoOxlintConfig", (failure) => `oxlint-guard: no oxlint config found in any directory up from the edited file.
Add one of ${ACCEPTED_CONFIG_NAMES} at the project root, and install oxlint locally: ${failure.installHint}`), tag("NoOxlintBinary", (failure) => `oxlint-guard: no local oxlint binary (node_modules/.bin/oxlint) found in any directory up from the edited file.
Install oxlint locally: ${failure.installHint}\nMake sure an oxlint config (${ACCEPTED_CONFIG_NAMES}) exists at the project root.`), exhaustive);
const FIX_ROOT_CAUSE = ["Fix the root cause of each violation — do not suppress the rule with an eslint-disable comment,", "and do not weaken the oxlint config to make the check pass."].join("\n");
const TYPE_AWARE_UNAVAILABLE = ["the type-aware backend (oxlint-tsgolint) was unavailable, so these findings come from", "the lint pass without type information."].join("\n");
const describeLintViolation = (violation, options) => `oxlint-guard: lint violations found.\n${options.typeAware ? "" : TYPE_AWARE_UNAVAILABLE + "\n"}${FIX_ROOT_CAUSE}\n\n${violation.output}`;
const stderrOrStdout = (result) => result.stderr !== "" ? result.stderr : result.stdout;
const allow = () => ({
	exitCode: 0,
	stderr: ""
});
const block = (stderr) => ({
	exitCode: 2,
	stderr
});
const ALLOWLISTED_ENV_VARS = [
	"PATH",
	"HOME",
	"TMPDIR",
	"TEMP",
	"TMP",
	"USERPROFILE",
	"HOMEDRIVE",
	"HOMEPATH",
	"SystemRoot",
	"COMSPEC",
	"PATHEXT"
];
const minimalEnv = () => {
	const env = {};
	for (const key of ALLOWLISTED_ENV_VARS) {
		const value = process.env[key];
		if (value !== void 0) env[key] = value;
	}
	return env;
};
const describeBrokenBinary = (failure) => `oxlint-guard: oxlint binary found at ${failure.path} but is not executable.\nRemove it (or fix its permissions) and install oxlint locally.`;
const describeOxlintSpawnFailure = (binaryPath, failure) => {
	if (failure.reason === "not-executable") return `oxlint-guard: oxlint binary found at ${binaryPath} but is not executable: ${failure.message}`;
	if (failure.reason === "not-found") return `oxlint-guard: oxlint binary at ${binaryPath} could not be launched (missing or broken): ${failure.message}`;
	return `oxlint-guard: failed to run the oxlint binary at ${binaryPath}: ${failure.message}`;
};
const describeDenoSpawnFailure = (failure) => {
	if (failure.reason === "not-found") return "oxlint-guard: deno not found on PATH. Install Deno to check and lint Deno-scripted files.";
	if (failure.reason === "not-executable") return `oxlint-guard: deno found on PATH but is not executable: ${failure.message}`;
	return `oxlint-guard: failed to run deno: ${failure.message}`;
};
const buildOxlintCommand = (run, cwd, typeAware) => {
	const args = [
		...typeAware ? ["--type-aware", "--type-check"] : [],
		"-f",
		"agent",
		"-c",
		run.configPath,
		"--",
		run.filePath
	];
	const command = run.oxlintBinary.endsWith(".cmd") ? make$7("cmd.exe", "/c", run.oxlintBinary, ...args) : make$7(run.oxlintBinary, ...args);
	return env(workingDirectory(command, cwd), minimalEnv());
};
const runDeno = (adapter, path, filePath, timeout) => gen(function* () {
	const cwd = path.dirname(filePath);
	const env$2 = minimalEnv();
	const checkAttempt = yield* either$1(timeoutOption(adapter.run(env(make$7("deno", "check", "--", filePath).pipe(workingDirectory(cwd)), env$2)), timeout));
	if (isLeft(checkAttempt)) return block(describeDenoSpawnFailure(checkAttempt.left));
	if (isNone(checkAttempt.right)) return allow();
	const check = checkAttempt.right.value;
	if (check.exitCode !== 0) return block(`oxlint-guard: deno check failed for ${filePath}:\n${stderrOrStdout(check)}`);
	const lintAttempt = yield* either$1(timeoutOption(adapter.run(env(make$7("deno", "lint", "--", filePath).pipe(workingDirectory(cwd)), env$2)), timeout));
	if (isLeft(lintAttempt)) return block(describeDenoSpawnFailure(lintAttempt.left));
	if (isNone(lintAttempt.right)) return allow();
	const lint = lintAttempt.right.value;
	if (lint.exitCode !== 0) return block(`oxlint-guard: deno lint failed for ${filePath}:\n${stderrOrStdout(lint)}`);
	return allow();
});
const runOxlint = (adapter, path, run, timeout) => gen(function* () {
	const cwd = path.dirname(run.configPath);
	const firstAttempt = yield* either$1(timeoutOption(adapter.run(buildOxlintCommand(run, cwd, true)), timeout));
	if (isLeft(firstAttempt)) return block(describeOxlintSpawnFailure(run.oxlintBinary, firstAttempt.left));
	if (isSome(firstAttempt.right)) {
		const firstVerdict = classifyLintResult({
			result: firstAttempt.right.value,
			canRetry: true
		});
		if (isLeft(firstVerdict)) return block(describeLintViolation(firstVerdict.left, { typeAware: true }));
		if (!is(RetryWithoutTypeAware)(firstVerdict.right)) return allow();
	}
	const retryAttempt = yield* either$1(timeoutOption(adapter.run(buildOxlintCommand(run, cwd, false)), timeout));
	if (isLeft(retryAttempt)) return block(describeOxlintSpawnFailure(run.oxlintBinary, retryAttempt.left));
	if (isNone(retryAttempt.right)) return allow();
	const retryVerdict = classifyLintResult({
		result: retryAttempt.right.value,
		canRetry: false
	});
	if (isLeft(retryVerdict)) return block(describeLintViolation(retryVerdict.left, { typeAware: false }));
	return allow();
});
const executePlan = (adapter, path, plan, timeout) => value(plan).pipe(tag("Skip", () => succeed$2(allow())), tag("RunDeno", ({ filePath }) => runDeno(adapter, path, filePath, timeout)), tag("RunOxlint", (run) => runOxlint(adapter, path, run, timeout)), exhaustive);
const settlePlan = (adapter, path, plan, timeout) => match$7(plan, {
	onLeft: (failure) => succeed$2(block(describeLintFailure(failure))),
	onRight: (decision) => executePlan(adapter, path, decision, timeout)
});
const decodeEdit = decodeUnknownEither(parseJson(HookPayloadToEditCommand));
const runLintGuard = (raw, cwd = process.cwd(), options = { commandTimeout: LINT_COMMAND_TIMEOUT }) => catchTag(gen(function* () {
	const decoded = decodeEdit(raw);
	if (isLeft(decoded)) return allow();
	const adapter = yield* LintGuardAdapter;
	const path = yield* Path;
	const facts = yield* adapter.gather(decoded.right.filePath, cwd);
	const plan = decideLintPlan({
		toolName: decoded.right.toolName,
		resolvedPath: facts.resolvedPath,
		extension: path.extname(facts.resolvedPath).slice(1),
		exists: facts.exists,
		firstLine: facts.firstLine,
		configPath: facts.configPath,
		oxlintBinary: facts.oxlintBinary,
		lockfile: facts.lockfile
	});
	return yield* settlePlan(adapter, path, plan, options.commandTimeout);
}), "OxlintBinaryNotExecutable", (failure) => succeed$2(block(describeBrokenBinary(failure))));
//#endregion
//#region src/lint-guard/lint-guard.adapter.ts
const CONFIG_BASENAMES = OxlintConfigBasename.literals;
const LOCKFILE_BASENAMES = [
	"pnpm-lock.yaml",
	"package-lock.json",
	"yarn.lock",
	"bun.lockb",
	"bun.lock"
];
const PROJECT_ROOT_ENV = "CLAUDE_PROJECT_DIR";
const OUTPUT_CAP_BYTES = 65536;
const walkUp = (path, startDir) => {
	const dirs = [];
	let dir = startDir;
	let parent = path.dirname(dir);
	while (parent !== dir) {
		dirs.push(dir);
		dir = parent;
		parent = path.dirname(dir);
	}
	dirs.push(dir);
	return dirs;
};
const withinRoot = (root, dir, sep) => dir === root || dir.startsWith(root + sep);
const dirsUpToRoot = (path, startDir, root) => {
	const walked = walkUp(path, startDir);
	const firstOutside = walked.findIndex((dir) => !withinRoot(root, dir, path.sep));
	return firstOutside === -1 ? walked : walked.slice(0, firstOutside);
};
const findProjectRoot = (fs, path, cwd) => gen(function* () {
	const fromEnv = process.env[PROJECT_ROOT_ENV];
	if (fromEnv !== void 0 && fromEnv.trim() !== "") return path.resolve(fromEnv);
	for (const dir of walkUp(path, cwd)) if (yield* catchAll(fs.exists(path.join(dir, ".git")), () => succeed$2(false))) return dir;
	return cwd;
});
const findFirstExisting = (fs, candidates) => reduce(candidates, none$4(), (acc, candidate) => isSome(acc) ? succeed$2(acc) : map$2(catchAll(fs.exists(candidate), () => succeed$2(false)), (exists) => exists ? some(candidate) : none$4()));
const findOxlintBinary = (fs, path, candidates) => gen(function* () {
	for (const candidate of candidates) {
		if (!(yield* catchAll(fs.exists(candidate), () => succeed$2(false)))) continue;
		const info = yield* catchAll(map$2(fs.stat(candidate), (info) => some(info)), () => succeed$2(none$4()));
		if (isSome(info) && info.value.type === "Directory") yield* fail$2(new OxlintBinaryNotExecutable({ path: candidate }));
		return some(candidate);
	}
	return none$4();
});
const readFirstLine = (fs, filePath) => catchAll(map$2(runFold(take(fs.stream(filePath), 1), "", (_, chunk) => new TextDecoder().decode(chunk)), (firstChunk) => {
	const firstLine = firstChunk.split("\n", 1)[0] ?? "";
	return firstLine === "" ? none$4() : some(firstLine);
}), () => succeed$2(none$4()));
const binaryCandidates = (path, dir) => {
	const bin = path.join(dir, "node_modules", ".bin");
	return path.sep === "\\" ? [path.join(bin, "oxlint.cmd"), path.join(bin, "oxlint")] : [path.join(bin, "oxlint")];
};
const drainToString = (stream) => runFold(stream, {
	bytes: /* @__PURE__ */ new Uint8Array(),
	truncated: false
}, (acc, chunk) => {
	if (acc.truncated) return acc;
	const room = OUTPUT_CAP_BYTES - acc.bytes.length;
	if (room <= 0) return {
		bytes: acc.bytes,
		truncated: true
	};
	const take = Math.min(room, chunk.length);
	const merged = new Uint8Array(acc.bytes.length + take);
	merged.set(acc.bytes);
	merged.set(chunk.subarray(0, take), acc.bytes.length);
	return {
		bytes: merged,
		truncated: take < chunk.length
	};
}).pipe(map$2(({ bytes, truncated }) => {
	const text = new TextDecoder().decode(bytes);
	return truncated ? `${text}${TRUNCATION_MARKER}` : text;
}));
const reasonOf = (error) => {
	if (typeof error !== "object" || error === null) return "unknown";
	const systemReason = "reason" in error ? Reflect.get(error, "reason") : void 0;
	if (systemReason === "NotFound") return "not-found";
	if (systemReason === "PermissionDenied" || systemReason === "BadResource") return "not-executable";
	const code = "code" in error ? Reflect.get(error, "code") : void 0;
	if (code === "ENOENT") return "not-found";
	if (code === "EACCES" || code === "EPERM" || code === "EISDIR") return "not-executable";
	return "unknown";
};
const toSpawnFailure = (program, error) => {
	const message = error instanceof Error ? error.message : "unknown error";
	return new SpawnFailure({
		program,
		reason: reasonOf(error),
		message
	});
};
const programName = (command) => flatten$1(command)[0].command;
const makeLintGuardAdapter = (options) => {
	const { fs, path, executor } = options;
	const gather = (filePath, cwd) => gen(function* () {
		const resolved = path.resolve(cwd, filePath);
		const root = yield* findProjectRoot(fs, path, cwd);
		const dirs = dirsUpToRoot(path, path.dirname(resolved), root);
		const exists = yield* catchAll(fs.exists(resolved), () => succeed$2(false));
		return {
			resolvedPath: resolved,
			exists,
			firstLine: exists ? yield* readFirstLine(fs, resolved) : none$4(),
			configPath: yield* findFirstExisting(fs, dirs.flatMap((dir) => CONFIG_BASENAMES.map((name) => path.join(dir, name)))),
			oxlintBinary: yield* findOxlintBinary(fs, path, dirs.flatMap((dir) => binaryCandidates(path, dir))),
			lockfile: yield* map$2(findFirstExisting(fs, dirs.flatMap((dir) => LOCKFILE_BASENAMES.map((name) => path.join(dir, name)))), map$13((found) => path.basename(found)))
		};
	});
	const run = (command) => catchAll(scoped$2(gen(function* () {
		const process = yield* executor.start(command);
		const [stdout, stderr, exitCode] = yield* all([
			drainToString(process.stdout),
			drainToString(process.stderr),
			process.exitCode
		], { concurrency: "unbounded" });
		return {
			stdout,
			stderr,
			exitCode: Number(exitCode)
		};
	})), (error) => fail$2(toSpawnFailure(programName(command), error)));
	return {
		gather,
		run
	};
};
const layer = effect$1(LintGuardAdapter, gen(function* () {
	const fs = yield* FileSystem;
	const path = yield* Path;
	const executor = yield* CommandExecutor;
	return makeLintGuardAdapter({
		fs,
		path,
		executor
	});
}));
//#endregion
//#region src/lint-guard/main.ts
const importMeta = import.meta;
const STDIN_CAP_BYTES = 1048576;
const readStdin = async((resume) => {
	process.stdin.setEncoding("utf-8");
	let data = "";
	const finish = (result) => {
		cleanup();
		resume(succeed$2(result));
	};
	const onData = (chunk) => {
		if (data.length + chunk.length > STDIN_CAP_BYTES) {
			finish(left("too-large"));
			return;
		}
		data += chunk;
	};
	const onEnd = () => {
		finish(right(data));
	};
	const onError = (error) => {
		cleanup();
		resume(die$1(error));
	};
	const cleanup = () => {
		process.stdin.off("data", onData);
		process.stdin.off("end", onEnd);
		process.stdin.off("error", onError);
	};
	process.stdin.on("data", onData);
	process.stdin.on("end", onEnd);
	process.stdin.on("error", onError);
	return sync$1(cleanup);
});
const program = gen(function* () {
	const stdin = yield* readStdin;
	if (isLeft(stdin)) return 0;
	const result = yield* runLintGuard(stdin.right);
	if (result.stderr !== "") yield* error(result.stderr);
	return result.exitCode;
});
const isExitCode = (value) => typeof value === "number";
const runnable = provide(program, merge(provide$1(layer, layer$1), layer$1));
if (importMeta.main) runMain({
	disableErrorReporting: true,
	disablePrettyLogger: true,
	teardown: (exit, onExit) => onExit(isSuccess(exit) && isExitCode(exit.value) ? exit.value : 1)
})(runnable);
//#endregion
export {};
