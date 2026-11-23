type Rect = {x:number; y:number; width:number; height:number};
type Viewport = {width:number; height:number; top?:number; left?:number};

export function dropdownLayout(anchor:Rect, viewport:Viewport, optionCount:number, searchable:boolean) {
  const gutter=12, gap=4;
  const leftEdge=(viewport.left||0)+gutter, topEdge=(viewport.top||0)+gutter;
  const bottom=(viewport.top||0)+viewport.height-gutter;
  const width=Math.max(0,Math.min(Math.max(anchor.width,240),viewport.width-gutter*2));
  const desired=Math.min(280,Math.max(96,optionCount*48+8+(searchable?64:0)));
  const below=Math.max(0,bottom-Math.max(topEdge,anchor.y+anchor.height+gap));
  const above=Math.max(0,Math.min(bottom,anchor.y-gap)-topEdge);
  const showAbove=below<desired&&above>below;
  const maxHeight=Math.max(0,Math.min(desired,viewport.height-gutter*2,showAbove?above:below));
  const height=maxHeight;
  return {
    width,
    left:Math.max(leftEdge,Math.min(anchor.x,leftEdge+viewport.width-gutter*2-width)),
    top:Math.max(topEdge,Math.min(showAbove?anchor.y-gap-height:anchor.y+anchor.height+gap,bottom-height)),
    maxHeight,
  };
}
