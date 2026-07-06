# Feature Modules

Feature folders reserve modular-monolith boundaries. UI and routes should call server-side feature entrypoints instead of mutating another feature's state directly.

Current reserved boundaries:

- `auth`
- `chat-trips`
- `admin`
- `knowledge`
- `retrieval`
- `search`
- `ai`
- `usage`
- `referrals`
- `audit`
- `feedback`
