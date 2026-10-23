export interface FallingBean {
    x: number; y: number; vx: number; vy: number;
    radius: number; xx?: number; xy?: number; yy?: number; seed: number; laps: number;
}
export interface Point { x: number; y: number }
export function convexHull(points: Point[]): Point[] {
    const sorted = points.slice().sort((a,b) => a.x - b.x || a.y - b.y);
    const cross = (a: Point,b: Point,c: Point) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    const lower: Point[] = [], upper: Point[] = [];
    for (const p of sorted) { while(lower.length>1 && cross(lower[lower.length-2],lower[lower.length-1],p)<=0) lower.pop(); lower.push(p); }
    for (const p of sorted.reverse()) { while(upper.length>1 && cross(upper[upper.length-2],upper[upper.length-1],p)<=0) upper.pop(); upper.push(p); }
    lower.pop(); upper.pop(); return lower.concat(upper);
}
const support = (b: FallingBean,x: number,y: number) => b.xx === undefined ? b.radius : Math.sqrt(Math.max(0,b.xx*x*x+2*(b.xy ?? 0)*x*y+(b.yy ?? 0)*y*y));

// Separating axes for the two rotated ellipses, without circular padding.
// Maximize the gap between their support planes to find the contact normal.
export function beanContact(a: FallingBean, b: FallingBean) {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.hypot(dx, dy) > a.radius + b.radius) return null;
    let angle = Math.atan2(dy, dx), gap = -Infinity;
    const separation = (t: number) => {
        const x = Math.cos(t), y = Math.sin(t);
        return dx*x + dy*y - support(a,x,y) - support(b,x,y);
    };
    for (let i = 0; i < 32; i++) {
        const t = i * Math.PI * 2 / 32, value = separation(t);
        if (value > gap) { gap = value; angle = t; }
    }
    let step = Math.PI * 2 / 32;
    for (let i = 0; i < 10; i++) {
        const left = separation(angle-step), right = separation(angle+step);
        if (left > gap && left >= right) { angle -= step; gap = left; }
        else if (right > gap) { angle += step; gap = right; }
        step *= .5;
    }
    return gap >= 0 ? null : { x: Math.cos(angle), y: Math.sin(angle), depth: -gap };
}

export function stepBeans(beans: FallingBean[], dt: number, bag: Point[], width: number, height: number) {
    if (dt <= 0) return;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let step = 0; step < steps; step++) {
        for (const b of beans) {
            b.vy = Math.max(-1.55, b.vy - .48 * h);
            b.x += b.vx * h;
            b.y += b.vy * h;
            if (b.y < -height - b.radius) {
                b.laps++;
                b.y = height + b.radius + (b.seed % 3) * .45;
                const lane = ((b.seed * .618 + b.laps * .381) % 1) * 2 - 1;
                b.x = lane * Math.max(.5, width - .45);
                b.vy = -.65;
                b.vx = lane * .2;
            }
        }
        for (let iteration = 0; iteration < 8; iteration++) {
            for (let i = 0; i < beans.length; i++) {
                const a = beans[i];
                for (let j = i + 1; j < beans.length; j++) {
                    const b = beans[j];
                    const contact = beanContact(a, b);
                    if (!contact) continue;
                    const dx = contact.x, dy = contact.y;
                    const push = contact.depth / 2;
                    a.x -= dx * push; a.y -= dy * push;
                    b.x += dx * push; b.y += dy * push;
                    const approach = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy;
                    if (approach < 0) {
                        const impulse = -approach * .7;
                        a.vx -= impulse * dx; a.vy -= impulse * dy;
                        b.vx += impulse * dx; b.vy += impulse * dy;
                    }
                }
            }
            for (const b of beans) {
                let separation = -Infinity, nx = 0, ny = 0;
                for (let k = 0; k < bag.length; k++) {
                    const a = bag[k], c = bag[(k+1)%bag.length];
                    const length = Math.hypot(c.x-a.x,c.y-a.y);
                    if (!length) continue;
                    const x = (c.y-a.y)/length, y = -(c.x-a.x)/length;
                    const distance = (b.x-a.x)*x+(b.y-a.y)*y-support(b,x,y);
                    if (distance > separation) { separation = distance; nx=x; ny=y; }
                }
                if (separation < 0 && Number.isFinite(separation)) {
                    b.x -= nx * separation; b.y -= ny * separation;
                    const velocity = b.vx * nx + b.vy * ny;
                    if (velocity < 0) { b.vx -= 1.35*velocity*nx; b.vy -= 1.35*velocity*ny; }
                    if (ny > .8) b.vx += (b.x < 0 ? -1 : 1) * h * .9;
                }
                const limit = width - support(b, 1, 0);
                if (Math.abs(b.x) > limit) {
                    b.x = Math.sign(b.x) * limit;
                    b.vx = -Math.sign(b.x) * Math.abs(b.vx) * .6;
                }
            }
        }
    }
}
