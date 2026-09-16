'use client';
import { useEffect } from 'react';
export default function Gate() {
  useEffect(() => {
    let stopped = false;
    async function check() {
      try { const res = await fetch('/api/session', { cache: 'no-store' }); if (res.ok && !stopped) window.location.reload(); } catch {}
    }
    const timer = setInterval(check, 15000);
    window.addEventListener('focus', check);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener('focus', check); };
  }, []);
  return <main className="gate"><div className="section-label">OWNER ACCESS</div><h2>A private view.</h2><p>Open marktan.ai to use your Google sign-in, then return here. If you’re already signed in, simply refresh The Daily.</p><a className="button primary" href="https://marktan.ai" target="_blank" rel="noopener noreferrer">Continue at marktan.ai ↗</a><p className="gate-note">This page unlocks automatically when your sign-in is ready.</p></main>;
}
