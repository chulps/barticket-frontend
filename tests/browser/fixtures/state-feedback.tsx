import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { CopyPanelButton, BarChart } from '../../../src/components/AnalyticsCharts';
import NotificationActivity from '../../../src/components/NotificationActivity';
import { receiveNotificationActivity } from '../../../src/api/notificationActivityStore';
import ShiftCloseReview from '../../../src/pages/ShiftCloseReview';
import { ModalProvider } from '../../../src/context/ModalProvider';
import '../../../src/index.css';
const params = new URLSearchParams(location.search);
const locale = params.get('locale') === 'ja' ? 'ja' : 'en';
if (params.get('view') === 'feed') receiveNotificationActivity({type:'activity',version:1,cursor:1,shift_id:10,reset:true,has_more:true,items:Array.from({length:200},(_,i)=>({id:i+1,type:'stock_notice',at:1793480000,ticket_id:null,stock_notice_id:1}))},'ISOLATED_STATE_FIXTURE');
const root = createRoot(document.getElementById('root')!);
window.addEventListener('fixture-unmount', () => root.unmount());
root.render(<StrictMode><MemoryRouter><ModalProvider><main style={{padding:16}}>
 {params.get('view') === 'feed' ? <NotificationActivity activeStockIds={[1]} /> : params.get('view') === 'shift' ? <ShiftCloseReview shiftId={10} businessDate="2026-10-31" locale={locale} onClosed={() => {throw new Error('Fixture must never close a shift');}} /> : <>
 <CopyPanelButton text={'Report\n2026-10-31\t¥1,200'} locale={locale} />
 <BarChart title="Fixture chart" locale={locale} formatTick={String} formatFull={value=>`¥${value.toLocaleString('en-US')}`} bars={[{id:'day',label:'Oct 31',title:'Oct 31',segments:[{value:1200,color:'#aaa'}]},{id:'previous',label:'Oct 30',title:'Oct 30',segments:[{value:500,color:'#aaa'}]}]} />
 </>}
</main></ModalProvider></MemoryRouter></StrictMode>);
