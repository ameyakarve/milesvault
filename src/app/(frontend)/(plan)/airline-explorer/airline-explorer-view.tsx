'use client'

import { useAsyncData } from '@/components/shared/use-async-data'
import { fetchJSON } from '@/lib/fetch-json'
import { AirlineExplorer } from './airline-explorer-ui'
import type { AirlineExplorerResult } from '@/durable/agents/tools/concierge/airline-explorer'

// Thin container: fetches the (static) airline-explorer graph once and hands it
// to the presentational <AirlineExplorer>. All filtering is client-side.
export function AirlineExplorerView() {
  const { status, data, error } = useAsyncData<AirlineExplorerResult>(
    (signal) => fetchJSON<AirlineExplorerResult>('/api/concierge/airline-explorer', { signal }),
    [],
  )

  return <AirlineExplorer status={status} data={data ?? undefined} error={error ?? undefined} />
}
