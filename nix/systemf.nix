# systemf, compiled from the pnpm workspace it lives in.
#
# Six facts drive this file.
#
# 1. Only what the install and the build read is in the source: the workspace's
#    lockfile and manifests, the patch `patchedDependencies` names, the CLI,
#    and the two toolchain packages its tsconfig and tsdown config extend. A
#    filtered `pnpm install` does not need the other members' directories: it
#    links them as `workspace:` dependencies and leaves them dangling, which
#    the build never touches.
# 2. The CLI's compiler is `typescript@7`, whose per-platform native binary is
#    an optionalDependency. `fetchPnpmDeps` fetches for every platform, so the
#    tarball store below is the only place the build platform's binary can come
#    from; a stale `hash` fails loudly the way gritlint's `cargoHash` does.
# 3. This workspace pins `pnpm@12.6.0` in `packageManager` while nixpkgs ships
#    the `pnpm` input below. pnpm 12 removed `managePackageManagerVersions` in
#    favour of `pmOnFail`, so `pmOnFail=ignore` is what keeps pnpm from trying
#    to download a package manager during an offline build.
# 4. The CLI declares TypeScript as a peer dependency — its consumers supply
#    the compiler. `pnpm deploy --prod` installs no peer and `pnpm add` cannot
#    resolve one offline (pnpm keeps registry metadata outside the store the
#    fetcher ships), so the install copies the compiler the workspace install
#    already resolved into the deployed tree, native binary and all.
# 5. The deployed tree is one derivation and the `bin` wrapper over it another:
#    a wrapper that named its own output path would not survive
#    `nix build --rebuild`, while one that names the deploy's fixed store path
#    does.
# 6. The wrapper names `nodejs-slim_24` (node without npm) as the interpreter,
#    so the caller's `PATH` and `node_modules` never take part.
{
  lib,
  stdenv,
  fetchPnpmDeps,
  pnpmConfigHook,
  pnpm_12,
  nodejs_24,
  nodejs-slim_24,
  makeWrapper,
}:

let
  root = ../.;

  # The three names the CLI is known by.
  packageDir = "packages/systemf";
  pname = "systemf";
  bin = "systemf";

  manifest = lib.importJSON (root + "/${packageDir}/package.json");

  # A working tree has node_modules; nothing in the build may read them, and
  # copying a stale install into the store would have pnpm reconcile against it.
  nodeModules =
    name:
    lib.fileset.maybeMissing (root + "/${name}/node_modules");

  src = lib.fileset.toSource {
    inherit root;
    fileset = lib.fileset.difference
      (lib.fileset.unions [
        (root + "/package.json")
        (root + "/pnpm-lock.yaml")
        (root + "/pnpm-workspace.yaml")
        (root + "/patches")
        (root + "/${packageDir}")
        (root + "/packages/toolchain/tsconfig")
        (root + "/packages/toolchain/tsdown-config")
      ])
      (lib.fileset.unions [
        (nodeModules "")
        (nodeModules packageDir)
        (nodeModules "packages/toolchain/tsconfig")
        (nodeModules "packages/toolchain/tsdown-config")
      ]);
  };

  pnpm = pnpm_12;

  # Fact 5: everything the CLI needs at run time, and nothing that names itself.
  deploy = stdenv.mkDerivation {
    name = "${pname}-deploy";
    version = manifest.version;
    inherit src;

    pnpmDeps = fetchPnpmDeps {
      inherit pname src pnpm;
      version = manifest.version;
      fetcherVersion = 4;
      pnpmWorkspaces = [ manifest.name ];
      hash = "sha256-JDKVnAK41WoLO/762sR9QrswftvldYEFiFvtl3eyO9U=";
    };

    # The install the hook runs must filter exactly what the fetcher fetched.
    pnpmWorkspaces = [ manifest.name ];

    nativeBuildInputs = [
      nodejs_24
      pnpm
      pnpmConfigHook
    ];

    # Fact 3 above: nothing in an offline build may reach for the pinned manager.
    env.pnpm_config_pm_on_fail = "ignore";

    # The package's own `build` script also runs `api:check`, which compares the
    # committed API report — a gate for this repository, not for a consumer's
    # installed copy. The dist is what ships.
    buildPhase = ''
      runHook preBuild

      pnpm --filter ${manifest.name} exec tsdown -l warn

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      pnpm --filter ${manifest.name} deploy --prod --offline --ignore-scripts $out/lib/${pname}

      # Fact 4 above. `pnpm add` cannot place the peer either: it re-resolves
      # the version and pnpm keeps registry metadata in a cache `fetchPnpmDeps`
      # never ships (ERR_PNPM_NO_OFFLINE_META). So the compiler the workspace
      # install already resolved is copied in, flat, which is where TypeScript's
      # `import.meta.resolve` finds its native binary.
      typescriptDir=$(readlink -f ${packageDir}/node_modules/typescript)
      nativePackage="@typescript/typescript-${stdenv.hostPlatform.node.platform}-${stdenv.hostPlatform.node.arch}"
      install -d $out/lib/${pname}/node_modules/@typescript
      cp -r "$typescriptDir" $out/lib/${pname}/node_modules/typescript
      cp -rL "$(dirname "$typescriptDir")/$nativePackage" $out/lib/${pname}/node_modules/@typescript/

      # pnpm's bookkeeping files and its `tsc` cmd-shim record the build
      # directory and a timestamp, so the same source built twice produced two
      # different outputs (`nix build --rebuild` says so). Nothing at run time
      # reads them, and the deploy's lockfile names a `patches/` directory that
      # is not part of the deploy.
      rm -rf $out/lib/${pname}/pnpm-lock.yaml \
             $out/lib/${pname}/pnpm-workspace.yaml \
             $out/lib/${pname}/node_modules/.modules.yaml \
             $out/lib/${pname}/node_modules/.pnpm-workspace-state-v1.json \
             $out/lib/${pname}/node_modules/typescript/node_modules

      runHook postInstall
    '';

    meta = {
      inherit (manifest) description;
      homepage = "https://github.com/systemfsoftware/systemfsoftware/tree/main/${packageDir}";
      license = lib.licenses.asl20;
      platforms = lib.platforms.unix;
    };
  };
in
stdenv.mkDerivation {
  inherit pname;
  version = manifest.version;

  dontUnpack = true;
  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall

    makeWrapper ${nodejs-slim_24}/bin/node $out/bin/${bin} \
      --add-flags ${deploy}/lib/${pname}/dist/bin.mjs

    runHook postInstall
  '';

  meta = {
    inherit (manifest) description;
    homepage = "https://github.com/systemfsoftware/systemfsoftware/tree/main/${packageDir}";
    license = lib.licenses.asl20;
    mainProgram = bin;
    platforms = lib.platforms.unix;
  };
}
