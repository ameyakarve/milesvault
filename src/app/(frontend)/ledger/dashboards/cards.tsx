'use client'

import React from 'react'
import { Card, Text, Group } from '@mantine/core'

export function DashCard({
  title,
  right,
  children,
}: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card withBorder radius="md" p="md" className="flex flex-col">
      <Group justify="space-between" align="center" mb="sm">
        <Text size="xs" fw={500} c="dark.4">{title}</Text>
        {right}
      </Group>
      {children}
    </Card>
  )
}

export function StatCard({
  label,
  value,
  valueColor = '#0f172a',
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <Card withBorder radius="md" p="md">
      <Text size="9px" fw={700} tt="uppercase" c="dimmed" mb={6} style={{ letterSpacing: '0.1em' }}>
        {label}
      </Text>
      <Text fw={700} className="font-mono" size="xl" style={{ color: valueColor }}>
        {value}
      </Text>
    </Card>
  )
}
