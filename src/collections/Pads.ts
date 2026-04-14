import type { CollectionConfig } from 'payload'

export const Pads: CollectionConfig = {
  slug: 'pads',
  admin: {
    group: 'Ledger',
    defaultColumns: ['date', 'account', 'accountPad'],
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
      name: 'accountPad',
      type: 'relationship',
      relationTo: 'accounts',
      required: true,
    },
    {
      name: 'metadata',
      type: 'json',
    },
  ],
}
