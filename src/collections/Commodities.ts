import type { CollectionConfig } from 'payload'

export const Commodities: CollectionConfig = {
  slug: 'commodities',
  admin: {
    group: 'Directory',
    useAsTitle: 'code',
    defaultColumns: ['code', 'openDate'],
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
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
