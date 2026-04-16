'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Select from 'react-select'
import CreatableSelect from 'react-select/creatable'
import {
  parse,
  BeancountParseError,
  Posting,
  type ParseResult,
  type Transaction,
} from 'beancount'

import {
  groupPostings,
  type PointsTransferGroup,
  type TransferGroup,
  type TransferVariant,
} from '@/lib/beancount/posting-grouping'
import { validateBeancount } from '@/lib/beancount/validate'

type SelectOption = { value: string; label: string }

type PostingType =
  | 'expense'
  | 'expense-refund'
  | 'fee'
  | 'cc-spend'
  | 'cc-refund'
  | 'reward-earn'
  | 'redemption'
  | 'gift-card-load'
  | 'gift-card-redeem'
  | 'discount'
  | 'cashback'
  | 'generic'

type PostingTypeConfig = {
  label: string
  tagClass: string
  prefix: string
  placeholder: string
  signMultiplier: 1 | -1
}

const POSTING_TYPE_CONFIG: Record<Exclude<PostingType, 'generic'>, PostingTypeConfig> = {
  expense: {
    label: 'EXPENSE',
    tagClass: 'txn-form-posting-tag-expense',
    prefix: 'Expenses:',
    placeholder: 'Food:Dining',
    signMultiplier: 1,
  },
  'expense-refund': {
    label: 'REFUND',
    tagClass: 'txn-form-posting-tag-expense-refund',
    prefix: 'Expenses:',
    placeholder: 'Food:Dining',
    signMultiplier: -1,
  },
  fee: {
    label: 'FEE',
    tagClass: 'txn-form-posting-tag-fee',
    prefix: 'Expenses:Fees:',
    placeholder: 'Annual:HDFC:Infinia',
    signMultiplier: 1,
  },
  'cc-spend': {
    label: 'CC SPEND',
    tagClass: 'txn-form-posting-tag-cc',
    prefix: 'Liabilities:CC:',
    placeholder: 'HDFC:Infinia',
    signMultiplier: -1,
  },
  'cc-refund': {
    label: 'CC REFUND',
    tagClass: 'txn-form-posting-tag-cc-refund',
    prefix: 'Liabilities:CC:',
    placeholder: 'HDFC:Infinia',
    signMultiplier: 1,
  },
  'reward-earn': {
    label: 'REWARD',
    tagClass: 'txn-form-posting-tag-reward',
    prefix: 'Assets:Rewards:',
    placeholder: 'HDFC:SmartBuy',
    signMultiplier: 1,
  },
  redemption: {
    label: 'REDEMPTION',
    tagClass: 'txn-form-posting-tag-redemption',
    prefix: 'Assets:Rewards:',
    placeholder: 'HDFC:SmartBuy',
    signMultiplier: -1,
  },
  'gift-card-load': {
    label: 'GIFT CARD LOAD',
    tagClass: 'txn-form-posting-tag-gift-card-load',
    prefix: 'Assets:GiftCard:',
    placeholder: 'Amazon',
    signMultiplier: 1,
  },
  'gift-card-redeem': {
    label: 'GIFT CARD REDEEM',
    tagClass: 'txn-form-posting-tag-gift-card-redeem',
    prefix: 'Assets:GiftCard:',
    placeholder: 'Amazon',
    signMultiplier: -1,
  },
  discount: {
    label: 'DISCOUNT',
    tagClass: 'txn-form-posting-tag-discount',
    prefix: 'Equity:Discount:',
    placeholder: 'HDFC:Infinia',
    signMultiplier: -1,
  },
  cashback: {
    label: 'CASHBACK',
    tagClass: 'txn-form-posting-tag-cashback',
    prefix: 'Income:Cashback:',
    placeholder: 'HDFC:Infinia',
    signMultiplier: -1,
  },
}

function classifyPosting(p: Posting): PostingType {
  if (p.account.startsWith('Expenses:Fees:')) return 'fee'
  if (p.account.startsWith('Expenses:')) {
    const n = p.amount != null ? parseFloat(p.amount) : 0
    return n < 0 ? 'expense-refund' : 'expense'
  }
  if (p.account.startsWith('Liabilities:CC:')) {
    const n = p.amount != null ? parseFloat(p.amount) : 0
    return n > 0 ? 'cc-refund' : 'cc-spend'
  }
  if (p.account.startsWith('Assets:Rewards:')) {
    const n = p.amount != null ? parseFloat(p.amount) : 0
    return n < 0 ? 'redemption' : 'reward-earn'
  }
  if (p.account.startsWith('Assets:GiftCard:')) {
    const n = p.amount != null ? parseFloat(p.amount) : 0
    return n < 0 ? 'gift-card-redeem' : 'gift-card-load'
  }
  if (p.account === 'Equity:Discount' || p.account.startsWith('Equity:Discount:')) return 'discount'
  if (p.account.startsWith('Income:Cashback:')) return 'cashback'
  return 'generic'
}

function isHiddenPosting(p: Posting): boolean {
  if (p.account.startsWith('Income:Rewards:')) return true
  if (p.account.startsWith('Assets:Cashback:Pending:')) return true
  return false
}

function validateByTxn(source: string): Map<number, string[]> {
  const errors = new Map<number, string[]>()
  for (const d of validateBeancount(source)) {
    if (d.transactionIndex == null) continue
    const list = errors.get(d.transactionIndex) ?? []
    list.push(d.message)
    errors.set(d.transactionIndex, list)
  }
  return errors
}

type ForexInfo = {
  foreignAmount: number
  foreignCurrency: string
  homeCurrency: string
  homeAmount: number | null
  rate: number | null
  source: 'rate' | 'total' | null
}

function buildForexInfo(p: Posting, targetCurrency: string | undefined): ForexInfo | null {
  if (!targetCurrency) return null
  if (!p.currency || p.currency === targetCurrency) return null
  const foreignAmount = p.amount != null ? Math.abs(parseFloat(p.amount)) : NaN
  if (!Number.isFinite(foreignAmount) || foreignAmount === 0) return null

  let homeAmount: number | null = null
  let rate: number | null = null
  let source: 'rate' | 'total' | null = null
  if (p.priceAmount && p.priceCurrency === targetCurrency) {
    const pa = parseFloat(p.priceAmount)
    if (Number.isFinite(pa)) {
      if (p.atSigns === 2) {
        homeAmount = pa
        rate = pa / foreignAmount
        source = 'total'
      } else {
        rate = pa
        homeAmount = pa * foreignAmount
        source = 'rate'
      }
    }
  }

  return {
    foreignAmount,
    foreignCurrency: p.currency,
    homeCurrency: targetCurrency,
    homeAmount,
    rate,
    source,
  }
}

function accountsMatching(result: ParseResult, prefix: string): string[] {
  const seen = new Set<string>()
  for (const t of result.transactions) {
    for (const p of t.postings) {
      if (p.account.startsWith(prefix)) seen.add(p.account)
    }
  }
  return [...seen].sort()
}

const DEFAULT_CURRENCIES = [
  'INR',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AED',
  'AUD',
  'CAD',
  'CHF',
  'CNY',
  'HKD',
  'SGD',
  'THB',
]

function isRewardAccount(account: string): boolean {
  return account.startsWith('Assets:Rewards:') || account.startsWith('Income:Rewards:')
}

function currenciesIn(
  result: ParseResult,
  homeCommodityByAccount: Record<string, string>,
): string[] {
  const seen = new Set<string>(DEFAULT_CURRENCIES)
  for (const t of result.transactions) {
    for (const p of t.postings) {
      if (!isRewardAccount(p.account) && p.currency) seen.add(p.currency)
      if (p.priceCurrency) seen.add(p.priceCurrency)
    }
  }
  for (const c of Object.values(homeCommodityByAccount)) {
    if (c) seen.add(c)
  }
  return [...seen].sort()
}

