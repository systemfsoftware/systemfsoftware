import { legacyClient } from '@consumer/legacy-client'
import { useQuery } from '@tanstack/react-query'
import { readFileSync } from 'node:fs'

export const used: readonly unknown[] = [readFileSync, useQuery, legacyClient]
