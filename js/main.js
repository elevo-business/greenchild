document.addEventListener('DOMContentLoaded',()=>{
    const pb=document.getElementById('scrollProgress');
    if(pb)window.addEventListener('scroll',()=>{const h=document.documentElement;pb.style.width=(h.scrollTop/(h.scrollHeight-h.clientHeight))*100+'%'},{passive:true});
    const hd=document.querySelector('.header');
    if(hd)window.addEventListener('scroll',()=>hd.classList.toggle('scrolled',window.scrollY>40),{passive:true});
    const mt=document.getElementById('menuToggle'),mn=document.getElementById('mobileNav');
    if(mt&&mn){mt.addEventListener('click',()=>{const a=mn.classList.toggle('active');const s=mt.querySelectorAll('span');s[0].style.transform=a?'rotate(45deg) translate(6px,6px)':'';s[1].style.opacity=a?'0':'';s[2].style.transform=a?'rotate(-45deg) translate(6px,-6px)':'';});mn.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{mn.classList.remove('active');mt.querySelectorAll('span').forEach(s=>{s.style.transform='';s.style.opacity=''})}))}
    const ro=document.querySelectorAll('.reveal');
    if(ro.length){const ob=new IntersectionObserver(e=>e.forEach(n=>{if(n.isIntersecting){n.target.classList.add('visible');ob.unobserve(n.target)}}),{threshold:.08,rootMargin:'0px 0px -40px 0px'});ro.forEach(e=>ob.observe(e))}
    const ct=document.querySelectorAll('[data-count]');
    if(ct.length){const co=new IntersectionObserver(e=>e.forEach(n=>{if(n.isIntersecting){const el=n.target,tg=parseFloat(el.dataset.count),sf=el.dataset.suffix||'',pf=el.dataset.prefix||'',dc=el.dataset.decimals?parseInt(el.dataset.decimals):0,dr=1600,st=performance.now();const an=now=>{const pr=Math.min((now-st)/dr,1),ez=1-Math.pow(1-pr,3),cu=tg*ez;el.textContent=pf+cu.toFixed(dc).replace(/\B(?=(\d{3})+(?!\d))/g,'.')+sf;if(pr<1)requestAnimationFrame(an)};requestAnimationFrame(an);co.unobserve(el)}}),{threshold:.3});ct.forEach(e=>co.observe(e))}
    document.querySelectorAll('[data-modal]').forEach(t=>t.addEventListener('click',e=>{e.preventDefault();const o=document.getElementById(t.dataset.modal);if(o){o.classList.add('active');document.body.style.overflow='hidden'}}));
    document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o||e.target.classList.contains('modal-close')){o.classList.remove('active');document.body.style.overflow=''}}));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelectorAll('.modal-overlay.active,.lightbox.active').forEach(o=>{o.classList.remove('active');document.body.style.overflow=''})}});
    document.querySelectorAll('.faq-q').forEach(q=>q.addEventListener('click',()=>q.parentElement.classList.toggle('open')));
    const lb=document.getElementById('lightbox');
    if(lb){document.querySelectorAll('.gallery-item').forEach(item=>{item.addEventListener('click',()=>{const img=item.querySelector('img');const lbImg=lb.querySelector('img');if(img&&lbImg){lbImg.src=img.src;lbImg.alt=img.alt;lb.classList.add('active');document.body.style.overflow='hidden'}})});lb.addEventListener('click',e=>{if(e.target===lb||e.target.classList.contains('lightbox-close')){lb.classList.remove('active');document.body.style.overflow=''}})}
    document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const t=document.querySelector(a.getAttribute('href'));if(t){e.preventDefault();t.scrollIntoView({behavior:'smooth'})}}));
    if('scrollRestoration' in history)history.scrollRestoration='manual';
    window.scrollTo(0,0);
    if(window.lucide)lucide.createIcons();
    initGrowthSlider();
    initConfigurator();
});