function constraintCurrenciesByAccount(result: ParseResult): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const o of result.open) {
    if (o.constraintCurrencies && o.constraintCurrencies.length > 0) {
      out[o.account] = o.constraintCurrencies
    }
  }
  return out
}

function AccountBreadcrumb({ account }: { account: string }) {
  const parts = account.split(':')
  return (
    <>
      {parts.map((part, i) => {
        const isLast = i === parts.length - 1
        return (
          <span key={i}>
            {i > 0 && ' › '}
            {isLast ? <strong>{part}</strong> : part}
          </span>
        )
      })}
    </>
  )
}

function formatAmount(value: number, fractionDigits = 2): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: Math.max(fractionDigits, 4),
  })
}

type Mutator = (result: ParseResult) => void

function EditableText({
  value,
  placeholder,
  editable,
  required,
  fieldLabel,
  onCommit,
}: {
  value: string
  placeholder?: string
  editable: boolean
  required?: boolean
  fieldLabel?: string
  onCommit: (next: string) => void
}) {
  const [local, setLocal] = useState(value)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setLocal(value)
  }, [value, focused])

  const invalid = !!required && !value.trim() && !focused

  if (!editable) {
    return <div className="txn-form-input">{value || placeholder}</div>
  }

  const commit = () => {
    setFocused(false)
    const next = local.trim()
    if (required && !next) {
      setLocal(value)
      return
    }
    if (next !== value) onCommit(next)
  }

  return (
    <div className="txn-form-input-shell">
      <input
        className={`txn-form-input ${invalid ? 'txn-form-input-invalid' : ''}`}
        value={local}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        onChange={(e) => setLocal(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.currentTarget as HTMLInputElement).blur()
          } else if (e.key === 'Escape') {
            setLocal(value)
            setFocused(false)
            ;(e.currentTarget as HTMLInputElement).blur()
          }
        }}
      />
      {invalid && (
        <span className="txn-form-input-error-text">
          {fieldLabel || 'This field'} is required
        </span>
      )}
    </div>
  )
}

function DateField({
  value,
  editable,
  onCommit,
}: {
  value: string
  editable: boolean
  onCommit: (next: string) => void
}) {
  if (!editable) {
    return <div className="txn-form-input txn-form-input-mono">{value}</div>
  }
  return (
    <input
      type="date"
      className="txn-form-input txn-form-input-mono"
      value={value}
      onChange={(e) => {
        const next = e.target.value
        if (next && next !== value) onCommit(next)
      }}
    />
  )
}

function LinkField({
  value,
  editable,
  onCommit,
}: {
  value: string
  editable: boolean
  onCommit: (next: string) => void
}) {
  const [local, setLocal] = useState(value)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setLocal(value)
  }, [value, focused])

  if (!editable) {
    return (
      <div className="txn-form-link-wrap">
        <span className="txn-form-link-caret">^</span>
        <div className="txn-form-link-input">{value || '—'}</div>
      </div>
    )
  }

  const commit = () => {
    setFocused(false)
    const next = local.trim()
    if (!next) {
      setLocal(value)
      return
    }
    if (next !== value) onCommit(next)
  }

  return (
    <div className="txn-form-link-wrap">
      <span className="txn-form-link-caret">^</span>
      <input
        className="txn-form-link-input"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.currentTarget as HTMLInputElement).blur()
          } else if (e.key === 'Escape') {
            setLocal(value)
            setFocused(false)
            ;(e.currentTarget as HTMLInputElement).blur()
          }
        }}
      />
    </div>
  )
}

function EditableAmount({
  amount,
  editable,
  onCommit,
}: {
  amount: number
  editable: boolean
  onCommit: (next: number) => void
}) {
  const isCredit = amount < 0
  const abs = Math.abs(amount)
  const display = (isCredit ? '–' : '') + formatAmount(abs)
  const [local, setLocal] = useState(display)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setLocal(display)
  }, [display, focused])

  const inputClass = `txn-form-posting-amount-input ${isCredit ? 'txn-form-posting-amount-input-credit' : ''}`
  const staticClass = `txn-form-posting-amount ${isCredit ? 'txn-form-posting-amount-credit' : ''}`

  if (!editable) {
    return <span className={staticClass}>{display}</span>
  }

  const commit = () => {
    setFocused(false)
    const cleaned = local.replace(/[,\s–-]/g, '')
    const parsed = parseFloat(cleaned)
    if (Number.isFinite(parsed) && parsed > 0 && parsed !== abs) {
      onCommit(isCredit ? -parsed : parsed)
    } else {
      setLocal(display)
    }
  }

  return (
    <input
      className={inputClass}
      value={local}
      inputMode="decimal"
      onChange={(e) => setLocal(e.target.value)}
      onFocus={(e) => {
        setFocused(true)
        e.currentTarget.select()
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.currentTarget as HTMLInputElement).blur()
        } else if (e.key === 'Escape') {
          setLocal(display)
          setFocused(false)
          ;(e.currentTarget as HTMLInputElement).blur()
        }
      }}
    />
  )
}

function EditableCurrency({
  value,
  options,
  editable,
  inputId,
  onCommit,
}: {
  value: string
  options: string[]
  editable: boolean
  inputId: string
  onCommit: (next: string) => void
}) {
  if (!editable) {
    return <span className="txn-form-posting-currency">{value}</span>
  }

  const allOptions = options.includes(value) ? options : [value, ...options].sort()
  const selectOptions: SelectOption[] = allOptions.map((c) => ({ value: c, label: c }))
  const selected = { value, label: value }

  return (
    <CreatableSelect<SelectOption>
      inputId={inputId}
      aria-label="Currency"
      classNamePrefix="rs-currency"
      className="rs-currency"
      unstyled
      isSearchable
      menuPlacement="auto"
      menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
      value={selected}
      options={selectOptions}
      formatCreateLabel={(input) => `Use "${input.toUpperCase()}"`}
      isValidNewOption={(input) =>
        /^[A-Z][A-Z0-9'._-]{0,22}[A-Z0-9]$|^[A-Z]$/.test(input.trim().toUpperCase())
      }
      onChange={(opt) => {
        if (opt && opt.value && opt.value !== value) onCommit(opt.value)
      }}
      onCreateOption={(input) => {
        const next = input.trim().toUpperCase()
        if (next && next !== value) onCommit(next)
      }}
    />
  )
}

function EditableForexNumber({
  value,
  editable,
  placeholder,
  ariaLabel,
  onCommit,
}: {
  value: number | null
  editable: boolean
  placeholder: string
  ariaLabel: string
  onCommit: (next: number | null) => void
}) {
  const display = value != null ? formatAmount(value, 2) : ''
  const [local, setLocal] = useState(display)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setLocal(display)
  }, [display, focused])

  if (!editable) {
    return (
      <span className="txn-form-posting-card-forex-value tnum">{display || placeholder}</span>
    )
  }

  const commit = () => {
    setFocused(false)
    const raw = local.replace(/[,\s]/g, '').trim()
    if (raw === '') {
      if (value != null) onCommit(null)
      return
    }
    const parsed = parseFloat(raw)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setLocal(display)
      return
    }
    if (parsed !== value) onCommit(parsed)
  }

  return (
    <input
      className="txn-form-posting-card-forex-input tnum"
      value={local}
      placeholder={placeholder}
      aria-label={ariaLabel}
      inputMode="decimal"
      onChange={(e) => setLocal(e.target.value)}
      onFocus={(e) => {
        setFocused(true)
        e.currentTarget.select()
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.currentTarget as HTMLInputElement).blur()
        } else if (e.key === 'Escape') {
          setLocal(display)
          setFocused(false)
          ;(e.currentTarget as HTMLInputElement).blur()
        }
      }}
    />
  )
}

