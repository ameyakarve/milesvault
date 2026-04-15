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

type SelectOption = { value: string; label: string }

type PostingType = 'expense' | 'cc-spend' | 'reward-earn' | 'discount' | 'cashback' | 'generic'

type PostingTypeConfig = {
  label: string
  tagClass: string
  prefix: string
  placeholder: string
  signMultiplier: 1 | -1
  signless: boolean
}

const POSTING_TYPE_CONFIG: Record<Exclude<PostingType, 'generic'>, PostingTypeConfig> = {
  expense: {
    label: 'EXPENSE',
    tagClass: 'txn-form-posting-tag-expense',
    prefix: 'Expenses:',
    placeholder: 'Food:Dining',
    signMultiplier: 1,
    signless: true,
  },
  'cc-spend': {
    label: 'CC SPEND',
    tagClass: 'txn-form-posting-tag-cc',
    prefix: 'Liabilities:CC:',
    placeholder: 'HDFC:Infinia',
    signMultiplier: -1,
    signless: true,
  },
  'reward-earn': {
    label: 'REWARD',
    tagClass: 'txn-form-posting-tag-reward',
    prefix: 'Assets:Rewards:',
    placeholder: 'HDFC:SmartBuy',
    signMultiplier: 1,
    signless: true,
  },
  discount: {
    label: 'DISCOUNT',
    tagClass: 'txn-form-posting-tag-discount',
    prefix: 'Equity:Discount:',
    placeholder: 'HDFC:Infinia',
    signMultiplier: -1,
    signless: true,
  },
  cashback: {
    label: 'CASHBACK',
    tagClass: 'txn-form-posting-tag-cashback',
    prefix: 'Income:Cashback:',
    placeholder: 'HDFC:Infinia',
    signMultiplier: -1,
    signless: true,
  },
}

function classifyPosting(p: Posting): PostingType {
  if (p.account.startsWith('Expenses:')) return 'expense'
  if (p.account.startsWith('Liabilities:CC:')) return 'cc-spend'
  if (p.account.startsWith('Assets:Rewards:')) return 'reward-earn'
  if (p.account === 'Equity:Discount' || p.account.startsWith('Equity:Discount:')) return 'discount'
  if (p.account.startsWith('Income:Cashback:')) return 'cashback'
  return 'generic'
}

function isHiddenPosting(p: Posting): boolean {
  if (p.account.startsWith('Income:Rewards:')) return true
  if (p.account.startsWith('Assets:Cashback:Pending:')) return true
  return false
}

type ForexInfo = {
  foreignAmount: number
  foreignCurrency: string
  homeCurrency: string
  homeAmount: number | null
  rate: number | null
  source: 'rate' | 'total' | null
}

