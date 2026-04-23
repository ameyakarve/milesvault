import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { LedgerEditor } from './ledger-editor'
import type { AccountCompleter, Validator } from './editor'

const BASELINE = `2026-04-17 * "Amudham" "coffee"
  Liabilities:CC:HSBC   -35.00 INR
  Expenses:Food:Coffee             35.00 INR

2026-04-16 * "Zomato" "dinner"
  Liabilities:CC:HDFC  -1220.00 INR
  Expenses:Food:Restaurant       1220.00 INR

2026-04-15 * "HDFC Savings" "ATM withdrawal"
  Assets:Bank:HDFC:Savings   -5000.00 INR
  Assets:Cash                 5000.00 INR
`

const DIRTY = `2026-04-17 * "Amudham" "coffee + tip"
  Liabilities:CC:HSBC   -40.00 INR
  Expenses:Food:Coffee             40.00 INR

2026-04-16 * "Zomato" "dinner"
  Liabilities:CC:HDFC  -1220.00 INR
  Expenses:Food:Restaurant       1220.00 INR

2026-04-15 * "HDFC Savings" "ATM withdrawal"
  Assets:Bank:HDFC:Savings   -5000.00 INR
  Assets:Cash                 5000.00 INR

2026-04-14 * "New txn" "created after baseline"
  Liabilities:CC:HDFC   -99.00 INR
  Expenses:Misc                    99.00 INR
`

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen bg-white text-navy-700 font-sans">
      <section className="w-[640px] h-screen flex flex-col border-r border-slate-200">
        {children}
      </section>
    </div>
  )
}

function Host({
  initialValue,
  baseline,
  validators,
  completeAccount,
}: {
  initialValue: string
  baseline?: string
  validators?: readonly Validator[]
  completeAccount?: AccountCompleter
}) {
  const [value, setValue] = useState(initialValue)
  return (
    <LedgerEditor
      className="h-full"
      value={value}
      baseline={baseline}
      validators={validators}
      completeAccount={completeAccount}
      onChange={setValue}
    />
  )
}