function AccountInput({
  value,
  prefix,
  placeholder,
  options,
  inputId,
  ariaLabel,
  editable,
  onCommit,
}: {
  value: string
  prefix: string
  placeholder: string
  options: string[]
  inputId: string
  ariaLabel: string
  editable: boolean
  onCommit: (next: string) => void
}) {
  if (!editable) {
    return (
      <div className="txn-form-posting-account-box txn-form-posting-account-box-readonly">
        <span className="txn-form-posting-account">
          <AccountBreadcrumb account={value} />
        </span>
      </div>
    )
  }

  const stripPrefix = (a: string) => (a.startsWith(prefix) ? a.slice(prefix.length) : a)

  const allOptions = options.includes(value) ? options : [...options, value]
  const selectOptions: SelectOption[] = allOptions
    .map((opt) => ({ value: opt, label: stripPrefix(opt) }))
    .filter((o) => o.label.length > 0)
  const selected = value ? { value, label: stripPrefix(value) } : null

  return (
    <CreatableSelect<SelectOption>
      inputId={inputId}
      aria-label={ariaLabel}
      classNamePrefix="rs-account"
      className="rs-account"
      unstyled
      isSearchable
      menuPlacement="auto"
      menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
      placeholder={placeholder}
      value={selected}
      options={selectOptions}
      formatCreateLabel={(input) => `Create ${prefix}${input}`}
      isValidNewOption={(input) => input.trim().length > 0}
      onChange={(opt) => {
        if (opt && opt.value && opt.value !== value) onCommit(opt.value)
      }}
      onCreateOption={(input) => {
        const trimmed = input.trim().replace(/^:+|:+$/g, '')
        if (!trimmed) return
        const next = trimmed.startsWith(prefix) ? trimmed : prefix + trimmed
        if (next !== value) onCommit(next)
      }}
    />
  )
}

function PostingCardShell({
  type,
  pillLabel,
  accountField,
  amountField,
  forexStrip,
  editable,
  canRemove,
  onRemove,
}: {
  type: PostingType
  pillLabel: string
  accountField?: ReactNode
  amountField: ReactNode
  forexStrip?: ReactNode
  editable: boolean
  canRemove: boolean
  onRemove: () => void
}) {
  return (
    <div className="txn-form-posting-card" data-posting-type={type}>
      <span className="txn-form-posting-card-type-pill">{pillLabel}</span>
      <div className="txn-form-posting-card-main">
        {accountField}
        {amountField}
      </div>
      {forexStrip}
      {editable && (
        <button
          type="button"
          className="txn-form-posting-card-remove"
          aria-label="Remove posting"
          disabled={!canRemove}
          title={canRemove ? 'Remove posting' : 'A transaction needs at least 2 postings'}
          onClick={onRemove}
        >
          <span className="material-symbols-outlined" aria-hidden>
            delete
          </span>
        </button>
      )}
    </div>
  )
}

function AccountField({
  label,
  icon,
  value,
  prefix,
  placeholder,
  options,
  inputId,
  editable,
  onCommit,
}: {
  label: string
  icon: string
  value: string
  prefix: string
  placeholder: string
  options: string[]
  inputId: string
  editable: boolean
  onCommit: (next: string) => void
}) {
  return (
    <div className="txn-form-posting-card-field txn-form-posting-card-field-category">
      <span className="txn-form-posting-card-label">{label}</span>
      <span
        className="material-symbols-outlined txn-form-posting-card-combobox-icon"
        aria-hidden="true"
      >
        {icon}
      </span>
      <AccountInput
        value={value}
        prefix={prefix}
        placeholder={placeholder}
        options={options}
        inputId={inputId}
        ariaLabel={label}
        editable={editable}
        onCommit={onCommit}
      />
    </div>
  )
}

function AmountField({
  amount,
  editable,
  onAmount,
  currencySlot,
}: {
  amount: number | null
  editable: boolean
  onAmount: (next: number) => void
  currencySlot: ReactNode
}) {
  return (
    <div className="txn-form-posting-card-field txn-form-posting-card-field-amount">
      <span className="txn-form-posting-card-label">Amount</span>
      <div className="txn-form-posting-card-amount-value">
        {amount != null && (
          <EditableAmount amount={amount} editable={editable} onCommit={onAmount} />
        )}
        {currencySlot}
      </div>
    </div>
  )
}

function ForexStrip({
  forex,
  editable,
  onRate,
  onTotal,
  homeCurrencyOptions,
  onHomeCurrency,
  listIdBase,
  label = 'FOREX',
}: {
  forex: ForexInfo
  editable: boolean
  onRate: (next: number | null) => void
  onTotal: (next: number | null) => void
  homeCurrencyOptions?: string[]
  onHomeCurrency?: (next: string) => void
  listIdBase: string
  label?: string
}) {
  return (
    <div className="txn-form-posting-card-forex" data-testid="forex-strip">
      <span className="txn-form-posting-card-forex-label">{label}</span>
      <div className="txn-form-posting-card-forex-calc">
        <div className="txn-form-posting-card-forex-term">
          <span className="txn-form-posting-card-forex-value tnum">
            {formatAmount(forex.foreignAmount)}
          </span>
          <span className="txn-form-posting-card-forex-unit">{forex.foreignCurrency}</span>
        </div>
        <span className="txn-form-posting-card-forex-op" aria-hidden="true">
          ×
        </span>
        <div className="txn-form-posting-card-forex-term txn-form-posting-card-forex-rate">
          <span className="txn-form-posting-card-forex-rate-label">RATE</span>
          <EditableForexNumber
            value={forex.rate}
            editable={editable}
            placeholder="—"
            ariaLabel="Exchange rate"
            onCommit={onRate}
          />
          {forex.source === 'total' && (
            <span className="txn-form-posting-card-forex-auto">auto</span>
          )}
        </div>
        <span className="txn-form-posting-card-forex-op" aria-hidden="true">
          =
        </span>
        <div className="txn-form-posting-card-forex-term txn-form-posting-card-forex-result">
          <EditableForexNumber
            value={forex.homeAmount}
            editable={editable}
            placeholder="—"
            ariaLabel="Home amount"
            onCommit={onTotal}
          />
          {onHomeCurrency && homeCurrencyOptions ? (
            <EditableCurrency
              value={forex.homeCurrency}
              options={homeCurrencyOptions}
              editable={editable}
              inputId={`${listIdBase}-forex-home-currency`}
              onCommit={onHomeCurrency}
            />
          ) : (
            <span className="txn-form-posting-card-forex-unit">{forex.homeCurrency}</span>
          )}
          {forex.source === 'rate' && (
            <span className="txn-form-posting-card-forex-auto">auto</span>
          )}
        </div>
      </div>
    </div>
  )
}

type PostingCardCommonProps = {
  posting: Posting
  editable: boolean
  canRemove: boolean
  accountOptions: string[]
  allCurrencies: string[]
  listIdBase: string
  displayAmount: number | null
  onAccount: (next: string) => void
  onAmount: (next: number) => void
  onCurrency: (next: string) => void
  onRemove: () => void
}

function ExpenseCard(
  props: PostingCardCommonProps & { typeKey: 'expense' | 'expense-refund' | 'fee' },
) {
  const cfg = POSTING_TYPE_CONFIG[props.typeKey]
  const icon = props.typeKey === 'fee' ? 'receipt_long' : 'restaurant'
  const label = props.typeKey === 'fee' ? 'Fee' : 'Category'
  return (
    <PostingCardShell
      type={props.typeKey}
      pillLabel={cfg.label}
      editable={props.editable}
      canRemove={props.canRemove}
      onRemove={props.onRemove}
      accountField={
        <AccountField
          label={label}
          icon={icon}
          value={props.posting.account}
          prefix={cfg.prefix}
          placeholder={cfg.placeholder}
          options={props.accountOptions}
          inputId={`${props.listIdBase}-account-${props.typeKey}`}
          editable={props.editable}
          onCommit={props.onAccount}
        />
      }
      amountField={
        <AmountField
          amount={props.displayAmount}
          editable={props.editable}
          onAmount={props.onAmount}
          currencySlot={
            <EditableCurrency
              value={props.posting.currency || ''}
              options={props.allCurrencies}
              editable={props.editable}
              inputId={`${props.listIdBase}-currency-${props.typeKey}`}
              onCommit={props.onCurrency}
            />
          }
        />
      }
    />
  )
}

