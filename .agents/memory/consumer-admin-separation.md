---
name: Consumer/admin separation
description: Project requirement for keeping the customer frontend unaware of administrative functionality.
---

Keep the Lance Cash consumer frontend free of administrative references, routes, imports, links, and UI. Administrative screens and client code belong only in the separate admin artifact.

**Why:** The user said consumers must never learn about the admin panel, including by inspecting or searching the frontend source.

**How to apply:** Put admin frontend work only in the admin artifact and its dedicated API client. Check the consumer source and production assets whenever changing frontend dependencies, routing, or shared code.
