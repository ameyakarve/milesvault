import type { CollectionConfig } from 'payload'

export const Txns: CollectionConfig = {
  slug: 'txns',
  admin: {
    group: 'Ledger',
    useAsTitle: 'narration',
    defaultColumns: ['date', 'flag', 'payee', 'narration'],
  },
  fields: [
    {
      name: 'date',
      type: 'date',
      required: true,
      index: true,
    },
    {
      name: 'flag',
      type: 'text',
      required: true,
      defaultValue: '*',
      maxLength: 1,
      admin: {
        description: 'Single char. * cleared, ! pending, P pad-generated, or custom',
      },
    },
    {
      name: 'payee',
      type: 'text',
    },
    {
      name: 'narration',
      type: 'text',
    },
    {
      name: 'tags',
      type: 'text',
      hasMany: true,
    },
    {
      name: 'links',
      type: 'text',
      hasMany: true,
      index: true,
    },
    {
      name: 'metadata',
      type: 'json',
    },
    {
      name: 'postings',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        {
          name: 'flag',
          type: 'text',
          maxLength: 1,
          admin: {
            description: 'Optional per-posting flag',
          },
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
        },
        {
          name: 'amountCommodity',
          type: 'relationship',
          relationTo: 'commodities',
        },
        {
          name: 'cost',
          type: 'group',
          fields: [
            {
              name: 'kind',
              type: 'select',
              options: [
                { label: 'Per unit {}', value: 'per_unit' },
                { label: 'Total {{}}', value: 'total' },
              ],
            },
            { name: 'number', type: 'number' },
            {
              name: 'commodity',
              type: 'relationship',
              relationTo: 'commodities',
            },
            { name: 'date', type: 'date' },
            { name: 'label', type: 'text' },
          ],
        },
        {
          name: 'price',
          type: 'group',
          fields: [
            {
              name: 'kind',
              type: 'select',
              options: [
                { label: 'Per unit @', value: 'per_unit' },
                { label: 'Total @@', value: 'total' },
              ],
            },
            { name: 'number', type: 'number' },
            {
              name: 'commodity',
              type: 'relationship',
              relationTo: 'commodities',
            },
          ],
        },
        {
          name: 'metadata',
          type: 'json',
        },
      ],
    },
  ],
}
