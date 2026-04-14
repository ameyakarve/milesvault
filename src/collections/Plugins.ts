import type { CollectionConfig } from 'payload'

export const Plugins: CollectionConfig = {
  slug: 'plugins',
  admin: {
    group: 'Config',
    useAsTitle: 'moduleName',
    defaultColumns: ['moduleName', 'configString'],
  },
  fields: [
    {
      name: 'moduleName',
      type: 'text',
      required: true,
    },
    {
      name: 'configString',
      type: 'text',
    },
  ],
}
