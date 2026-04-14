import type { CollectionConfig } from 'payload'

export const Prices: CollectionConfig = {
  slug: 'prices',
  admin: {
    group: 'Ledger',
    defaultColumns: ['date', 'base', 'amountNumber', 'amountCommodity'],
  },
  fields: [
    {
      name: 'date',
      type: 'date',
      required: true,
      index: true,
    },
    {
      name: 'base',
      type: 'relationship',
      relationTo: 'commodities',
      required: true,
    },
    {
      name: 'amountNumber',
      type: 'number',
      required: true,
    },
    {
      name: 'amountCommodity',
      type: 'relationship',
      relationTo: 'commodities',
      required: true,
    },
    {
      name: 'metadata',
      type: 'json',
    },
  ],
}
