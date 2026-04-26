import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import React from 'react'
import { HomeChrome } from './home-chrome'

export default async function HomePage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/home')
  return <HomeChrome />
}
