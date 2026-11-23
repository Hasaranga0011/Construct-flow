import React from 'react';
import { Pressable, Text, TextProps, View, StyleSheet, TextStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { TableSortState } from '@/hooks/useTableSort';
import { Select } from '@/components/ui/Select';

export function SortableHeader({sort,column,children,className='',style,...props}:TextProps&{sort:TableSortState;column:string;className?:string}){
  const active=sort.column===column;
  const styles=StyleSheet.flatten(style)||{};
  const textKeys=['color','fontSize','fontWeight','fontFamily','textAlign','textTransform','lineHeight','letterSpacing'];
  const textStyle=Object.fromEntries(Object.entries(styles).filter(([key])=>textKeys.includes(key))) as TextStyle;
  const layoutStyle=Object.fromEntries(Object.entries(styles).filter(([key])=>!textKeys.includes(key)));
  const classes=className.split(/\s+/);
  const textClass=classes.filter(c=>/^(?:[\w-]+:)*(text-|font-|uppercase|lowercase|capitalize|tracking-|leading-)/.test(c));
  return <Pressable accessibilityRole="button" accessibilityLabel={`Sort by ${column}, ${active&&sort.direction==='asc'?'descending':'ascending'}`} accessibilityState={{selected:active}} onPress={()=>sort.select(column)}
    className={classes.filter(c=>!textClass.includes(c)).join(' ')} style={[layoutStyle,{minHeight:44,flexDirection:'row',alignItems:'center',gap:4,minWidth:0}]}>
    <Text {...props} className={textClass.join(' ')} style={[textStyle,{flexShrink:1,minWidth:0}]}>{children}</Text>
    <Ionicons name={active?(sort.direction==='asc'?'arrow-up':'arrow-down'):'swap-vertical-outline'} size={12} color={active?'#C2410C':'#94A3B8'} style={{flexShrink:0}} />
  </Pressable>;
}
export function TableSortControl({sort}:{sort:TableSortState}){
  return <View className="flex-row flex-wrap items-center gap-3 mb-3" style={{minWidth:0}}>
    <View style={{width:240,maxWidth:'100%'}}><Select value={sort.column} placeholder="Sort by column" options={sort.columns.map(value=>({value,label:value}))} onValueChange={sort.select}/></View>
    {!!sort.column&&<Pressable accessibilityRole="button" accessibilityLabel="Reverse sort direction" onPress={()=>sort.select(sort.column)} style={{minHeight:44,justifyContent:'center'}}><Text className="text-sm font-semibold text-orange-700 dark:text-orange-400">{sort.direction==='asc'?'Ascending ↑':'Descending ↓'}</Text></Pressable>}
  </View>;
}
