# tsconfig paths: never map the package's own published name

No tsconfig may map the package's own published name through
`compilerOptions.paths`. A self-name mapping is a shortcut that bypasses the
export map.

`paths` is honoured only by the tools that read that tsconfig, so the mapping
resolves source in some tools and `dist/` in others, and it silently stays
correct while the export map is wrong — the condition ordering, the publish map
and the subpath coverage are never exercised, and the next tool to be added
resolves the published name the published way and fails. Resolution belongs in
the package `exports` map.

Fix it by deleting the `paths` entry whose only job is the workspace self-name
and letting the export map's condition do the work.

```grit
language json
multifile {
  bubble($dir, $package) file($name, $body) where {
    $name <: r"(.*/)package\.json"($dir),
    $program <: contains `"name": $declared`,
    $declared <: r"\"(.*)\""($package)
  },
  bubble($dir, $key, $package) file($name, $body) where {
    $name <: r"(.*/)tsconfig[^/]*\.json"($config_dir),
    $config_dir <: $dir,
    $program <: contains `"paths": $paths`,
    $paths <: contains `$mapped: $target`,
    $mapped <: r"\"(.*)\""($key),
    $key <: $package
  }
}
```
