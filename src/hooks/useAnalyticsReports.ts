import type { AnalyticsShiftReport } from '../api/account';
import { analyticsPath, useAnalyticsData } from './useAnalyticsData';
export function useAnalyticsReports(range:'all'|'year'|'month'|'day',key:string,signedIn:boolean) {
    const result=useAnalyticsData<AnalyticsShiftReport[]>(analyticsPath('shifts',range,key),signedIn&&(range==='all'||!!key));
    return {shifts:result.value??[],ready:result.ready,error:result.error};
}
