'use client'

import React from 'react'
import { Card, Group, Text } from '@mantine/core'

// ---------------------------------------------------------------------------
// Card style primitives.
//
// Every dashboard card renders through DashCard. The chassis is fixed:
// withBorder, radius="md", p="md", flex column. Top-level card headers all
// use the same `title` convention (12px regular, sentence case) so cards
// read as a uniform set:
//
//   <DashCard title="Money flow">
//   <DashCard title="Total spend">
//
// Section labels *inside* a card use <CardEyebrow> (9px uppercase, dimmed,
// letter-spaced) so the eyebrow style is the one place to adjust. The
// `eyebrow` prop on DashCard exists only for one-off stat tiles built via
// <StatCard> — prefer `title` for new cards. Hero numbers use <HeroValue>
// (28px mono, bold).
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
