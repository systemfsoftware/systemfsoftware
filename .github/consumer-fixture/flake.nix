{
  description = "Consumer fixture for systemfsoftware's reusable nix workflow";

  outputs = { self }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forEachSystem = f: builtins.listToAttrs (map (system: { name = system; value = f system; }) systems);
    in
    {
      checks = forEachSystem (system: {
        answer = derivation {
          name = "consumer-fixture-answer";
          inherit system;
          builder = "/bin/sh";
          args = [ "-c" "echo 42 > $out" ];
        };
      });
    };
}
