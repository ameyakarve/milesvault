import { z } from 'zod'

const dataRow = z.record(z.string(), z.union([z.string(), z.number(), z.null()]))

export const stackedBarSchema = z.object({
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
  series: z
    .array(
      z.object({
        key: z.string().describe('Property name in data rows for this series'),
        label: z.string().optional(),
        color: z
          .string()
          .optional()
          .describe(
            'Mantine color reference, e.g. "teal.6", "blue.5", "violet.4"',
          ),
      }),
    )
    .min(1),
  value_format: z
    .enum(['currency', 'number'])
    .optional()
    .describe('Tick + tooltip formatting for the y-axis values'),
  currency: z
    .string()
    .optional()
    .describe('ISO 4217 code when value_format is "currency", e.g. "USD"'),
})

export type StackedBarProps = z.infer<typeof stackedBarSchema>

export const GEN_UI_TOOLS = {
  show_stacked_bar: stackedBarSchema,
} as const

export type GenUiToolName = keyof typeof GEN_UI_TOOLS
