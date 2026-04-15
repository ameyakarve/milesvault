import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'

afterEach(() => cleanup())

import { TxnFormView } from '@/app/(frontend)/chat/txn-form-view'

function Harness({
  initial,
  accounts,
}: {
  initial: string
  accounts?: Record<string, string>
}) {
  const [text, setText] = useState(initial)
  return (
    <>
      <TxnFormView text={text} onChange={setText} homeCommodityByAccount={accounts} />
      <pre data-testid="text">{text}</pre>
    </>
  )
}

const INITIAL = `2026-04-14 * "Amudham" "Team dinner" ^dinner-amudham
  Expenses:Food:Dining           1500 INR
  Liabilities:CC:HDFC:Infinia   -1500 INR`

function getText(): string {
  return screen.getByTestId('text').textContent ?? ''
}

function rsValue(container: ParentNode, classPrefix: string): string | null {
  return container.querySelector(`.${classPrefix}__single-value`)?.textContent ?? null
}

function rsTypeAndCommit(input: HTMLElement, typed: string) {
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: typed } })
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
}

function rsOpenMenu(input: HTMLElement) {
  fireEvent.focus(input)
  fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' })
}

describe('TxnFormView round-trip', () => {
  it('edits payee', () => {
    render(<Harness initial={INITIAL} />)
    const input = screen.getByDisplayValue('Amudham') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Farzi Cafe' } })
    fireEvent.blur(input)
    expect(getText()).toContain('"Farzi Cafe"')
    expect(getText()).not.toContain('"Amudham"')
  })

  it('edits notes (narration)', () => {
    render(<Harness initial={INITIAL} />)
    const input = screen.getByDisplayValue('Team dinner') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Offsite dinner' } })
    fireEvent.blur(input)
    expect(getText()).toContain('"Offsite dinner"')
    expect(getText()).not.toContain('"Team dinner"')
  })

  it('edits link', () => {
    render(<Harness initial={INITIAL} />)
    const input = screen.getByDisplayValue('dinner-amudham') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'dinner-offsite-q2' } })
    fireEvent.blur(input)
    expect(getText()).toContain('^dinner-offsite-q2')
    expect(getText()).not.toContain('^dinner-amudham')
  })

  it('edits date', () => {
    render(<Harness initial={INITIAL} />)
    const input = screen.getByDisplayValue('2026-04-14') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2026-04-20' } })
    expect(getText()).toMatch(/^2026-04-20/)
    expect(getText()).not.toContain('2026-04-14')
  })

  it('edits an expense amount', () => {
    render(<Harness initial={INITIAL} />)
    const inputs = screen.getAllByDisplayValue('1,500.00') as HTMLInputElement[]
    expect(inputs.length).toBe(2)
    fireEvent.change(inputs[0], { target: { value: '2000' } })
    fireEvent.blur(inputs[0])
    expect(getText()).toMatch(/Expenses:Food:Dining[^\n]*2000/)
  })

  it('edits a cc-spend amount (stored negative)', () => {
    render(<Harness initial={INITIAL} />)
    const inputs = screen.getAllByDisplayValue('1,500.00') as HTMLInputElement[]
    expect(inputs.length).toBe(2)
    fireEvent.change(inputs[1], { target: { value: '2000' } })
    fireEvent.blur(inputs[1])
    expect(getText()).toMatch(/Liabilities:CC:HDFC:Infinia[^\n]*-2000/)
  })

  it('sequential edits compose', () => {
    render(<Harness initial={INITIAL} />)

    const payee = screen.getByDisplayValue('Amudham') as HTMLInputElement
    fireEvent.change(payee, { target: { value: 'Farzi Cafe' } })
    fireEvent.blur(payee)

    const notes = screen.getByDisplayValue('Team dinner') as HTMLInputElement
    fireEvent.change(notes, { target: { value: 'Offsite dinner' } })
    fireEvent.blur(notes)

    const link = screen.getByDisplayValue('dinner-amudham') as HTMLInputElement
    fireEvent.change(link, { target: { value: 'dinner-offsite-q2' } })
    fireEvent.blur(link)

    const text = getText()
    expect(text).toContain('"Farzi Cafe"')
    expect(text).toContain('"Offsite dinner"')
    expect(text).toContain('^dinner-offsite-q2')
  })

  it('toggles flag from cleared to pending', () => {
    render(<Harness initial={INITIAL} />)
    const pendingBtn = screen.getByRole('radio', { name: /pending/i })
    expect(pendingBtn).toHaveProperty('ariaChecked', 'false')
    fireEvent.click(pendingBtn)
    expect(getText()).toMatch(/^2026-04-14 ! /)
    expect(getText()).not.toMatch(/^2026-04-14 \* /)
  })

  it('toggles flag from pending back to cleared', () => {
    const pending = INITIAL.replace('2026-04-14 *', '2026-04-14 !')
    render(<Harness initial={pending} />)
    const clearedBtn = screen.getByRole('radio', { name: /cleared/i })
    expect(clearedBtn).toHaveProperty('ariaChecked', 'false')
    fireEvent.click(clearedBtn)
    expect(getText()).toMatch(/^2026-04-14 \* /)
    expect(getText()).not.toMatch(/^2026-04-14 ! /)
  })

  it('clicking already-active flag is a no-op', () => {
    render(<Harness initial={INITIAL} />)
    const clearedBtn = screen.getByRole('radio', { name: /cleared/i })
    expect(clearedBtn).toHaveProperty('ariaChecked', 'true')
    const before = getText()
    fireEvent.click(clearedBtn)
    expect(getText()).toBe(before)
  })

  it('preserves original text shape on parse round-trip (no edits)', () => {
    render(<Harness initial={INITIAL} />)
    const text = getText()
    expect(text).toContain('2026-04-14')
    expect(text).toContain('"Amudham"')
    expect(text).toContain('"Team dinner"')
    expect(text).toContain('^dinner-amudham')
    expect(text).toContain('Expenses:Food:Dining')
    expect(text).toContain('Liabilities:CC:HDFC:Infinia')
  })
})

