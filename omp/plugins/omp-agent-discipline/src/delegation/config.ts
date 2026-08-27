import { makeStringArrayCache } from '../config-cache.js'

type NoDelegateSkillsTag = { readonly _brand: 'NoDelegateSkills' }

const _cache = makeStringArrayCache<NoDelegateSkillsTag>('omp-agent-discipline/NoDelegateSkills', [])

export const NoDelegateSkills = _cache.Service
export type NoDelegateSkills = NoDelegateSkillsTag
export const NoDelegateSkillsLive = _cache.Live

export const __resetNoDelegateSkillsForTesting = _cache.reset
