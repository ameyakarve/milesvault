import type { CollectionConfig } from 'payload'

export const Includes: CollectionConfig = {
  slug: 'includes',
  admin: {
    group: 'Config',
    useAsTitle: 'filename',
  },
  fields: [
    {
      name: 'filename',
      type: 'text',
      required: true,
    },
  ],
}