describe('TxnFormView required field validation', () => {
  it('rejects empty narration commit and reverts', () => {
    render(<Harness initial={INITIAL} />)
    const input = screen.getByDisplayValue('Team dinner') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(getText()).toContain('"Team dinner"')
    expect(input.value).toBe('Team dinner')
  })

  it('shows error state when initial narration is empty', () => {
    const empty = INITIAL.replace('"Team dinner"', '""')
    render(<Harness initial={empty} />)
    const narration = screen.getByPlaceholderText(/describe this transaction/i)
    expect(narration.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText(/Notes is required/i)).toBeTruthy()
  })

  it('rejects empty payee commit and reverts', () => {
    render(<Harness initial={INITIAL} />)
    const input = screen.getByDisplayValue('Amudham') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(getText()).toContain('"Amudham"')
    expect(input.value).toBe('Amudham')
  })
})

describe('TxnFormView posting add/remove/currency', () => {
  it('edits posting currency', () => {
    render(<Harness initial={INITIAL} />)
    const currencyInputs = screen.getAllByLabelText('Currency') as HTMLInputElement[]
    expect(currencyInputs.length).toBeGreaterThan(0)
    rsTypeAndCommit(currencyInputs[0], 'USD')
    expect(getText()).toMatch(/Expenses:Food:Dining[^\n]*USD/)
  })

  it('adds a new generic posting via menu', () => {
    render(<Harness initial={INITIAL} />)
    fireEvent.click(screen.getByRole('button', { name: /add posting/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /generic/i }))
    expect(getText()).toContain('Assets:Todo')
  })

  it('added generic posting inherits currency from existing postings', () => {
    render(<Harness initial={INITIAL} />)
    fireEvent.click(screen.getByRole('button', { name: /add posting/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /generic/i }))
    expect(getText()).toMatch(/Assets:Todo[^\n]*INR/)
  })

  it('remove button is visible but disabled when only two postings', () => {
    render(<Harness initial={INITIAL} />)
    const removeBtns = screen.getAllByRole('button', {
      name: /remove posting/i,
    }) as HTMLButtonElement[]
    expect(removeBtns.length).toBe(2)
    for (const btn of removeBtns) expect(btn.disabled).toBe(true)
  })

  it('removes a posting when there are more than two', () => {
    const threePostings = `2026-04-14 * "Amudham" "Team dinner" ^dinner-amudham
  Expenses:Food:Dining           1000 INR
  Expenses:Food:Tips              500 INR
  Liabilities:CC:HDFC:Infinia   -1500 INR`
    render(<Harness initial={threePostings} />)
    const removeBtns = screen.getAllByRole('button', { name: /remove posting/i })
    expect(removeBtns.length).toBe(3)
    fireEvent.click(removeBtns[1])
    expect(getText()).not.toContain('Expenses:Food:Tips')
    expect(getText()).toContain('Expenses:Food:Dining')
    expect(getText()).toContain('Liabilities:CC:HDFC:Infinia')
  })

  it('currency dropdown lists common defaults', () => {
    render(<Harness initial={INITIAL} />)
    const currencyInputs = screen.getAllByLabelText('Currency') as HTMLInputElement[]
    rsOpenMenu(currencyInputs[0])
    const options = screen.getAllByRole('option')
    const labels = options.map((o) => o.textContent)
    expect(labels).toContain('USD')
    expect(labels).toContain('EUR')
    expect(labels).toContain('INR')
  })
})

