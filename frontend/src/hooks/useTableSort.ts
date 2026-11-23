import { useState } from 'react';
import { sortTableRows, SortDirection, SortValue } from '@/utils/tableSort';
export function useTableSort<T=any>(columns:Record<string,(row:T)=>SortValue>, onChange?:()=>void) {
  const [column,setColumn]=useState('');
  const [direction,setDirection]=useState<SortDirection>('asc');
  const select=(key:string)=>{
    if(!columns[key])return;
    setDirection(column===key&&direction==='asc'?'desc':'asc');setColumn(key);onChange?.();
  };
  return {column,direction,columns:Object.keys(columns),select,
    sort:(rows:readonly T[])=>column&&columns[column]?sortTableRows(rows,columns[column],direction):[...rows]};
}
export type TableSortState = Pick<ReturnType<typeof useTableSort>, 'column'|'direction'|'columns'|'select'>;
