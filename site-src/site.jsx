import {createGrowTransition,createSlideTransition,bindScrollMotion} from '@tobiasoberpaul/mdk';
import {Moon,Sun,Accessibility,PanelRight,X} from 'lucide-react';
import {playgroundDefaults as defaults,motionSettingsTokens} from './motion-settings.js';
import {Documentation} from './documentation.jsx';
import {Button} from './ui/button';
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Card,CardHeader,CardTitle,CardContent} from './ui/card';
import {Label} from './ui/label';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from './ui/select';
import {Slider} from './ui/slider';
import {Switch} from './ui/switch';
import {Tooltip,TooltipTrigger,TooltipContent,TooltipProvider} from './ui/tooltip';

const productName = 'AI Performance Tool';
const productShortName = 'AI Performance';
const sourceUrl = 'https://github.com/TOberpaul/ai-performance';
const container = document.getElementById('root');
const fallback = container.querySelector('article').cloneNode(true);
fallback.querySelector('[data-static-toc]')?.remove();
const html = fallback.innerHTML;
const sections = [...fallback.querySelectorAll('section[id]')].map(section => ({
  id: section.id, title: section.querySelector('h2').textContent,
}));
const view = sections.length ? 'docs' : 'home';
const base = new URL(view === 'docs' ? '../' : './', location.href);
const urls = { home: base.href, docs: new URL('docs/',base).href,
  setup: new URL('docs/#get-started',base).href, source: sourceUrl };
const linkTo = key => ({href:urls[key]});

function HeaderHint({text,children}){return <TooltipProvider delayDuration={350}><Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{text}</TooltipContent></Tooltip></TooltipProvider>;}