describe('TxnFormView typed posting views', () => {
  it('classifies Expenses leg as an expense card', () => {
    const { container } = render(<Harness initial={INITIAL} />)
    const card = container.querySelector('[data-posting-type="expense"]')
    expect(card).toBeTruthy()
    expect(rsValue(card!, 'rs-account')).toBe('Food:Dining')
  })

  it('classifies Liabilities:CC leg as a cc-spend card', () => {
    const { container } = render(<Harness initial={INITIAL} />)
    const card = container.querySelector('[data-posting-type="cc-spend"]')
    expect(card).toBeTruthy()
    expect(rsValue(card!, 'rs-account')).toBe('HDFC:Infinia')
  })

  it('cc-spend amount is displayed as positive (abs) even though stored negative', () => {
    render(<Harness initial={INITIAL} />)
    const inputs = screen.getAllByDisplayValue('1,500.00') as HTMLInputElement[]
    expect(inputs.length).toBe(2)
  })

  it('adds an Expense via menu with Expenses:Todo placeholder', () => {
    render(<Harness initial={INITIAL} />)
    fireEvent.click(screen.getByRole('button', { name: /add posting/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^expense$/i }))
    expect(getText()).toContain('Expenses:Todo')
  })

  it('adds a CC Spend via menu with Liabilities:CC:Todo placeholder', () => {
    render(<Harness initial={INITIAL} />)
    fireEvent.click(screen.getByRole('button', { name: /add posting/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /cc spend/i }))
    expect(getText()).toContain('Liabilities:CC:Todo')
  })

  it('adds a Reward Earn via menu with both Assets and Income legs', () => {
    render(<Harness initial={INITIAL} />)
    fireEvent.click(screen.getByRole('button', { name: /add posting/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /reward earn/i }))
    expect(getText()).toContain('Assets:Rewards:Todo')
    expect(getText()).toContain('Income:Rewards:Todo')
  })

  it('edits expense account via combobox, auto-prefixing', () => {
    render(<Harness initial={INITIAL} />)
    const input = screen.getByLabelText('Category') as HTMLInputElement
    rsTypeAndCommit(input, 'Travel:Flights')
    expect(getText()).toContain('Expenses:Travel:Flights')
    expect(getText()).not.toContain('Expenses:Food:Dining')
  })

  it('existing accounts are offered as options in their respective menus', () => {
    const multi = `2026-04-14 * "Amudham" "Team dinner" ^dinner-amudham
  Expenses:Food:Dining           1000 INR
  Expenses:Travel:Cab             500 INR
  Liabilities:CC:HDFC:Infinia   -1500 INR`
    render(<Harness initial={multi} />)

    const categoryInputs = screen.getAllByLabelText('Category') as HTMLInputElement[]
    rsOpenMenu(categoryInputs[0])
    let options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toContain('Food:Dining')
    expect(options).toContain('Travel:Cab')

    fireEvent.keyDown(categoryInputs[0], { key: 'Escape', code: 'Escape' })

    const cardInput = screen.getByLabelText('Card') as HTMLInputElement
    rsOpenMenu(cardInput)
    options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toContain('HDFC:Infinia')
  })

  it('cancel button closes the add-posting menu without adding', () => {
    render(<Harness initial={INITIAL} />)
    fireEvent.click(screen.getByRole('button', { name: /add posting/i }))
    const before = getText()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(getText()).toBe(before)
    expect(screen.queryByRole('menuitem', { name: /^expense$/i })).toBeNull()
  })
})

