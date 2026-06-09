'use client'

import { useEffect, useRef, useState } from 'react'
import * as Plot from '@observablehq/plot'
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import landTopo from 'world-atlas/land-110m.json'

// Land outline once (module scope) — a black-and-white globe needs only the
// landmasses; oceans stay white.
const land = feature(landTopo as unknown as Topology, (landTopo as never as Topology).objects.land)

export type MapPoint = { iata: string; lat: number; lng: number }

// A black-and-white 3D globe (orthographic projection) with the great-circle
// flight path origin → hub(s) → destination. Rendered with Observable Plot.
export function FlightMap({
  points,
  maxSize = 280,
}: {
  points: MapPoint[]
  // The globe is square and fills its container width, capped at maxSize so it
  // stays compact on desktop while going edge-to-edge in a full-width mobile card.
  maxSize?: number
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  // Track the available width so the globe is responsive (full-width on mobile).
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = mountRef.current
    if (!el || points.length < 2) return
    const size = Math.min(width || maxSize, maxSize)
    if (size < 40) return

    // Rotate the globe so the route's midpoint faces us.
    const lngs = points.map((p) => p.lng)
    const lats = points.map((p) => p.lat)
    const cLng = (Math.min(...lngs) + Math.max(...lngs)) / 2
    const cLat = (Math.min(...lats) + Math.max(...lats)) / 2

    const route = {
      type: 'LineString' as const,
      coordinates: points.map((p) => [p.lng, p.lat] as [number, number]),
    }

    const chart = Plot.plot({
      width: size,
      height: size,
      margin: 2,
      projection: { type: 'orthographic', rotate: [-cLng, -cLat] },
      marks: [
        Plot.sphere({ fill: 'white', stroke: '#e2e8f0', strokeWidth: 1 }),
        Plot.graticule({ stroke: '#f1f5f9', strokeWidth: 0.5 }),
        Plot.geo(land, { fill: '#e5e7eb', stroke: '#cbd5e1', strokeWidth: 0.4 }),
        Plot.geo(route, { stroke: '#0f172a', strokeWidth: 1.5, strokeDasharray: '4,3' }),
        Plot.dot(points, { x: 'lng', y: 'lat', fill: '#0f172a', r: 3.5 }),
        Plot.text(points, {
          x: 'lng',
          y: 'lat',
          text: 'iata',
          dy: -10,
          fontSize: 10,
          fontWeight: 600,
          fill: '#0f172a',
        }),
      ],
    })
    el.replaceChildren(chart)
    return () => {
      chart.remove()
    }
  }, [points, width, maxSize])

  return (
    <div ref={wrapRef} className="w-full" aria-label="Flight route map">
      <div ref={mountRef} className="flex justify-center" />
    </div>
  )
}
