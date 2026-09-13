# comment-checker, from the release asset the pinned input's
# `nix/release-hashes.json` names for this host. A fixed-output fetch, so a
# digest that drifts from the URL fails the build loudly rather than reusing
# the previous store object.
{ lib, stdenv, stdenvNoCC, fetchurl, autoPatchelfHook, hashes }:

let
  manifest = builtins.fromJSON (builtins.readFile hashes);

  system = stdenvNoCC.hostPlatform.system;
  target = manifest.systems.${system} or (throw "comment-checker: no release binary for ${system}");
  sha256 =
    manifest.assets.${target}
      or (throw "comment-checker: ${hashes} carries no digest for ${target}");
in
stdenvNoCC.mkDerivation {
  pname = "comment-checker";
  version = manifest.version;

  src = fetchurl {
    url = "https://github.com/systemfsoftware/comment-checker/releases/download/v${manifest.version}/comment-checker-${target}";
    inherit sha256;
  };

  # The asset is one bare executable, so there is no directory to enter.
  dontUnpack = true;

  nativeBuildInputs = lib.optional stdenvNoCC.hostPlatform.isLinux autoPatchelfHook;
  # `stdenv.cc.cc.lib` supplies libgcc_s.so.1, which the Rust binaries link.
  buildInputs = lib.optionals stdenvNoCC.hostPlatform.isLinux [ stdenv.cc.cc.lib ];

  installPhase = ''
    runHook preInstall
    install -Dm755 "$src" "$out/bin/comment-checker"
    runHook postInstall
  '';

  meta = {
    description = "Claude Code PostToolUse hook that flags unnecessary comments";
    homepage = "https://github.com/systemfsoftware/comment-checker";
    license = lib.licenses.asl20;
    mainProgram = "comment-checker";
    platforms = lib.attrNames manifest.systems;
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
}
