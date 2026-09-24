import { accessSync, constants, existsSync } from 'node:fs'

const KVM_DEVICE = '/dev/kvm'

const isGranted = (): boolean => {
  try {
    accessSync(KVM_DEVICE, constants.R_OK | constants.W_OK)
    return true
  } catch {
    return false
  }
}

export interface KvmGate {
  readonly available: boolean
  readonly reason: string
}

const available = isGranted()

export const kvmGate: KvmGate = {
  available,
  reason: available
    ? `${KVM_DEVICE} is readable and writable`
    : existsSync(KVM_DEVICE)
    ? `${KVM_DEVICE} exists but is not readable and writable by this process`
    : `${KVM_DEVICE} does not exist on this host`,
}

export const featureNameOf = (capability: string): string =>
  kvmGate.available
    ? capability
    : `${capability}, which this host cannot do: ${kvmGate.reason}, so the suite is skipped here and runs in CI`

export const kvmVerdictOf = (): string => kvmGate.available ? 'readable and writable' : kvmGate.reason
