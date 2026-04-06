document.addEventListener('DOMContentLoaded',()=>{
    // Scroll Progress
    const pb=document.getElementById('scrollProgress');
    if(pb)window.addEventListener('scroll',()=>{const h=document.documentElement;pb.style.width=(h.scrollTop/(h.scrollHeight-h.clientHeight))*100+'%'},{passive:true});
    // Header
    const hd=document.querySelector('.header');
    if(hd)window.addEventListener('scroll',()=>hd.classList.toggle('scrolled',window.scrollY>40),{passive:true});
    // Mobile Menu
    const mt=document.getElementById('menuToggle'),mn=document.getElementById('mobileNav');
    if(mt&&mn){mt.addEventListener('click',()=>{const a=mn.classList.toggle('active');const s=mt.querySelectorAll('span');s[0].style.transform=a?'rotate(45deg) translate(6px,6px)':'';s[1].style.opacity=a?'0':'';s[2].style.transform=a?'rotate(-45deg) translate(6px,-6px)':'';});mn.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{mn.classList.remove('active');mt.querySelectorAll('span').forEach(s=>{s.style.transform='';s.style.opacity=''})}))}
    // Scroll Reveal
    const ro=document.querySelectorAll('.reveal');
    if(ro.length){const ob=new IntersectionObserver(e=>e.forEach(n=>{if(n.isIntersecting){n.target.classList.add('visible');ob.unobserve(n.target)}}),{threshold:.08,rootMargin:'0px 0px -40px 0px'});ro.forEach(e=>ob.observe(e))}
    // Counters
    const ct=document.querySelectorAll('[data-count]');
    if(ct.length){const co=new IntersectionObserver(e=>e.forEach(n=>{if(n.isIntersecting){const el=n.target,tg=parseFloat(el.dataset.count),sf=el.dataset.suffix||'',pf=el.dataset.prefix||'',dc=el.dataset.decimals?parseInt(el.dataset.decimals):0,dr=1600,st=performance.now();const an=now=>{const pr=Math.min((now-st)/dr,1),ez=1-Math.pow(1-pr,3),cu=tg*ez;el.textContent=pf+cu.toFixed(dc).replace(/\B(?=(\d{3})+(?!\d))/g,'.')+sf;if(pr<1)requestAnimationFrame(an)};requestAnimationFrame(an);co.unobserve(el)}}),{threshold:.3});ct.forEach(e=>co.observe(e))}
    // Modals
    document.querySelectorAll('[data-modal]').forEach(t=>t.addEventListener('click',e=>{e.preventDefault();const o=document.getElementById(t.dataset.modal);if(o){o.classList.add('active');document.body.style.overflow='hidden'}}));
    document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o||e.target.classList.contains('modal-close')){o.classList.remove('active');document.body.style.overflow=''}}));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelectorAll('.modal-overlay.active,.lightbox.active').forEach(o=>{o.classList.remove('active');document.body.style.overflow=''})}});
    // FAQ
    document.querySelectorAll('.faq-q').forEach(q=>q.addEventListener('click',()=>q.parentElement.classList.toggle('open')));
    // Lightbox Gallery
    const lb=document.getElementById('lightbox');
    if(lb){document.querySelectorAll('.gallery-item').forEach(item=>{item.addEventListener('click',()=>{const img=item.querySelector('img');const lbImg=lb.querySelector('img');if(img&&lbImg){lbImg.src=img.src;lbImg.alt=img.alt;lb.classList.add('active');document.body.style.overflow='hidden'}})});lb.addEventListener('click',e=>{if(e.target===lb||e.target.classList.contains('lightbox-close')){lb.classList.remove('active');document.body.style.overflow=''}})}
    // Smooth scroll
    document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const t=document.querySelector(a.getAttribute('href'));if(t){e.preventDefault();t.scrollIntoView({behavior:'smooth'})}}));
    if('scrollRestoration' in history)history.scrollRestoration='manual';
    window.scrollTo(0,0);
    // Lucide icons
    if(window.lucide)lucide.createIcons();
    // Init features
    initGrowthSlider();
    initConfigurator();
});

