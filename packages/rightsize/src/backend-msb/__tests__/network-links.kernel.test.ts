import { describe, expect, it } from 'vitest'

import { hostsAliasScript, type NetworkLinkLike, validateAliases, validateGuestPorts } from '../network-links.kernel.js'

const link = (alias: string, guestPort: number, targetHostPort: number): NetworkLinkLike => ({
  alias,
  guestPort,
  targetHostPort,
})

describe('network-links.kernel (duplicate guest ports)', () => {
  it('Should_RejectTwoLinksWithTheSameGuestPort_When_NamedNetworkWouldHaveBoth', () => {
    expect(validateGuestPorts([link('a', 8888, 1), link('b', 8888, 2)])).toEqual({
      _tag: 'duplicate-guest-port',
      guestPort: 8888,
    })
  })

  it('Should_AcceptDistinctGuestPorts_When_NoTwoLinksCollide', () => {
    expect(validateGuestPorts([link('a', 80, 1), link('b', 443, 2)])).toEqual({ _tag: 'ok' })
  })
})

describe('network-links.kernel (alias charset)', () => {
  it('Should_RejectShellMetacharacterAliases_When_InterpolatedIntoHostsEcho', () => {
    const evil = "evil'; rm -rf /;'"
    expect(validateAliases([link(evil, 80, 1)])).toEqual({ _tag: 'invalid-alias', alias: evil })
    expect(validateAliases([link('ok', 80, 1), link('x y', 81, 1)])).toEqual({ _tag: 'invalid-alias', alias: 'x y' })
  })

  it('Should_AcceptLettersDigitsDotUnderscoreHyphen_When_AliasIsDnsLabelShaped', () => {
    expect(validateAliases([link('configuration-stub.local_1', 80, 1)])).toEqual({ _tag: 'ok' })
  })
})

describe('network-links.kernel (hosts alias script)', () => {
  it('Should_EmitOneEchoPerDistinctAlias_When_BuildingTheHostsScript', () => {
    expect(hostsAliasScript([link('a', 1, 1), link('a', 2, 2), link('b', 3, 3)])).toBe(
      "echo '127.0.0.1 a' >> /etc/hosts; echo '127.0.0.1 b' >> /etc/hosts",
    )
  })
})
