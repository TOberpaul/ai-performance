import {createSlideTransition,bindScrollMotion} from '@tobiasoberpaul/mdk';
import {Moon,Sun} from 'lucide-react';
import {Documentation} from './documentation.jsx';
import {Button} from './ui/button';
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Tooltip,TooltipTrigger,TooltipContent,TooltipProvider} from './ui/tooltip';

const productName = 'AI Performance Tool';
const productShortName = 'AI Performance';
const sourceUrl = 'https://github.com/Tobias-Oberpaul/aip';
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

function Site(){
 const [theme,setTheme]=useState(()=>{
  try { return JSON.parse(sessionStorage.getItem('performance-site-settings')??'{}').theme==='light'?'light':'dark'; }
  catch { return 'dark'; }
 });
 const [systemReduced,setSystemReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const headerRef=useRef(null);
 const [headerFloating,setHeaderFloating]=useState(false);
 useLayoutEffect(()=>{
  document.documentElement.classList.toggle('dark',theme==='dark');
  document.documentElement.dataset.theme=theme;
  document.documentElement.style.colorScheme=theme;
  try {sessionStorage.setItem('performance-site-settings',JSON.stringify({theme}));}catch{}
 },[theme]);
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
   seek(progress){header.style.setProperty('--header-scroll-progress',String(systemReduced?(progress>0?1:0):progress));}};
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
 },[systemReduced]);
 return <>
  <header ref={headerRef} data-floating={headerFloating} className="shell-header border-b bg-background">
    <div className="shell-title">
      <a className="shell-home text-base font-semibold tracking-tight" aria-label={productName} {...linkTo('home')}>
        <span className="shell-home-full">{productName}</span>
        <span className="shell-home-short">{productShortName}</span>
      </a>
      <nav aria-label="AI Performance Tool pages" className="shell-view-group">
        {[['docs','Documentation'],['setup','Setup'],['source','GitHub']].map(([key,label])=>
          <Button key={key} asChild variant={view===key?'secondary':'ghost'}>
            <a aria-current={view===key?'page':undefined} {...linkTo(key)}>{label}</a>
          </Button>
        )}
      </nav>
    </div>
    <div className="shell-switches">
      <div className="shell-icon-actions">
        <HeaderHint text={theme==='dark'?'Switch to light mode':'Switch to dark mode'}>
          <Button type="button" variant="ghost" size="icon" aria-label="Dark mode" aria-pressed={theme==='dark'}
            onClick={()=>setTheme(theme==='dark'?'light':'dark')}>
            {theme==='dark'?<Moon aria-hidden="true"/>:<Sun aria-hidden="true"/>}
          </Button>
        </HeaderHint>
      </div>
    </div>
  </header>
  <div className="shell-layout">
    <main className="canvas">
      {view==='docs'?<Documentation sections={sections} html={html} sourceUrl={sourceUrl}/>:<div className="home-page">
        <article className="home-intro" dangerouslySetInnerHTML={{__html:html}}/>
      </div>}
    </main>
  </div>
 </>;
}
createRoot(container).render(<Site/>);
