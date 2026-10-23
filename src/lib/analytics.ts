type EventName = 'view_item' | 'add_to_cart' | 'begin_checkout' | 'add_shipping_info' | 'purchase';
export interface AnalyticsItem { item_id: string; item_name: string; price: number; quantity: number }
interface Payload { value: number; items: AnalyticsItem[]; transaction_id?: string; shipping?: number; shipping_tier?: string }
declare global { interface Window { dataLayer: unknown[]; gtag?: (...args: unknown[]) => void } }
let initialized = false;
const sent = new Set<string>();
const id = import.meta.env.PUBLIC_GA4_ID || 'G-YMMJ7V30SZ';
export function analyticsEnabled() {
    return typeof window !== 'undefined' && import.meta.env.PROD &&
        import.meta.env.PUBLIC_ANALYTICS_ENV === 'production' && /^G-[A-Z0-9]+$/.test(id) &&
        !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && !location.pathname.startsWith('/admin');
}
const safeCampaign = (value: string | null) => value && /^[a-z][a-z0-9_-]{0,59}$/i.test(value) && !/\d{7,}/.test(value) ? value : undefined;
function campaign() {
    const params = new URLSearchParams(location.search);
    const result: Record<string, string> = {};
    for (const key of ['source', 'medium', 'campaign', 'content', 'term']) {
        const value = safeCampaign(params.get(`utm_${key}`));
        if (value) result[`campaign_${key === 'campaign' ? 'name' : key}`] = value;
    }
    return result;
}
export function initAnalytics() {
    if (!analyticsEnabled() || initialized) return;
    initialized = true;
    window.dataLayer ||= [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    const path = location.pathname.startsWith('/pedido/') ? '/pedido/confirmacion' : location.pathname;
    window.gtag('js', new Date());
    let debug = false;
    try { debug = sessionStorage.getItem('codebrew:ga-debug') === '1'; } catch { /* optional */ }
    window.gtag('config', id, {
        send_page_view: false, page_location: location.origin + path, page_referrer: '',
        page_title: path, allow_google_signals: false, allow_ad_personalization_signals: false,
        ...campaign(), ...(debug ? { debug_mode: true } : {})
    });
    window.gtag('event', 'page_view', { page_location: location.origin + path, page_title: path, page_referrer: '' });
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.append(script);
}
/** Explicit allowlist: never spread customer, form, URL or API response objects. */
export function track(name: EventName, payload: Payload): boolean {
    if (!analyticsEnabled()) return false;
    try {
        initAnalytics();
        const data: Record<string, unknown> = {
            currency: 'PEN', value: payload.value,
            items: payload.items.map(i => ({item_id: i.item_id, item_name: i.item_name, price: i.price, quantity: i.quantity}))
        };
        if (name === 'purchase') {
            if (!payload.transaction_id || !/^CB-\d+$/.test(payload.transaction_id)) return false;
            data.transaction_id = payload.transaction_id;
            data.shipping = payload.shipping ?? 0;
        }
        if (name === 'add_shipping_info') data.shipping_tier = payload.shipping_tier;
        window.gtag?.('event', name, data);
        return true;
    } catch { return false; } // Analytics must never interrupt checkout.
}
export async function trackPurchase(payload: Payload) {
    if (!analyticsEnabled() || !payload.transaction_id) return;
    const key = `codebrew:ga-purchase:${payload.transaction_id}`;
    const send = () => {
        try {
            if (sent.has(key) || localStorage.getItem(key)) return;
            if (track('purchase', payload)) { sent.add(key); localStorage.setItem(key, '1'); }
        } catch { if (!sent.has(key) && track('purchase', payload)) sent.add(key); }
    };
    if (navigator.locks) await navigator.locks.request(key, send);
    else send();
}
export function quoteAnalytics(quote: { subtotalCents: number; lines: { sku: string; productName: string; unitPriceCents: number; quantity: number }[] }) {
    return { value: quote.subtotalCents / 100, items: quote.lines.map(i => ({item_id:i.sku,item_name:i.productName,price:i.unitPriceCents/100,quantity:i.quantity})) };
}
