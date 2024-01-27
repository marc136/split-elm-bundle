{
  inputs.treefmt-nix.url = "github:numtide/treefmt-nix";

  outputs = { self, nixpkgs, systems, treefmt-nix }:
    let
      # Small tool to iterate over each systems
      eachSystem = f:
        nixpkgs.lib.genAttrs (import systems)
        (system: f nixpkgs.legacyPackages.${system});

      # Eval the treefmt modules from ./treefmt.nix
      treefmtEval =
        eachSystem (pkgs: treefmt-nix.lib.evalModule pkgs ./treefmt.nix);
    in {
      # for `nix fmt`
      formatter =
        eachSystem (pkgs: treefmtEval.${pkgs.system}.config.build.wrapper);
      # for `nix flake check`
      checks = eachSystem (pkgs: {
        formatting = treefmtEval.${pkgs.system}.config.build.check self;
      });
    };
}
