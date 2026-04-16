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

describe('TxnFormView paired-posting validation', () => {
  function errorMessages(container: Element | Document): string[] {
    return Array.from(container.querySelectorAll('.txn-form-validation-errors li')).map(
      (el) => el.textContent ?? '',
    )
  }

  const VALID_CASHBACK = `2026-04-14 * "Amudham" "Dinner — 5% cashback" ^cashback-5pct
  Expenses:Food:Dining                    1500 INR
  Liabilities:CC:HDFC:Infinia            -1500 INR
  Assets:Cashback:Pending:HDFC:Infinia      75 INR
  Income:Cashback:HDFC:Infinia             -75 INR`

  const VALID_REWARD = `2026-04-14 * "Amudham" "Dinner with points" ^dinner-points-earn
  Expenses:Food:Dining              1500 INR
  Liabilities:CC:HDFC:Infinia      -1500 INR
  Assets:Rewards:HDFC:SmartBuy        50 SMARTBUY_POINTS
  Income:Rewards:HDFC:Earned         -50 SMARTBUY_POINTS`

  it('paired cashback produces no validation errors', () => {
    const { container } = render(<Harness initial={VALID_CASHBACK} />)
    expect(errorMessages(container)).toEqual([])
  })

  it('paired reward produces no validation errors', () => {
    const { container } = render(<Harness initial={VALID_REWARD} />)
    expect(errorMessages(container)).toEqual([])
  })

  it('Income:Cashback without Assets:Cashback:Pending fires an error', () => {
    const ORPHAN = `2026-04-14 * "Amudham" "Dinner — broken cashback" ^orphan-no-pending
  Expenses:Food:Dining           1500 INR
  Liabilities:CC:HDFC:Infinia   -1425 INR
  Income:Cashback:HDFC:Infinia    -75 INR`
    const { container } = render(<Harness initial={ORPHAN} />)
    const msgs = errorMessages(container)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatch(/Cashback/)
    expect(msgs[0]).toMatch(/Assets:Cashback:Pending/)
  })

  it('Assets:Cashback:Pending without Income:Cashback fires an error', () => {
    const ORPHAN = `2026-04-14 * "Amudham" "Dinner — broken cashback" ^orphan-no-income-cb
  Expenses:Food:Dining                    1500 INR
  Liabilities:CC:HDFC:Infinia            -1500 INR
  Assets:Cashback:Pending:HDFC:Infinia      75 INR
  Equity:Adjustment                       -75 INR`
    const { container } = render(<Harness initial={ORPHAN} />)
    const msgs = errorMessages(container)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatch(/Cashback/)
    expect(msgs[0]).toMatch(/Income:Cashback/)
  })

  it('mismatched cashback amounts fire a balance error', () => {
    const MISMATCH = `2026-04-14 * "Amudham" "Dinner — mismatched cashback" ^mismatch-cb-amt
  Expenses:Food:Dining                    1500 INR
  Liabilities:CC:HDFC:Infinia            -1450 INR
  Assets:Cashback:Pending:HDFC:Infinia      75 INR
  Income:Cashback:HDFC:Infinia            -125 INR`
    const { container } = render(<Harness initial={MISMATCH} />)
    const msgs = errorMessages(container)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatch(/Cashback/)
    expect(msgs[0]).toMatch(/INR/)
    expect(msgs[0]).toMatch(/cancel/)
  })

  it('Assets:Rewards without Income:Rewards fires an error', () => {
    const ORPHAN = `2026-04-14 * "Amudham" "Dinner — broken reward" ^orphan-no-income-rwd
  Expenses:Food:Dining              1500 INR
  Liabilities:CC:HDFC:Infinia      -1500 INR
  Assets:Rewards:HDFC:SmartBuy        50 SMARTBUY_POINTS
  Equity:Adjustment                  -50 SMARTBUY_POINTS`
    const { container } = render(<Harness initial={ORPHAN} />)
    const msgs = errorMessages(container)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatch(/Reward/)
    expect(msgs[0]).toMatch(/Income:Rewards/)
  })

  it('Income:Rewards without Assets:Rewards fires an error', () => {
    const ORPHAN = `2026-04-14 * "Amudham" "Dinner — broken reward" ^orphan-no-assets-rwd
  Expenses:Food:Dining              1500 INR
  Liabilities:CC:HDFC:Infinia      -1500 INR
  Income:Rewards:HDFC:Earned         -50 SMARTBUY_POINTS
  Equity:Adjustment                   50 SMARTBUY_POINTS`
    const { container } = render(<Harness initial={ORPHAN} />)
    const msgs = errorMessages(container)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatch(/Reward/)
    expect(msgs[0]).toMatch(/Assets:Rewards/)
  })

  it('kitchen-sink txn with discount + cashback + reward stays clean', () => {
    const KITCHEN = `2020-01-01 open Assets:Rewards:HDFC:SmartBuy SMARTBUY_POINTS
2020-01-01 open Income:Rewards:HDFC:Earned SMARTBUY_POINTS

2026-04-14 * "Amudham" "Dinner — discount + cashback + points" ^kitchen-discount-cb-pts
  Expenses:Food:Dining                    1500 INR
  Liabilities:CC:HDFC:Infinia            -1400 INR
  Equity:Discount                         -100 INR
  Assets:Cashback:Pending:HDFC:Infinia      70 INR
  Income:Cashback:HDFC:Infinia             -70 INR
  Assets:Rewards:HDFC:SmartBuy              50 SMARTBUY_POINTS
  Income:Rewards:HDFC:Earned               -50 SMARTBUY_POINTS`
    const { container } = render(<Harness initial={KITCHEN} />)
    expect(errorMessages(container)).toEqual([])
  })

  it('errors are scoped per-transaction (one bad txn doesn’t taint a sibling)', () => {
    const MIXED = `2026-04-14 * "Amudham" "Good cashback" ^mixed-good-cb
  Expenses:Food:Dining                    1500 INR
  Liabilities:CC:HDFC:Infinia            -1500 INR
  Assets:Cashback:Pending:HDFC:Infinia      75 INR
  Income:Cashback:HDFC:Infinia             -75 INR

2026-04-13 * "Chai Point" "Bad cashback" ^mixed-bad-cb
  Expenses:Food:Coffee           120 INR
  Liabilities:CC:HDFC:Infinia   -114 INR
  Income:Cashback:HDFC:Infinia    -6 INR`
    const { container } = render(<Harness initial={MIXED} />)
    const cards = container.querySelectorAll('.txn-form-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].querySelectorAll('.txn-form-validation-errors li')).toHaveLength(0)
    expect(cards[1].querySelectorAll('.txn-form-validation-errors li')).toHaveLength(1)
  })

  it('valid redemption with @@ price annotation produces no errors', () => {
    const OK = `2026-04-15 * "Accor" "Hotel stay — points + cash" ^hotel-redeem-total
  Expenses:Travel:Hotel                10000 INR
  Assets:Rewards:HDFC:SmartBuy         -4000 SMARTBUY_POINTS @@ 8000 INR
  Assets:Cash                          -2000 INR`
    const { container } = render(<Harness initial={OK} />)
    expect(errorMessages(container)).toEqual([])
  })

  it('valid redemption with @ rate annotation produces no errors', () => {
    const OK = `2026-04-15 * "Accor" "Hotel stay — points + cash" ^hotel-redeem-rate
  Expenses:Travel:Hotel                10000 INR
  Assets:Rewards:HDFC:SmartBuy         -4000 SMARTBUY_POINTS @ 2 INR
  Assets:Cash                          -2000 INR`
    const { container } = render(<Harness initial={OK} />)
    expect(errorMessages(container)).toEqual([])
  })

  it('redemption without price clause fires an error', () => {
    const BAD = `2026-04-15 * "Accor" "Hotel — redemption missing price" ^hotel-redeem-no-price
  Expenses:Travel:Hotel            10000 SMARTBUY_POINTS
  Assets:Rewards:HDFC:SmartBuy    -10000 SMARTBUY_POINTS`
    const { container } = render(<Harness initial={BAD} />)
    const msgs = errorMessages(container)
    expect(msgs.some((m) => /Redemption/.test(m) && /price clause/.test(m))).toBe(true)
  })

  it('positive Assets:Rewards still triggers earn pairing check (not redemption check)', () => {
    const ORPHAN = `2026-04-14 * "Amudham" "Dinner — earn with no income leg" ^orphan-earn-no-income
  Expenses:Food:Dining              1500 INR
  Liabilities:CC:HDFC:Infinia      -1500 INR
  Assets:Rewards:HDFC:SmartBuy        50 SMARTBUY_POINTS
  Equity:Adjustment                  -50 SMARTBUY_POINTS`
    const { container } = render(<Harness initial={ORPHAN} />)
    const msgs = errorMessages(container)
    expect(msgs.some((m) => /Reward/.test(m) && /Income:Rewards/.test(m))).toBe(true)
    expect(msgs.some((m) => /Redemption/.test(m))).toBe(false)
  })
})

describe('TxnFormView redemption home-currency picker', () => {
  const REDEMPTION = `2026-04-15 * "Accor" "Hotel stay — points + cash" ^hotel-redeem-picker
  Expenses:Travel:Hotel                10000 INR
  Assets:Rewards:HDFC:SmartBuy         -4000 SMARTBUY_POINTS @@ 8000 INR
  Assets:Cash                          -2000 INR`

  it('renders an editable currency picker inside the redemption forex strip', () => {
    const { container } = render(<Harness initial={REDEMPTION} />)
    const card = container.querySelector('[data-posting-type="redemption"]')
    expect(card).toBeTruthy()
    const strip = card!.querySelector('[data-testid="forex-strip"]')
    expect(strip).toBeTruthy()
    const picker = strip!.querySelector('.rs-currency')
    expect(picker).toBeTruthy()
    expect(strip!.querySelector('.rs-currency__single-value')?.textContent).toBe('INR')
  })

  it('CC-spend forex keeps a static home currency (no picker)', () => {
    const CC_FOREX = `2026-04-14 * "Amazon US" "USD charge" ^amazon-us
  Expenses:Online          100 USD
  Liabilities:CC:HDFC:Infinia  -100 USD @ 85 INR`
    const { container } = render(
      <Harness initial={CC_FOREX} accounts={{ 'Liabilities:CC:HDFC:Infinia': 'INR' }} />,
    )
    const card = container.querySelector('[data-posting-type="cc-spend"]')
    const strip = card!.querySelector('[data-testid="forex-strip"]')
    expect(strip!.querySelector('.rs-currency')).toBeNull()
    expect(strip!.querySelector('.txn-form-posting-card-forex-unit')?.textContent).toBe('USD')
  })
})

describe('TxnFormView points-transfer', () => {
  function errorMessages(container: Element | Document): string[] {
    return Array.from(container.querySelectorAll('.txn-form-validation-errors li')).map(
      (el) => el.textContent ?? '',
    )
  }

  const VALID = `2026-04-16 * "HDFC" "SmartBuy → Finnair" ^pts-xfer-smartbuy-finnair
  Assets:Rewards:HDFC:SmartBuy    -4000 SMARTBUY_POINTS
  Assets:Rewards:Finnair           2000 FINNAIR_POINTS @@ 4000 SMARTBUY_POINTS`

  it('renders a single points-transfer card for a valid pair', () => {
    const { container } = render(<Harness initial={VALID} />)
    const card = container.querySelector('[data-posting-type="points-transfer"]')
    expect(card).toBeTruthy()
    const singles = container.querySelectorAll(
      '[data-posting-type]:not([data-posting-type="points-transfer"])',
    )
    expect(singles).toHaveLength(0)
  })

  it('does not fire redemption or earn errors on a valid pair', () => {
    const { container } = render(<Harness initial={VALID} />)
    const msgs = errorMessages(container)
    expect(msgs.some((m) => /Redemption/.test(m))).toBe(false)
    expect(msgs.some((m) => /Reward/.test(m))).toBe(false)
    expect(msgs).toEqual([])
  })

  it('falls back to singles when the sink has no price clause', () => {
    const BAD = `2026-04-16 * "HDFC" "SmartBuy → Finnair (orphan)" ^pts-xfer-orphan
  Assets:Rewards:HDFC:SmartBuy    -4000 SMARTBUY_POINTS
  Assets:Rewards:Finnair           2000 FINNAIR_POINTS`
    const { container } = render(<Harness initial={BAD} />)
    expect(container.querySelector('[data-posting-type="points-transfer"]')).toBeNull()
    const msgs = errorMessages(container)
    expect(
      msgs.some((m) => /Redemption/.test(m) && /price clause/.test(m)),
    ).toBe(true)
  })

  it('hides the rewards program account currency label (currency is implied)', () => {
    const { container } = render(<Harness initial={VALID} />)
    const card = container.querySelector('[data-posting-type="points-transfer"]')
    const currencyStatics = card!.querySelectorAll('.txn-form-posting-card-currency-static')
    expect(currencyStatics).toHaveLength(0)
  })

  it('serializes the source amount back through @@ total on edit', () => {
    const { container } = render(<Harness initial={VALID} />)
    const card = container.querySelector(
      '[data-posting-type="points-transfer"]',
    ) as HTMLElement
    const amountInputs = card.querySelectorAll(
      '.txn-form-posting-amount-input',
    ) as NodeListOf<HTMLInputElement>
    expect(amountInputs.length).toBeGreaterThanOrEqual(2)
    const sourceInput = amountInputs[0]
    fireEvent.focus(sourceInput)
    fireEvent.change(sourceInput, { target: { value: '5000' } })
    fireEvent.blur(sourceInput)
    const text = getText()
    expect(text).toMatch(/-5000 SMARTBUY_POINTS/)
    expect(text).toMatch(/@@ 5000 SMARTBUY_POINTS/)
  })

  it('renders the ratio strip with source total and sink amount', () => {
    const { container } = render(<Harness initial={VALID} />)
    const card = container.querySelector('[data-posting-type="points-transfer"]')
    const strip = card!.querySelector('[data-testid="forex-strip"]')
    expect(strip).toBeTruthy()
    expect(strip!.textContent).toMatch(/RATIO/)
    expect(strip!.textContent).toMatch(/2,000/)
    expect(strip!.textContent).toMatch(/4,000/)
  })
})

describe('TxnFormView transfer family', () => {
  function errorMessages(container: Element | Document): string[] {
    return Array.from(container.querySelectorAll('.txn-form-validation-errors li')).map(
      (el) => el.textContent ?? '',
    )
  }

  const TRANSFER = `2026-04-16 * "Self" "Savings to Checking" ^savings-to-checking
  Assets:Bank:Savings    -10000 INR
  Assets:Bank:Checking    10000 INR`

  const CC_PAYMENT = `2026-04-16 * "HDFC" "April statement payment" ^cc-payment-april
  Assets:Bank:Checking          -18000 INR
  Liabilities:CC:HDFC:Infinia    18000 INR`

  const WALLET_TOPUP = `2026-04-16 * "Paytm" "Load wallet from CC" ^wallet-topup-paytm
  Liabilities:CC:HDFC:Infinia   -1000 INR
  Assets:Wallet:Paytm            1000 INR`

  const GIFT_CARD_TOPUP = `2026-04-16 * "Amazon" "Gift card reload" ^amazon-gc-reload
  Assets:Bank:Checking       -500 INR
  Assets:GiftCard:Amazon      500 INR`

  it('renders a TRANSFER card for Assets:* ↔ Assets:*', () => {
    const { container } = render(<Harness initial={TRANSFER} />)
    const card = container.querySelector('[data-posting-type="transfer"]')
    expect(card).toBeTruthy()
    expect(card!.textContent).toMatch(/TRANSFER/)
  })

  it('renders exactly one card (no fallback singles) for a valid transfer', () => {
    const { container } = render(<Harness initial={TRANSFER} />)
    expect(container.querySelectorAll('[data-posting-type]')).toHaveLength(1)
  })

  it('renders a CC PAYMENT card when one leg is Liabilities:CC:*', () => {
    const { container } = render(<Harness initial={CC_PAYMENT} />)
    const card = container.querySelector('[data-posting-type="cc-payment"]')
    expect(card).toBeTruthy()
    expect(card!.textContent).toMatch(/CC PAYMENT/)
  })

  it('renders a WALLET TOP-UP card when one leg is Assets:Wallet:*', () => {
    const { container } = render(<Harness initial={WALLET_TOPUP} />)
    const card = container.querySelector('[data-posting-type="wallet-topup"]')
    expect(card).toBeTruthy()
    expect(card!.textContent).toMatch(/WALLET TOP-UP/)
  })

  it('wallet variant takes precedence over cc-payment when both are present', () => {
    const { container } = render(<Harness initial={WALLET_TOPUP} />)
    expect(container.querySelector('[data-posting-type="cc-payment"]')).toBeNull()
    expect(container.querySelector('[data-posting-type="wallet-topup"]')).toBeTruthy()
  })

  it('renders a GIFT CARD card for gift cards (Assets:GiftCard:*)', () => {
    const { container } = render(<Harness initial={GIFT_CARD_TOPUP} />)
    const card = container.querySelector('[data-posting-type="gift-card"]')
    expect(card).toBeTruthy()
    expect(card!.textContent).toMatch(/GIFT CARD/)
    expect(card!.textContent).toMatch(/Assets:GiftCard:Amazon/)
  })

  it('gift-card variant takes precedence over wallet-topup and cc-payment', () => {
    const CC_GIFT = `2026-04-16 * "Amazon" "CC-paid gift card" ^amazon-gc-cc-paid
  Liabilities:CC:HDFC:Infinia  -500 INR
  Assets:GiftCard:Amazon        500 INR`
    const { container } = render(<Harness initial={CC_GIFT} />)
    expect(container.querySelector('[data-posting-type="gift-card"]')).toBeTruthy()
    expect(container.querySelector('[data-posting-type="wallet-topup"]')).toBeNull()
    expect(container.querySelector('[data-posting-type="cc-payment"]')).toBeNull()
  })

  it('does not fire any validation errors on a valid transfer', () => {
    const { container } = render(<Harness initial={TRANSFER} />)
    expect(errorMessages(container)).toEqual([])
  })

  it('does not fire any validation errors on a valid cc-payment', () => {
    const { container } = render(<Harness initial={CC_PAYMENT} />)
    expect(errorMessages(container)).toEqual([])
  })

  it('does not fire any validation errors on a valid wallet-topup', () => {
    const { container } = render(<Harness initial={WALLET_TOPUP} />)
    expect(errorMessages(container)).toEqual([])
  })

  it('edits the single amount and keeps both legs in sync (opposite signs)', () => {
    const { container } = render(<Harness initial={TRANSFER} />)
    const card = container.querySelector('[data-posting-type="transfer"]') as HTMLElement
    const amountInputs = card.querySelectorAll(
      '.txn-form-posting-amount-input',
    ) as NodeListOf<HTMLInputElement>
    expect(amountInputs.length).toBeGreaterThanOrEqual(1)
    const input = amountInputs[0]
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '12345' } })
    fireEvent.blur(input)
    const text = getText()
    expect(text).toMatch(/-12345 INR/)
    expect(text).toMatch(/12345 INR/)
  })

  it('falls back to singles when magnitudes do not balance', () => {
    const BAD = `2026-04-16 * "Self" "Unbalanced" ^transfer-unbalanced
  Assets:Bank:Savings    -10000 INR
  Assets:Bank:Checking    9000 INR`
    const { container } = render(<Harness initial={BAD} />)
    expect(container.querySelector('[data-posting-type="transfer"]')).toBeNull()
    expect(container.querySelector('[data-posting-type="cc-payment"]')).toBeNull()
    expect(container.querySelector('[data-posting-type="wallet-topup"]')).toBeNull()
  })

  it('falls back to singles when a price clause is present (points transfer territory)', () => {
    const PRICED = `2026-04-16 * "Self" "With price" ^transfer-with-price
  Assets:Bank:Savings    -100 USD
  Assets:Bank:Checking    100 USD @@ 8500 INR`
    const { container } = render(<Harness initial={PRICED} />)
    expect(container.querySelector('[data-posting-type="transfer"]')).toBeNull()
  })

  it('composes with an unrelated posting in the same transaction', () => {
    const MIXED = `2026-04-16 * "Mixed" "Transfer + fee" ^transfer-plus-fee
  Assets:Bank:Savings    -10000 INR
  Assets:Bank:Checking    10000 INR
  Expenses:Fees:Wire         50 INR
  Liabilities:CC:HDFC:Infinia  -50 INR`
    const { container } = render(<Harness initial={MIXED} />)
    expect(container.querySelectorAll('[data-posting-type="transfer"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-posting-type="fee"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-posting-type="cc-spend"]')).toHaveLength(1)
  })

  it('hides account currency label once (same currency on both legs, shown once)', () => {
    const { container } = render(<Harness initial={TRANSFER} />)
    const card = container.querySelector('[data-posting-type="transfer"]')
    const statics = card!.querySelectorAll('.txn-form-posting-card-currency-static')
    expect(statics.length).toBe(1)
    expect(statics[0].textContent).toBe('INR')
  })

  it('shows From and To labels', () => {
    const { container } = render(<Harness initial={TRANSFER} />)
    const card = container.querySelector('[data-posting-type="transfer"]')
    const labels = Array.from(
      card!.querySelectorAll('.txn-form-posting-card-label'),
    ).map((l) => l.textContent)
    expect(labels).toContain('From')
    expect(labels).toContain('To')
  })
})