describe('TxnFormView forex strip', () => {
  const INR_CARD = { 'Liabilities:CC:HDFC:Infinia': 'INR' }

  const FOREX = `2026-04-14 * "Starbucks SFO" "Airport coffee" ^sfo-coffee
  Expenses:Food:Dining         100 USD
  Liabilities:CC:HDFC:Infinia -100 USD`

  it('renders forex strip when cc leg currency ≠ card home currency', () => {
    const { container } = render(<Harness initial={FOREX} accounts={INR_CARD} />)
    const cc = container.querySelector('[data-posting-type="cc-spend"]')
    expect(cc).toBeTruthy()
    const strip = cc?.querySelector('[data-testid="forex-strip"]')
    expect(strip).toBeTruthy()
    const text = strip?.textContent || ''
    expect(text).toMatch(/100\.00/)
    expect(text).toMatch(/USD/)
    expect(text).toMatch(/INR/)
  })

  it('does NOT render forex strip when cc leg currency matches card home currency', () => {
    const { container } = render(<Harness initial={INITIAL} accounts={INR_CARD} />)
    expect(container.querySelector('[data-testid="forex-strip"]')).toBeNull()
  })

  it('does NOT render forex strip when no homeCommodity is known for the card', () => {
    const { container } = render(<Harness initial={FOREX} />)
    expect(container.querySelector('[data-testid="forex-strip"]')).toBeNull()
  })

  it('rewards legs (points) never trigger forex regardless of currency', () => {
    const CC_REWARD = `2026-04-14 * "Amudham" "Dinner with SmartBuy" ^dinner-amudham
  Expenses:Food:Dining              1500 INR
  Liabilities:CC:HDFC:Infinia      -1500 INR
  Assets:Rewards:HDFC:SmartBuy        50 SMARTBUY_POINTS
  Income:Rewards:HDFC:Earned         -50 SMARTBUY_POINTS`
    const { container } = render(<Harness initial={CC_REWARD} accounts={INR_CARD} />)
    expect(container.querySelector('[data-testid="forex-strip"]')).toBeNull()
  })

  it('changing the cc leg currency to non-home triggers the forex strip', () => {
    const { container } = render(<Harness initial={INITIAL} accounts={INR_CARD} />)
    expect(container.querySelector('[data-testid="forex-strip"]')).toBeNull()
    const currencyInputs = screen.getAllByLabelText('Currency') as HTMLInputElement[]
    rsTypeAndCommit(currencyInputs[1], 'USD')
    const strip = container.querySelector('[data-testid="forex-strip"]')
    expect(strip).toBeTruthy()
    expect(getText()).toMatch(/Liabilities:CC:HDFC:Infinia[^\n]*USD/)
  })

  it('changing the expense leg currency alone does NOT trigger forex', () => {
    const { container } = render(<Harness initial={INITIAL} accounts={INR_CARD} />)
    const currencyInputs = screen.getAllByLabelText('Currency') as HTMLInputElement[]
    rsTypeAndCommit(currencyInputs[0], 'USD')
    expect(container.querySelector('[data-testid="forex-strip"]')).toBeNull()
  })
})

