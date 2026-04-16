import type { CollectionConfig } from 'payload'
import { ValidationError } from 'payload'

const ADMIN_USER_ID = 1

export const Commodities: CollectionConfig = {
  slug: 'commodities',
  admin: {
    group: 'Directory',
    useAsTitle: 'code',
    defaultColumns: ['code', 'user', 'openDate'],
  },
  indexes: [{ fields: ['user', 'code'], unique: true }],
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false
      return {
        or: [{ user: { equals: null } }, { user: { equals: user.id } }],
      }
    },
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.id === ADMIN_USER_ID) return true
      return { user: { equals: user.id } }
    },
    delete: ({ req: { user } }) => {
      if (!user) return false
      if (user.id === ADMIN_USER_ID) return true
      return { user: { equals: user.id } }
    },
  },
  hooks: {
    beforeValidate: [
      async ({ data, req, operation, originalDoc }) => {
        if (!data) return data
        const isAdmin = req.user?.id === ADMIN_USER_ID
        if (operation === 'create' && req.user && !isAdmin) {
          data.user = req.user.id
        }
        if (operation === 'update' && originalDoc && !isAdmin) {
          data.user = originalDoc.user
        }

        if (data.code) {
          const userClause =
            data.user == null
              ? { user: { equals: null } }
              : { user: { equals: data.user } }
          const clauses: Array<Record<string, unknown>> = [
            userClause,
            { code: { equals: data.code } },
          ]
          if (operation === 'update' && originalDoc) {
            clauses.push({ id: { not_equals: originalDoc.id } })
          }
          const existing = await req.payload.find({
            collection: 'commodities',
            where: { and: clauses },
            limit: 1,
            overrideAccess: true,
            depth: 0,
          })
          if (existing.docs.length > 0) {
            const scope = data.user == null ? 'global' : 'user'
            throw new ValidationError({
              collection: 'commodities',
              errors: [
                { path: 'code', message: `Commodity "${data.code}" already exists (${scope})` },
              ],
            })
          }
        }

        return data
      },
    ],
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: {
        description: 'Owner. Null = global. Only admin can mutate globals.',
        position: 'sidebar',
      },
      access: {
        create: ({ req: { user } }) => user?.id === ADMIN_USER_ID,
        update: ({ req: { user } }) => user?.id === ADMIN_USER_ID,
      },
    },
    {
      name: 'code',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'openDate',
      type: 'date',
      required: true,
    },
    {
      name: 'metadata',
      type: 'json',
    },
  ],
}
