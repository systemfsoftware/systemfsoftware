# @systemfsoftware/registry-gate-canary

The package `.github/workflows/registry-gate.yml` publishes to GitHub Packages, installs with a GitHub App installation token, and then deletes. It holds no code anyone should depend on.

Each run publishes `0.0.1-gate.<run id>.0`. The version is deleted when the run ends, and the run summary records the deletion.
