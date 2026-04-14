import type { CollectionConfig } from 'payload'

export const Queries: CollectionConfig = {
  slug: 'queries',
  admin: {
    group: 'Records',
    useAsTitle: 'name',
    defaultColumns: ['date', 'name'],
  },
  fields: [
    {
      name: 'date',
      type: 'date',
      required: true,
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'sql',
      type: 'textarea',
      required: true,
      admin: {
        description: 'Beancount Query Language (BQL)',
      },
    },
    {
      name: 'metadata',
      type: 'json',
    },
  ],
}
