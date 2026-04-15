import type { CollectionConfig } from 'payload'

export const Accounts: CollectionConfig = {
  slug: 'accounts',
  admin: {
    group: 'Directory',
    useAsTitle: 'path',
    defaultColumns: ['path', 'type', 'user', 'openDate', 'closeDate'],
  },
  // TODO: duplicate (user, path) surfaces as HTTP 500 because the DB unique
  // violation isn't translated to a ValidationError. Add a beforeValidate
  // hook that pre-checks and throws a friendly error.
  indexes: [{ fields: ['user', 'path'], unique: true }],
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false
      return { user: { equals: user.id } }
    },
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => {
      if (!user) return false
      return { user: { equals: user.id } }
    },
    delete: ({ req: { user } }) => {
      if (!user) return false
      return { user: { equals: user.id } }
    },
  },
  hooks: {
    beforeValidate: [
      ({ data, req, operation, originalDoc }) => {
        if (!data) return data
        if (operation === 'create' && req.user) {
          data.user = req.user.id
        }
        if (operation === 'update' && originalDoc) {
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
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
      access: {
        create: () => false,
        update: () => false,
      },
    },
    {
      name: 'path',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Assets', value: 'Assets' },
        { label: 'Liabilities', value: 'Liabilities' },
        { label: 'Income', value: 'Income' },
        { label: 'Expenses', value: 'Expenses' },
        { label: 'Equity', value: 'Equity' },
      ],
    },
    {
      name: 'openDate',
      type: 'date',
      required: true,
    },
    {
      name: 'closeDate',
      type: 'date',
    },
    {
      name: 'homeCommodity',
      type: 'relationship',
      relationTo: 'commodities',
      admin: {
        description:
          'Native commodity for this account. For credit cards, postings in other commodities trigger forex conversion.',
      },
    },
    {
      name: 'constraintCommodities',
      type: 'relationship',
      relationTo: 'commodities',
      hasMany: true,
    },
    {
      name: 'bookingMethod',
      type: 'select',
      defaultValue: 'STRICT',
      options: [
        { label: 'STRICT', value: 'STRICT' },
        { label: 'STRICT_WITH_SIZE', value: 'STRICT_WITH_SIZE' },
        { label: 'NONE', value: 'NONE' },
        { label: 'FIFO', value: 'FIFO' },
        { label: 'LIFO', value: 'LIFO' },
        { label: 'AVERAGE', value: 'AVERAGE' },
        { label: 'HISTORICAL', value: 'HISTORICAL' },
      ],
    },
    {
      name: 'metadata',
      type: 'json',
    },
  ],
}
