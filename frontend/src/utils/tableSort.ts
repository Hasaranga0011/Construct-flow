export type SortDirection = 'asc' | 'desc';
export type SortValue = string | number | boolean | Date | null | undefined;
function comparable(value: SortValue): string | number | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return Number(value);
  const text=value.trim();
  if (!text || /^(—|–|-|n\/a|not recorded)$/i.test(text)) return null;
  const numeric=text.match(/^(?:(?:Rs\.?|LKR|\$)\s*)?([+-]?[\d,]+(?:\.\d+)?)\s*([KMB%])?$/i);
  if(numeric) return Number(numeric[1].replace(/,/g,''))*({K:1000,M:1e6,B:1e9}[numeric[2]?.toUpperCase() as 'K'|'M'|'B']||1);
  if(/^\d{4}-\d{2}-\d{2}(T|$)/.test(text)||/^\d{1,2} [A-Za-z]{3,9} \d{4}$/.test(text)||/^[A-Za-z]{3,9} \d{1,2},? \d{4}$/.test(text)){
    const timestamp=Date.parse(text);if(Number.isFinite(timestamp))return timestamp;
  }
  const date=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(date)return Date.UTC(Number(date[3]),Number(date[2])-1,Number(date[1]));
  return text;
}
export function sortTableRows<T>(rows: readonly T[], getter: (row:T)=>SortValue, direction:SortDirection): T[] {
  return rows.map((row,index)=>({row,index,value:comparable(getter(row))})).sort((a,b)=>{
    if(a.value===null||b.value===null)return a.value===b.value?a.index-b.index:a.value===null?1:-1;
    let result=typeof a.value==='number'&&typeof b.value==='number'?a.value-b.value:String(a.value).localeCompare(String(b.value),undefined,{numeric:true,sensitivity:'base'});
    if(direction==='desc')result=-result;
    return result||a.index-b.index;
  }).map(item=>item.row);
}
