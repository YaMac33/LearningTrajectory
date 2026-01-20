/**
 * Application Logic
 * Handles Google Analytics, Scroll Progress, and minimal interactions.
 */

const GA_ID = 'G-MQ9ZB4LYWP';

document.addEventListener('DOMContentLoaded', () => {
    initAnalytics();
    initScrollProgress();
    initSmoothScroll();
});

/**
 * Initialize Google Analytics (GA4)
 * Injects the tag dynamically to keep HTML clean.
 */
function initAnalytics() {
    // Inject Script Tag
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(script);

    // Initialize DataLayer
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', GA_ID);
    
    console.log('GA initialized:', GA_ID);
}

/**
 * Scroll Progress Bar
 * Adds a subtle reading indicator at the top of the screen.
 */
function initScrollProgress() {
    const progressBar = document.createElement('div');
    progressBar.id = 'scroll-progress';
    document.body.prepend(progressBar);

    window.addEventListener('scroll', () => {
        const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (winScroll / height) * 100;
        progressBar.style.width = scrolled + '%';
    });
}

/**
 * Smooth Scroll for internal anchor links
 */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
}
