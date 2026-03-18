import { notFound } from 'next/navigation'

// Public download page — wird in Phase 6 implementiert
export default async function DownloadPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Phase 6: Lead anhand slug laden + Download-Seite rendern
  // Vorerst 404
  notFound()

  return null
}