const meta: Meta<typeof Host> = {
  title: 'LedgerNew / Editor',
  component: Host,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Frame>
        <Story />
      </Frame>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof Host>

export const Empty: Story = {
  args: { initialValue: '' },
}

export const Clean: Story = {
  args: { initialValue: BASELINE, baseline: BASELINE },
  parameters: {
    docs: {
      description: {
        story: 'Buffer matches baseline. No created/updated highlights, no diagnostics.',
      },
    },
  },
}

export const Dirty: Story = {
  args: { initialValue: DIRTY, baseline: BASELINE },
  parameters: {
    docs: {
      description: {
        story:
          'Buffer diverges from baseline. First txn shows updated-line background + word-added marks; last is fully created.',
      },
    },
  },
}

const KITCHEN_SINK = `2026-12-31 * "Marriott" "tier reset"
  Assets:Rewards:Status:Marriott                         -50 MAR-NIGHTS
  Expenses:Void                                           50 MAR-NIGHTS

2026-12-31 * "Avios" "annual expiry"
  Assets:Rewards:Points:Avios                          -2000 AVIOS
  Expenses:Void                                         2000 AVIOS

2026-06-10 *  "Marriott" "award night Goa"
  Expenses:Travel:Hotels                               20000 INR
  Assets:Rewards:Points:Marriott                      -30000 MARRIOTT @@ 20000 INR

2026-06-01 * "BA" "award flight LHR-BOM"
  Assets:Rewards:Points:Avios                         -20000 AVIOS @@ 47500 INR
  Liabilities:CC:HDFC:Infinia                          -2500 INR
  Expenses:Travel:Flights                              50000 INR

2026-05-12 * "HDFC Infinia" "points → statement credit"
  Assets:Rewards:Points:SmartBuy                       -5000 SMARTBUY
  Liabilities:CC:HDFC:Infinia                           1250 INR @@ 5000 SMARTBUY

2026-05-10 * "SBI Rewards" "Amazon voucher"
  Assets:Rewards:Points:SBI                            -4000 SBI-RP
  Assets:Loaded:GiftCards:Amazon                        1000 INR @@ 4000 SBI-RP

2026-04-30 * "HDFC" "Infinia April statement cashback"
  Liabilities:CC:HDFC:Infinia                            250 INR
  Income:Void                                           -250 INR

2026-04-25 * "HDFC" "personal loan EMI April"
  Assets:Bank:HDFC:Savings                            -12000 INR
  Liabilities:Loans:HDFC:Personal                       9500 INR
  Expenses:Finance:Interest                             2500 INR

2026-04-22 * "Funny Cafe" "Funny Cafe"
  Expenses:Food:Coffee                                   500 INR
  Liabilities:CC:HSBC:Cashback                          -500 INR

2026-04-21 * "Amex MR" "transfer to Marriott Bonvoy"
  Assets:Rewards:Points:MR                            -20000 MR
  Assets:Rewards:Points:Marriott                       20000 MARRIOTT @@ 20000 MR

2026-04-20 * "HDFC SmartBuy" "transfer to Avios"
  Assets:Rewards:Points:SmartBuy                      -10000 SMARTBUY
  Assets:Rewards:Points:Avios                          15000 AVIOS @@ 10000 SMARTBUY

2026-04-20 * "Louvre" "museum admission"
;  7. Forex / DCC — cross-currency with markup in price
  Assets:Loaded:ForexCards:HDFC                       -19.25 USD
  Expenses:Travel:Museums                                 17 EUR @@ 19.25 USD

2026-04-19 * "Amudham Cafe" "Coffee"
  Expenses:Food                                           30 INR
  Liabilities:CC:HSBC:Platinum                           -30 INR

2026-04-19 * "Amudham Cafe" "SIK coffee combo"
  Expenses:Food:Coffee                                   105 INR
  Liabilities:CC:HSBC:Cashback                          -105 INR
  Income:Void                                         -10.50 INR
  Liabilities:CC:HSBC:Cashback                         10.50 INR

2026-04-19 * "Amudham Cafe" "SIK coffee combo"
  Expenses:Food                                          105 INR
  Liabilities:CC:HSBC:Cashback                          -105 INR
  Income:Void                                         -10.50 INR
  Liabilities:CC:HSBC:Cashback                         10.50 INR

2026-04-19 * "Ramesh Cafe" "SIK coffee combo"
  Expenses:Food:Coffee                                   200 INR
  Liabilities:CC:HSBC:Cashback                          -200 INR
  Income:Void                                            -10 INR
  Liabilities:CC:HSBC:Cashback                            10 INR

2026-04-18 * "Rahul" "settled dinner split"
  Assets:Receivables:Rahul                             -1000 INR
  Assets:Bank:HDFC:Savings                              1000 INR

2026-04-18 * "Café de Flore" "breakfast in Paris"
;6. Forex card spend — held currency (no conversion)
  Assets:Loaded:ForexCards:HDFC                          -22 EUR
  Expenses:Food:Restaurant                                22 EUR

2026-04-16 * "Amazon" "headphones + ₹150 AmazonPay cashback"
  Liabilities:CC:HDFC:Infinia                          -3000 INR
  Expenses:Shopping:Electronics                         3000 INR
  Assets:Loaded:Wallets:AmazonPay                        150 INR
  Income:Void                                           -150 INR

2026-04-16 * "Zomato" "dinner + 5% Paytm cashback"
  Assets:Loaded:Wallets:Paytm                          -1000 INR
  Expenses:Food:Restaurant                              1000 INR
  Assets:Loaded:Wallets:Paytm                             50 INR
  Income:Void                                            -50 INR

2026-04-16 * "Zomato" "dinner, 10% HDFC offer"
  Liabilities:CC:HDFC:Infinia                          -1000 INR
  Expenses:Food:Restaurant                              1000 INR
  Liabilities:CC:HDFC:Infinia                            100 INR
  Income:Void                                           -100 INR

2026-04-16 * "Zomato" "dinner ₹1000 — ₹150 promo"
  Liabilities:CC:HDFC:Infinia                           -850 INR
  Expenses:Food:Restaurant                              1000 INR
  Income:Savings:Discounts                              -150 INR

2026-04-16 * "Blue Tokai" "morning coffee"
;1. Simple CC expense
  Liabilities:CC:HDFC:Infinia:4521                      -220 INR
  Expenses:Food:Coffee                                   220 INR

2026-04-16 * "Amazon" "book restock"
  Assets:Loaded:GiftCards:Amazon                        -499 INR
  Expenses:Entertainment:Books                           499 INR

2026-04-16 * "Swiggy" "lunch"
  Assets:Loaded:PrepaidCards:Jupiter                    -340 INR
  Expenses:Food:Delivery                                 340 INR

2026-04-16 * "Uber" "auto to office"
;3. Wallet spend
  Assets:Loaded:Wallets:Paytm                            -85 INR
  Expenses:Travel:Local                                   85 INR

2026-04-16 * "BigBasket" "weekly groceries"
;2. Debit card spend (zero-sum pass-through, 4 postings)
  Assets:Bank:HDFC:Savings                             -2150 INR
  Assets:DC:HDFC:1234                                   2150 INR
  Assets:DC:HDFC:1234                                  -2150 INR
  Expenses:Food:Groceries                               2150 INR

2026-04-16 * "HDFC" "Infinia annual fee"
  Expenses:Finance:Fees                                12500 INR
  Liabilities:CC:HDFC:Infinia                         -12500 INR

;; P2P UPI — loan to a friend (recoverable, not an expense)

2026-04-15 * "HDFC" "Infinia revolving interest"
  Expenses:Finance:Interest                              850 INR
  Liabilities:CC:HDFC:Infinia                           -850 INR

2026-04-14 * "Netflix" "monthly subscription" #subscription ^netflix-2026
  Liabilities:CC:HDFC:Infinia                           -649 INR
  Expenses:Subscriptions:Streaming                       649 INR

2026-04-12 * "Priya" "lent for flight booking"
  Assets:Bank:HDFC:Savings                             -8000 INR
  Assets:Receivables:Priya                              8000 INR

2026-04-12 * "Mom" "Diwali gift"
  Assets:Bank:HDFC:Savings                             -5000 INR
  Expenses:Void                                         5000 INR

2026-04-11 * "Toit" "dinner with Rahul"
  Liabilities:CC:HDFC:Infinia                          -2000 INR
  Expenses:Food:Restaurant                              1000 INR
  Assets:Receivables:Rahul                              1000 INR

2026-04-10 * "CRED" "HDFC bill + ₹25 CRED cashback"
  Assets:Bank:HDFC:Savings                            -10000 INR
  Liabilities:CC:HDFC:Infinia                          10000 INR
  Assets:Loaded:Wallets:CRED                              25 INR
  Income:Void                                            -25 INR

2026-04-10 * "Amazon" "refund: returned headphones"
  Liabilities:CC:HDFC:Infinia                           3000 INR
  Expenses:Shopping:Electronics                        -3000 INR

2026-04-08 * "Zomato" "refund: cancelled order"
  Expenses:Food:Delivery                                -420 INR
  Liabilities:CC:HDFC:Infinia                            420 INR

2026-04-07 * "Auto" "airport ride "
  Assets:Cash                                           -350 INR
  Expenses:Transport:Auto                                350 INR

2026-04-07 * "ATM" "HDFC Koregaon Park withdrawal"
  Assets:Bank:HDFC:Savings                             -5000 INR
  Assets:Cash                                           5000 INR

2026-04-06 * "Singapore Airlines" "BOM-SIN business"
  Liabilities:CC:HDFC:Infinia                         -95000 INR
  Expenses:Travel:Flights                              95000 INR
  Assets:Rewards:Points:Krisflyer                      12000 KRISFLYER
  Income:Void                                         -12000 KRISFLYER
  Assets:Rewards:Status:Krisflyer                        135 KF-PPS
  Income:Void                                           -135 KF-PPS

2026-04-06 * "Self" "move savings to HYSA"
  Assets:Bank:HDFC:Savings                           -100000 INR
  Assets:Bank:ICICI:HYSA                              100000 INR

2026-04-05 * "Marriott" "Bengaluru stay — nights credit"
  Assets:Rewards:Status:Marriott                           3 MAR-NIGHTS
  Income:Void                                             -3 MAR-NIGHTS

2026-04-05 * "Marriott" "Bengaluru stay"
  Liabilities:CC:HDFC:Infinia                         -15000 INR
  Expenses:Travel:Hotels                               15000 INR
  Assets:Rewards:Points:Marriott                        7500 MARRIOTT
  Income:Void                                          -7500 MARRIOTT

2026-04-05 * "HDFC" "April Infinia bill payment"
  Assets:Bank:HDFC:Savings                            -42350 INR
  Liabilities:CC:HDFC:Infinia                          42350 INR

2026-04-04 * "BigBasket" "weekly groceries"
  Liabilities:CC:SBI:Elite                             -3500 INR
  Expenses:Groceries                                    3500 INR
  Assets:Rewards:Points:SBI                               35 SBI-RP
  Income:Void                                            -35 SBI-RP

2026-04-03 * "Amazon" "laptop purchase"
  Liabilities:CC:HDFC:Infinia                         -80000 INR
  Expenses:Shopping:Electronics                        80000 INR
  Assets:Rewards:Points:SmartBuy                        2400 SMARTBUY
  Income:Void                                          -2400 SMARTBUY

2026-04-03 * "HDFC" "personal loan disbursed"
  Assets:Bank:HDFC:Savings                            500000 INR
  Liabilities:Loans:HDFC:Personal                    -500000 INR

2026-04-02 * "BA" "LHR-BOM flight"
  Liabilities:CC:HDFC:Infinia                         -50000 INR
  Expenses:Travel:Flights                              50000 INR
  Assets:Rewards:Points:Avios                            500 AVIOS
  Income:Void                                           -500 AVIOS

2026-04-01 * "Jupiter" "prepaid card reload"
  Assets:Bank:HDFC:Savings                             -2000 INR
  Assets:Loaded:PrepaidCards:Jupiter                    2000 INR

2026-04-01 * "Mom" "birthday — Amazon Pay"
  Income:Void                                          -2000 INR
  Assets:Loaded:GiftCards:Amazon                        2000 INR

2026-04-01 * "HDFC" "forex card load"
  Assets:Bank:HDFC:Savings                            -50000 INR
  Assets:Loaded:ForexCards:HDFC                          600 USD @@ 50000 INR
`

export const KitchenSink: Story = {
  args: { initialValue: KITCHEN_SINK, baseline: KITCHEN_SINK },
  parameters: {
    docs: {
      description: {
        story:
          'Broad buffer covering forex, rewards/points, cashback, refunds, P2P, multi-currency @@ prices, tags and links — a single place to eyeball chip rendering, alignment, and validators.',
      },
    },
  },
}

const BROKEN = `2026-04-17 * "Amudham" "coffee"
  Liabilities:CC:HSBC   -35.00 INR
  Expenses:Food:Coffee             35.00 INR

2026-04-16 & "Zomato" "dinner"
  Liabilities:CC:HDFC  -1220.00 INR
  Expenses:Food:Restaurant       1220.00 INR

2026-04-15 * "HDFC Savings" "ATM withdrawal
  Assets:Bank:HDFC:Savings   -5000.00 INR
  Assets:Cash                 5000.00 INR
`

export const WithParseErrors: Story = {
  args: { initialValue: BROKEN },
  parameters: {
    docs: {
      description: {
        story:
          'Second txn uses invalid flag "&"; third txn has unterminated narration string. Lezer marks error spans; CodeMirror underlines them and shows gutter markers.',
      },
    },
  },
}

const UNBALANCED = `2026-04-17 * "Amudham" "coffee"
  Liabilities:CC:HSBC   -35.00 INR
  Expenses:Food:Coffee             30.00 INR
`

export const WithUnbalancedTxn: Story = {
  args: { initialValue: UNBALANCED },
  parameters: {
    docs: {
      description: {
        story:
          'Postings sum to -5 INR. Block-level balance validator flags the header with a red underline + gutter marker.',
      },
    },
  },
}

const MISSING_PAYEE = `2026-04-17 * "coffee"
  Liabilities:CC:HSBC   -35.00 INR
  Expenses:Food:Coffee   35.00 INR
`

export const WithMissingPayee: Story = {
  args: { initialValue: MISSING_PAYEE },
  parameters: {
    docs: {
      description: {
        story:
          'Header has only one string (= narration), no payee. payee-present validator underlines the header.',
      },
    },
  },
}

const ELIDED_AMOUNT = `2026-04-17 * "Amudham" "coffee"
  Liabilities:CC:HSBC   -35.00 INR
  Expenses:Food:Coffee
`

export const WithElidedAmount: Story = {
  args: { initialValue: ELIDED_AMOUNT },
  parameters: {
    docs: {
      description: {
        story:
          'One posting has no amount (elided). amount-required validator flags the posting line.',
      },
    },
  },
}

const CASHBACK_POSITIVE = `2026-04-17 * "HDFC" "April statement cashback"
  Liabilities:CC:HDFC          -250.00 INR
  Income:Void       250.00 INR
`

export const WithPositiveCashback: Story = {
  args: { initialValue: CASHBACK_POSITIVE },
  parameters: {
    docs: {
      description: {
        story:
          'Income:Void posting is positive. cashback-sign validator underlines the amount.',
      },
    },
  },
}

const CASHBACK_NO_MATCH = `2026-04-17 * "HDFC" "cashback split oddly"
  Liabilities:CC:HDFC          -200.00 INR
  Income:Void      -250.00 INR
  Expenses:Food:Coffee          450.00 INR
`

export const WithCashbackNoMatchingPosting: Story = {
  args: { initialValue: CASHBACK_NO_MATCH },
  parameters: {
    docs: {
      description: {
        story:
          'Cashback is -250 INR but no other posting equals +250 INR. cashback-counterpart validator flags the cashback posting.',
      },
    },
  },
}

const CASHBACK_NO_PAYMENT = `2026-04-17 * "Redeem" "cashback fully offsets expense"
  Expenses:Food:Coffee     100.00 INR
  Income:Void -100.00 INR
`

export const WithCashbackButNoPayment: Story = {
  args: { initialValue: CASHBACK_NO_PAYMENT },
  parameters: {
    docs: {
      description: {
        story:
          'Txn has only Expenses + `Income:Void` postings — no real payment leg. cashback-needs-payment validator flags the header.',
      },
    },
  },
}

const COMPLETION_SEED = `2026-04-17 * "Amudham" "coffee"
  Liabilities:CC:HSBC   -35.00 INR
  Expenses:`

export const WithAccountAutocomplete: Story = {
  args: { initialValue: COMPLETION_SEED },
  parameters: {
    docs: {
      description: {
        story:
          'Caret parked after `Expenses:`. Typing `:` after any capitalized segment triggers the built-in account completer (prefix match over default account list).',
      },
    },
  },
}

export const WithNoopValidator: Story = {
  args: {
    initialValue: BASELINE,
    baseline: BASELINE,
    validators: [() => []],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Validator wiring is live but returns no diagnostics. Replace the no-op in `validators` with real validators (e.g. `(doc) => Diagnostic[]`) to see lint gutter + underlines appear.',
      },
    },
  },
}
