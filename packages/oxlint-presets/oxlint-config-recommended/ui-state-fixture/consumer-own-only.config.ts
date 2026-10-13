import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

const storage = { object: 'window', property: 'localStorage', message: 'Persist through the KeyValueStore service.' }

export default defineConfig({
  extends: [recommended],
  overrides: [
    { files: ['**/*.ts'], rules: { 'no-restricted-properties': ['error', storage] } },
    { files: ['**/*.tsx'], rules: { 'no-restricted-properties': ['error', storage] } },
  ],
})
