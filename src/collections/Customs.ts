import type { CollectionConfig } from 'payload'

export const Customs: CollectionConfig = {
  slug: 'customs',
  admin: {
    group: 'Records',
    useAsTitle: 'typeName',
    defaultColumns: ['date', 'typeName'],
  },
  fields: [
    {
      name: 'date',
      type: 'date',
      required: true,
      index: true,
    },
    {
      name: 'typeName',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'values',
      type: 'json',
      admin: {
        description: 'Array of typed values (string/date/bool/amount/number/account)',
      },
    },
    {
      name: 'metadata',
      type: 'json',
    },
  ],
}
