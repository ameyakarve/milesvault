import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-d1-sqlite'

const SEED_DATE = '1970-01-01T00:00:00.000Z'

type Seed = {
  code: string
  metadata: Record<string, unknown>
}

const GLOBAL_COMMODITIES: Seed[] = [
  // Fiat
  {
    code: 'INR',
    metadata: { name: 'Indian Rupee', kind: 'fiat', country: 'IN', fractional: false },
  },
  {
    code: 'USD',
    metadata: { name: 'US Dollar', kind: 'fiat', country: 'US', fractional: false },
  },
  {
    code: 'EUR',
    metadata: { name: 'Euro', kind: 'fiat', country: 'EU', fractional: false },
  },
  {
    code: 'GBP',
    metadata: { name: 'Pound Sterling', kind: 'fiat', country: 'GB', fractional: false },
  },
  {
    code: 'AED',
    metadata: { name: 'UAE Dirham', kind: 'fiat', country: 'AE', fractional: false },
  },
  {
    code: 'SGD',
    metadata: { name: 'Singapore Dollar', kind: 'fiat', country: 'SG', fractional: false },
  },

  // Airline loyalty
  {
    code: 'AVIOS',
    metadata: {
      name: 'Avios',
      issuer: 'Avios Group (IAG)',
      kind: 'airline_miles',
      country: 'GB',
      fractional: false,
    },
  },
  {
    code: 'SQ_KRISFLYER',
    metadata: {
      name: 'KrisFlyer Miles',
      issuer: 'Singapore Airlines',
      kind: 'airline_miles',
      country: 'SG',
      fractional: false,
    },
  },
  {
    code: 'FLYING_BLUE',
    metadata: {
      name: 'Flying Blue Miles',
      issuer: 'Air France-KLM',
      kind: 'airline_miles',
      country: 'FR',
      fractional: false,
    },
  },
  {
    code: 'EK_SKYWARDS',
    metadata: {
      name: 'Skywards Miles',
      issuer: 'Emirates',
      kind: 'airline_miles',
      country: 'AE',
      fractional: false,
    },
  },
  {
    code: 'CX_ASIA_MILES',
    metadata: {
      name: 'Asia Miles',
      issuer: 'Cathay Pacific',
      kind: 'airline_miles',
      country: 'HK',
      fractional: false,
    },
  },

  // Hotel loyalty
  {
    code: 'MARRIOTT_BONVOY',
    metadata: {
      name: 'Marriott Bonvoy Points',
      issuer: 'Marriott International',
      kind: 'hotel_points',
      country: 'US',
      fractional: false,
    },
  },
  {
    code: 'HILTON_HONORS',
    metadata: {
      name: 'Hilton Honors Points',
      issuer: 'Hilton',
      kind: 'hotel_points',
      country: 'US',
      fractional: false,
    },
  },
  {
    code: 'HYATT_WOH',
    metadata: {
      name: 'World of Hyatt Points',
      issuer: 'Hyatt Hotels Corporation',
      kind: 'hotel_points',
      country: 'US',
      fractional: false,
    },
  },
  {
    code: 'IHG_ONE',
    metadata: {
      name: 'IHG One Rewards Points',
      issuer: 'IHG Hotels & Resorts',
      kind: 'hotel_points',
      country: 'GB',
      fractional: false,
    },
  },

  // Card / bank points
  {
    code: 'SMARTBUY_POINTS',
    metadata: {
      name: 'HDFC SmartBuy Points',
      issuer: 'HDFC Bank',
      kind: 'card_points',
      country: 'IN',
      fractional: false,
    },
  },
  {
    code: 'NEU_COINS',
    metadata: {
      name: 'Tata NeuCoins',
      issuer: 'Tata Digital',
      kind: 'card_points',
      country: 'IN',
      fractional: false,
    },
  },
  {
    code: 'AMEX_MR_INDIA',
    metadata: {
      name: 'Amex Membership Rewards (India)',
      issuer: 'American Express',
      kind: 'card_points',
      country: 'IN',
      fractional: false,
    },
  },
  {
    code: 'AXIS_EDGE_REWARDS',
    metadata: {
      name: 'Axis Bank EDGE Rewards',
      issuer: 'Axis Bank',
      kind: 'card_points',
      country: 'IN',
      fractional: false,
    },
  },
]

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  for (const seed of GLOBAL_COMMODITIES) {
    await payload.create({
      collection: 'commodities',
      data: {
        code: seed.code,
        openDate: SEED_DATE,
        metadata: seed.metadata,
      },
      overrideAccess: true,
      req,
    })
  }
}

export async function down({ payload, req }: MigrateDownArgs): Promise<void> {
  for (const seed of GLOBAL_COMMODITIES) {
    await payload.delete({
      collection: 'commodities',
      where: {
        and: [{ code: { equals: seed.code } }, { user: { equals: null } }],
      },
      overrideAccess: true,
      req,
    })
  }
}
