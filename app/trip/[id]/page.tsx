import TripPageClient from '@/components/TripPageClient'

export default async function TripPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <TripPageClient tripId={id} />
}