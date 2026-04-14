import type { CollectionConfig } from 'payload'

export const Options: CollectionConfig = {
  slug: 'options',
  admin: {
    group: 'Config',
    useAsTitle: 'name',
    defaultColumns: ['name', 'value'],
  },
  fields: [
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
  ],
}
