import type { CollectionConfig } from 'payload'

export const Accounts: CollectionConfig = {
  slug: 'accounts',
  admin: {
    group: 'Directory',
    useAsTitle: 'path',
    defaultColumns: ['path', 'type', 'openDate', 'closeDate'],
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
      name: 'openDate',
      type: 'date',
      required: true,
    },
    {
      name: 'closeDate',
      type: 'date',
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
