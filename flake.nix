{
  description = "T3 Code with Base16 backgrounds — desktop app built from this fork";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      forSystem = system: import nixpkgs { inherit system; };
      # Route pnpm through corepack so the packageManager pin
      # (pnpm@11.10.0) is honored without chasing nixpkgs versions.
      # First run downloads pnpm into ~/.cache/node/corepack.
      pnpmPinned = pkgs: pkgs.writeShellScriptBin "pnpm" ''
        exec ${pkgs.nodejs_24}/bin/corepack pnpm "$@"
      '';
      # Native toolchain for node-gyp prebuilds (node-pty). NixOS has no
      # system compiler, so without these pty.node never gets built.
      nativeBuildTools = pkgs: [
        pkgs.python3
        pkgs.gnumake
        pkgs.stdenv.cc
        pkgs.pkg-config
      ];
      t3codeForkFor = pkgs:
        let
          # `self` is already the clean flake source (gitignored files out,
          # intent-to-add files in); re-wrap it so it carries the `.name`
          # resource-monitor.nix reads off the source.
          forkSrc = builtins.path {
            path = self;
            name = "t3code-fork";
          };
          unwrapped = pkgs.t3code.passthru.unwrapped.overrideAttrs (old: {
            src = forkSrc;
            # This fork's tree builds the Linux browser-import helper,
            # which needs libsecret headers at compile time.
            nativeBuildInputs = (old.nativeBuildInputs or [ ]) ++ [ pkgs.pkg-config ];
            buildInputs = (old.buildInputs or [ ]) ++ [ pkgs.libsecret ];
            pnpmDeps = pkgs.fetchPnpmDeps {
              pnpm = pkgs.pnpm_11;
              inherit (old) pname version;
              src = forkSrc;
              pnpmWorkspaces = [
                "@t3tools/monorepo"
                "t3..."
                "@t3tools/desktop..."
                "@t3tools/scripts..."
              ];
              fetcherVersion = 4;
              hash = "sha256-EO844JyOlqtUG+mGWOeXlVtQjRpFFgwiXRvTgfEh7ao=";
            };
          });
        in
        # The resource-monitor sidecar is an unrelated Rust binary; reuse the
        # stock one instead of rebuilding it (its vendored cargo hash is
        # pinned to the upstream source).
        pkgs.t3code.override {
          t3code-unwrapped = unwrapped;
          t3code-resource-monitor = pkgs.t3code.passthru.resourceMonitor;
          # The stock wrapper already puts its `git` input on PATH for both
          # the CLI and desktop-spawned server. Add Pywal to that same runtime
          # path so wallpaper palette generation also works in `nix run`.
          git = pkgs.symlinkJoin {
            name = "t3code-git-with-pywal";
            paths = [ pkgs.git pkgs.pywal16 ];
          };
        };
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = forSystem system;
        in
        {
          default = pkgs.mkShell {
            name = "t3code-dithered";
            packages = [
              pkgs.nodejs_24
              pkgs.pywal16
              (pnpmPinned pkgs)
            ] ++ nativeBuildTools pkgs;
          };
        }
      );

      # The desktop app (Electron), built from this fork with the nixpkgs
      # recipe. `nix run` launches it.
      packages = forAllSystems (system: {
        default = t3codeForkFor (forSystem system);
      });

      apps = forAllSystems (
        system:
        let
          pkgs = forSystem system;
        in
        {
          default = {
            type = "app";
            program = pkgs.lib.getExe (t3codeForkFor pkgs);
          };
          # Contributor flow: install deps, boot the dev servers.
          # Extra args are forwarded, e.g. `nix run .#dev -- --share`.
          dev = {
            type = "app";
            program = pkgs.lib.getExe (
              pkgs.writeShellApplication {
                name = "t3code-dithered-dev";
                runtimeInputs = [
                  pkgs.nodejs_24
                  pkgs.pywal16
                  (pnpmPinned pkgs)
                ] ++ nativeBuildTools pkgs;
                text = ''
                  pnpm install
                  exec pnpm exec vp run dev "$@"
                '';
              }
            );
          };
        }
      );
    };
}
