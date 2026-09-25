import type { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { MicroVMMedium } from '@systemfsoftware/effect-daemon-microvm'

const ALPINE_3_20_INDEX_DIGEST = 'sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc'

export const FIXTURE_IMAGE = `alpine:3.20@${ALPINE_3_20_INDEX_DIGEST}`

export const READY_TOKEN = 'child-script-ready'

export const ABNORMAL_EXIT_CODE = 3

const scriptOf = (lines: Readonly<Record<Conformance.ChildStep['_tag'], string>>): string =>
  `\
while IFS= read -r step; do
  case "$step" in
    ${lines.BecomeReady}) printf '${READY_TOKEN}\\n' ;;
    ${lines.ExitNormal}) exit 0 ;;
    ${lines.ExitAbnormal}) exit ${ABNORMAL_EXIT_CODE} ;;
    ${lines.IgnoreGracefulStop}) : ;;
    ${lines.NeverBecomeReady}) : ;;
  esac
done
`

export const childScriptWorkload = MicroVMMedium.MicroVMWorkload.make({
  image: FIXTURE_IMAGE,
  command: ['sh', '-c', scriptOf(MicroVMMedium.ChildStepLines)],
  readyOnStdout: READY_TOKEN,
})
