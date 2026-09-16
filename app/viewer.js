'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
const media = (event, kind) => `/api/media/${encodeURIComponent(event.id)}/${kind}`;
const date = (value, options) => new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', ...options }).format(new Date(value));
const time = value => date(value, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const day = value => date(value, { day: 'numeric', month: 'short', year: 'numeric' });
const duration = seconds => `${Math.round(seconds)} sec`;

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('clip');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mediaError, setMediaError] = useState(false);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      const res = await fetch('/api/events', { cache: 'no-store' });
      if (res.status === 401) { window.location.reload(); return; }
      if (!res.ok) throw new Error('Could not update recordings. Please try again.');
      const next = await res.json();
      setData(next); setError('');
      setSelectedId(current => next.events.some(e => e.id === current) ? current : next.events[0]?.id || null);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); inFlight.current = false; }
  }, []);
  useEffect(() => { refresh(); const timer = setInterval(() => { if (!document.hidden) refresh(); }, 30000); window.addEventListener('focus', refresh); return () => { clearInterval(timer); window.removeEventListener('focus', refresh); }; }, [refresh]);
  useEffect(() => setMediaError(false), [selectedId, mode]);
  const events = data?.events || [];
  const selected = events.find(e => e.id === selectedId);
  return <main>
    <div className="journal-bar"><div><span className="status-dot" /><span>PRIVATE RECORDINGS</span></div><button onClick={refresh} disabled={busy} className="text-button">{busy ? 'Updating…' : '↻ Refresh'}</button></div>
    <section className="summary" aria-label="Recording summary"><div><span className="section-label">IN THE JOURNAL</span><strong>{data ? String(events.length).padStart(2, '0') : '—'} <small>/ 10 detections</small></strong></div><div><span className="section-label">LATEST MOVEMENT</span><strong className="summary-time">{events[0] ? time(events[0].detectedAt) : '—'} <small>{events[0] ? day(events[0].detectedAt) : 'Awaiting recordings'}</small></strong></div><div><span className="section-label">TIME ZONE</span><strong className="summary-time">Singapore <small>UTC +08:00</small></strong></div></section>
    {error && <div role="alert" className="error">{error} {data && 'Showing the last loaded collection.'}</div>}
    {!data && !error && <section className="empty" aria-live="polite"><h2>Opening the journal…</h2></section>}
    {data && events.length === 0 && <section className="empty"><span className="section-label">NO DETECTIONS YET</span><h2>Nothing to review. Yet.</h2><p>Photos and clips will appear here after the camera recorder uploads its first movement detection.</p><p className="muted">An empty journal does not confirm that the camera is running.</p></section>}
    {selected && <div className="workspace"><section className="view-section" aria-label="Selected detection"><div className="section-heading"><h2>In focus</h2><span className="section-label">{selected.camera}</span></div><div className="screen">
      {mode === 'clip' ? <video key={selected.id} controls playsInline preload="metadata" poster={media(selected, 'photo')} src={media(selected, 'clip')} onError={() => setMediaError(true)} aria-label={`Motion clip from ${day(selected.detectedAt)} at ${time(selected.detectedAt)}`} /> : <img src={media(selected, 'photo')} alt={`Movement detected at ${time(selected.detectedAt)} on ${day(selected.detectedAt)}`} onError={() => setMediaError(true)} />}
    </div>{mediaError && <p className="error" role="alert">This recording could not load. Refresh the journal and try again.</p>}<div className="caption"><div><h3>{day(selected.detectedAt)} <em>{time(selected.detectedAt)}</em></h3><p className="muted">Motion detected · {duration(selected.durationSeconds)}</p></div><div className="toggle" aria-label="View format"><button aria-pressed={mode === 'clip'} onClick={() => setMode('clip')}>Video</button><button aria-pressed={mode === 'photo'} onClick={() => setMode('photo')}>Photo</button></div></div></section>
    <aside className="history"><div className="section-heading"><h2>Recent movement</h2><span className="section-label">{String(events.length).padStart(2, '0')}</span></div><ol>{events.map((event, index) => <li key={event.id}><button className={`event ${event.id === selectedId ? 'selected' : ''}`} onClick={() => { setSelectedId(event.id); setMediaError(false); }} aria-current={event.id === selectedId ? 'true' : undefined}><span className="event-number">{String(index + 1).padStart(2, '0')}</span><img loading="lazy" src={media(event, 'photo')} alt="" /><span className="event-info"><strong>{time(event.detectedAt)}</strong><span>{day(event.detectedAt)}</span><small>{duration(event.durationSeconds)}</small></span><span aria-hidden="true">↗</span></button></li>)}</ol></aside></div>}
    {data?.updatedAt && <p className="sync-note">Collection updated {day(data.updatedAt)} at {time(data.updatedAt)} SGT · Checks for new uploads every 30 seconds.</p>}
  </main>;
}
