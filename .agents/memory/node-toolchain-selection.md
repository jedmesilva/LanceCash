---
name: Node toolchain selection
description: Why newer Node modules may not be used by pnpm-driven scripts.
---

The workspace runtime configuration can pin Node 20, and the installed pnpm wrapper may use an absolute Node 20 interpreter. Installing Node 24 alone may therefore leave pnpm scripts on Node 20.

**Why:** tooling such as Orval can require Node APIs that are unavailable in the configured runtime, even when a newer runtime has been installed.

**How to apply:** verify the version through the same pnpm command that will run the tool. If it is still Node 20, explicitly invoke pnpm with Node 24 and put Node 24 first on `PATH`, or update the workspace runtime when a lasting version change is intended.