function CCSpendCard(
  props: PostingCardCommonProps & {
    typeKey: 'cc-spend' | 'cc-refund'
    forex: ForexInfo | null
    onForexRate: (next: number | null) => void
    onForexTotal: (next: number | null) => void
  },
) {
  const cfg = POSTING_TYPE_CONFIG[props.typeKey]
  return (
    <PostingCardShell
      type={props.typeKey}
      pillLabel={cfg.label}
      editable={props.editable}
      canRemove={props.canRemove}
      onRemove={props.onRemove}
      accountField={
        <AccountField
          label="Card"
          icon="credit_card"
          value={props.posting.account}
          prefix={cfg.prefix}
          placeholder={cfg.placeholder}
          options={props.accountOptions}
          inputId={`${props.listIdBase}-account-${props.typeKey}`}
          editable={props.editable}
          onCommit={props.onAccount}
        />
      }
      amountField={
        <AmountField
          amount={props.displayAmount}
          editable={props.editable}
          onAmount={props.onAmount}
          currencySlot={
            <EditableCurrency
              value={props.posting.currency || ''}
              options={props.allCurrencies}
              editable={props.editable}
              inputId={`${props.listIdBase}-currency-${props.typeKey}`}
              onCommit={props.onCurrency}
            />
          }
        />
      }
      forexStrip={
        props.forex && (
          <ForexStrip
            forex={props.forex}
            editable={props.editable}
            onRate={props.onForexRate}
            onTotal={props.onForexTotal}
            listIdBase={`${props.listIdBase}-${props.typeKey}`}
          />
        )
      }
    />
  )
}

function DiscountCard(props: PostingCardCommonProps) {
  const cfg = POSTING_TYPE_CONFIG.discount
  return (
    <PostingCardShell
      type="discount"
      pillLabel={cfg.label}
      editable={props.editable}
      canRemove={props.canRemove}
      onRemove={props.onRemove}
      amountField={
        <AmountField
          amount={props.displayAmount}
          editable={props.editable}
          onAmount={props.onAmount}
          currencySlot={
            <EditableCurrency
              value={props.posting.currency || ''}
              options={props.allCurrencies}
              editable={props.editable}
              inputId={`${props.listIdBase}-currency-discount`}
              onCommit={props.onCurrency}
            />
          }
        />
      }
    />
  )
}

function CashbackCard(props: PostingCardCommonProps) {
  const cfg = POSTING_TYPE_CONFIG.cashback
  return (
    <PostingCardShell
      type="cashback"
      pillLabel={cfg.label}
      editable={props.editable}
      canRemove={props.canRemove}
      onRemove={props.onRemove}
      accountField={
        <AccountField
          label="Source"
          icon="savings"
          value={props.posting.account}
          prefix={cfg.prefix}
          placeholder={cfg.placeholder}
          options={props.accountOptions}
          inputId={`${props.listIdBase}-account-cashback`}
          editable={props.editable}
          onCommit={props.onAccount}
        />
      }
      amountField={
        <AmountField
          amount={props.displayAmount}
          editable={props.editable}
          onAmount={props.onAmount}
          currencySlot={
            <EditableCurrency
              value={props.posting.currency || ''}
              options={props.allCurrencies}
              editable={props.editable}
              inputId={`${props.listIdBase}-currency-cashback`}
              onCommit={props.onCurrency}
            />
          }
        />
      }
    />
  )
}

function RewardCard(props: PostingCardCommonProps) {
  const cfg = POSTING_TYPE_CONFIG['reward-earn']
  return (
    <PostingCardShell
      type="reward-earn"
      pillLabel={cfg.label}
      editable={props.editable}
      canRemove={props.canRemove}
      onRemove={props.onRemove}
      accountField={
        <AccountField
          label="Program"
          icon="stars"
          value={props.posting.account}
          prefix={cfg.prefix}
          placeholder={cfg.placeholder}
          options={props.accountOptions}
          inputId={`${props.listIdBase}-account-reward-earn`}
          editable={props.editable}
          onCommit={props.onAccount}
        />
      }
      amountField={
        <AmountField
          amount={props.displayAmount}
          editable={props.editable}
          onAmount={props.onAmount}
          currencySlot={null}
        />
      }
    />
  )
}

function RedemptionCard(
  props: PostingCardCommonProps & {
    forex: ForexInfo | null
    onForexRate: (next: number | null) => void
    onForexTotal: (next: number | null) => void
    onPriceCurrency: (next: string) => void
  },
) {
  const cfg = POSTING_TYPE_CONFIG.redemption
  return (
    <PostingCardShell
      type="redemption"
      pillLabel={cfg.label}
      editable={props.editable}
      canRemove={props.canRemove}
      onRemove={props.onRemove}
      accountField={
        <AccountField
          label="Program"
          icon="redeem"
          value={props.posting.account}
          prefix={cfg.prefix}
          placeholder={cfg.placeholder}
          options={props.accountOptions}
          inputId={`${props.listIdBase}-account-redemption`}
          editable={props.editable}
          onCommit={props.onAccount}
        />
      }
      amountField={
        <AmountField
          amount={props.displayAmount}
          editable={props.editable}
          onAmount={props.onAmount}
          currencySlot={null}
        />
      }
      forexStrip={
        props.forex && (
          <ForexStrip
            forex={props.forex}
            editable={props.editable}
            onRate={props.onForexRate}
            onTotal={props.onForexTotal}
            homeCurrencyOptions={props.allCurrencies}
            onHomeCurrency={props.onPriceCurrency}
            listIdBase={`${props.listIdBase}-redemption`}
            label="VALUE"
          />
        )
      }
    />
  )
}

function GiftCardCard(
  props: PostingCardCommonProps & {
    typeKey: 'gift-card-load' | 'gift-card-redeem'
    forex: ForexInfo | null
    onForexRate: (next: number | null) => void
    onForexTotal: (next: number | null) => void
    onPriceCurrency: (next: string) => void
  },
) {
  const cfg = POSTING_TYPE_CONFIG[props.typeKey]
  const card = props.posting.metadata?.card
  const expires = props.posting.metadata?.expires
  const cardStr = card != null ? String(card) : null
  const expiresStr = expires != null ? String(expires) : null
  const showMeta = cardStr || expiresStr
  return (
    <PostingCardShell
      type={props.typeKey}
      pillLabel={cfg.label}
      editable={props.editable}
      canRemove={props.canRemove}
      onRemove={props.onRemove}
      accountField={
        <AccountField
          label="Issuer"
          icon="card_giftcard"
          value={props.posting.account}
          prefix={cfg.prefix}
          placeholder={cfg.placeholder}
          options={props.accountOptions}
          inputId={`${props.listIdBase}-account-${props.typeKey}`}
          editable={props.editable}
          onCommit={props.onAccount}
        />
      }
      amountField={
        <AmountField
          amount={props.displayAmount}
          editable={props.editable}
          onAmount={props.onAmount}
          currencySlot={
            props.posting.currency ? (
              <span className="txn-form-posting-card-currency-static">
                {props.posting.currency}
              </span>
            ) : null
          }
        />
      }
      forexStrip={
        <>
          {props.forex && (
            <ForexStrip
              forex={props.forex}
              editable={props.editable}
              onRate={props.onForexRate}
              onTotal={props.onForexTotal}
              homeCurrencyOptions={props.allCurrencies}
              onHomeCurrency={props.onPriceCurrency}
              listIdBase={`${props.listIdBase}-${props.typeKey}`}
              label={props.typeKey === 'gift-card-load' ? 'BASIS' : 'VALUE'}
            />
          )}
          {showMeta && (
            <div className="txn-form-posting-card-meta" data-testid="gift-card-meta">
              {cardStr && (
                <span className="txn-form-posting-card-meta-item">
                  <span className="txn-form-posting-card-meta-label">Card</span>
                  <span className="txn-form-posting-card-meta-value">{cardStr}</span>
                </span>
              )}
              {expiresStr && (
                <span className="txn-form-posting-card-meta-item">
                  <span className="txn-form-posting-card-meta-label">Expires</span>
                  <span className="txn-form-posting-card-meta-value">{expiresStr}</span>
                </span>
              )}
            </div>
          )}
        </>
      }
    />
  )
}

