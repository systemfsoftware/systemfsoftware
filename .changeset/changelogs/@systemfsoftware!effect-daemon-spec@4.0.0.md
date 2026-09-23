## 4.0.0

### Patch Changes

- A supervisor whose restart decision cannot read its own restart command now logs the error and cools down, the same as when its restart budget runs out. It used to die and take its children down with it.
