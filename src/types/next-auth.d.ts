// Identity surface (docs/design/discord-identity.md). The Discord snowflake is
// the primary id; `key` is the resolved per-user Durable Object storage key
// (snowflake for new users, legacy email for the migrated ~30). `email` is an
// optional attribute (Discord email is nullable) — never an identity key.
import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string // Discord snowflake (uid) — primary identity
      key: string // per-user DO storage key (idFromName)
      email?: string | null
      name?: string | null
      image?: string | null
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string // Discord snowflake
    key?: string // per-user DO storage key
  }
}
