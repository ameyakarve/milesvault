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

export const GEN_UI_TOOLS = {
  show_stacked_bar: stackedBarSchema,
  show_bar_chart: barChartSchema,
  show_line_chart: lineChartSchema,
  show_donut_chart: donutChartSchema,
} as const

export type GenUiToolName = keyof typeof GEN_UI_TOOLS
