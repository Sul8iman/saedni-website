---
name: GitHub connector release flow
description: Reliable authenticated GitHub release publishing without exposing repository credentials.
---

When a release must go through the connected GitHub integration, create a normal branch commit with the Git Data API, open a pull request, and merge it normally. Build the tree from the current remote base and apply an explicit allowlist so workspace-only reports, attachments, temporary output, and agent memory never enter the release.

**Why:** The connector exposes authenticated REST access rather than a direct git transport, and repository snapshots can contain tracked workspace artifacts that should not be shipped.

**How to apply:** Prepare and read the workspace file set outside the authenticated connector callback, then send blobs, a tree, a commit, a branch ref, and a PR through the connector. Treat zero-byte tracked files as valid empty content when the workspace reader reports them as not found.