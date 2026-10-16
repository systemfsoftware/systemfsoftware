import type { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { MicroVMMedium } from '@systemfsoftware/effect-daemon-microvm'
import images from '@systemfsoftware/microvm-test-images' with { type: 'json' }

export const FIXTURE_IMAGE = images.alpine

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