function PointsTransferCard({
  source,
  sink,
  editable,
  canRemove,
  accountOptions,
  listIdBase,
  onSourceAccount,
  onSinkAccount,
  onSourceAmount,
  onSinkAmount,
  onRemove,
}: {
  source: Posting
  sink: Posting
  editable: boolean
  canRemove: boolean
  accountOptions: string[]
  listIdBase: string
  onSourceAccount: (next: string) => void
  onSinkAccount: (next: string) => void
  onSourceAmount: (next: number) => void
  onSinkAmount: (next: number) => void
  onRemove: () => void
}) {
  const rewardsAccounts = accountOptions.filter((a) => a.startsWith('Assets:Rewards:'))
  const sourceMagnitude =
    source.amount != null && Number.isFinite(parseFloat(source.amount))
      ? Math.abs(parseFloat(source.amount))
      : null
  const sinkMagnitude =
    sink.amount != null && Number.isFinite(parseFloat(sink.amount))
      ? Math.abs(parseFloat(sink.amount))
      : null
  const priceTotal =
    sink.priceAmount != null && Number.isFinite(parseFloat(sink.priceAmount))
      ? parseFloat(sink.priceAmount)
      : null

  const forex: ForexInfo | null =
    sink.currency && source.currency && sinkMagnitude != null && priceTotal != null
      ? {
          foreignAmount: sinkMagnitude,
          foreignCurrency: sink.currency,
          homeCurrency: source.currency,
          homeAmount: priceTotal,
          rate: sinkMagnitude > 0 ? priceTotal / sinkMagnitude : null,
          source: 'total',
        }
      : null

  return (
    <div
      className="txn-form-posting-card txn-form-posting-card-points-transfer"
      data-posting-type="points-transfer"
    >
      <span className="txn-form-posting-card-type-pill">POINTS TRANSFER</span>
      <div className="txn-form-posting-card-main">
        <AccountField
          label="From"
          icon="arrow_upward"
          value={source.account}
          prefix="Assets:Rewards:"
          placeholder="HDFC:SmartBuy"
          options={rewardsAccounts}
          inputId={`${listIdBase}-points-transfer-source`}
          editable={editable}
          onCommit={onSourceAccount}
        />
        <AmountField
          amount={sourceMagnitude}
          editable={editable}
          onAmount={(next) => onSourceAmount(Math.abs(next))}
          currencySlot={null}
        />
      </div>
      <div className="txn-form-posting-card-main txn-form-posting-card-main-secondary">
        <AccountField
          label="To"
          icon="arrow_downward"
          value={sink.account}
          prefix="Assets:Rewards:"
          placeholder="Finnair"
          options={rewardsAccounts}
          inputId={`${listIdBase}-points-transfer-sink`}
          editable={editable}
          onCommit={onSinkAccount}
        />
        <AmountField
          amount={sinkMagnitude}
          editable={editable}
          onAmount={(next) => onSinkAmount(Math.abs(next))}
          currencySlot={null}
        />
      </div>
      {forex && (
        <ForexStrip
          forex={forex}
          editable={false}
          onRate={() => {}}
          onTotal={() => {}}
          listIdBase={`${listIdBase}-points-transfer`}
          label="RATIO"
        />
      )}
      {editable && (
        <button
          type="button"
          className="txn-form-posting-card-remove"
          aria-label="Remove points transfer"
          disabled={!canRemove}
          title={
            canRemove
              ? 'Remove points transfer'
              : 'Cannot remove — transaction would be empty'
          }
          onClick={onRemove}
        >
          <span className="material-symbols-outlined" aria-hidden>
            delete
          </span>
        </button>
      )}
    </div>
  )
}

const TRANSFER_VARIANT_CONFIG: Record<
  TransferVariant,
  { pill: string; fromPlaceholder: string; toPlaceholder: string }
> = {
  transfer: {
    pill: 'TRANSFER',
    fromPlaceholder: 'Bank:Savings',
    toPlaceholder: 'Bank:Checking',
  },
  'cc-payment': {
    pill: 'CC PAYMENT',
    fromPlaceholder: 'Bank:Checking',
    toPlaceholder: 'HDFC:Infinia',
  },
  'wallet-topup': {
    pill: 'WALLET TOP-UP',
    fromPlaceholder: 'Bank:Checking',
    toPlaceholder: 'Paytm',
  },
}

function TransferCard({
  from,
  to,
  variant,
  editable,
  canRemove,
  accountOptions,
  listIdBase,
  onFromAccount,
  onToAccount,
  onAmount,
  onRemove,
}: {
  from: Posting
  to: Posting
  variant: TransferVariant
  editable: boolean
  canRemove: boolean
  accountOptions: string[]
  listIdBase: string
  onFromAccount: (next: string) => void
  onToAccount: (next: string) => void
  onAmount: (next: number) => void
  onRemove: () => void
}) {
  const transferEligible = accountOptions.filter(
    (a) =>
      (a.startsWith('Assets:') && !a.startsWith('Assets:Rewards:')) ||
      a.startsWith('Liabilities:CC:'),
  )
  const magnitude =
    to.amount != null && Number.isFinite(parseFloat(to.amount))
      ? Math.abs(parseFloat(to.amount))
      : from.amount != null && Number.isFinite(parseFloat(from.amount))
        ? Math.abs(parseFloat(from.amount))
        : null
  const currency = to.currency || from.currency || ''
  const cfg = TRANSFER_VARIANT_CONFIG[variant]

  return (
    <div
      className={`txn-form-posting-card txn-form-posting-card-transfer txn-form-posting-card-transfer-${variant}`}
      data-posting-type={variant}
    >
      <span className="txn-form-posting-card-type-pill">{cfg.pill}</span>
      <div className="txn-form-posting-card-main">
        <AccountField
          label="From"
          icon="arrow_upward"
          value={from.account}
          prefix=""
          placeholder={cfg.fromPlaceholder}
          options={transferEligible}
          inputId={`${listIdBase}-transfer-from`}
          editable={editable}
          onCommit={onFromAccount}
        />
        <AmountField
          amount={magnitude}
          editable={editable}
          onAmount={(next) => onAmount(Math.abs(next))}
          currencySlot={
            currency ? (
              <span className="txn-form-posting-card-currency-static">{currency}</span>
            ) : null
          }
        />
      </div>
      <div className="txn-form-posting-card-main txn-form-posting-card-main-secondary">
        <AccountField
          label="To"
          icon="arrow_downward"
          value={to.account}
          prefix=""
          placeholder={cfg.toPlaceholder}
          options={transferEligible}
          inputId={`${listIdBase}-transfer-to`}
          editable={editable}
          onCommit={onToAccount}
        />
      </div>
      {editable && (
        <button
          type="button"
          className="txn-form-posting-card-remove"
          aria-label={`Remove ${cfg.pill.toLowerCase()}`}
          disabled={!canRemove}
          title={
            canRemove
              ? `Remove ${cfg.pill.toLowerCase()}`
              : 'Cannot remove — transaction would be empty'
          }
          onClick={onRemove}
        >
          <span className="material-symbols-outlined" aria-hidden>
            delete
          </span>
        </button>
      )}
    </div>
  )
}

