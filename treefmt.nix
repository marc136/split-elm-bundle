{ pkgs, ... }: {
  # Used to find the project root
  projectRootFile = "flake.nix";

  programs.nixfmt.enable = true;

  programs.biome.enable = true;
  programs.biome.includes = [ "{bin,src}/**/*.{js,mjs,ts}" ];
  programs.biome.settings.formatter.indentStyle = "space";
  programs.biome.settings.formatter.indentWidth = 4;
  programs.biome.settings.formatter.lineWidth = 100;
  programs.biome.settings.javascript.formatter.quoteStyle = "single";
  programs.biome.settings.javascript.formatter.semicolons = "asNeeded";
  programs.biome.settings.javascript.formatter.arrowParentheses = "asNeeded";
}
