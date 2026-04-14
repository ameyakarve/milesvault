import type { CollectionConfig } from 'payload'

export const Balances: CollectionConfig = {
  slug: 'balances',
  admin: {
    group: 'Ledger',
    defaultColumns: ['date', 'account', 'amountNumber', 'amountCommodity'],
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
      name: 'tolerance',
      type: 'number',
    },
    {
      name: 'metadata',
      type: 'json',
    },
  ],
}
