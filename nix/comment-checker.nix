{ lib, stdenvNoCC, fetchurl }:

let
  version = "0.1.5";

  releases = {
    x86_64-linux = {
      target = "x86_64-unknown-linux-gnu";
      hash = "sha256-d/Xl2VZqnB+lFNkdtglY7N/nY6CxhgQG+arGL7FmCME=";
    };
    aarch64-linux = {
      target = "aarch64-unknown-linux-gnu";
      hash = "sha256-vP0Ss8eOOElpCrxryGiMn0WMBIEDtJe3LnB8FunZjok=";
    };
    x86_64-darwin = {
      target = "x86_64-apple-darwin";
      hash = "sha256-c0mJOCcz0Zt61Da/y/n3JTFGchWJQk8cBZ8EMVYx7e8=";
    };
    aarch64-darwin = {
      target = "aarch64-apple-darwin";
      hash = "sha256-C/f81qw86DXoZ6dL2rEt6z67IfYw09hG8iaa0vQOu2U=";
    };
  };

  system = stdenvNoCC.hostPlatform.system;
  release = releases.${system} or (throw "comment-checker: no release pinned for ${system}");
in
stdenvNoCC.mkDerivation {
  pname = "comment-checker";
  inherit version;

  src = fetchurl {
    url = "https://github.com/systemfsoftware/comment-checker/releases/download/v${version}/comment-checker-${release.target}";
    inherit (release) hash;
  };

  dontUnpack = true;

  installPhase = ''
    runHook preInstall
    install -Dm755 $src $out/bin/comment-checker
    runHook postInstall
  '';

  meta = {
    description = "Claude Code PostToolUse hook that flags unnecessary comments";
    homepage = "https://github.com/systemfsoftware/comment-checker";
    license = lib.licenses.asl20;
    mainProgram = "comment-checker";
    platforms = lib.attrNames releases;
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
}
