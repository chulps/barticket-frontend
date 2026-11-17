/** Explicit on-demand full-period export; never silently returns partial pages. */
export async function readCompleteTicketHistory<T extends {id:number}>(
    load:(offset:number,limit:number)=>Promise<{items:T[];total:number;offset:number}>,
    isCurrent:()=>boolean,
    maximum=5000,
):Promise<T[]> {
    const rows:T[]=[];const seen=new Set<number>();let expected:number|null=null;
    for(let offset=0;offset<maximum;offset+=100){
        if(!isCurrent())throw new Error('Export interrupted');
        const page=await load(offset,100);
        if(!isCurrent())throw new Error('Export interrupted');
        if(page.total>maximum||page.offset!==offset||(expected!==null&&expected!==page.total))throw new Error('Export changed or too large');
        expected=page.total;
        for(const row of page.items){if(seen.has(row.id))throw new Error('Export changed');seen.add(row.id);rows.push(row);}
        if(rows.length===expected)return rows;
        if(page.items.length!==100)throw new Error('Incomplete export');
    }
    throw new Error('Incomplete export');
}