function PostingRow({
  posting,
  editable,
  canRemove,
  allAccounts,
  allCurrencies,
  listIdBase,
  forex,
  onAccount,
  onAmount,
  onCurrency,
  onForexRate,
  onForexTotal,
  onPriceCurrency,
  onRemove,
}: {
  posting: Posting
  editable: boolean
  canRemove: boolean
  allAccounts: string[]
  allCurrencies: string[]
  listIdBase: string
  forex?: ForexInfo | null
  onAccount: (next: string) => void
  onAmount: (next: number) => void
  onCurrency: (next: string) => void
  onForexRate: (next: number | null) => void
  onForexTotal: (next: number | null) => void
  onPriceCurrency: (next: string) => void
  onRemove: () => void
}) {
  const type = classifyPosting(posting)
  const typeConfig = type === 'generic' ? null : POSTING_TYPE_CONFIG[type]
  const accountOptions = typeConfig
    ? allAccounts.filter((a) => a.startsWith(typeConfig.prefix))
    : []

  const rawAmount = posting.amount != null ? parseFloat(posting.amount) : null
  const currency = posting.currency || ''

  const displayAmount =
    typeConfig && rawAmount != null ? Math.abs(rawAmount) : rawAmount

  const handleAmountCommit = (next: number) => {
    const signed = typeConfig ? typeConfig.signMultiplier * Math.abs(next) : next
    onAmount(signed)
  }

  if (typeConfig) {
    const common: PostingCardCommonProps = {
      posting,
      editable,
      canRemove,
      accountOptions,
      allCurrencies,
      listIdBase,
      displayAmount,
      onAccount,
      onAmount: handleAmountCommit,
      onCurrency,
      onRemove,
    }
    if (type === 'expense' || type === 'expense-refund' || type === 'fee') {
      return <ExpenseCard {...common} typeKey={type} />
    }
    if (type === 'cc-spend' || type === 'cc-refund') {
      return (
        <CCSpendCard
          {...common}
          typeKey={type}
          forex={forex ?? null}
          onForexRate={onForexRate}
          onForexTotal={onForexTotal}
        />
      )
    }
    if (type === 'redemption') {
      return (
        <RedemptionCard
          {...common}
          forex={forex ?? null}
          onForexRate={onForexRate}
          onForexTotal={onForexTotal}
          onPriceCurrency={onPriceCurrency}
        />
      )
    }
    if (type === 'gift-card-load' || type === 'gift-card-redeem') {
      return (
        <GiftCardCard
          {...common}
          typeKey={type}
          forex={forex ?? null}
          onForexRate={onForexRate}
          onForexTotal={onForexTotal}
          onPriceCurrency={onPriceCurrency}
        />
      )
    }
    if (type === 'discount') return <DiscountCard {...common} />
    if (type === 'cashback') return <CashbackCard {...common} />
    return <RewardCard {...common} />
  }

  let tagLabel: string
  let tagClass: string
  if (typeConfig) {
    tagLabel = typeConfig.label
    tagClass = `txn-form-posting-tag ${typeConfig.tagClass}`
  } else if (rawAmount == null) {
    tagLabel = 'AUTO'
    tagClass = 'txn-form-posting-tag'
  } else if (rawAmount < 0) {
    tagLabel = 'CREDIT'
    tagClass = 'txn-form-posting-tag txn-form-posting-tag-credit'
  } else {
    tagLabel = 'DEBIT'
    tagClass = 'txn-form-posting-tag txn-form-posting-tag-debit'
  }

  return (
    <div className="txn-form-posting-row">
      <span className={tagClass}>{tagLabel}</span>
      {typeConfig ? (
        <AccountInput
          value={posting.account}
          prefix={typeConfig.prefix}
          placeholder={typeConfig.placeholder}
          options={accountOptions}
          inputId={`${listIdBase}-account-${type}`}
          ariaLabel={typeConfig.label}
          editable={editable}
          onCommit={onAccount}
        />
      ) : (
        <div
          className="txn-form-posting-account-box txn-form-posting-account-box-readonly"
          title={posting.account}
        >
          <span className="txn-form-posting-account">
            <AccountBreadcrumb account={posting.account} />
          </span>
        </div>
      )}
      <div className="txn-form-posting-value">
        {displayAmount != null && (
          <EditableAmount
            amount={displayAmount}
            editable={editable}
            onCommit={handleAmountCommit}
          />
        )}
        {displayAmount != null && (
          <EditableCurrency
            value={currency}
            options={allCurrencies}
            editable={editable}
            inputId={`${listIdBase}-currency-${type || 'generic'}`}
            onCommit={onCurrency}
          />
        )}
      </div>
      {editable && (
        <button
          type="button"
          className="txn-form-posting-remove"
          aria-label="Remove posting"
          disabled={!canRemove}
          title={canRemove ? 'Remove posting' : 'A transaction needs at least 2 postings'}
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </div>
  )
}

function FlagToggle({
  flag,
  editable,
  onChange,
}: {
  flag: string | undefined
  editable: boolean
  onChange: (next: '*' | '!') => void
}) {
  const isCleared = flag === '*'
  const isPending = flag === '!'

  return (
    <div className="txn-form-flag-toggle" role="radiogroup" aria-label="Transaction status">
      <button
        type="button"
        role="radio"
        aria-checked={isCleared}
        disabled={!editable}
        className={`txn-form-flag-toggle-btn ${isCleared ? 'txn-form-flag-toggle-btn-cleared' : ''}`}
        onClick={() => {
          if (!isCleared) onChange('*')
        }}
      >
        Cleared
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={isPending}
        disabled={!editable}
        className={`txn-form-flag-toggle-btn ${isPending ? 'txn-form-flag-toggle-btn-pending' : ''}`}
        onClick={() => {
          if (!isPending) onChange('!')
        }}
      >
        Pending
      </button>
    </div>
  )
}

type AddPostingKind =
  | 'generic'
  | 'expense'
  | 'cc-spend'
  | 'reward-earn'
  | 'redemption'
  | 'points-transfer'
  | 'transfer'
  | 'cc-payment'
  | 'wallet-topup'
  | 'gift-card-load'
  | 'gift-card-redeem'
  | 'discount'
  | 'cashback'

function AddPostingMenu({ onAdd }: { onAdd: (kind: AddPostingKind) => void }) {
  const [open, setOpen] = useState(false)
  const options: Array<{ kind: AddPostingKind; label: string }> = [
    { kind: 'expense', label: 'Expense' },
    { kind: 'cc-spend', label: 'CC Spend' },
    { kind: 'reward-earn', label: 'Reward Earn' },
    { kind: 'redemption', label: 'Redemption' },
    { kind: 'points-transfer', label: 'Points Transfer' },
    { kind: 'transfer', label: 'Transfer' },
    { kind: 'cc-payment', label: 'CC Payment' },
    { kind: 'wallet-topup', label: 'Wallet Top-up' },
    { kind: 'gift-card-load', label: 'Gift Card Load' },
    { kind: 'gift-card-redeem', label: 'Gift Card Redeem' },
    { kind: 'discount', label: 'Discount' },
    { kind: 'cashback', label: 'Cashback' },
    { kind: 'generic', label: 'Generic' },
  ]

  return (
    <div className="txn-form-posting-add-wrap">
      <button
        type="button"
        className="txn-form-posting-add"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="txn-form-posting-add-icon" aria-hidden="true">
          +
        </span>
        Add posting
      </button>
      {open && (
        <div className="txn-form-posting-add-popover" role="menu">
          {options.map((opt) => (
            <button
              key={opt.kind}
              type="button"
              role="menuitem"
              className="txn-form-posting-add-menu-item"
              onClick={() => {
                onAdd(opt.kind)
                setOpen(false)
              }}
            >
              <span
                className={`txn-form-posting-add-menu-dot txn-form-posting-add-menu-dot-${opt.kind}`}
                aria-hidden="true"
              />
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            className="txn-form-posting-add-menu-cancel"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function TxnCard({
  txn,
  index,
  editable,
  mutate,
  allAccounts,
  allCurrencies,
  accountCurrencyConstraints,
  homeCommodityByAccount,
  validationErrors,
}: {
  txn: Transaction
  index: number
  editable: boolean
  mutate: (fn: Mutator) => void
  allAccounts: string[]
  allCurrencies: string[]
  accountCurrencyConstraints: Record<string, string[]>
  homeCommodityByAccount: Record<string, string>
  validationErrors: string[]
}) {
  const dateStr = txn.date.toString()
  const firstLink = [...txn.links][0] || ''
  const listIdBase = `txn-${index}`
  const groups = groupPostings(txn.postings)
  const visibleGroups = groups.filter((g) =>
    g.kind === 'single' ? !isHiddenPosting(g.posting) : true,
  )

  return (
    <div className="txn-form-card">
      <div className="txn-form-header-card">
        <span className="txn-form-header-pill">TRANSACTION</span>
        <div className="txn-form-header-row">
          <div className="txn-form-header-field txn-form-header-field-date">
            <label className="txn-form-header-field-label">Date</label>
            <DateField
              value={dateStr}
              editable={editable}
              onCommit={(next) =>
                mutate((r) => {
                  const stub = parse(
                    `${next} * "_" "_"\n  Expenses:X 1 USD\n  Assets:Y -1 USD`,
                  )
                  if (stub.transactions.length > 0) {
                    r.transactions[index].date = stub.transactions[0].date
                  }
                })
              }
            />
          </div>
          <div className="txn-form-header-field txn-form-header-field-payee">
            <label className="txn-form-header-field-label">Payee</label>
            <EditableText
              value={txn.payee || ''}
              placeholder="Who got paid?"
              editable={editable}
              required
              fieldLabel="Payee"
              onCommit={(next) =>
                mutate((r) => {
                  r.transactions[index].payee = next
                })
              }
            />
          </div>
          <div className="txn-form-header-field txn-form-header-field-status">
            <label className="txn-form-header-field-label">Status</label>
            <FlagToggle
              flag={txn.flag}
              editable={editable}
              onChange={(next) =>
                mutate((r) => {
                  r.transactions[index].flag = next
                })
              }
            />
          </div>
        </div>

        <div className="txn-form-header-field txn-form-header-field-notes">
          <label className="txn-form-header-field-label">Notes</label>
          <EditableText
            value={txn.narration || ''}
            placeholder="Describe this transaction…"
            editable={editable}
            required
            fieldLabel="Notes"
            onCommit={(next) =>
              mutate((r) => {
                r.transactions[index].narration = next
              })
            }
          />
        </div>

        <div className="txn-form-header-field txn-form-header-field-link">
          <label className="txn-form-header-field-label">Link</label>
          <LinkField
            value={firstLink}
            editable={editable}
            onCommit={(next) =>
              mutate((r) => {
                const t = r.transactions[index]
                const links = [...t.links]
                if (links.length > 0) links[0] = next
                else links.push(next)
                t.links = new Set(links)
              })
            }
          />
        </div>
      </div>

      {validationErrors.length > 0 && (
        <ul className="txn-form-validation-errors">
          {validationErrors.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}

      <div className="txn-form-postings">
        {visibleGroups.map((group) => {
          if (group.kind === 'transfer') {
            const tr: TransferGroup = group
            return (
              <TransferCard
                key={`transfer-${tr.fromIndex}-${tr.toIndex}`}
                from={tr.from}
                to={tr.to}
                variant={tr.variant}
                editable={editable}
                canRemove={txn.postings.length >= 3}
                accountOptions={allAccounts}
                listIdBase={listIdBase}
                onFromAccount={(next) =>
                  mutate((r) => {
                    r.transactions[index].postings[tr.fromIndex].account = next
                  })
                }
                onToAccount={(next) =>
                  mutate((r) => {
                    r.transactions[index].postings[tr.toIndex].account = next
                  })
                }
                onAmount={(next) =>
                  mutate((r) => {
                    const magnitude = Math.abs(next)
                    const fromPosting = r.transactions[index].postings[tr.fromIndex]
                    const toPosting = r.transactions[index].postings[tr.toIndex]
                    fromPosting.amount = (-magnitude).toString()
                    toPosting.amount = magnitude.toString()
                  })
                }
                onRemove={() =>
                  mutate((r) => {
                    const hi = Math.max(tr.fromIndex, tr.toIndex)
                    const lo = Math.min(tr.fromIndex, tr.toIndex)
                    r.transactions[index].postings.splice(hi, 1)
                    r.transactions[index].postings.splice(lo, 1)
                  })
                }
              />
            )
          }
          if (group.kind === 'points-transfer') {
            const pair: PointsTransferGroup = group
            return (
              <PointsTransferCard
                key={`pair-${pair.sourceIndex}-${pair.sinkIndex}`}
                source={pair.source}
                sink={pair.sink}
                editable={editable}
                canRemove={txn.postings.length >= 4}
                accountOptions={allAccounts}
                listIdBase={listIdBase}
                onSourceAccount={(next) =>
                  mutate((r) => {
                    r.transactions[index].postings[pair.sourceIndex].account = next
                  })
                }
                onSinkAccount={(next) =>
                  mutate((r) => {
                    r.transactions[index].postings[pair.sinkIndex].account = next
                  })
                }
                onSourceAmount={(next) =>
                  mutate((r) => {
                    const magnitude = Math.abs(next)
                    const sourcePosting =
                      r.transactions[index].postings[pair.sourceIndex]
                    const sinkPosting = r.transactions[index].postings[pair.sinkIndex]
                    sourcePosting.amount = (-magnitude).toString()
                    sinkPosting.priceAmount = magnitude.toString()
                    if (!sinkPosting.atSigns) sinkPosting.atSigns = 2
                  })
                }
                onSinkAmount={(next) =>
                  mutate((r) => {
                    r.transactions[index].postings[pair.sinkIndex].amount =
                      Math.abs(next).toString()
                  })
                }
                onRemove={() =>
                  mutate((r) => {
                    const hi = Math.max(pair.sourceIndex, pair.sinkIndex)
                    const lo = Math.min(pair.sourceIndex, pair.sinkIndex)
                    r.transactions[index].postings.splice(hi, 1)
                    r.transactions[index].postings.splice(lo, 1)
                  })
                }
              />
            )
          }
          const posting = group.posting
          const originalIndex = group.index
          const makeForexHandler = (atSigns: 1 | 2) => (next: number | null) =>
            mutate((r) => {
              const target = r.transactions[index].postings[originalIndex]
              const targetCurrency =
                target.priceCurrency || homeCommodityByAccount[target.account]
              if (!targetCurrency) return
              if (next == null) {
                target.priceAmount = undefined
                target.priceCurrency = undefined
                target.atSigns = undefined
              } else {
                target.priceAmount = next.toString()
                target.priceCurrency = targetCurrency
                target.atSigns = atSigns
              }
            })
          return (
          <PostingRow
            key={originalIndex}
            posting={posting}
            editable={editable}
            canRemove={txn.postings.length > 2}
            allAccounts={allAccounts}
            allCurrencies={allCurrencies}
            listIdBase={listIdBase}
            forex={(() => {
              const t = classifyPosting(posting)
              if (t === 'cc-spend') {
                return buildForexInfo(posting, homeCommodityByAccount[posting.account])
              }
              if (t === 'redemption' || t === 'gift-card-load' || t === 'gift-card-redeem') {
                return buildForexInfo(posting, posting.priceCurrency)
              }
              return null
            })()}
            onAccount={(next) =>
              mutate((r) => {
                const target = r.transactions[index].postings[originalIndex]
                target.account = next
                const constraint = accountCurrencyConstraints[next]
                if (constraint && constraint.length === 1) {
                  target.currency = constraint[0]
                }
              })
            }
            onAmount={(next) =>
              mutate((r) => {
                const target = r.transactions[index].postings[originalIndex]
                target.amount = next.toString()
              })
            }
            onCurrency={(next) =>
              mutate((r) => {
                const target = r.transactions[index].postings[originalIndex]
                target.currency = next
              })
            }
            onForexRate={makeForexHandler(1)}
            onForexTotal={makeForexHandler(2)}
            onPriceCurrency={(next) =>
              mutate((r) => {
                const target = r.transactions[index].postings[originalIndex]
                target.priceCurrency = next
                if (!target.atSigns) target.atSigns = 2
              })
            }
            onRemove={() =>
              mutate((r) => {
                r.transactions[index].postings.splice(originalIndex, 1)
              })
            }
          />
          )
        })}
        {editable && (
          <AddPostingMenu
            onAdd={(kind) =>
              mutate((r) => {
                const t = r.transactions[index]
                const defaultCurrency =
                  t.postings.find((p) => p.currency && !p.account.startsWith('Assets:Rewards:') && !p.account.startsWith('Income:Rewards:'))?.currency || 'USD'
                if (kind === 'generic') {
                  t.postings.push(
                    new Posting({ account: 'Assets:Todo', amount: '0', currency: defaultCurrency }),
                  )
                } else if (kind === 'expense') {
                  t.postings.push(
                    new Posting({ account: 'Expenses:Todo', amount: '0', currency: defaultCurrency }),
                  )
                } else if (kind === 'cc-spend') {
                  t.postings.push(
                    new Posting({ account: 'Liabilities:CC:Todo', amount: '0', currency: defaultCurrency }),
                  )
                } else if (kind === 'reward-earn') {
                  t.postings.push(
                    new Posting({
                      account: 'Assets:Rewards:Todo',
                      amount: '0',
                      currency: 'POINTS',
                    }),
                  )
                  t.postings.push(
                    new Posting({
                      account: 'Income:Rewards:Todo',
                      amount: '0',
                      currency: 'POINTS',
                    }),
                  )
                } else if (kind === 'redemption') {
                  t.postings.push(
                    new Posting({
                      account: 'Assets:Rewards:Todo',
                      amount: '-1',
                      currency: 'POINTS',
                      priceAmount: '0',
                      priceCurrency: defaultCurrency,
                      atSigns: 2,
                    }),
                  )
                } else if (kind === 'points-transfer') {
                  t.postings.push(
                    new Posting({
                      account: 'Assets:Rewards:Todo:Source',
                      amount: '-1',
                      currency: 'POINTS_A',
                    }),
                  )
                  t.postings.push(
                    new Posting({
                      account: 'Assets:Rewards:Todo:Sink',
                      amount: '1',
                      currency: 'POINTS_B',
                      priceAmount: '1',
                      priceCurrency: 'POINTS_A',
                      atSigns: 2,
                    }),
                  )
                } else if (kind === 'transfer') {
                  t.postings.push(
                    new Posting({
                      account: 'Assets:Bank:Savings',
                      amount: '-1',
                      currency: defaultCurrency,
                    }),
                  )
                  t.postings.push(
                    new Posting({
                      account: 'Assets:Bank:Checking',
                      amount: '1',
                      currency: defaultCurrency,
                    }),
                  )
                } else if (kind === 'cc-payment') {
                  t.postings.push(
                    new Posting({
                      account: 'Assets:Bank:Checking',
                      amount: '-1',
                      currency: defaultCurrency,
                    }),
                  )
                  t.postings.push(
                    new Posting({
                      account: 'Liabilities:CC:Todo',
                      amount: '1',
                      currency: defaultCurrency,
                    }),
                  )
                } else if (kind === 'wallet-topup') {
                  t.postings.push(
                    new Posting({
                      account: 'Assets:Bank:Checking',
                      amount: '-1',
                      currency: defaultCurrency,
                    }),
                  )
                  t.postings.push(
                    new Posting({
                      account: 'Assets:Wallet:Todo',
                      amount: '1',
                      currency: defaultCurrency,
                    }),
                  )
                } else if (kind === 'gift-card-load') {
                  t.postings.push(
                    new Posting({
                      account: 'Liabilities:CC:Todo',
                      amount: '-1',
                      currency: defaultCurrency,
                    }),
                  )
                  t.postings.push(
                    new Posting({
                      account: 'Assets:GiftCard:Todo',
                      amount: '1',
                      currency: 'GC_POINTS',
                      priceAmount: '1',
                      priceCurrency: defaultCurrency,
                      atSigns: 2,
                    }),
                  )
                } else if (kind === 'gift-card-redeem') {
                  t.postings.push(
                    new Posting({
                      account: 'Assets:GiftCard:Todo',
                      amount: '-1',
                      currency: 'GC_POINTS',
                      priceAmount: '1',
                      priceCurrency: defaultCurrency,
                      atSigns: 2,
                    }),
                  )
                } else if (kind === 'discount') {
                  t.postings.push(
                    new Posting({
                      account: 'Equity:Discount',
                      amount: '0',
                      currency: defaultCurrency,
                    }),
                  )
                } else if (kind === 'cashback') {
                  t.postings.push(
                    new Posting({
                      account: 'Assets:Cashback:Pending:Todo',
                      amount: '0',
                      currency: defaultCurrency,
                    }),
                  )
                  t.postings.push(
                    new Posting({
                      account: 'Income:Cashback:Todo',
                      amount: '0',
                      currency: defaultCurrency,
                    }),
                  )
                }
              })
            }
          />
        )}
      </div>
    </div>
  )
}

export function TxnFormView({
  text,
  onChange,
  homeCommodityByAccount = {},
}: {
  text: string
  onChange?: (next: string) => void
  homeCommodityByAccount?: Record<string, string>
}) {
  if (!text.trim()) {
    return <div className="txn-card-form-empty">Start typing in the Code view to see the form.</div>
  }

  let result: ParseResult
  try {
    result = parse(text)
  } catch (err) {
    const message =
      err instanceof BeancountParseError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err)
    return <div className="txn-form-error">Parse error: {message}</div>
  }

  if (result.transactions.length === 0) {
    return <div className="txn-card-form-empty">No transactions recognized yet.</div>
  }

  const editable = onChange != null

  const mutate = (fn: Mutator) => {
    if (!onChange) return
    let fresh: ParseResult
    try {
      fresh = parse(text)
    } catch {
      return
    }
    fn(fresh)
    onChange(fresh.toFormattedString())
  }

  const allAccounts = accountsMatching(result, '')
  const allCurrencies = currenciesIn(result, homeCommodityByAccount)
  const accountCurrencyConstraints = constraintCurrenciesByAccount(result)
  const validationErrorsByTxn = validateByTxn(text)

  return (
    <div className="txn-form-list">
      {result.transactions.map((t, i) => (
        <TxnCard
          key={i}
          txn={t}
          index={i}
          editable={editable}
          mutate={mutate}
          allAccounts={allAccounts}
          allCurrencies={allCurrencies}
          accountCurrencyConstraints={accountCurrencyConstraints}
          homeCommodityByAccount={homeCommodityByAccount}
          validationErrors={validationErrorsByTxn.get(i) ?? []}
        />
      ))}
    </div>
  )
}