describe('TxnFormView refund + fee overlays', () => {
  const CC_REFUND = `2026-04-16 * "Myntra" "Returned shirt" ^myntra-return
  Expenses:Shopping:Clothing     -2500 INR
  Liabilities:CC:HDFC:Infinia     2500 INR`

  const ANNUAL_FEE = `2026-04-16 * "HDFC" "Infinia annual fee" ^infinia-fee-2026
  Expenses:Fees:Annual:HDFC:Infinia    12500 INR
  Liabilities:CC:HDFC:Infinia         -12500 INR`

  const FEE_WAIVED = `2026-04-16 * "HDFC" "Fee waiver credit" ^infinia-waive
  Expenses:Fees:Annual:HDFC:Infinia    -12500 INR
  Liabilities:CC:HDFC:Infinia           12500 INR`

  it('renders REFUND pill for negative Expenses: posting', () => {
    const { container } = render(<Harness initial={CC_REFUND} />)
    const card = container.querySelector('[data-posting-type="expense-refund"]')
    expect(card).toBeTruthy()
    expect(card!.querySelector('.txn-form-posting-card-type-pill')?.textContent).toBe('REFUND')
  })

  it('renders CC REFUND pill for positive Liabilities:CC: posting', () => {
    const { container } = render(<Harness initial={CC_REFUND} />)
    const card = container.querySelector('[data-posting-type="cc-refund"]')
    expect(card).toBeTruthy()
    expect(card!.querySelector('.txn-form-posting-card-type-pill')?.textContent).toBe('CC REFUND')
  })

  it('refund txn has no plain EXPENSE or CC SPEND cards', () => {
    const { container } = render(<Harness initial={CC_REFUND} />)
    expect(container.querySelector('[data-posting-type="expense"]')).toBeNull()
    expect(container.querySelector('[data-posting-type="cc-spend"]')).toBeNull()
  })

  it('refund txn renders no validation errors', () => {
    const { container } = render(<Harness initial={CC_REFUND} />)
    expect(container.querySelector('.txn-form-posting-card-errors')).toBeNull()
  })

  it('renders FEE pill for Expenses:Fees: posting', () => {
    const { container } = render(<Harness initial={ANNUAL_FEE} />)
    const card = container.querySelector('[data-posting-type="fee"]')
    expect(card).toBeTruthy()
    expect(card!.querySelector('.txn-form-posting-card-type-pill')?.textContent).toBe('FEE')
  })

  it('renders CC SPEND pill on the paying leg of an annual fee', () => {
    const { container } = render(<Harness initial={ANNUAL_FEE} />)
    const card = container.querySelector('[data-posting-type="cc-spend"]')
    expect(card).toBeTruthy()
    expect(card!.querySelector('.txn-form-posting-card-type-pill')?.textContent).toBe('CC SPEND')
  })

  it('annual fee renders no EXPENSE pill (fee takes precedence)', () => {
    const { container } = render(<Harness initial={ANNUAL_FEE} />)
    expect(container.querySelector('[data-posting-type="expense"]')).toBeNull()
  })

  it('Expenses:Fees: with negative amount still classifies as FEE', () => {
    const { container } = render(<Harness initial={FEE_WAIVED} />)
    const card = container.querySelector('[data-posting-type="fee"]')
    expect(card).toBeTruthy()
    expect(card!.querySelector('.txn-form-posting-card-type-pill')?.textContent).toBe('FEE')
    expect(container.querySelector('[data-posting-type="expense-refund"]')).toBeNull()
  })

  it('displays refund amount as positive (signless) even though stored negative', () => {
    const { container } = render(<Harness initial={CC_REFUND} />)
    const card = container.querySelector('[data-posting-type="expense-refund"]')!
    const input = card.querySelector('input[inputmode="decimal"]') as HTMLInputElement
    const value = input.value.replace(/,/g, '')
    expect(parseFloat(value)).toBe(2500)
    expect(value.startsWith('-')).toBe(false)
  })

  it('editing refund amount keeps the Expense leg negative in text', () => {
    const { container } = render(<Harness initial={CC_REFUND} />)
    const card = container.querySelector('[data-posting-type="expense-refund"]')!
    const amountInput = card.querySelector('input[inputmode="decimal"]') as HTMLInputElement
    fireEvent.focus(amountInput)
    fireEvent.change(amountInput, { target: { value: '1800' } })
    fireEvent.blur(amountInput)
    const t = getText()
    expect(t).toContain('Expenses:Shopping:Clothing')
    expect(t).toMatch(/Expenses:Shopping:Clothing\s+-1800/)
  })

  it('editing cc-refund amount keeps the CC leg positive in text', () => {
    const { container } = render(<Harness initial={CC_REFUND} />)
    const card = container.querySelector('[data-posting-type="cc-refund"]')!
    const amountInput = card.querySelector('input[inputmode="decimal"]') as HTMLInputElement
    fireEvent.focus(amountInput)
    fireEvent.change(amountInput, { target: { value: '1800' } })
    fireEvent.blur(amountInput)
    const t = getText()
    expect(t).toMatch(/Liabilities:CC:HDFC:Infinia\s+1800/)
  })

  it('editing fee amount keeps the Expenses:Fees leg positive in text', () => {
    const { container } = render(<Harness initial={ANNUAL_FEE} />)
    const card = container.querySelector('[data-posting-type="fee"]')!
    const amountInput = card.querySelector('input[inputmode="decimal"]') as HTMLInputElement
    fireEvent.focus(amountInput)
    fireEvent.change(amountInput, { target: { value: '10000' } })
    fireEvent.blur(amountInput)
    const t = getText()
    expect(t).toMatch(/Expenses:Fees:Annual:HDFC:Infinia\s+10000/)
  })

  it('annual fee renders no validation errors', () => {
    const { container } = render(<Harness initial={ANNUAL_FEE} />)
    expect(container.querySelector('.txn-form-posting-card-errors')).toBeNull()
  })
})
