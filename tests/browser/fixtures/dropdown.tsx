import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Select from '../../../src/components/Select';
import '../../../src/index.css';
export function Extended() {
 const [disabled,setDisabled]=useState(false);const [value,setValue]=useState('item-0');const [trim,setTrim]=useState(false);const [fieldsetDisabled,setFieldsetDisabled]=useState(false);const [cancelReset,setCancelReset]=useState(false);const [resetCount,setResetCount]=useState(0);
 const options=<><option value="">Choose</option>{Array.from({length:30},(_,i)=>i).filter(i=>!trim||i>5).map(i=><option key={i} value={`item-${i}`}>Long staff option {i} with a fully readable name</option>)}<optgroup label="Unavailable group" disabled><option value="locked">Locked choice</option></optgroup></>;
 return <main style={{padding:20}}><h1>Extended cases</h1><form id="reset-form" onReset={e=>{if(cancelReset)e.preventDefault();else setResetCount(n=>n+1);}}><Select aria-label="Reset example" name="reset" defaultValue="item-2">{options}</Select><button type="reset">Reset form</button><output data-testid="reset-count">{resetCount}</output></form>
 <fieldset disabled={fieldsetDisabled}><Select aria-label="Dynamic choices" value={value} disabled={disabled} onChange={e=>setValue(e.currentTarget.value)}>{options}</Select></fieldset>
 <button onClick={()=>setTimeout(()=>{setDisabled(true);setTimeout(()=>setDisabled(false),200);},200)}>Schedule disable</button>
 <button onClick={()=>setTimeout(()=>setValue('item-20'),200)}>Schedule value</button>
 <button onClick={()=>setTimeout(()=>setTrim(true),200)}>Schedule options</button><button onClick={()=>setTimeout(()=>setFieldsetDisabled(true),200)}>Schedule fieldset disable</button><button onClick={()=>setCancelReset(!cancelReset)}>Cancel resets</button></main>;
}
export function Fixture() {
 const ja = new URLSearchParams(location.search).get('locale') === 'ja';
 const [value,setValue]=useState(''); const [disabled,setDisabled]=useState(false); const [changes,setChanges]=useState(0); const [submitted,setSubmitted]=useState('');
 const dialog=useRef<HTMLDialogElement>(null);
 const label=ja?'担当スタッフ':'Assigned staff';
 const options=<><option value="">{ja?'スタッフを選択':'Choose staff'}</option><optgroup label={ja?'スタッフ':'Staff'}><option value="haruka">{ja?'ハルカ・長いスタッフ名でもすべて表示されます':'Haruka with a very long family name that remains fully readable'}</option><option value="kanata">{ja?'カナタ':'Kanata'}</option><option value="blocked" disabled>{ja?'無効なスタッフ':'Disabled staff'}</option></optgroup><optgroup label={ja?'マネージャー':'Managers'}><option value="chuck">Chuck</option><option value="nori">Nori</option></optgroup></>;
 const control=<Select name="staff" aria-label={label} aria-describedby="help" value={value} required disabled={disabled} onChange={e=>{setValue(e.currentTarget.value);setChanges(n=>n+1);}}>{options}</Select>;
 return <main style={{padding:20,maxWidth:600,margin:'auto'}}>
 <h1>{ja?'ドロップダウン':'Dropdown controls'}</h1><p id="help">{ja?'名前を選択してください。':'Choose a name. No real records are changed.'}</p>
 <form onSubmit={e=>{e.preventDefault();setSubmitted(String(new FormData(e.currentTarget).get('staff')));}}>
 <label>{label}{control}</label><button type="submit">Submit</button><button type="button" onClick={()=>setDisabled(!disabled)}>Toggle disabled</button>
 </form><p data-testid="changes">{changes}</p><p data-testid="submitted">{submitted}</p>
 <button onClick={()=>setValue('nori')}>External update</button><button onClick={()=>dialog.current?.showModal()}>Open dialog</button>
 <dialog ref={dialog} style={{position:'fixed',inset:0,width:'100%',height:'100dvh',maxWidth:'none',maxHeight:'none',margin:0,padding:20,background:'var(--neutral-950)',color:'var(--white)',boxSizing:'border-box'}}>
 <h2>{ja?'通知設定と同じ全画面ダイアログ':'Fullscreen native dialog'}</h2><label>{label}{control}</label><button onClick={()=>dialog.current?.close()}>Close dialog</button>
 </dialog></main>;
}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('extended') ? <Extended/> : <Fixture/>);
