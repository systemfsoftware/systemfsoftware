import { Array as A, Match, Option } from 'effect'

interface PatternCategory {
  readonly name: string
  readonly weight: number
  readonly patterns: readonly RegExp[]
}

const STRUCTURAL_CATEGORIES: readonly PatternCategory[] = [
  {
    name: 'scope_drift',
    weight: 2,
    patterns: [
      /I asked you to [^.!?]+[.!?]? why (are you|is it)/i,
      /(you('re| are)|this is) (drifted|off track|wrong|coding|doing)/i,
      /this is(n't| not) what I asked/i,
    ],
  },
  {
    name: 'competence_challenge',
    weight: 2,
    patterns: [
      /(oh )?(but )?you('?re?| are) wrong/i,
      /you('?re| are) (confused|mistaken)/i,
      /that('?s| is) (wrong|incorrect|not right)/i,
      /(actually|oh but)[,\s]+\w+ IS /i,
    ],
  },
  {
    name: 'premature_work',
    weight: 2,
    patterns: [
      /i need more guidance on/i,
      /this is(n't| not) what I needed/i,
      /that('s| is) premature/i,
    ],
  },
  {
    name: 'dismissal',
    weight: 2,
    patterns: [
      /whatever[,\s]+it'?s? fine/i,
      /(just )?forget it/i,
      /never mind/i,
      /let('s|s) (just )?move on/i,
    ],
  },
  {
    name: 'premise_challenge',
    weight: 2,
    patterns: [
      /wait[,\s]+really[?\s]/i,
      /(why|how) (is|would|does|can) \w+ (so |be )?\w+ if/i,
      /that (can('t|not)|could(n't| not)) be right/i,
    ],
  },
  {
    name: 'strong_negative',
    weight: 2,
    patterns: [
      /\b(catastrophic|catalymic|complete|total) (failure|disaster|mess)\b/i,
      /this is (completely|totally|absolutely) (broken|wrong|useless)\b/i,
    ],
  },
  {
    name: 'rejection',
    weight: 2,
    patterns: [
      /we (don't|do not) need/i,
      /this is unnecessary/i,
      /no need for/i,
      /that's not (what|right|correct)/i,
      /who asked (you )?(for |to )/i,
      /nobody asked/i,
      /did I ask/i,
    ],
  },
  {
    name: 'repetition_frustration',
    weight: 2,
    patterns: [
      /how many times/i,
      /i already told you/i,
      /i (just )?told you/i,
      /i('ve| have) said this/i,
      /why do you keep/i,
      /you keep (changing|doing|adding|using|ignoring|forgetting|missing)/i,
      /again\?/i,
      /stop (changing|doing|adding|trying|ignoring|repeating)/i,
      /for the (last|(\d+)(st|nd|rd|th)) time/i,
      /how many times do I/i,
      /read what I (said|wrote|typed)/i,
    ],
  },
]

const KEYWORD_CATEGORIES: readonly PatternCategory[] = [
  {
    name: 'direct_insult',
    weight: 2,
    patterns: [
      /\b(idiot|stupid|dumb|moron|imbecil|inbred|braindead|brain dead|retard)/i,
      /\b(dipshit|dumbass|jackass|halfwit|dimwit|nitwit|twit|numbskull)/i,
      /\b(incompetent|clueless|pathetic|degenerat|delusional)/i,
      /\b(clown|grift|fraud|ponzi)/i,
      /\b(asshole|bastard|bitch|prick|wanker|twat|bellend)/i,
      /\bf+u+c+k+/i,
    ],
  },
  {
    name: 'mild_profanity',
    weight: 1,
    patterns: [
      /\b(wtf|stfu|ffs|jfc|omfg|smh)\b/i,
      /\b(useless|worthless|hopeless|scam|hack)/i,
      /\b(trash|garbage|crap|shit|bullshit|dogshit|horseshit|pos)\b/i,
      /\b(ass|dick)\b/i,
      /\b(damn|hell|suck|terrible|awful|horrible|atrocious|abysmal)/i,
    ],
  },
  {
    name: 'sarcasm',
    weight: 1,
    patterns: [
      /\b(great|good|nice|brilliant|wonderful|fantastic|amazing) (job|work|going)\b/i,
      /thanks for nothing/i,
      /wow[,.]? really/i,
      /oh? great/i,
      /slow clap/i,
      /real helpful/i,
      /you('re| are) (really )?something/i,
    ],
  },
  {
    name: 'exasperation',
    weight: 1,
    patterns: [
      /\b(god|jesus|christ|ugh|sigh|fml|bruh)\b/i,
      /^(oh )?come on/i,
      /for (god('s|s) |crying out )?loud/i,
      /\b(unbelievable|incredible|seriously)\?/i,
      /are you (even )?(listening|reading|paying attention)/i,
    ],
  },
]

const ALL_CATEGORIES: readonly PatternCategory[] = [...STRUCTURAL_CATEGORIES, ...KEYWORD_CATEGORIES]

const THRESHOLD = 2

const STACKING_WEIGHT = 1

const SHOUT_MIN_LENGTH = 3

const INTERVENTION = `*** SYSTEM INTERVENTION ***
STATUS: CRITICAL
ACTION REQUIRED: IMMEDIATE COMPLIANCE

1. CEASE generating. Do NOT continue your current approach.
2. Re-read the user's last 3-5 messages. You MUST identify where you diverged.
3. Acknowledge the specific mistake. FORBIDDEN: deflecting, excusing, or restating what you already said.
4. You MUST search existing memories FIRST using whatever persistence tools are available in this session.
   - If a relevant memory EXISTS: UPDATE it with the correction. Do NOT create a duplicate.
   - If NO relevant memory exists: ONLY THEN create a new one.
   FORBIDDEN: append-only memory slop. FORBIDDEN: claiming you saved without an actual tool invocation. The user WILL verify.
5. Show the tool call result or file path as proof. No exceptions.

Non-compliance is NOT ACCEPTABLE.
*** END INTERVENTION ***
`

const withoutQuotedSpans = (text: string): string =>
  text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/'[^']*'/g, '')
    .replace(/<-+.*$/gm, '')

const isShoutedWord = (word: string): boolean =>
  word.length >= SHOUT_MIN_LENGTH && word === word.toUpperCase() && /[A-Z]/.test(word)

const shoutBoostOf = (cleaned: string): number => Number(cleaned.split(/\s+/).some(isShoutedWord))

const contributionOf = (category: PatternCategory, cleaned: string, shoutBoost: number): number => {
  const hitCount = A.filter(category.patterns, (pattern) => pattern.test(cleaned)).length
  return Match.value(category.weight === STACKING_WEIGHT).pipe(
    Match.when(true, () => (STACKING_WEIGHT + shoutBoost) * hitCount),
    Match.when(false, () => category.weight * Math.min(hitCount, 1)),
    Match.exhaustive,
  )
}

export const frustrationSignal = (prompt: string): Option.Option<string> => {
  const cleaned = withoutQuotedSpans(prompt)
  const shoutBoost = shoutBoostOf(cleaned)
  const score = A.reduce(
    ALL_CATEGORIES,
    0,
    (total, category) => total + contributionOf(category, cleaned, shoutBoost),
  )
  return Option.some(score).pipe(Option.filter((total) => total >= THRESHOLD), Option.as(INTERVENTION))
}
