import type { CollectionConfig } from 'payload'

export const Events: CollectionConfig = {
  slug: 'events',
  admin: {
    group: 'Records',
    useAsTitle: 'name',
    defaultColumns: ['date', 'name', 'value'],
  },
  fields: [
    {
      name: 'date',
      type: 'date',
      required: true,
      index: true,
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'value',
      type: 'text',
      required: true,
    },
    {
      name: 'metadata',
      type: 'json',
    },
  ],
}