describe('TxnFormView forex editing', () => {
  const INR_CARD = { 'Liabilities:CC:HDFC:Infinia': 'INR' }
  const FOREX = `2026-04-14 * "Starbucks SFO" "Airport coffee" ^sfo-coffee
  Expenses:Food:Dining         100 USD
  Liabilities:CC:HDFC:Infinia -100 USD`

  function getRateInput() {
    return screen.getByLabelText('Exchange rate') as HTMLInputElement
  }

  function getHomeInput() {
    return screen.getByLabelText('Home amount') as HTMLInputElement
  }

  it('typing a rate writes @ price annotation on the cc leg', () => {
    render(<Harness initial={FOREX} accounts={INR_CARD} />)
    const rate = getRateInput()
    fireEvent.change(rate, { target: { value: '85' } })
    fireEvent.blur(rate)
    expect(getText()).toMatch(/Liabilities:CC:HDFC:Infinia[^\n]*-100 USD @ 85 INR/)
  })

  it('typing a home amount writes @@ total annotation on the cc leg', () => {
    render(<Harness initial={FOREX} accounts={INR_CARD} />)
    const home = getHomeInput()
    fireEvent.change(home, { target: { value: '8750' } })
    fireEvent.blur(home)
    expect(getText()).toMatch(/Liabilities:CC:HDFC:Infinia[^\n]*-100 USD @@ 8750 INR/)
  })

  it('auto chip appears on home side when rate is the typed source', () => {
    const { container } = render(<Harness initial={FOREX} accounts={INR_CARD} />)
    fireEvent.change(getRateInput(), { target: { value: '85' } })
    fireEvent.blur(getRateInput())
    const rateTerm = container.querySelector('.txn-form-posting-card-forex-rate')
    const resultTerm = container.querySelector('.txn-form-posting-card-forex-result')
    expect(rateTerm?.querySelector('.txn-form-posting-card-forex-auto')).toBeNull()
    expect(resultTerm?.querySelector('.txn-form-posting-card-forex-auto')).toBeTruthy()
  })

  it('auto chip appears on rate side when home is the typed source', () => {
    const { container } = render(<Harness initial={FOREX} accounts={INR_CARD} />)
    fireEvent.change(getHomeInput(), { target: { value: '8750' } })
    fireEvent.blur(getHomeInput())
    const rateTerm = container.querySelector('.txn-form-posting-card-forex-rate')
    const resultTerm = container.querySelector('.txn-form-posting-card-forex-result')
    expect(rateTerm?.querySelector('.txn-form-posting-card-forex-auto')).toBeTruthy()
    expect(resultTerm?.querySelector('.txn-form-posting-card-forex-auto')).toBeNull()
  })

  it('home amount derives from rate × foreign amount', () => {
    render(<Harness initial={FOREX} accounts={INR_CARD} />)
    fireEvent.change(getRateInput(), { target: { value: '85' } })
    fireEvent.blur(getRateInput())
    expect(getHomeInput().value).toBe('8,500.00')
  })

  it('rate derives from home amount / foreign amount', () => {
    render(<Harness initial={FOREX} accounts={INR_CARD} />)
    fireEvent.change(getHomeInput(), { target: { value: '8750' } })
    fireEvent.blur(getHomeInput())
    expect(getRateInput().value).toBe('87.50')
  })

  it('typing home after rate switches the annotation from @ to @@', () => {
    render(<Harness initial={FOREX} accounts={INR_CARD} />)
    fireEvent.change(getRateInput(), { target: { value: '85' } })
    fireEvent.blur(getRateInput())
    expect(getText()).toMatch(/@ 85 INR/)
    fireEvent.change(getHomeInput(), { target: { value: '8750' } })
    fireEvent.blur(getHomeInput())
    expect(getText()).toMatch(/@@ 8750 INR/)
    expect(getText()).not.toMatch(/@ 85 INR/)
  })

  it('clearing the rate removes the price annotation entirely', () => {
    render(<Harness initial={FOREX} accounts={INR_CARD} />)
    fireEvent.change(getRateInput(), { target: { value: '85' } })
    fireEvent.blur(getRateInput())
    expect(getText()).toMatch(/@ 85 INR/)
    fireEvent.change(getRateInput(), { target: { value: '' } })
    fireEvent.blur(getRateInput())
    expect(getText()).not.toMatch(/@/)
    expect(getText()).toMatch(/Liabilities:CC:HDFC:Infinia[^\n]*-100 USD$/m)
  })

  it('rejects non-numeric rate input and reverts', () => {
    render(<Harness initial={FOREX} accounts={INR_CARD} />)
    const rate = getRateInput()
    fireEvent.change(rate, { target: { value: 'abc' } })
    fireEvent.blur(rate)
    expect(getText()).not.toMatch(/@/)
  })
})

describe('TxnFormView round-trip — cc-spend-reward', () => {
  const CC_REWARD = `2026-04-14 * "Amudham" "Dinner with SmartBuy earn" ^dinner-amudham
  Expenses:Food:Dining              1500 INR
  Liabilities:CC:HDFC:Infinia      -1500 INR
  Assets:Rewards:HDFC:SmartBuy        50 SMARTBUY_POINTS
  Income:Rewards:HDFC:Earned         -50 SMARTBUY_POINTS`

  it('edits reward amount', () => {
    render(<Harness initial={CC_REWARD} />)
    const input = screen.getByDisplayValue('50.00') as HTMLInputElement
    fireEvent.change(input, { target: { value: '75' } })
    fireEvent.blur(input)
    expect(getText()).toMatch(/Assets:Rewards:HDFC:SmartBuy[^\n]*75/)
  })
})
