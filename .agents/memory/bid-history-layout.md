---
name: Responsive bid history
description: Product expectation for the live auction bid list on screens of different heights.
---

The bid history belongs in normal page flow so users scroll the whole page vertically; the header stays at the top and the bid CTA stays pinned at the bottom. The auction carousel remains horizontal. A response page size must not be treated as a total display limit: load older pages as the user approaches the end of the history, and load enough to avoid leaving a short initial list in a tall viewport.

**Why:** The user expects whole-page vertical scrolling rather than a nested scroll limited to the bids section, while keeping the header and bid action available.

**How to apply:** Preserve page-level vertical scroll, a pinned header and bid CTA, horizontal auction swipes, and paginated history loading when changing bid history or responsive layout.
