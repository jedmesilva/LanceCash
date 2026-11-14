---
name: Auction opening state
description: Product behavior for scheduled auctions and the first bid.
---

Scheduled auctions stay `upcoming` and display “Em breve”. When the current auction ends, the next one becomes `live` with zero bids and displays “Aberto”. The first bid is available immediately; it starts the 15-second countdown and automated bidding.

The database constraint requires timestamps for every `live` auction. For a live auction with zero bids, keep valid placeholder timestamps in the database, keep `nextBotAt` null, and do not advance or expire the auction until a manual first bid. Return `deadlineAt: null` to clients until that bid so the placeholder is not shown as a countdown. Later simulated bids must sometimes be scheduled beyond the 15-second deadline so an auction can close naturally.

**Why:** the user specified that the next auction should open for a first bid, while changing the existing database constraint would require a schema change.

**How to apply:** keep the scheduled/open/live labels, first-bid availability, countdown, and automated-bid timing consistent. Do not expose or enforce the placeholder deadline, and do not guarantee a simulated bid before every deadline.
