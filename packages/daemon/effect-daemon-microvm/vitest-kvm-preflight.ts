import { accessSync, constants, existsSync } from 'node:fs'

const KVM_DEVICE = '/dev/kvm'

const kvmIsGranted = (): boolean => {
  try {
    accessSync(KVM_DEVICE, constants.R_OK | constants.W_OK)
    return true
  } catch {
    return false
  }
}

const kvmReason = (): string =>
  existsSync(KVM_DEVICE)
    ? `${KVM_DEVICE} exists but is not readable and writable by this process`
    : `${KVM_DEVICE} does not exist on this host`

const ciIsSet = (): boolean => {
  const value = process.env['CI']
  return value !== undefined && value.length > 0
}

export const setup = (): void => {
  if (ciIsSet() && !kvmIsGranted()) {
    throw new Error(
      `the microVM integration suites need hardware virtualization and this runner grants none: ${kvmReason()}. .github/workflows/reusable-checks.yml grants it; a missing KVM fails these suites rather than skipping them.`,
    )
  }
}
