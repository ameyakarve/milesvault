import type { CollectionConfig } from 'payload'

export const Commodities: CollectionConfig = {
  slug: 'commodities',
  admin: {
    useAsTitle: 'code',
    defaultColumns: ['code', 'name', 'kind', 'issuer'],
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
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: [
        { label: 'Currency', value: 'currency' },
        { label: 'Points', value: 'points' },
        { label: 'Miles', value: 'miles' },
        { label: 'Pass', value: 'pass' },
      ],
    },
    {
      name: 'issuer',
      type: 'text',
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}
