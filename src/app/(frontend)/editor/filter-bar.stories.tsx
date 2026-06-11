import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { JournalFilterBar, type JournalFilter } from './journal-filter-bar'

const meta: Meta = { title: 'Editor/FilterBar' }
export default meta

function Demo() {
  const [filter, setFilter] = useState<JournalFilter>({ account: null, date: null })
  return (
    <div className="h-[500px] bg-background p-4">
      <JournalFilterBar
        accounts={[
          'Assets:Bank:HDFC',
          'Assets:Rewards:Axis',
          'Expenses:Food:Restaurants',
          'Liabilities:CreditCards:Axis:MagnusBurgundy',
        ]}
        filter={filter}
        onChange={setFilter}
      />
    </div>
  )
}

export const Default: StoryObj = { render: () => <Demo /> }
