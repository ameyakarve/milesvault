export type BeancountExample = {
  id: string
  label: string
  description: string
  text: string
}

export const PRIMITIVES: BeancountExample[] = [
  {
    id: 'spend',
    label: 'Spend (card or cash)',
    description:
      'Debit an expense account; credit a funding source (credit card, cash, bank, wallet).',
    text: `2026-04-14 * "Amudham" "Team dinner"
  Expenses:Food:Dining           1500 INR
  Liabilities:CC:HDFC:Infinia   -1500 INR`,
  },
  {
    id: 'earn-cashback',
    label: 'Earn cashback (pending)',
    description:
      'Accrues cashback that the card has promised but not yet credited. Pairs Assets:Cashback:Pending with Income:Cashback. Attach alongside a spend; never stands alone.',
    text: `2026-04-14 * "Amudham" "Dinner with 5% cashback"
  Expenses:Food:Dining                      1500 INR
  Liabilities:CC:HDFC:Infinia              -1500 INR
  Assets:Cashback:Pending:HDFC:Infinia        75 INR
  Income:Cashback:HDFC:Infinia               -75 INR`,
  },
  {
    id: 'earn-points',
    label: 'Earn reward points',
    description:
      'Accrues points/miles in the program commodity. Pairs Assets:Rewards with Income:Rewards. Attach alongside a spend.',
    text: `2026-04-14 * "Amudham" "Dinner earning 50 SmartBuy points"
  Expenses:Food:Dining              1500 INR
  Liabilities:CC:HDFC:Infinia      -1500 INR
  Assets:Rewards:HDFC:SmartBuy        50 SMARTBUY_POINTS
  Income:Rewards:HDFC:Earned         -50 SMARTBUY_POINTS`,
  },
  {
    id: 'discount',
    label: 'Discount at point of sale',
    description:
      'Absorbs the gap between sticker price and what was actually paid. Expense stays at sticker; the card is debited for the discounted amount; Equity:Discount takes the difference.',
    text: `2026-04-14 * "Amudham" "Dinner with Rs. 100 off coupon"
  Expenses:Food:Dining           1500 INR
  Liabilities:CC:HDFC:Infinia   -1400 INR
  Equity:Discount                -100 INR`,
  },
  {
    id: 'pay-cc',
    label: 'Credit card payment',
    description:
      'Pay a credit card bill from a bank account. Debits the CC (reducing liability), credits the bank.',
    text: `2026-04-16 * "HDFC" "April statement payment"
  Assets:Bank:Checking          -18000 INR
  Liabilities:CC:HDFC:Infinia    18000 INR`,
  },
  {
    id: 'refund',
    label: 'Refund to card',
    description:
      'Reverses a previous spend. Expense goes negative; card balance goes positive (less liability).',
    text: `2026-04-16 * "Myntra" "Returned shirt refund"
  Expenses:Shopping:Clothing     -2500 INR
  Liabilities:CC:HDFC:Infinia     2500 INR`,
  },
  {
    id: 'transfer',
    label: 'Bank-to-bank transfer',
    description: 'Move cash between two asset accounts. Both sides same commodity.',
    text: `2026-04-16 * "Self" "Move cash to checking"
  Assets:Bank:Savings    -10000 INR
  Assets:Bank:Checking    10000 INR`,
  },
  {
    id: 'annual-fee',
    label: 'Annual fee',
    description: 'CC annual fee: charged to an expense account; posted to the card.',
    text: `2026-04-16 * "HDFC" "Infinia annual fee"
  Expenses:Fees:Annual:HDFC:Infinia    12500 INR
  Liabilities:CC:HDFC:Infinia         -12500 INR`,
  },
  {
    id: 'wallet-load',
    label: 'Wallet load (with optional cost basis)',
    description:
      'Top up a wallet. Same-currency wallets (Paytm INR): both legs in INR. Cross-currency wallets (Amazon voucher with face value in AMZN_GC bought at a discount) use @@ to record cost basis.',
    text: `2026-04-16 * "SmartBuy" "Amazon voucher Rs. 500 face at Rs. 450"
  Liabilities:CC:HDFC:Infinia      -450 INR
  Assets:Wallet:Amazon              500 AMZN_GC @@ 450 INR`,
  },
  {
    id: 'wallet-redeem',
    label: 'Wallet redemption',
    description:
      'Spend from a wallet. Cross-currency wallets use @@ to convert face-value back to the purchase commodity.',
    text: `2026-04-22 * "Amazon" "Echo Dot from voucher"
  Expenses:Electronics              500 INR
  Assets:Wallet:Amazon             -500 AMZN_GC @@ 500 INR`,
  },
  {
    id: 'points-transfer',
    label: 'Points transfer between programs',
    description:
      'Convert points from one program to another at a fixed ratio. Use @@ to lock the exchange rate.',
    text: `2026-04-16 * "HDFC" "SmartBuy to Finnair at 2:1"
  Assets:Rewards:HDFC:SmartBuy    -4000 SMARTBUY_POINTS
  Assets:Rewards:Finnair           2000 FINNAIR_POINTS @@ 4000 SMARTBUY_POINTS`,
  },
  {
    id: 'points-redeem',
    label: 'Points redemption for a purchase',
    description:
      'Burn points for a real-world expense. Use @@ to state the INR value of the points used. If the expense exceeds the redemption value, add a card leg for the remainder.',
    text: `2026-04-15 * "Accor" "Hotel stay with 4000 SmartBuy + card"
  Expenses:Travel:Hotel                10000 INR
  Assets:Rewards:HDFC:SmartBuy         -4000 SMARTBUY_POINTS @@ 8000 INR
  Liabilities:CC:HDFC:Infinia          -2000 INR`,
  },
]