function initGrowthSlider(){
    const s=document.getElementById('growthSlider');if(!s)return;
    const data=[
        {year:1,height:3,diameter:8,volume:0.01,co2:40},
        {year:2,height:5,diameter:12,volume:0.04,co2:80},
        {year:3,height:7,diameter:16,volume:0.08,co2:130},
        {year:4,height:10,diameter:22,volume:0.2,co2:180},
        {year:5,height:12,diameter:26,volume:0.35,co2:220},
        {year:6,height:14,diameter:30,volume:0.5,co2:250},
        {year:7,height:16,diameter:34,volume:0.7,co2:270},
        {year:8,height:17,diameter:36,volume:0.85,co2:285},
        {year:9,height:18,diameter:38,volume:1.0,co2:295},
        {year:10,height:19,diameter:40,volume:1.1,co2:300},
        {year:11,height:19.5,diameter:43,volume:1.25,co2:300},
        {year:12,height:20,diameter:45,volume:1.4,co2:300}
    ];
    const el=id=>document.getElementById(id);
    const update=()=>{
        const d=data[parseInt(s.value)-1];
        if(el('growthYear'))el('growthYear').textContent='Jahr '+d.year;
        if(el('growthYear2'))el('growthYear2').textContent='Jahr '+d.year;
        if(el('growthHeight'))el('growthHeight').textContent=d.height+'m';
        if(el('growthDiameter'))el('growthDiameter').textContent=d.diameter+'cm';
        if(el('growthVolume'))el('growthVolume').textContent=d.volume.toFixed(2)+' m\u00B3';
        if(el('growthCo2'))el('growthCo2').textContent=d.co2+' kg';
        if(el('growthMarketLow'))el('growthMarketLow').textContent='$'+Math.round(d.volume*1695).toLocaleString('de-DE');
        if(el('growthMarketHigh'))el('growthMarketHigh').textContent='$'+Math.round(d.volume*2119).toLocaleString('de-DE');
        const trunk=el('treeTrunk'),crown=el('treeCrown');
        if(trunk){trunk.style.height=(40+(d.year/12)*200)+'px';trunk.style.width=(12+(d.diameter/45)*16)+'px'}
        if(crown){const sz=60+(d.year/12)*160;crown.style.width=sz+'px';crown.style.height=(sz*.85)+'px';crown.style.bottom=(90+(d.year/12)*200)+'px'}
    };
    s.addEventListener('input',update);update();
}

function initConfigurator(){
    const s=document.getElementById('configSlider');if(!s)return;
    const PRICE_PER_TREE=249;
    const TREES_PER_HA=625;
    const VOLUME_PER_TREE=1.4;
    const CO2_PER_TREE=300;
    const MARKET_LOW=1695;
    const MARKET_HIGH=2119;
    const el=id=>document.getElementById(id);
    const update=()=>{
        const t=parseInt(s.value);
        const area=t/TREES_PER_HA;
        const vol=t*VOLUME_PER_TREE;
        const co2=t*CO2_PER_TREE;
        const price=t*PRICE_PER_TREE;
        const mktLow=vol*MARKET_LOW;
        const mktHigh=vol*MARKET_HIGH;
        if(el('configCount'))el('configCount').textContent=t;
        if(el('configPrice'))el('configPrice').textContent=price.toLocaleString('de-DE')+' \u20AC';
        if(el('configArea'))el('configArea').textContent=area.toFixed(2).replace('.',',');
        if(el('configCo2'))el('configCo2').textContent=co2.toLocaleString('de-DE');
        if(el('configVolume'))el('configVolume').textContent=vol.toLocaleString('de-DE');
        if(el('configMarketLow'))el('configMarketLow').textContent='$'+Math.round(mktLow).toLocaleString('de-DE');
        if(el('configMarketHigh'))el('configMarketHigh').textContent='$'+Math.round(mktHigh).toLocaleString('de-DE');
        const bars=document.querySelectorAll('.forest-bar');
        bars.forEach((b,i)=>{const active=i<Math.ceil((t/800)*bars.length);b.classList.toggle('active',active);b.style.height=active?(30+Math.random()*60)+'px':'8px'});
    };
    s.addEventListener('input',update);update();
}
