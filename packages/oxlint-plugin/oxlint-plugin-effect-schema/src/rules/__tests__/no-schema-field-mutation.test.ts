import { createRuleTester } from './_tester.js'

import {
  FIELD_MUTATION_ACTUAL,
  FIELD_MUTATION_EXPECTED,
  FIELD_MUTATION_FIX,
} from '../no-schema-field-mutation.config.js'
import { noSchemaFieldMutation } from '../no-schema-field-mutation.js'

const ruleTester = createRuleTester()

const error = (name: string) => ({
  messageId: 'schemaFieldMutation',
  data: {
    name,
    expected: FIELD_MUTATION_EXPECTED,
    actual: FIELD_MUTATION_ACTUAL,
    fix: FIELD_MUTATION_FIX,
  },
})

ruleTester.run('no-schema-field-mutation', noSchemaFieldMutation, {
  valid: [
    {
      name: 'Should_Pass_When_MethodOnlyReadsFields',
      code: `import { Schema as S } from 'effect'
class User extends S.Class<User>('User')({ name: S.String }) {
  greet() {
    return this.name
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
    },
    {
      name: 'Should_Pass_When_InitializerSetsField',
      code: `import { Schema as S } from 'effect'
class User extends S.Class<User>('User')({ name: S.String }) {
  count = 0
}`,
      filename: '/repo/pkg/src/domain.ts',
    },
    {
      name: 'Should_Pass_When_MutationLivesOffSchemaClass',
      code: `class Plain {
  count = 0
  reset() {
    this.count = 0
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
    },
    {
      name: 'Should_Pass_When_MethodAssignsParameter',
      code: `import { Schema as S } from 'effect'
class User extends S.Class<User>('User')({ name: S.String }) {
  rename(next: string) {
    next = next.trim()
    return next
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
    },
    {
      name: 'Should_Pass_When_MutationExtendsForeignBase',
      code: `import { Base } from './base.js'
class Thing extends Base {
  reset() {
    this.count = 0
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Fail_When_MethodAssignsField',
      code: `import { Schema as S } from 'effect'
class User extends S.Class<User>('User')({ name: S.String }) {
  rename(next: string) {
    this.name = next
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
      errors: [error('an assignment to this.name in a method')],
    },
    {
      name: 'Should_Fail_When_ConstructorAssignsField',
      code: `import { Schema as S } from 'effect'
class User extends S.Class<User>('User')({ name: S.String }) {
  count = 0
  constructor() {
    this.count = 0
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
      errors: [error('an assignment to this.count in a method')],
    },
    {
      name: 'Should_Fail_When_AliasedNamespaceMethodAssignsField',
      code: `import { Schema as Sch } from 'effect'
class User extends Sch.Class<User>('User')({ name: Sch.String }) {
  reset() {
    this.count = 0
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
      errors: [error('an assignment to this.count in a method')],
    },
    {
      name: 'Should_Fail_When_DestructuredBaseMethodAssignsField',
      code: `import { Schema as S } from 'effect'
const { Class } = S
class User extends Class<User>('User')({ name: S.String }) {
  reset() {
    this.count = 0
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
      errors: [error('an assignment to this.count in a method')],
    },
    {
      name: 'Should_Fail_When_NamedImportBaseMethodAssignsField',
      code: `import { Class } from 'effect/Schema'
class User extends Class<User>('User')({ name: 'x' }) {
  reset() {
    this.count = 0
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
      errors: [error('an assignment to this.count in a method')],
    },
    {
      name: 'Should_Fail_When_CompoundAssignmentMutatesField',
      code: `import { Schema as S } from 'effect'
class User extends S.Class<User>('User')({ name: S.String }) {
  bump() {
    this.count += 1
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
      errors: [error('an assignment to this.count in a method')],
    },
    {
      name: 'Should_Fail_When_NestedArrowAssignsField',
      code: `import { Schema as S } from 'effect'
class User extends S.Class<User>('User')({ name: S.String }) {
  reset() {
    const apply = () => {
      this.count = 0
    }
    apply()
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
      errors: [error('an assignment to this.count in a method')],
    },
    {
      name: 'Should_Fail_When_ArrowPropertyAssignsField',
      code: `import { Schema as S } from 'effect'
class User extends S.Class<User>('User')({ name: S.String }) {
  reset = () => {
    this.count = 0
  }
}`,
      filename: '/repo/pkg/src/domain.ts',
      errors: [error('an assignment to this.count in a method')],
    },
  ],
})
