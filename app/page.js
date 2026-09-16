import { isOwner } from '../lib/auth.mjs';
import Dashboard from './viewer';
import Gate from './gate';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const authorized = await isOwner();
  return <div className="wrap">
    <nav className="topline"><a className="brand" href="https://marktan.ai">marktan<em>.ai</em></a><span>PRIVATE CAMERA JOURNAL</span><a href="https://marktan.ai">← The Daily</a></nav>
    <header className="masthead"><p className="eyebrow">HOME · SECURITY</p><h1>The <em>Watch</em></h1><div className="dateline"><span /> <p>Movement, recorded.</p> <span /></div></header>
    {authorized ? <Dashboard /> : <Gate />}
    <footer><span>THE WATCH · MARKTAN.AI</span><a href="https://marktan.ai">Account & sign out ↗</a></footer>
  </div>;
}
