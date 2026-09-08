import { createRuleTester } from './_tester.js'

import {
  EFFECT_METHOD_ACTUAL,
  EFFECT_METHOD_EXPECTED,
  EFFECT_METHOD_FIX,
} from '../no-effect-returning-schema-method.config.js'
import { noEffectReturningSchemaMethod } from '../no-effect-returning-schema-method.js'

const ruleTester = createRuleTester()

const error = (name: string) => ({
  messageId: 'effectReturningMethod',
  data: {
    name,
    expected: EFFECT_METHOD_EXPECTED,
    actual: EFFECT_METHOD_ACTUAL,
    fix: EFFECT_METHOD_FIX,
  },
})

ruleTester.run('no-effect-returning-schema-method', noEffectReturningSchemaMethod, {
  valid: [
    {
      name: 'Should_Pass_When_MethodReturnsPlainValue',
      code: `import { Schema as S } from 'effect'
class User extends S.Class<User>('User')({ name: S.String }) {
  greet() {
    return this.name
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
    },
    {
      name: 'Should_Pass_When_MethodCarriesPlainReturnType',
      code: `import { Schema as S } from 'effect'
class User extends S.Class<User>('User')({ name: S.String }) {
  describe(): string {
    return this.name
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
    },
    {
      name: 'Should_Pass_When_AsyncMethodLivesOffSchemaClass',
      code: `class Plain {
  async load() {
    return 1
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
    },
    {
      name: 'Should_Pass_When_EffectReturnLivesOffSchemaClass',
      code: `import { Effect } from 'effect'
class Plain {
  run(): Effect.Effect<string> {
    throw new Error('x')
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
    },
    {
      name: 'Should_Pass_When_AsyncMethodExtendsForeignBase',
      code: `import { Base } from './base.js'
class Thing extends Base {
  async run() {
    return 1
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
    },
    {
      name: 'Should_Pass_When_GetterReturnsPlainValue',
      code: `import { Schema as S } from 'effect'
class User extends S.Class<User>('User')({ name: S.String }) {
  get label(): string {
    return this.name
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Fail_When_MethodIsAsync',
      code: `import { Schema as S } from 'effect'
class User extends S.Class<User>('User')({ name: S.String }) {
  async load() {
    return this.name
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
      errors: [error('method load that builds an effect')],
    },
    {
      name: 'Should_Fail_When_ReturnTypeMentionsEffect',
      code: `import { Effect } from 'effect'
import { Schema as S } from 'effect'
class User extends S.Class<User>('User')({ name: S.String }) {
  run(): Effect.Effect<string> {
    throw new Error('x')
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
      errors: [error('method run that builds an effect')],
    },
    {
      name: 'Should_Fail_When_ReturnTypeMentionsPromise',
      code: `import { Schema as S } from 'effect'
class User extends S.Class<User>('User')({ name: S.String }) {
  load(): Promise<string> {
    throw new Error('x')
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
      errors: [error('method load that builds an effect')],
    },
    {
      name: 'Should_Fail_When_AliasedNamespaceMethodIsAsync',
      code: `import { Schema as Sch } from 'effect'
class User extends Sch.Class<User>('User')({ name: Sch.String }) {
  async load() {
    return this.name
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
      errors: [error('method load that builds an effect')],
    },
    {
      name: 'Should_Fail_When_DestructuredBaseMethodIsAsync',
      code: `import { Schema as S } from 'effect'
const { Class } = S
class User extends Class<User>('User')({ name: S.String }) {
  async load() {
    return this.name
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
      errors: [error('method load that builds an effect')],
    },
    {
      name: 'Should_Fail_When_NamedImportBaseMethodMentionsEffect',
      code: `import { Effect } from 'effect'
import { Class } from 'effect/Schema'
class User extends Class<User>('User')({ name: 'x' }) {
  run(): Effect.Effect<string> {
    throw new Error('x')
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
      errors: [error('method run that builds an effect')],
    },
    {
      name: 'Should_Fail_When_TaggedClassMethodIsAsync',
      code: `import { Schema as S } from 'effect'
class Settled extends S.TaggedClass<Settled>()('Settled', { name: S.String }) {
  async settle() {
    return this.name
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
      errors: [error('method settle that builds an effect')],
    },
    {
      name: 'Should_Fail_When_ArrowPropertyMentionsPromise',
      code: `import { Schema as S } from 'effect'
class User extends S.Class<User>('User')({ name: S.String }) {
  load = (): Promise<string> => {
    throw new Error('x')
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
      errors: [error('method load that builds an effect')],
    },
  ],
})