function buildForexForCcLeg(cc: Posting, homeCurrency: string | undefined): ForexInfo | null {
  if (!homeCurrency) return null
  if (!cc.currency || cc.currency === homeCurrency) return null
  const foreignAmount = cc.amount != null ? Math.abs(parseFloat(cc.amount)) : NaN
  if (!Number.isFinite(foreignAmount) || foreignAmount === 0) return null

  let homeAmount: number | null = null
  let rate: number | null = null
  let source: 'rate' | 'total' | null = null
  if (cc.priceAmount && cc.priceCurrency === homeCurrency) {
    const pa = parseFloat(cc.priceAmount)
    if (Number.isFinite(pa)) {
      if (cc.atSigns === 2) {
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
    foreignCurrency: cc.currency,
    homeCurrency,
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
      if (isRewardAccount(p.account)) continue
      if (p.currency) seen.add(p.currency)
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

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="txn-form-field-label">{children}</span>
}

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
          ×
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
}: {
  forex: ForexInfo
  editable: boolean
  onRate: (next: number | null) => void
  onTotal: (next: number | null) => void
}) {
  return (
    <div className="txn-form-posting-card-forex" data-testid="forex-strip">
      <span className="txn-form-posting-card-forex-label">FOREX</span>
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
          <span className="txn-form-posting-card-forex-unit">{forex.homeCurrency}</span>
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

function ExpenseCard(props: PostingCardCommonProps) {
  const cfg = POSTING_TYPE_CONFIG.expense
  return (
    <PostingCardShell
      type="expense"
      pillLabel={cfg.label}
      editable={props.editable}
      canRemove={props.canRemove}
      onRemove={props.onRemove}
      accountField={
        <AccountField
          label="Category"
          icon="restaurant"
          value={props.posting.account}
          prefix={cfg.prefix}
          placeholder={cfg.placeholder}
          options={props.accountOptions}
          inputId={`${props.listIdBase}-account-expense`}
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
              inputId={`${props.listIdBase}-currency-expense`}
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
    forex: ForexInfo | null
    onForexRate: (next: number | null) => void
    onForexTotal: (next: number | null) => void
  },
) {
  const cfg = POSTING_TYPE_CONFIG['cc-spend']
  return (
    <PostingCardShell
      type="cc-spend"
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
          inputId={`${props.listIdBase}-account-cc-spend`}
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
              inputId={`${props.listIdBase}-currency-cc-spend`}
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
          currencySlot={
            <span
              className="txn-form-posting-card-currency-static"
              aria-label="Currency"
            >
              {props.posting.currency || ''}
            </span>
          }
        />
      }
    />
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
    typeConfig?.signless && rawAmount != null ? Math.abs(rawAmount) : rawAmount

  const handleAmountCommit = (next: number) => {
    const signed = typeConfig ? typeConfig.signMultiplier * Math.abs(next) : next
    onAmount(signed)
  }

  if (
    (type === 'expense' ||
      type === 'cc-spend' ||
      type === 'reward-earn' ||
      type === 'discount' ||
      type === 'cashback') &&
    typeConfig
  ) {
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
    if (type === 'expense') return <ExpenseCard {...common} />
    if (type === 'cc-spend') {
      return (
        <CCSpendCard
          {...common}
          forex={forex ?? null}
          onForexRate={onForexRate}
          onForexTotal={onForexTotal}
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

type AddPostingKind = 'generic' | 'expense' | 'cc-spend' | 'reward-earn' | 'discount' | 'cashback'

function AddPostingMenu({ onAdd }: { onAdd: (kind: AddPostingKind) => void }) {
  const [open, setOpen] = useState(false)
  const options: Array<{ kind: AddPostingKind; label: string }> = [
    { kind: 'expense', label: 'Expense' },
    { kind: 'cc-spend', label: 'CC Spend' },
    { kind: 'reward-earn', label: 'Reward Earn' },
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
}: {
  txn: Transaction
  index: number
  editable: boolean
  mutate: (fn: Mutator) => void
  allAccounts: string[]
  allCurrencies: string[]
  accountCurrencyConstraints: Record<string, string[]>
  homeCommodityByAccount: Record<string, string>
}) {
  const dateStr = txn.date.toString()
  const firstLink = [...txn.links][0] || ''
  const listIdBase = `txn-${index}`
  const visiblePostings = txn.postings
    .map((p, i) => ({ posting: p, originalIndex: i }))
    .filter(({ posting }) => !isHiddenPosting(posting))

  return (
    <div className="txn-form-card">
      <div className="txn-form-top-row">
        <div className="txn-form-field txn-form-field-date">
          <FieldLabel>Date</FieldLabel>
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
        <div className="txn-form-field txn-form-field-grow">
          <FieldLabel>Payee</FieldLabel>
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

      <div className="txn-form-field">
        <FieldLabel>Notes</FieldLabel>
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

      <div className="txn-form-field">
        <FieldLabel>Link</FieldLabel>
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

      <hr className="txn-form-divider" />

      <div className="txn-form-postings">
        {visiblePostings.map(({ posting, originalIndex }) => (
          <PostingRow
            key={originalIndex}
            posting={posting}
            editable={editable}
            canRemove={txn.postings.length > 2}
            allAccounts={allAccounts}
            allCurrencies={allCurrencies}
            listIdBase={listIdBase}
            forex={
              classifyPosting(posting) === 'cc-spend'
                ? buildForexForCcLeg(posting, homeCommodityByAccount[posting.account])
                : null
            }
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
            onForexRate={(next) =>
              mutate((r) => {
                const target = r.transactions[index].postings[originalIndex]
                const home = homeCommodityByAccount[target.account]
                if (!home) return
                if (next == null) {
                  target.priceAmount = undefined
                  target.priceCurrency = undefined
                  target.atSigns = undefined
                } else {
                  target.priceAmount = next.toString()
                  target.priceCurrency = home
                  target.atSigns = 1
                }
              })
            }
            onForexTotal={(next) =>
              mutate((r) => {
                const target = r.transactions[index].postings[originalIndex]
                const home = homeCommodityByAccount[target.account]
                if (!home) return
                if (next == null) {
                  target.priceAmount = undefined
                  target.priceCurrency = undefined
                  target.atSigns = undefined
                } else {
                  target.priceAmount = next.toString()
                  target.priceCurrency = home
                  target.atSigns = 2
                }
              })
            }
            onRemove={() =>
              mutate((r) => {
                r.transactions[index].postings.splice(originalIndex, 1)
              })
            }
          />
        ))}
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
        />
      ))}
    </div>
  )
}
