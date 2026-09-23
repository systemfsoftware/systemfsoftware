import recommended, { effect } from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

export default defineConfig({ extends: [recommended, effect] })
