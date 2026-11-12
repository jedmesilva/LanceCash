---
name: External database schema drift
description: Existing database objects that are not modeled by the app's current Drizzle schema.
---

The configured `DATABASE_URL` database contains `public.users.auth_user_id` and an `auth_sessions` table that are not modeled by the app's current Drizzle schema. The app's account flow uses `password_hash` and `user_sessions`.

**Why:** The database schema diverges from the current app, and the extra auth objects may contain data or support an older auth flow.

**How to apply:** Inspect database differences before schema pushes. Preserve unmodeled columns and tables, and ask before removing them until their purpose is confirmed.
