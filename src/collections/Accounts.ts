import type { CollectionConfig } from 'payload'

export const Accounts: CollectionConfig = {
  slug: 'accounts',
  admin: {
    useAsTitle: 'path',
    defaultColumns: ['path', 'type', 'defaultCommodity', 'openDate'],
  },
  fields: [
    {
      name: 'path',
      type: 'text',
      required: true,
      unique: true,
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
      name: 'defaultCommodity',
      type: 'relationship',
      relationTo: 'commodities',
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
      name: 'metadata',
      type: 'json',
    },
  ],
}
