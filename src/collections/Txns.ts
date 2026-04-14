import type { CollectionConfig } from 'payload'

export const Txns: CollectionConfig = {
  slug: 'txns',
  admin: {
    useAsTitle: 'narration',
    defaultColumns: ['date', 'type', 'payee', 'narration'],
  },
  fields: [
    {
      name: 'date',
      type: 'date',
      required: true,
      index: true,
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Purchase', value: 'purchase' },
        { label: 'Refund', value: 'refund' },
        { label: 'Bill Payment', value: 'bill_payment' },
        { label: 'Cash Advance', value: 'cash_advance' },
        { label: 'Card Fee', value: 'card_fee' },
        { label: 'Fee Waiver', value: 'fee_waiver' },
        { label: 'Reward Earn', value: 'reward_earn' },
        { label: 'Pass Earn', value: 'pass_earn' },
        { label: 'Reward Clawback', value: 'reward_clawback' },
        { label: 'Reward Expiry', value: 'reward_expiry' },
        { label: 'Transfer', value: 'transfer' },
        { label: 'Redemption', value: 'redemption' },
        { label: 'EMI Conversion', value: 'emi_conversion' },
        { label: 'EMI Installment', value: 'emi_installment' },
        { label: 'Opening Balance', value: 'opening_balance' },
      ],
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
      name: 'postings',
      type: 'array',
      required: true,
      minRows: 2,
      fields: [
        {
          name: 'account',
          type: 'relationship',
          relationTo: 'accounts',
          required: true,
        },
        {
          name: 'amount',
          type: 'number',
          required: true,
        },
        {
          name: 'commodity',
          type: 'relationship',
          relationTo: 'commodities',
          required: true,
        },
        {
          name: 'priceTotalValue',
          type: 'number',
        },
        {
          name: 'priceCommodity',
          type: 'relationship',
          relationTo: 'commodities',
        },
        {
          name: 'metadata',
          type: 'json',
        },
      ],
    },
    {
      name: 'links',
      type: 'text',
      hasMany: true,
    },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'manual',
      options: [
        { label: 'Chat', value: 'chat' },
        { label: 'Email', value: 'email' },
        { label: 'Manual', value: 'manual' },
        { label: 'Import', value: 'import' },
      ],
    },
    {
      name: 'externalId',
      type: 'text',
      unique: true,
      index: true,
    },
  ],
}
