import type { CollectionConfig } from 'payload'
import { ValidationError } from 'payload'

const BALANCE_TOLERANCE = 0.005

type RawPosting = {
  account?: unknown
  amountNumber?: number | null
  amountCommodity?: unknown
  price?: {
    kind?: 'per_unit' | 'total' | null
    number?: number | null
    commodity?: unknown
  } | null
  cost?: {
    kind?: 'per_unit' | 'total' | null
    number?: number | null
    commodity?: unknown
  } | null
}

function postingWeight(p: RawPosting): { number: number; commodity: unknown } | null {
  if (p.amountNumber == null || p.amountCommodity == null) return null
  const priceOrCost = p.price?.number != null ? p.price : p.cost?.number != null ? p.cost : null
  if (priceOrCost?.kind === 'per_unit' && priceOrCost.number != null && priceOrCost.commodity != null) {
    return { number: p.amountNumber * priceOrCost.number, commodity: priceOrCost.commodity }
  }
  if (priceOrCost?.kind === 'total' && priceOrCost.number != null && priceOrCost.commodity != null) {
    const sign = p.amountNumber < 0 ? -1 : 1
    return { number: sign * priceOrCost.number, commodity: priceOrCost.commodity }
  }
  return { number: p.amountNumber, commodity: p.amountCommodity }
}

export const Txns: CollectionConfig = {
  slug: 'txns',
  admin: {
    group: 'Ledger',
    useAsTitle: 'narration',
    defaultColumns: ['date', 'flag', 'payee', 'narration', 'user'],
  },
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false
      return { user: { equals: user.id } }
    },
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => {
      if (!user) return false
      return { user: { equals: user.id } }
    },
    delete: ({ req: { user } }) => {
      if (!user) return false
      return { user: { equals: user.id } }
    },
  },
  hooks: {
    beforeValidate: [
      ({ data, req, operation, originalDoc }) => {
        if (!data) return data
        if (operation === 'create' && req.user) {
          data.user = req.user.id
        }
        if (operation === 'update' && originalDoc) {
          data.user = originalDoc.user
        }

        const postings = (data.postings as RawPosting[] | undefined) ?? []
        if (postings.length === 0) return data

        const sums = new Map<unknown, number>()
        const elided: RawPosting[] = []
        for (const p of postings) {
          const w = postingWeight(p)
          if (w == null) {
            elided.push(p)
            continue
          }
          sums.set(w.commodity, (sums.get(w.commodity) ?? 0) + w.number)
        }

        if (elided.length > 1) {
          throw new ValidationError({
            collection: 'txns',
            errors: [{ path: 'postings', message: 'At most one posting may have an elided amount' }],
          })
        }

        if (elided.length === 1) {
          const unbalanced = [...sums].filter(([, v]) => Math.abs(v) > BALANCE_TOLERANCE)
          if (unbalanced.length !== 1) {
            throw new ValidationError({
              collection: 'txns',
              errors: [
                {
                  path: 'postings',
                  message: `Cannot auto-balance elided posting: need exactly one unbalanced commodity, found ${unbalanced.length}`,
                },
              ],
            })
          }
          const [plugCcy, plugSum] = unbalanced[0]
          elided[0].amountNumber = -plugSum
          elided[0].amountCommodity = plugCcy
          sums.set(plugCcy, 0)
        }

        const stillUnbalanced = [...sums].filter(([, v]) => Math.abs(v) > BALANCE_TOLERANCE)
        if (stillUnbalanced.length > 0) {
          const detail = stillUnbalanced.map(([c, v]) => `${String(c)}=${v}`).join(', ')
          throw new ValidationError({
            collection: 'txns',
            errors: [{ path: 'postings', message: `Unbalanced transaction: ${detail}` }],
          })
        }

        return data
      },
    ],
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
      access: {
        create: () => false,
        update: () => false,
      },
    },
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
