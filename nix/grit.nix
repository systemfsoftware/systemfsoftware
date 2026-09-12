# grit, from the official GitHub release archive for this host's platform.
#
# Pinned to the exact engine version @systemfsoftware/conventions exact-pins in
# its dependencies (@getgrit/cli 0.1.0-alpha.1743007075, build SHA 0e04dd49), so
# the devShell binary and the published version contract cannot drift. The npm
# launcher's postinstall downloads this same archive — blocked under this repo's
# deny-all build policy, so the binary arrives here instead (dprint doctrine:
# docs/solutions/tooling-decisions/dprint-from-the-repo-flake.md).
{ lib, stdenv, stdenvNoCC, fetchurl, autoPatchelfHook, zlib }:

let
  version = "0.1.0-alpha.1743007075";

  releases = {
    x86_64-linux = {
      target = "x86_64-unknown-linux-gnu";
      sha256 = "94b34641a538ca0e85a92aa7f0ac94077fc6d663c996d0556c781d3d4c163149";
    };
    aarch64-linux = {
      target = "aarch64-unknown-linux-gnu";
      sha256 = "/POQ6Br2+R/O3tV8cmem6REATb1fJCrLAtc+yyxBpz4=";
    };
    x86_64-darwin = {
      target = "x86_64-apple-darwin";
      sha256 = "7r4lPmBVTR/A7zdxSPweVFZyyvESLZibEq59gdtnk8g=";
    };
    aarch64-darwin = {
      target = "aarch64-apple-darwin";
      sha256 = "pFzgr047Y7pIos+uSzFCeXpTHXYG9EcHxopf6L0TdTw=";
    };
  };

  system = stdenvNoCC.hostPlatform.system;
  release = releases.${system} or (throw "grit: no release archive pinned for ${system}");
in
stdenvNoCC.mkDerivation {
  pname = "grit";
  inherit version;

  src = fetchurl {
    url = "https://github.com/getgrit/gritql/releases/download/v${version}/grit-${release.target}.tar.gz";
    inherit (release) sha256;
  };

  # The archive extracts into a platform-named directory.
  sourceRoot = ".";


  # The official binary links libstdc++/libgcc_s (stdenv.cc.cc.lib) and libz.
  buildInputs = lib.optionals stdenvNoCC.hostPlatform.isLinux [ stdenv.cc.cc.lib zlib ];

  nativeBuildInputs = lib.optional stdenvNoCC.hostPlatform.isLinux autoPatchelfHook;

  installPhase = ''
    runHook preInstall
    install -Dm755 grit-*/grit "$out/bin/grit"
    runHook postInstall
  '';

  meta = {
    description = "GritQL engine — query language for searching, linting, and modifying code";
    homepage = "https://docs.grit.io/";
    license = lib.licenses.mit;
    mainProgram = "grit";
    platforms = lib.attrNames releases;
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
}
