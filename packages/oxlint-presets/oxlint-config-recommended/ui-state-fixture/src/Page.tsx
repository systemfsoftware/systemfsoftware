import { legacyClient } from '@consumer/legacy-client'
import { useQuery } from '@tanstack/react-query'
import { readFileSync } from 'node:fs'
import { useLayoutEffect } from 'react'

export const used: readonly unknown[] = [readFileSync, useQuery, legacyClient, useLayoutEffect]

export const load = (): Promise<Response> => fetch('/demand')

export const density = (): string | null => localStorage.getItem('density')