function initGrowthSlider(){
    const s=document.getElementById('growthSlider');if(!s)return;
    var data=[
        {year:1,height:2.8,diameter:7,volume:0.01,co2:37},
        {year:2,height:4.6,diameter:11,volume:0.03,co2:74},
        {year:3,height:6.9,diameter:15,volume:0.07,co2:123},
        {year:4,height:9.3,diameter:21,volume:0.18,co2:171},
        {year:5,height:11.5,diameter:25,volume:0.31,co2:213},
        {year:6,height:13.2,diameter:29,volume:0.47,co2:246},
        {year:7,height:15.1,diameter:33,volume:0.67,co2:268},
        {year:8,height:16.4,diameter:35,volume:0.83,co2:281},
        {year:9,height:17.6,diameter:37,volume:0.97,co2:291},
        {year:10,height:18.3,diameter:39,volume:1.09,co2:297},
        {year:11,height:19.1,diameter:42,volume:1.23,co2:299},
        {year:12,height:19.7,diameter:44,volume:1.37,co2:301}
    ];
    var el=function(id){return document.getElementById(id)};
    var update=function(){
        var d=data[parseInt(s.value)-1];
        if(el('growthYear'))el('growthYear').textContent='Jahr '+d.year;
        if(el('growthYear2'))el('growthYear2').textContent='Jahr '+d.year;
        if(el('growthHeight'))el('growthHeight').textContent=d.height+'m';
        if(el('growthDiameter'))el('growthDiameter').textContent=d.diameter+'cm';
        if(el('growthVolume'))el('growthVolume').textContent='ca. '+d.volume.toFixed(2)+' m\u00B3';
        if(el('growthCo2'))el('growthCo2').textContent='ca. '+d.co2+' kg';
        if(el('growthMarketLow'))el('growthMarketLow').textContent='$'+Math.round(d.volume*1695).toLocaleString('de-DE');
        if(el('growthMarketHigh'))el('growthMarketHigh').textContent='$'+Math.round(d.volume*2119).toLocaleString('de-DE');
        // Visual tree
        var pct=d.year/12;
        var trunk=el('treeTrunk'),crown=el('treeCrown');
        if(trunk){trunk.style.height=(40+pct*200)+'px';trunk.style.width=(12+(d.diameter/44)*16)+'px'}
        if(crown){var sz=60+pct*160;crown.style.width=sz+'px';crown.style.height=(sz*.85)+'px';crown.style.bottom=(90+pct*200)+'px'}
        // Tree disc cross-section
        var disc=el('treeDisc');
        if(disc){
            var maxDisc=120;
            var discSize=24+(d.diameter/44)*maxDisc;
            disc.style.width=discSize+'px';
            disc.style.height=discSize+'px';
            var svg='<svg viewBox="0 0 100 100" width="100%" height="100%">';
            svg+='<circle cx="50" cy="50" r="48" fill="#D4A574" stroke="#8B6843" stroke-width="2"/>';
            svg+='<circle cx="50" cy="50" r="44" fill="#C49A6C"/>';
            for(var i=1;i<=d.year;i++){
                var r=4+(40*(i/12));
                var op=0.15+i*0.03;
                svg+='<circle cx="50" cy="50" r="'+r+'" fill="none" stroke="rgba(139,104,67,'+op+')" stroke-width="0.8"/>';
            }
            svg+='<circle cx="50" cy="50" r="2.5" fill="#8B6843"/>';
            svg+='<line x1="50" y1="6" x2="50" y2="15" stroke="rgba(92,61,46,.12)" stroke-width="0.3"/>';
            svg+='<line x1="85" y1="50" x2="94" y2="50" stroke="rgba(92,61,46,.12)" stroke-width="0.3"/>';
            svg+='</svg>';
            disc.innerHTML=svg;
        }
        var discLabel=el('discDiameter');
        if(discLabel)discLabel.textContent='\u00D8 '+d.diameter+' cm';
    };
    s.addEventListener('input',update);update();
}

function initConfigurator(){
    var s=document.getElementById('configSlider');if(!s)return;
    var PRICE=249,HA=625,VOL=1.37,CO2=301,MLO=1695,MHI=2119;
    var el=function(id){return document.getElementById(id)};
    var update=function(){
        var t=parseInt(s.value),area=t/HA,vol=t*VOL,co2=t*CO2,price=t*PRICE;
        if(el('configCount'))el('configCount').textContent=t;
        if(el('configPrice'))el('configPrice').textContent=price.toLocaleString('de-DE')+' \u20AC';
        if(el('configArea'))el('configArea').textContent=area.toFixed(2).replace('.',',');
        if(el('configCo2'))el('configCo2').textContent='ca. '+co2.toLocaleString('de-DE');
        if(el('configVolume'))el('configVolume').textContent='ca. '+Math.round(vol).toLocaleString('de-DE');
        if(el('configMarketLow'))el('configMarketLow').textContent='$'+Math.round(vol*MLO).toLocaleString('de-DE');
        if(el('configMarketHigh'))el('configMarketHigh').textContent='$'+Math.round(vol*MHI).toLocaleString('de-DE');
        var bars=document.querySelectorAll('.forest-bar');
        bars.forEach(function(b,i){var active=i<Math.ceil((t/800)*bars.length);b.classList.toggle('active',active);b.style.height=active?(30+Math.random()*60)+'px':'8px'});
    };
    s.addEventListener('input',update);update();
}

// Dropdown Nav — mobile touch support
(function(){
    var drops=document.querySelectorAll('.nav-dropdown');
    if(!drops.length)return;
    drops.forEach(function(d){
        var link=d.querySelector('.nav-link');
        if(!link)return;
        link.addEventListener('click',function(e){
            // On touch/mobile: first tap opens, second navigates
            if(window.innerWidth<=900)return; // mobile uses hamburger, not dropdowns
            if(!d.classList.contains('open')){
                e.preventDefault();
                // Close others
                drops.forEach(function(o){o.classList.remove('open')});
                d.classList.add('open');
            }
            // If already open, let click navigate
        });
    });
    // Close dropdowns on click outside
    document.addEventListener('click',function(e){
        if(!e.target.closest('.nav-dropdown')){
            drops.forEach(function(d){d.classList.remove('open')});
        }
    });
})();
