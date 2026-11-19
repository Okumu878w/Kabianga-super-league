'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CompetitionSelector } from '@/components/selector';
import { createClient } from '@/lib/supabase/client';
/** Reads ?c=&s= from the URL and loads the seasons of the selected competition so the season selector stays in sync. */
export function SelectorLoader({ competitions }: { competitions: { id?: string; slug: string; name: string }[] }) {
  const sp = useSearchParams(); const c = sp.get('c') ?? competitions[0]?.slug; const s = sp.get('s') ?? undefined;
  const [seasons, setSeasons] = useState<{ id: string; name: string; is_current?: boolean }[]>([]);
  useEffect(() => {
    let alive = true; const comp = competitions.find((x) => x.slug === c) as any; if (!comp?.id) { setSeasons([]); return; }
    createClient().from('seasons').select('id,name,is_current').eq('competition_id', comp.id).order('starts_on', { ascending: false }).then(({ data }) => { if (alive) setSeasons(data ?? []); });
    return () => { alive = false; };
  }, [c, competitions]);
  const active = s ?? seasons.find((x) => x.is_current)?.id ?? seasons[0]?.id;
  return <CompetitionSelector competitions={competitions} seasons={seasons} c={c} s={active} />;
}
