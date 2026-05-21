import { z } from 'zod'

const dataRow = z.record(z.string(), z.union([z.string(), z.number(), z.null()]))

const seriesItem = z.object({
  key: z.string().describe('Property name in data rows for this series'),
  label: z.string().optional(),
  color: z
    .string()
    .optional()
    .describe('Mantine color reference, e.g. "teal.6", "blue.5", "violet.4"'),
})

const xySeriesBase = z.object({
  title: z.string().optional().describe('Title displayed above the chart'),
  x_key: z
    .string()
    .describe('Property name in each data row that holds the x-axis label'),
  data: z
    .array(dataRow)
    .min(1)
    .describe(
      'Wide-format rows. Each row has the x_key value plus one numeric value per series key.',
    ),
  series: z.array(seriesItem).min(1),
  value_format: z
    .enum(['currency', 'number'])
    .optional()
    .describe('Tick + tooltip formatting for the y-axis values'),
  currency: z
    .string()
    .optional()
    .describe('ISO 4217 code when value_format is "currency", e.g. "USD"'),
})

export const stackedBarSchema = xySeriesBase
export type StackedBarProps = z.infer<typeof stackedBarSchema>

export const barChartSchema = xySeriesBase.extend({
  orientation: z
    .enum(['vertical', 'horizontal'])
    .optional()
    .describe(
      'Horizontal for ranked lists ("top payees"), vertical for time series.',
    ),
})
export type BarChartProps = z.infer<typeof barChartSchema>

export const lineChartSchema = xySeriesBase.extend({
  curve_type: z
    .enum(['linear', 'monotone', 'step', 'natural'])
    .optional()
    .describe('Curve interpolation between points'),
})
export type LineChartProps = z.infer<typeof lineChartSchema>

export const donutChartSchema = z.object({
  title: z.string().optional(),
  data: z
    .array(
      z.object({
        name: z.string().describe('Segment label'),
        value: z.number().describe('Numeric magnitude of the segment'),
        color: z.string().optional().describe('Mantine color reference'),
      }),
    )
    .min(1),
  value_format: z.enum(['currency', 'number']).optional(),
  currency: z.string().optional(),
})
export type DonutChartProps = z.infer<typeof donutChartSchema>

export const heatmapSchema = z.object({
  title: z.string().optional(),
  currency: z.string().describe('ISO 4217 code, e.g. "USD"'),
  days: z
    .array(
      z.object({
        date: z.string().describe('YYYY-MM-DD'),
        amount: z
          .number()
          .describe(
            'Total spend on this date as a positive plain number (sum of outflows; convert from scaled-decimal first)',
          ),
      }),
    )
    .min(1)
    .describe(
      'One row per calendar day in the requested range. Include zero-spend days too so the grid is continuous; the renderer color-scales by magnitude.',
    ),
})
export type HeatmapProps = z.infer<typeof heatmapSchema>

export const accountCardSchema = z.object({
  account: z
    .string()
    .describe('Full Beancount account path, e.g. "Assets:Bank:Chase:Checking"'),
  currency: z.string().describe('ISO 4217 code, e.g. "USD"'),
  balance: z.number().describe('Current balance as a plain number'),
  as_of_date: z
    .string()
    .optional()
    .describe('YYYY-MM-DD the balance is computed for'),
  recent_txns: z
    .array(
      z.object({
        date: z.string().describe('YYYY-MM-DD'),
        payee: z.string().optional(),
        narration: z.string().optional(),
        amount: z
          .number()
          .describe(
            'Signed amount posted to this account (positive = inflow, negative = outflow)',
          ),
        counterparty: z
          .string()
          .optional()
          .describe('Other side of the txn, e.g. "Expenses:Food:Groceries"'),
      }),
    )
    .max(15)
    .optional(),
})
export type AccountCardProps = z.infer<typeof accountCardSchema>

export const GEN_UI_TOOLS = {
  show_stacked_bar: stackedBarSchema,
  show_bar_chart: barChartSchema,
  show_line_chart: lineChartSchema,
  show_donut_chart: donutChartSchema,
  show_heatmap: heatmapSchema,
  show_account_card: accountCardSchema,
} as const

export type GenUiToolName = keyof typeof GEN_UI_TOOLS
