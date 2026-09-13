(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(pointer: fine) and (hover: hover)');
  const hero = document.querySelector('.hero');
  if (!hero || !document.querySelector('#launcherGalleryImage')
      || !('IntersectionObserver' in window) || !('ResizeObserver' in window)
      || typeof Element.prototype.animate !== 'function') return;
  let enabled = !reduced.matches;
  let pageVisible = !document.hidden;
  let heroVisible = true;
  const entryAnimations = [];
  const galleryAnimations = [];
  const changeListeners = new Set();
  const canvas = document.createElement('canvas');
  canvas.className = 'motion-ambient';canvas.setAttribute('aria-hidden','true');
  const light = document.createElement('div');light.className='motion-light';light.setAttribute('aria-hidden','true');
  hero.append(canvas,light);
  const progress = document.createElement('div');progress.className='motion-progress';progress.setAttribute('aria-hidden','true');document.body.append(progress);
  function cancelAnimations(list){list.splice(0).forEach(animation=>animation.cancel());}

  function playEntry() {
    cancelAnimations(entryAnimations);
    if(!enabled) return;
    const sequence=['.hero .eyebrow','.hero h1','.hero-lead','.hero-description','.hero-actions','.hero-meta'];
    sequence.forEach((selector,i)=>{
      const element=document.querySelector(selector);if(!element) return;
      const animation=element.animate([
        {opacity:0,translate:`0 ${i===1?38:22}px`,filter:`blur(${i===1?5:2}px)`},
        {opacity:1,translate:'0 0',filter:'blur(0px)'}
      ],{duration:i===1?1100:900,delay:i*110,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'});
      entryAnimations.push(animation);
    });
  }
  const reveals=[...document.querySelectorAll('.reveal')].filter(el=>!el.closest('.hero'));
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;
      entry.target.classList.add('motion-in');observer.unobserve(entry.target);
    });
  },{threshold:.08,rootMargin:'0px 0px -25px 0px'});
  function armReveals() {
    observer.disconnect();
    reveals.forEach((element,i)=>{
      element.dataset.motionReveal='';
      element.style.setProperty('--motion-delay',`${element.classList.contains('workflow-step') ? i%3*110 : i%3*40}ms`);
      const rect=element.getBoundingClientRect();
      element.classList.toggle('motion-in',!enabled||rect.bottom<0);
      if(enabled) observer.observe(element);
    });
  }
  function applyMotionPreferences() {
    enabled = !reduced.matches;
    root.classList.toggle('motion-on', enabled);
    cancelAnimations(entryAnimations);
    cancelAnimations(galleryAnimations);
    document.querySelectorAll('.motion-gallery-ghost').forEach(element => element.remove());
    hero.style.setProperty('--motion-pointer-x', '0');
    hero.style.setProperty('--motion-pointer-y', '0');
    armReveals();
    if (enabled && scrollY < hero.clientHeight * .6) playEntry();
    changeListeners.forEach(callback => callback());
  }
  reduced.addEventListener('change', applyMotionPreferences);

  let scrollFrame=0;
  function updateProgress(){scrollFrame=0;root.style.setProperty('--motion-progress',String(Math.min(1,Math.max(0,scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight)))));}
  window.addEventListener('scroll',()=>{if(!scrollFrame)scrollFrame=requestAnimationFrame(updateProgress);},{passive:true});
  window.addEventListener('resize',updateProgress);updateProgress();
  let pointerFrame=0,pointerX=0,pointerY=0;
  hero.addEventListener('pointermove',event=>{
    if(!enabled||!fine.matches) return;
    const rect=hero.getBoundingClientRect();pointerX=(event.clientX/rect.width-.5)*2;pointerY=((event.clientY-rect.top)/rect.height-.5)*2;
    if(pointerFrame) return;
    pointerFrame=requestAnimationFrame(()=>{pointerFrame=0;if(!enabled)return;hero.style.setProperty('--motion-pointer-x',pointerX.toFixed(3));hero.style.setProperty('--motion-pointer-y',pointerY.toFixed(3));});
  },{passive:true});
  hero.addEventListener('pointerleave',()=>{if(pointerFrame)cancelAnimationFrame(pointerFrame);pointerFrame=0;hero.style.setProperty('--motion-pointer-x','0');hero.style.setProperty('--motion-pointer-y','0');});
  document.querySelectorAll('.workflow-step,.feature-row,.release-row').forEach(card=>{
    let pending=0,x=0,y=0;
    card.addEventListener('pointermove',event=>{
      if(!enabled||!fine.matches)return;
      const rect=card.getBoundingClientRect();x=event.clientX-rect.left;y=event.clientY-rect.top;
      if(pending)return;
      pending=requestAnimationFrame(()=>{pending=0;card.style.setProperty('--motion-spot-x',x+'px');card.style.setProperty('--motion-spot-y',y+'px');});
    },{passive:true});
  });

  // The original app owns slide state and keyboard controls. This layer only
  // animates the image swap, with one reusable overlay even during rapid clicks.
  const image=document.querySelector('#launcherGalleryImage');
  const stage=image.parentElement;
  let previousSource=image.src,revision=0;
  new MutationObserver(async()=>{
    if(image.src===previousSource)return;
    const source=image.src,oldSource=previousSource;previousSource=source;
    const current=++revision;
    const existing=stage.querySelector('.motion-gallery-ghost');
    const visibleSource=existing?.src||oldSource;
    cancelAnimations(galleryAnimations);existing?.remove();
    if(!enabled)return;
    const ghost=new Image();ghost.className='motion-gallery-ghost';ghost.alt='';ghost.setAttribute('aria-hidden','true');ghost.src=visibleSource;stage.append(ghost);
    try{await image.decode();}catch{ghost.remove();return;}
    if(current!==revision||!enabled){ghost.remove();return;}
    const outgoing=ghost.animate([{opacity:1,translate:'0 0'},{opacity:0,translate:'-22px 0'}],{duration:650,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
    const incoming=image.animate([{opacity:.4,translate:'25px 0',scale:1.012},{opacity:1,translate:'0 0',scale:1}],{duration:750,easing:'cubic-bezier(.22,1,.36,1)'});
    galleryAnimations.push(outgoing,incoming);
    outgoing.finished.then(()=>ghost.remove(),()=>ghost.remove());
  }).observe(image,{attributes:true,attributeFilter:['src']});

  // A small canvas, capped at 30 fps, only runs while the hero is visible.
  const context=canvas.getContext('2d');
  if (context) {
  let width=1,height=1,particles=[],particleFrame=0,lastTime=0;
  function resizeParticles(){
    const rect=hero.getBoundingClientRect();width=rect.width;height=rect.height;
    const dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);context.setTransform(dpr,0,0,dpr,0,0);
    particles=Array.from({length:Math.min(58,Math.max(20,Math.floor(width/23)))},()=>({x:Math.random()*width,y:Math.random()*height,r:Math.random()*1.2+.45,speed:Math.random()*.3+.15,alpha:Math.random()*.38+.12,phase:Math.random()*Math.PI*2}));
  }
  function paint(time){
    particleFrame=0;if(!enabled||!pageVisible||!heroVisible)return;
    particleFrame=requestAnimationFrame(paint);if(time-lastTime<32)return;
    const elapsed=lastTime?Math.min(time-lastTime,70)/16:1;lastTime=time;
    context.clearRect(0,0,width,height);
    for(const point of particles){
      point.y-=point.speed*elapsed;point.x+=(.12+Math.sin(time*.0003+point.phase)*.09)*elapsed;
      if(point.y< -8)point.y=height+8;if(point.x>width+8)point.x=-8;
      const alpha=point.alpha*(.65+.35*Math.sin(time*.001+point.phase));
      context.beginPath();context.arc(point.x,point.y,point.r,0,Math.PI*2);context.fillStyle=`rgba(240,192,105,${alpha})`;context.fill();
    }
  }
  function refreshMotion(){
    if(particleFrame)cancelAnimationFrame(particleFrame);particleFrame=0;lastTime=0;
    hero.classList.toggle('motion-outside',!pageVisible||!heroVisible);
    if(enabled&&pageVisible&&heroVisible)particleFrame=requestAnimationFrame(paint);
    else context.clearRect(0,0,width,height);
  }
  new ResizeObserver(resizeParticles).observe(hero);
  new IntersectionObserver(entries=>{heroVisible=entries[0].isIntersecting;refreshMotion();}).observe(hero);
  document.addEventListener('visibilitychange',()=>{pageVisible=!document.hidden;refreshMotion();});
  window.addEventListener('pagehide',()=>{pageVisible=false;refreshMotion();});
  window.addEventListener('pageshow',()=>{pageVisible=!document.hidden;refreshMotion();});
  changeListeners.add(refreshMotion);
  resizeParticles();
  } else {
    canvas.remove();
  }
  applyMotionPreferences();
})();
