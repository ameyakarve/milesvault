'use client'

import React from 'react'
import { Card, Group, Text } from '@mantine/core'

// ---------------------------------------------------------------------------
// Card style primitives.
//
// Every dashboard card on every dashboard renders through DashCard. The
// chassis is fixed: withBorder, radius="md", p="md", flex column. Cards
// pick one of two header conventions:
//
//   <DashCard title="Money flow">           — 12px regular header
//   <DashCard eyebrow="Owed now">           — 9px uppercase eyebrow,
//                                              for hero/stat-style cards
//
// Section labels *inside* a card use <CardEyebrow> so the eyebrow style
// is the one place to adjust. Hero numbers use <HeroValue> (28px mono,
// bold). Anything else is per-card.
// ---------------------------------------------------------------------------

export function DashCard({
  title,
  eyebrow,
  right,
  children,
  className,
}: {
  title?: string
  eyebrow?: string
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const headerLabel = eyebrow ? (
    <CardEyebrow>{eyebrow}</CardEyebrow>
  ) : title ? (
    <CardTitle>{title}</CardTitle>
  ) : null
  const showHeader = headerLabel != null || right != null
  return (
    <Card withBorder radius="md" p="md" className={`flex flex-col ${className ?? ''}`}>
      {showHeader && (
        <Group justify="space-between" align="center" mb="sm" wrap="nowrap">
          {headerLabel ?? <span />}
          {right}
        </Group>
      )}
      {children}
    </Card>
  )
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text size="xs" fw={500} c="dark.4">
      {children}
    </Text>
  )
}

export function CardEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Text size="9px" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.1em' }}>
      {children}
    </Text>
  )
}

export function HeroValue({
  children,
  color = 'dark.9',
}: {
  children: React.ReactNode
  color?: string
}) {
  return (
    <Text fw={700} ff="monospace" size="28px" lh={1} c={color}>
      {children}
    </Text>
  )
}

export function StatCard({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <DashCard eyebrow={label}>
      <HeroValue color={valueColor}>{value}</HeroValue>
    </DashCard>
  )
}
