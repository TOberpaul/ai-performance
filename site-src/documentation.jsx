import {Card} from './ui/card';
import {Button} from './ui/button';
import React,{useLayoutEffect,useRef,useState} from 'react';
import {createGrowTransition} from '@tobiasoberpaul/mdk';
import {Tooltip,TooltipContent,TooltipProvider,TooltipTrigger} from './ui/tooltip';


function createTocMarker(element){
 let motion,from='idle',to='idle',target='idle';
 return {
   set(next){
     if(next===target)return;
     target=next;
     if(motion&&next===from){motion.close();return;}
     if(motion&&next===to){motion.open();return;}
     const style=getComputedStyle(element);
     const width=style.width,color=style.color;
     const source=element.dataset.length??'idle';
     // A retargeted frame may be between sizes, so only reuse settled endpoints.
     from=motion&&(motion.state==='opening'||motion.state==='closing')?undefined:source;
     motion?.destroy();
     to=next;
     element.style.width=width;
     element.style.color=color;
     motion=createGrowTransition({
       content:element,trigger:element,axis:'width',
       onStateChange(state){
         if(state==='opening'){
           element.dataset.length=to;
           element.style.removeProperty('width');
           element.style.removeProperty('color');
         }
         if(state==='closed')element.dataset.length=source;
       },
     });
     motion.open();
   },
   destroy(){
     motion?.destroy();
     delete element.dataset.length;
   },
 };
}

export function Documentation({sections,html,sourceUrl}){
 const root=useRef(null),[active,setActive]=useState({current:undefined,visible:[]});
 const article=useRef(null);
 useLayoutEffect(()=>{
   const content=document.createRange().createContextualFragment(html);
   const nodes=[...content.childNodes];
   article.current.prepend(content);
   return()=>nodes.forEach(node=>node.remove());
 },[html]);
 useLayoutEffect(()=>{
   const scroller=root.current;
   const toc=scroller.querySelector('nav');
   const header=document.querySelector('.shell-header');
   const compact=matchMedia('(max-width:1279.98px)');
   const links=[...toc.querySelectorAll('.docs-toc-section')];
   const targets=links.map(link=>scroller.querySelector(link.hash));
   let markers=[];
   let frame=0;
   function update(){
     frame=0;
     scroller.dataset.scrollable=String(scroller.scrollHeight>scroller.clientHeight+1);
     const rail=toc.getBoundingClientRect();
     scroller.style.setProperty('--docs-toc-height',rail.height+'px');
     const viewport=scroller.getBoundingClientRect();
     const anchorInset=parseFloat(getComputedStyle(scroller).scrollPaddingTop)||0;
     const visibleTop=Math.max(viewport.top,header.getBoundingClientRect().bottom,compact.matches?rail.bottom:0);
     const top=Math.max(viewport.top+anchorInset,visibleTop);
     const atEnd=scroller.scrollTop>0&&scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop<=1;
     const limit=atEnd?viewport.bottom:top+1;
     const visible=targets.flatMap((target,index)=>{
       const rect=target.getBoundingClientRect();
       return rect.bottom>visibleTop&&rect.top<viewport.bottom?[{index,id:target.id,top:rect.top}]:[];
     });
     const current=visible.reduce((selected,section)=>section.top<limit?section:selected,visible[0]);
     const ids=visible.map(section=>section.id);
     markers.forEach((marker,index)=>{
       const isVisible=offset=>ids.includes(targets[index+offset]?.id);
       marker.set(isVisible(0)?'active':isVisible(-1)||isVisible(1)?'nearby':'idle');
     });
     setActive(previous=>previous.current===current?.id&&previous.visible.length===ids.length&&
       ids.every((id,index)=>id===previous.visible[index])?previous:{current:current?.id,visible:ids});
     if(!current)return;
     // Only move the TOC rail so tracking never scrolls the article back.
     const link=links[current.index].getBoundingClientRect();
     const gutter=compact.matches?parseFloat(getComputedStyle(toc).paddingLeft):0;
     const left=rail.left+toc.clientLeft+gutter,topEdge=rail.top+toc.clientTop;
     toc.scrollLeft+=Math.min(0,link.left-left)+Math.max(0,link.right-left-toc.clientWidth+2*gutter);
     toc.scrollTop+=Math.min(0,link.top-topEdge)+Math.max(0,link.bottom-topEdge-toc.clientHeight);
   }
   function schedule(){if(!frame)frame=requestAnimationFrame(update);}
   function configureMarkers(){
     markers.forEach(marker=>marker.destroy());
     markers=compact.matches?[]:links.map(link=>createTocMarker(link.querySelector('.docs-toc-marker')));
     schedule();
   }
   compact.addEventListener('change',configureMarkers);
   configureMarkers();
   scroller.addEventListener('scroll',schedule,{passive:true});
   const resize=new ResizeObserver(schedule);resize.observe(scroller);resize.observe(scroller.querySelector('article'));resize.observe(toc);resize.observe(header);
   update();
   const initial=targets.find(target=>'#'+target.id===location.hash);
   const anchorFrame=requestAnimationFrame(()=>{if(initial)scroller.scrollTop+=initial.getBoundingClientRect().top-scroller.getBoundingClientRect().top-(parseFloat(getComputedStyle(scroller).scrollPaddingTop)||0);});
   return()=>{cancelAnimationFrame(anchorFrame);scroller.removeEventListener('scroll',schedule);resize.disconnect();cancelAnimationFrame(frame);compact.removeEventListener('change',configureMarkers);markers.forEach(marker=>marker.destroy());};
 },[]);
 return <div className="documentation" ref={root}>
 <nav aria-label="Documentation sections">
   <TooltipProvider>
     {sections.map(({title,id})=>{
       return <Tooltip key={id}>
         <TooltipTrigger asChild><a className="docs-toc-section" href={'#'+id} aria-label={title} aria-current={active.current===id?'location':undefined} data-active={active.visible.includes(id)}>
           <span className="docs-toc-marker" aria-hidden="true"/>
           <span className="docs-toc-label">{title}</span>
         </a></TooltipTrigger>
         <TooltipContent side="right" className="docs-toc-tooltip">{title}</TooltipContent>
       </Tooltip>;
     })}
   </TooltipProvider>
 </nav><article ref={article}>
 <footer className="docs-download" aria-labelledby="docs-download-title">
   <Card className="docs-download-card">
     <h2 id="docs-download-title">Start tracking your project</h2>
     <p>Set up AI Performance in your own clone and choose which tools to record.</p>
     <Button asChild><a href={sourceUrl}>Open the repository</a></Button>
   </Card>
 </footer>
 </article></div>;
}
