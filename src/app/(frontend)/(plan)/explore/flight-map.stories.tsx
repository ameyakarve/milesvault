import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Card } from '@/components/ui/card'
import { FlightMap, type MapPoint } from './flight-map'

const A: Record<string, MapPoint> = {
  BLR: { iata: 'BLR', lat: 13.1986, lng: 77.7066 },
  NRT: { iata: 'NRT', lat: 35.7647, lng: 140.3863 },
  SIN: { iata: 'SIN', lat: 1.3592, lng: 103.9894 },
  HKG: { iata: 'HKG', lat: 22.308, lng: 113.918 },
}

function Demo({ points }: { points: MapPoint[] }) {
  return (
    <div className="bg-background p-6">
      <Card className="w-[320px] p-3">
        <FlightMap points={points} />
        <p className="mt-1 text-center font-mono text-xs text-muted-foreground">
          {points.map((p) => p.iata).join(' → ')}
        </p>
      </Card>
    </div>
  )
}

const meta: Meta<typeof Demo> = { title: 'Explore/FlightMap', component: Demo }
export default meta
type Story = StoryObj<typeof Demo>

export const Direct: Story = { args: { points: [A.BLR, A.NRT] } }
export const OneStopSIN: Story = { args: { points: [A.BLR, A.SIN, A.NRT] } }
export const OneStopHKG: Story = { args: { points: [A.BLR, A.HKG, A.NRT] } }
