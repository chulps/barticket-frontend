import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TabGroup from '../../../src/components/TabGroup';
import '../../../src/index.css';

export function Fixture() {
  const [locale, setLocale] = useState('en');
  const [status, setStatus] = useState('paid');
  const [team, setTeam] = useState('pay');
  const ja = locale === 'ja';
  return <main style={{ padding: 18, width: '100%', boxSizing: 'border-box' }}>
    <button onClick={() => setLocale(ja ? 'en' : 'ja')}>Language</button>
    <h2>Status</h2>
    <TabGroup label="Status" tabs={[{id:'open',label:ja?'未会計':'Open'},{id:'paid',label:ja?'会計済':'Paid'},{id:'cancelled',label:ja?'キャンセル済':'Cancelled'}]} activeTab={status} onChange={setStatus}/>
    <h2>Team views</h2>
    <TabGroup label="Team views" tabs={[{id:'people',label:ja?'スタッフ':'People'},{id:'pay',label:ja?'チーム給与':'Team pay'}]} activeTab={team} onChange={setTeam}/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture/></StrictMode>);