function Choice({id,label,value,options,onChange,className=''}){
 return <div className={`grid gap-2 ${className}`}><Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger id={id}><SelectValue/></SelectTrigger><SelectContent>{options.map(([key,text])=><SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectContent></Select></div>;
}
function Range({id,label,value,min=100,max=2000,step=20,unit=' ms',disabled,onChange,onCommit}){
 return <div className="grid gap-3"><div className="flex items-center justify-between gap-2"><Label id={`${id}-label`} className="text-xs">{label}</Label><output className="font-mono text-[11px] text-muted-foreground" id={`${id}-output`}>{value}{unit}</output></div><Slider id={id} className={disabled?'opacity-50':undefined} aria-labelledby={`${id}-label`} value={[value]} min={min} max={max} step={step} disabled={disabled} onValueChange={values=>onChange(values[0])} onValueCommit={onCommit} /></div>;
}
function Panel({title,children,className=''}){
 return <Card data-motion-content-group="" className={`shadow-none ${className}`}><CardHeader className="p-4 pb-4"><CardTitle className="text-sm">{title}</CardTitle></CardHeader><CardContent className="grid gap-5 p-4 pt-0">{children}</CardContent></Card>;
}

function Site(){
 const [config,setConfig]=useState(()=>{
  try { return {...defaults,...JSON.parse(sessionStorage.getItem('performance-site-settings')??'{}')}; }
  catch { return defaults; }
 });
 const [systemReduced,setSystemReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const headerRef=useRef(null);
 const [headerFloating,setHeaderFloating]=useState(false);
 function update(key,next){setConfig(previous=>({...previous,[key]:next}));}
 useLayoutEffect(()=>{
  document.documentElement.classList.toggle('dark',config.theme==='dark');
  document.documentElement.dataset.theme=config.theme;
  document.documentElement.style.colorScheme=config.theme;
  for(const [name,value] of Object.entries(motionSettingsTokens({...config,reduced:config.reduced||systemReduced})))
    document.documentElement.style.setProperty(name,value);
  try {sessionStorage.setItem('performance-site-settings',JSON.stringify(config));}catch{}
 },[config,systemReduced]);
 useEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const change=()=>setSystemReduced(media.matches);
  media.addEventListener('change',change);
  return()=>media.removeEventListener('change',change);
 },[]);
 useLayoutEffect(()=>{
  const element=headerRef.current;
  const update=()=>{
   const style=getComputedStyle(element);
   const height=element.getBoundingClientRect().height;
   document.documentElement.style.setProperty('--shell-header-height',height+'px');
   const slot=height+parseFloat(style.marginTop)+parseFloat(style.marginBottom);
   document.documentElement.style.setProperty('--shell-header-slot',slot+'px');
  };
  const observer=new ResizeObserver(update);
  observer.observe(element);
  update();
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  const header=headerRef.current;
  const nav=header.querySelector('.shell-view-group');
  const scroller=document.querySelector('.documentation');
  const navigationMotion=createSlideTransition({content:nav,side:'top',initiallyOpen:true});
  const abort=new AbortController();
  let previousScroll=0;
  const transition={state:'closed',isOpen:false,open(){this.seek(1);},close(){this.seek(0);},toggle(){},destroy(){},
   seek(progress){header.style.setProperty('--header-scroll-progress',String(config.reduced||systemReduced?(progress>0?1:0):progress));}};
  const disconnect=scroller&&bindScrollMotion({root:scroller,transition,start:0,end:160,mode:'scrub'});
  function updateHeader(){
   const y=scroller?.scrollTop??0;
   const bounds=scroller?.querySelector('article').getBoundingClientRect();
   if(bounds){
    document.documentElement.style.setProperty('--floating-content-width',bounds.width+'px');
    document.documentElement.style.setProperty('--floating-content-center',(bounds.left+bounds.width/2)+'px');
   }
   const delta=y-previousScroll;
   const home=header.querySelector('.shell-home');
   const wrapped=nav.offsetTop>home.offsetTop+home.offsetHeight;
   header.dataset.wrapped=String(wrapped);
   if(wrapped||y<=4||delta<0){header.dataset.navigationHidden='false';nav.inert=false;if(wrapped)navigationMotion.seek(1);else navigationMotion.open();}
   else if(delta>0){header.dataset.navigationHidden='true';nav.inert=true;navigationMotion.close();}
   previousScroll=y;
   setHeaderFloating(y>0);
  }
  document.addEventListener('scroll',updateHeader,{capture:true,passive:true,signal:abort.signal});
  window.addEventListener('resize',updateHeader,{passive:true,signal:abort.signal});
  updateHeader();
  return()=>{abort.abort();navigationMotion.destroy();disconnect?.();};
 },[config.reduced,systemReduced]);
 const [settingsVisible,setSettingsVisible]=useState(false);
 const settingsElement=useRef(null),settingsMotion=useRef(null),settingsTrigger=useRef(null);
 useLayoutEffect(()=>{
  const content=settingsElement.current;
  const reveal=[];
  const transition=createGrowTransition({content,axis:'width',reveal,onStateChange(state){
   if(state==='destroyed')return;
   if(state==='opening'||state==='closing')reveal.splice(0,reveal.length,...content.children);
   content.hidden=state==='closed';
   content.inert=state==='closed'||state==='closing';
  }});
  settingsMotion.current=transition;
  return()=>transition.destroy();
 },[]);
 useLayoutEffect(()=>{if(settingsVisible)settingsMotion.current?.open();else settingsMotion.current?.close();},[settingsVisible]);
 const reduced=config.reduced||systemReduced;
 return <><header ref={headerRef} data-floating={headerFloating} className="shell-header border-b bg-background"><div className="shell-title"><a className="shell-home text-base font-semibold tracking-tight" aria-label={productName} {...linkTo('home')}><span className="shell-home-full">{productName}</span><span className="shell-home-short">{productShortName}</span></a><nav aria-label="AI Performance Tool pages" className="shell-view-group">{[['docs','Documentation'],['setup','Setup'],['source','GitHub']].map(([key,label])=><Button key={key} asChild variant={view===key?'secondary':'ghost'}><a aria-current={view===key?'page':undefined} {...linkTo(key)}>{label}</a></Button>)}</nav></div><div className="shell-switches"><div className="shell-icon-actions"><HeaderHint text={config.theme==='dark'?'Switch to light mode':'Switch to dark mode'}><Button type="button" variant="ghost" size="icon" aria-label="Dark mode" aria-pressed={config.theme==="dark"} onClick={()=>update("theme",config.theme==="dark"?"light":"dark",true)}>{config.theme==="dark"?<Moon aria-hidden="true"/>:<Sun aria-hidden="true"/>}</Button></HeaderHint><HeaderHint text={systemReduced?'Reduced motion is enabled by your system':reduced?'Disable reduced motion':'Enable reduced motion'}><Button type="button" variant={reduced?'secondary':'ghost'} size="icon" aria-label="Reduced motion" aria-pressed={reduced} aria-disabled={systemReduced} onClick={()=>{if(!systemReduced)update('reduced',!config.reduced,true);}}><Accessibility aria-hidden="true"/></Button></HeaderHint><HeaderHint text={settingsVisible?"Hide settings":"Show settings"}><Button ref={settingsTrigger} type="button" variant="ghost" size="icon" aria-label="Motion settings" aria-controls="motion-settings" aria-expanded={settingsVisible} onClick={()=>setSettingsVisible(value=>!value)}><PanelRight aria-hidden="true"/></Button></HeaderHint></div></div></header>
  <div className="shell-layout" data-settings-visible={settingsVisible}><aside ref={settingsElement} id="motion-settings" hidden className="controls border-l bg-muted/10" aria-label="Motion settings"><Button type="button" variant="ghost" size="icon" className="self-end shrink-0" aria-label="Close motion settings" onClick={()=>{setSettingsVisible(false);settingsTrigger.current?.focus();}}><X aria-hidden="true"/></Button><Panel title="Timing"><Range id="duration" label="Duration" value={config.duration} onChange={next=>update('duration',next)}/></Panel>
   <Panel title="Content"><Choice id="content-entry" label="Screen entry" value={config.contentEntry} options={[["once","Once"],["repeat","Every time"]]} onChange={next=>update("contentEntry",next,true)}/><div className="flex items-center gap-2"><Switch id="progressive" checked={config.progressive} onCheckedChange={next=>update('progressive',next,true)}/><Label htmlFor="progressive" className="text-xs">Progressive content animation</Label></div><Range id="progressionGap" label="Progression gap" value={config.progressionGap} min={0} max={150} step={2} disabled={!config.progressive} onChange={next=>update('progressionGap',next)}/><p className="text-[11px] leading-relaxed text-muted-foreground">Time between content starts. Component sequences stay within their duration.</p></Panel>
   <Panel title="Overshoot"><div className="flex items-center gap-2"><Switch id="overshoot" checked={config.overshoot} onCheckedChange={next=>update('overshoot',next,true)}/><Label htmlFor="overshoot" className="text-xs">Overshoot</Label></div><Range id="overshootMinimum" disabled={!config.overshoot} label="Proportional · Min" value={config.overshootMinimum} min={0} max={30} step={1} unit="%" onChange={next=>update('overshootMinimum',next)}/><Range id="overshootMax" disabled={!config.overshoot} label="Maximum" value={config.overshootMax} min={0} max={2} step={0.125} unit=" rem" onChange={next=>update('overshootMax',next)}/><p className="text-[11px] leading-relaxed text-muted-foreground">Percentage of the shorter side, capped by the rem maximum. Direction follows the anchor or travel.</p></Panel>
  </aside><main className="canvas">
    {view==='docs'?<Documentation sections={sections} html={html} sourceUrl={sourceUrl}/>:<div className="home-page">
      <article className="home-intro" dangerouslySetInnerHTML={{__html:html}}/>
    </div>}
  </main></div></>;
}
createRoot(container).render(<Site/>);