export const COMPOSITIONS_INTRA: BeancountExample[] = [
  {
    id: 'kitchen-sink-cc-spend',
    label: 'CC spend + discount + cashback + points',
    description:
      'A single dinner txn that earns cashback, earns points, and applies a discount — all primitives stacked under one header.',
    text: `2026-04-14 * "Amudham" "Dinner: discount + cashback + points" ^dinner-amudham
  Expenses:Food:Dining                      1500 INR
  Liabilities:CC:HDFC:Infinia              -1400 INR
  Equity:Discount                           -100 INR
  Assets:Cashback:Pending:HDFC:Infinia        70 INR
  Income:Cashback:HDFC:Infinia               -70 INR
  Assets:Rewards:HDFC:SmartBuy                50 SMARTBUY_POINTS
  Income:Rewards:HDFC:Earned                 -50 SMARTBUY_POINTS`,
  },
  {
    id: 'hotel-card-plus-points',
    label: 'Hotel: card + points redemption',
    description:
      'A hotel bill paid partly with points (at a known INR rate) and partly with the card. Points-redeem primitive plus a card leg.',
    text: `2026-04-15 * "Taj" "Hotel: 4000 SmartBuy + card"
  Expenses:Travel:Hotel                10000 INR
  Assets:Rewards:HDFC:SmartBuy         -4000 SMARTBUY_POINTS @@ 8000 INR
  Liabilities:CC:HDFC:Infinia          -2000 INR`,
  },
  {
    id: 'split-across-cards',
    label: 'Single purchase split across two cards',
    description: 'One expense, two funding legs. No special primitive — just two spend-style legs.',
    text: `2026-04-22 * "Amazon" "Appliance split across cards"
  Expenses:Electronics               9000 INR
  Liabilities:CC:HDFC:Infinia       -5000 INR
  Liabilities:CC:Axis:Magnus        -4000 INR`,
  },
]

export const COMPOSITIONS_INTER: BeancountExample[] = [
  {
    id: 'subscription-linked',
    label: 'Subscription: fee + monthly point credits',
    description:
      'One L3 document with 3 txns sharing ^link. First is the annual fee (cleared). Monthly point drops follow as pending until they land.',
    text: `2026-04-16 * "HDFC SmartBuy" "Elite segment annual fee" ^subs-smartbuy-elite-2026
  Expenses:Fees:Annual:HDFC:Infinia    12000 INR
  Liabilities:CC:HDFC:Infinia         -12000 INR

2026-05-01 ! "HDFC SmartBuy" "May points credit" ^subs-smartbuy-elite-2026
  Assets:Rewards:HDFC:SmartBuy        1000 SMARTBUY_POINTS
  Income:Rewards:HDFC:Earned         -1000 SMARTBUY_POINTS

2026-06-01 ! "HDFC SmartBuy" "June points credit" ^subs-smartbuy-elite-2026
  Assets:Rewards:HDFC:SmartBuy        1000 SMARTBUY_POINTS
  Income:Rewards:HDFC:Earned         -1000 SMARTBUY_POINTS`,
  },
  {
    id: 'trip-linked',
    label: 'Trip: flight + hotel + meals',
    description:
      'A multi-day trip rolled up under one ^link so everything can be viewed as a unit later.',
    text: `2026-06-10 * "IndiGo" "Flight to Goa" ^goa-jun-2026
  Expenses:Travel:Flights          8200 INR
  Liabilities:CC:HDFC:Infinia     -8200 INR

2026-06-11 * "Taj Goa" "Hotel two nights" ^goa-jun-2026
  Expenses:Travel:Hotel           18000 INR
  Liabilities:CC:HDFC:Infinia    -18000 INR

2026-06-12 * "Gunpowder" "Lunch" ^goa-jun-2026
  Expenses:Food:Dining              950 INR
  Liabilities:CC:HDFC:Infinia      -950 INR`,
  },
  {
    id: 'mixed-batch',
    label: 'Mixed: linked group + solo txn',
    description:
      'Batch entry where some txns are linked and some stand alone. The UI renders the group with a rail and the solo as a flat card.',
    text: `2026-04-14 * "Amudham" "Team dinner" ^team-dinners
  Expenses:Food:Dining           1500 INR
  Liabilities:CC:HDFC:Infinia   -1500 INR

2026-04-21 * "Amudham" "Team lunch" ^team-dinners
  Expenses:Food:Dining            900 INR
  Liabilities:CC:HDFC:Infinia    -900 INR

2026-04-22 * "Chai Point" "Solo coffee"
  Expenses:Food:Coffee      120 INR
  Assets:Cash              -120 INR`,
  },
]

function renderSection(title: string, items: BeancountExample[]): string {
  return [
    `## ${title}`,
    '',
    ...items.map((e) => `### ${e.label} (\`${e.id}\`)\n${e.description}\n\n\`\`\`\n${e.text}\n\`\`\`\n`),
  ].join('\n')
}

export function buildExamplesPrompt(): string {
  return [
    renderSection('Primitives', PRIMITIVES),
    renderSection('Composing primitives within one transaction', COMPOSITIONS_INTRA),
    renderSection('Composing multiple transactions (optionally linked)', COMPOSITIONS_INTER),
  ].join('\n')
}
