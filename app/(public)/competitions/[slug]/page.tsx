import { notFound, redirect } from 'next/navigation';
import { getContext } from '@/lib/data';
import { Empty, PageHead } from '@/components/ui';
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const { competition } = await getContext(slug); return { title: competition?.name ?? 'Competition', description: competition?.description ?? undefined, alternates: { canonical: `/competitions/${slug}` } }; }
export default async function Comp({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const { competition, season } = await getContext(slug);
  if (!competition || competition.slug !== slug) notFound();
  if (season) redirect(`/competitions/${slug}/${season.id}`);
  return <><PageHead eyebrow="Competition" title={competition.name} sub={competition.description} /><Empty>No season has been published for this competition yet.</Empty></>;
}
