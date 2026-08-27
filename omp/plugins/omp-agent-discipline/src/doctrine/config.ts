import { makeStringArrayCache } from '../config-cache.js'

type DispatchDoctrineSkillsTag = { readonly _brand: 'DispatchDoctrineSkills' }

const _cache = makeStringArrayCache<DispatchDoctrineSkillsTag>(
  'omp-agent-discipline/DispatchDoctrineSkills',
  'dispatch_doctrine_skills',
  [],
)

export const DispatchDoctrineSkills = _cache.Service
export type DispatchDoctrineSkills = DispatchDoctrineSkillsTag
export const DispatchDoctrineSkillsLive = _cache.Live

export const __resetDispatchDoctrineSkillsForTesting = _cache.reset
