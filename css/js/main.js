document.addEventListener('DOMContentLoaded', () => {
    const progressBar = document.getElementById('scrollProgress');
    if (progressBar) {
        window.addEventListener('scroll', () => {
            const h = document.documentElement;
            const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
            progressBar.style.width = pct + '%';
        }, { passive: true });
    }
    const header = document.querySelector('.header');
    if (header) {
        window.addEventListener('scroll', () => {
            header.classList.toggle('scrolled', window.scrollY > 40);
        }, { passive: true });
    }
    const menuToggle = document.getElementById('menuToggle');
    const mobileNav = document.getElementById('mobileNav');
    if (menuToggle && mobileNav) {
        menuToggle.addEventListener('click', () => {
            mobileNav.classList.toggle('active');
            const spans = menuToggle.querySelectorAll('span');
            if (mobileNav.classList.contains('active')) {
                spans[0].style.transform = 'rotate(45deg) translate(6px, 6px)';
                spans[1].style.opacity = '0';
                spans[2].style.transform = 'rotate(-45deg) translate(6px, -6px)';
            } else {
                spans[0].style.transform = '';
                spans[1].style.opacity = '';
                spans[2].style.transform = '';
            }
        });
        mobileNav.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', () => {
                mobileNav.classList.remove('active');
                const spans = menuToggle.querySelectorAll('span');
                spans[0].style.transform = '';
                spans[1].style.opacity = '';
                spans[2].style.transform = '';
            });
        });
    }
    const revealEls = document.querySelectorAll('.reveal');
    if (revealEls.length > 0) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
        revealEls.forEach(el => observer.observe(el));
    }
    const counters = document.querySelectorAll('[data-count]');
    if (counters.length > 0) {
        const counterObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const target = parseFloat(el.dataset.count);
                    const suffix = el.dataset.suffix || '';
                    const prefix = el.dataset.prefix || '';
                    const decimals = el.dataset.decimals ? parseInt(el.dataset.decimals) : 0;
                    const duration = 1600;
                    const start = performance.now();
                    const animate = (now) => {
                        const elapsed = now - start;
                        const progress = Math.min(elapsed / duration, 1);
                        const eased = 1 - Math.pow(1 - progress, 3);
                        const current = target * eased;
                        el.textContent = prefix + current.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + suffix;
                        if (progress < 1) requestAnimationFrame(animate);
                    };
                    requestAnimationFrame(animate);
                    counterObserver.unobserve(el);
                }
            });
        }, { threshold: 0.3 });
        counters.forEach(el => counterObserver.observe(el));
    }
    document.querySelectorAll('[data-modal]').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            const id = trigger.dataset.modal;
            const overlay = document.getElementById(id);
            if (overlay) overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    });
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.classList.contains('modal-close')) {
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(o => {
                o.classList.remove('active');
                document.body.style.overflow = '';
            });
        }
    });
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', (e) => {
            const target = document.querySelector(a.getAttribute('href'));
            if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
        });
    });
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    initGrowthSlider();
    initConfigurator();
});

function initGrowthSlider() {
    const slider = document.getElementById('growthSlider');
    if (!slider) return;
    const data = [
        { year: 1, height: 3, diameter: 8, volume: 0.02, co2: 120 },
        { year: 2, height: 5, diameter: 12, volume: 0.06, co2: 200 },
        { year: 3, height: 7, diameter: 16, volume: 0.12, co2: 300 },
        { year: 4, height: 10, diameter: 22, volume: 0.35, co2: 420 },
        { year: 5, height: 12, diameter: 26, volume: 0.55, co2: 500 },
        { year: 6, height: 14, diameter: 30, volume: 0.75, co2: 540 },
        { year: 7, height: 16, diameter: 34, volume: 1.0, co2: 570 },
        { year: 8, height: 17, diameter: 36, volume: 1.2, co2: 580 },
        { year: 9, height: 18, diameter: 38, volume: 1.4, co2: 590 },
        { year: 10, height: 19, diameter: 40, volume: 1.7, co2: 595 },
        { year: 11, height: 19.5, diameter: 43, volume: 1.85, co2: 598 },
        { year: 12, height: 20, diameter: 45, volume: 2.0, co2: 600 },
    ];
    const update = () => {
        const idx = parseInt(slider.value) - 1;
        const d = data[idx];
        const yearEl = document.getElementById('growthYear');
        const heightEl = document.getElementById('growthHeight');
        const diameterEl = document.getElementById('growthDiameter');
        const volumeEl = document.getElementById('growthVolume');
        const co2El = document.getElementById('growthCo2');
        const trunk = document.getElementById('treeTrunk');
        const crown = document.getElementById('treeCrown');
        const year2 = document.getElementById('growthYear2');
        if (yearEl) yearEl.textContent = 'Jahr ' + d.year;
        if (year2) year2.textContent = 'Jahr ' + d.year;
        if (heightEl) heightEl.textContent = d.height + 'm';
        if (diameterEl) diameterEl.textContent = d.diameter + 'cm';
        if (volumeEl) volumeEl.textContent = d.volume.toFixed(2) + ' m\u00B3';
        if (co2El) co2El.textContent = d.co2 + ' kg';
        if (trunk) {
            trunk.style.height = (40 + (d.year / 12) * 200) + 'px';
            trunk.style.width = (12 + (d.diameter / 45) * 16) + 'px';
        }
        if (crown) {
            const size = 60 + (d.year / 12) * 160;
            crown.style.width = size + 'px';
            crown.style.height = (size * 0.85) + 'px';
            crown.style.bottom = (90 + (d.year / 12) * 200) + 'px';
        }
    };
    slider.addEventListener('input', update);
    update();
}

function initConfigurator() {
    const slider = document.getElementById('configSlider');
    if (!slider) return;
    const pricePerTree = 250;
    const update = () => {
        const trees = parseInt(slider.value);
        const countEl = document.getElementById('configCount');
        const priceEl = document.getElementById('configPrice');
        const areaEl = document.getElementById('configArea');
        const co2El = document.getElementById('configCo2');
        const volumeEl = document.getElementById('configVolume');
        if (countEl) countEl.textContent = trees;
        if (priceEl) priceEl.textContent = (trees * pricePerTree).toLocaleString('de-DE') + ' \u20AC';
        if (areaEl) areaEl.textContent = (trees * 0.02).toFixed(1).replace('.', ',');
        if (co2El) co2El.textContent = (trees * 600).toLocaleString('de-DE');
        if (volumeEl) volumeEl.textContent = (trees * 2).toLocaleString('de-DE');
        const bars = document.querySelectorAll('.forest-bar');
        bars.forEach((bar, i) => {
            const isActive = i < Math.ceil((trees / 800) * bars.length);
            bar.classList.toggle('active', isActive);
            bar.style.height = isActive ? (30 + Math.random() * 60) + 'px' : '8px';
        });
    };
    slider.addEventListener('input', update);
    update();
}
