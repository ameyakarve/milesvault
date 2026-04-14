import type { CollectionConfig } from 'payload'

export const Notes: CollectionConfig = {
  slug: 'notes',
  admin: {
    group: 'Records',
    useAsTitle: 'description',
    defaultColumns: ['date', 'account', 'description'],
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
      name: 'description',
      type: 'text',
      required: true,
    },
    {
      name: 'metadata',
      type: 'json',
    },
  ],
}
