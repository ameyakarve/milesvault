import type { CollectionConfig } from 'payload'
import { ValidationError } from 'payload'

export const Accounts: CollectionConfig = {
  slug: 'accounts',
  admin: {
    group: 'Directory',
    useAsTitle: 'path',
    defaultColumns: ['path', 'type', 'user', 'openDate', 'closeDate'],
  },
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
      async ({ data, req, operation, originalDoc }) => {
        if (!data) return data
        if (operation === 'create' && req.user) {
          data.user = req.user.id
        }
        if (operation === 'update' && originalDoc) {
          data.user = originalDoc.user
        }

        if (data.path && data.user != null) {
          const clauses: Array<Record<string, unknown>> = [
            { user: { equals: data.user } },
            { path: { equals: data.path } },
          ]
          if (operation === 'update' && originalDoc) {
            clauses.push({ id: { not_equals: originalDoc.id } })
          }
          const existing = await req.payload.find({
            collection: 'accounts',
            where: { and: clauses },
            limit: 1,
            overrideAccess: true,
            depth: 0,
          })
          if (existing.docs.length > 0) {
            throw new ValidationError({
              collection: 'accounts',
              errors: [{ path: 'path', message: `Account "${data.path}" already exists` }],
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
