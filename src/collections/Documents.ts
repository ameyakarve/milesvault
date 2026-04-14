import type { CollectionConfig } from 'payload'

export const Documents: CollectionConfig = {
  slug: 'documents',
  admin: {
    group: 'Records',
    useAsTitle: 'path',
    defaultColumns: ['date', 'account', 'path'],
  },
  fields: [
    {
      name: 'date',
      type: 'date',
      required: true,
      index: true,
    },
    {
      name: 'account',
      type: 'relationship',
      relationTo: 'accounts',
      required: true,
    },
    {
      name: 'path',
      type: 'text',
      required: true,
    },
    {
      name: 'metadata',
      type: 'json',
    },
  ],
}
