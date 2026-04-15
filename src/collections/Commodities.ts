import type { CollectionConfig } from 'payload'

const ADMIN_USER_ID = 1

export const Commodities: CollectionConfig = {
  slug: 'commodities',
  admin: {
    group: 'Directory',
    useAsTitle: 'code',
    defaultColumns: ['code', 'user', 'openDate'],
  },
  // TODO: duplicate (user, code) surfaces as HTTP 500 because the DB unique
  // violation isn't translated to a ValidationError. Add a beforeValidate
  // hook that pre-checks and throws a friendly error.
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
      ({ data, req, operation, originalDoc }) => {
        if (!data) return data
        const isAdmin = req.user?.id === ADMIN_USER_ID
        if (operation === 'create' && req.user && !isAdmin) {
          data.user = req.user.id
        }
        if (operation === 'update' && originalDoc && !isAdmin) {
          data.user = originalDoc.user
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
