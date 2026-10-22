import * as THREE from 'three';
/** One WebGL renderer, scissored to the visible editorial stages. */
export function mountWorlds() {
    const hosts = [...document.querySelectorAll<HTMLElement>('[data-world]')];
    if (!hosts.length)
        return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const canvas = document.createElement('canvas');
    canvas.className = 'world-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    let renderer: THREE.WebGLRenderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'default' });
    }
    catch {
        return;
    }
    document.body.append(canvas);
    renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 768 ? 1.25 : 1.6));
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    renderer.autoClear = false;
    const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
    const remember = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(value: T): T => { resources.add(value); return value; };
    const cream = remember(new THREE.MeshStandardMaterial({ color: '#e9e2cd', roughness: .82, metalness: .02 }));
    const green = remember(new THREE.MeshStandardMaterial({ color: '#214d39', roughness: .7 }));
    const brown = remember(new THREE.MeshStandardMaterial({ color: '#55301d', roughness: .7 }));
    const grooveMaterial = remember(new THREE.MeshStandardMaterial({ color: '#21160e', roughness: 1 }));
    const beanGeometry = remember(new THREE.SphereGeometry(1, 16, 12));
    const grooveGeometry = remember(new THREE.TorusGeometry(.35, .035, 5, 14, Math.PI * 1.65));
    function bean() {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(beanGeometry, brown);
        mesh.scale.set(.19, .28, .13);
        group.add(mesh);
        const groove = new THREE.Mesh(grooveGeometry, grooveMaterial);
        groove.scale.set(.12, .65, .5);
        groove.position.z = .125;
        group.add(groove);
        return group;
    }
    function packageTexture(label: string, color: string) {
        const c = document.createElement('canvas');
        c.width = 768;
        c.height = 1152;
        const x = c.getContext('2d')!;
        x.fillStyle = '#eee8da';
        x.fillRect(0, 0, 768, 1152);
        // A deterministic surface grain keeps the material from looking like plastic.
        for (let i = 0; i < 6000; i++) {
            x.fillStyle = i % 2 ? '#ffffff12' : '#837d690d';
            x.fillRect((i * 127) % 768, (i * 71) % 1152, 2, 2);
        }
        x.textAlign = 'center';
        x.fillStyle = '#213e31';
        x.font = 'bold 86px Georgia';
        x.fillText('codebrew', 384, 340);
        x.font = '19px sans-serif';
        x.fillText('C O F F E E  F O R  D E V E L O P E R S', 384, 390);
        x.fillStyle = color;
        x.fillRect(58, 515, 652, 500);
        x.strokeStyle = '#e6e2bc35';
        x.lineWidth = 1.5;
        for (let j = 0; j < 13; j++) {
            x.beginPath();
            for (let i = 0; i < 680; i += 6) {
                const y = 540 + j * 36 + Math.sin(i * .013 + j * .43) * 18;
                x.lineTo(45 + i, y);
            }
            x.stroke();
        }
        x.fillStyle = '#f5efdb';
        x.font = `${label.length > 9 ? 65 : 78}px Georgia`;
        x.fillText(label, 384, 730);
        x.font = '20px sans-serif';
        x.fillText('A M A Z O N A S  ·  P E R Ú', 384, 795);
        x.font = '17px sans-serif';
        x.fillText(label === 'Espresso' ? 'TUESTE MEDIO-OSCURO' : 'TUESTE MEDIO', 384, 885);
        x.font = '24px sans-serif';
        x.fillText('250 g', 384, 955);
        x.fillStyle = '#344737';
        x.font = '12px sans-serif';
        x.fillText('B U E N  C A F É .  M E J O R  C Ó D I G O .', 384, 1070);
        const texture = remember(new THREE.CanvasTexture(c));
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        return texture;
    }
    const pouchGeometry = remember(new THREE.BoxGeometry(2.25, 3.55, .57, 28, 40, 6));
    const pos = pouchGeometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const vertical = (y + 1.775) / 3.55;
        const taper = 1 - .10 * Math.pow(vertical, 5) - .035 * Math.pow(1 - vertical, 8);
        const bulge = Math.sin(vertical * Math.PI) * .19 * Math.cos(x / 2.25 * Math.PI);
        pos.setXYZ(i, x * taper, y, z * (.58 + Math.sin(vertical * Math.PI) * .42) + Math.sign(z) * bulge);
    }
    pouchGeometry.computeVertexNormals();
    const frontGreen = remember(new THREE.MeshStandardMaterial({ map: packageTexture('Monteverde', '#2c523b'), roughness: .88 }));
    const frontOrange = remember(new THREE.MeshStandardMaterial({ map: packageTexture('Espresso', '#9e563c'), roughness: .88 }));
    const sealGeometry = remember(new THREE.BoxGeometry(2.02, .035, .22));
    const valveGeometry = remember(new THREE.CylinderGeometry(.083, .083, .02, 20));
    function pouch(orange = false) {
        const group = new THREE.Group();
        group.add(new THREE.Mesh(pouchGeometry, [cream, cream, cream, cream, orange ? frontOrange : frontGreen, cream]));
        for (let i = 0; i < 3; i++) {
            const seal = new THREE.Mesh(sealGeometry, cream);
            seal.position.set(0, 1.49 + i * .055, .17);
            group.add(seal);
        }
        const valve = new THREE.Mesh(valveGeometry, cream);
        valve.rotation.x = Math.PI / 2;
        valve.position.set(.45, 1.03, .33);
        group.add(valve);
        return group;
    }
    const states = hosts.map(host => {
        const kind = host.dataset.world!;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, 1, .1, 80);
        camera.position.set(0, 0, 8.7);
        scene.add(new THREE.HemisphereLight('#fff7e4', '#718267', 2.5));
        const key = new THREE.DirectionalLight('#fff6e5', 3.3);
        key.position.set(-3, 5, 6);
        scene.add(key);
        const rim = new THREE.DirectionalLight('#d0e5d4', 2.2);
        rim.position.set(4, 2, -2);
        scene.add(rim);
        const root = new THREE.Group();
        scene.add(root);
        const floaters: THREE.Group[] = [];
        if (kind === 'hero' || kind === 'team') {
            const bag = pouch();
            bag.rotation.set(.06, -.24, -.13);
            root.add(bag);
            if (kind === 'team') {
                bag.position.x = -.7;
                bag.rotation.z = .16;
                const second = pouch(true);
                second.position.set(.8, .1, -.4);
                second.rotation.set(0, -.25, -.16);
                root.add(second);
                root.scale.setScalar(.8);
            }
            const count = innerWidth < 768 ? 7 : 13;
            for (let i = 0; i < count; i++) {
                const b = bean();
                const angle = i / count * Math.PI * 2;
                b.position.set(Math.cos(angle) * (1.8 + (i % 3) * .22), Math.sin(angle) * 2.1, Math.sin(i * 2) * .7);
                b.rotation.set(i * .7, i * .9, i * .5);
                const s = .65 + (i % 4) * .16;
                b.scale.setScalar(s);
                root.add(b);
                floaters.push(b);
            }
        }
        else if (kind === 'origin') {
            const terrain = remember(new THREE.PlaneGeometry(6, 4.6, 55, 45));
            const p = terrain.attributes.position;
            for (let i = 0; i < p.count; i++) {
                const x = p.getX(i), y = p.getY(i);
                const height = .95 * Math.exp(-((x + .7) ** 2 + (y - .2) ** 2) * .75) + .65 * Math.exp(-((x - 1.3) ** 2 + (y + .6) ** 2) * 1.2) + .08 * Math.sin(x * 5 + y * 3);
                p.setZ(i, height);
            }
            terrain.computeVertexNormals();
            const material = remember(new THREE.MeshStandardMaterial({ color: '#4d6844', roughness: 1, flatShading: true, side: THREE.DoubleSide }));
            const land = new THREE.Mesh(terrain, material);
            land.rotation.x = -.9;
            root.add(land);
            const wire = new THREE.Mesh(terrain, remember(new THREE.MeshBasicMaterial({ color: '#dfe9bc', wireframe: true, transparent: true, opacity: .18 })));
            wire.rotation.copy(land.rotation);
            wire.position.y = .012;
            root.add(wire);
            const marker = new THREE.Mesh(remember(new THREE.SphereGeometry(.11, 16, 16)), remember(new THREE.MeshStandardMaterial({ color: '#d47a46', emissive: '#8a3e20', emissiveIntensity: .3 })));
            marker.position.set(-.65, .9, 1.1);
            root.add(marker);
            for (let i = 0; i < 3; i++) {
                const ring = new THREE.Mesh(remember(new THREE.TorusGeometry(.25 + i * .16, .008, 6, 48)), cream);
                ring.rotation.x = -Math.PI / 2;
                ring.position.set(-.65, .6, .2);
                root.add(ring);
            }
            root.rotation.z = -.08;
            root.position.y = -.3;
            root.scale.setScalar(.8);
        }
        else {
            const points = [new THREE.Vector2(.02, -.8), new THREE.Vector2(.64, -.8), new THREE.Vector2(.78, -.7), new THREE.Vector2(.91, .55), new THREE.Vector2(.9, .68), new THREE.Vector2(.83, .69), new THREE.Vector2(.81, .57), new THREE.Vector2(.7, -.55), new THREE.Vector2(.02, -.55)];
            const cup = new THREE.Mesh(remember(new THREE.LatheGeometry(points, 64)), green);
            root.add(cup);
            const handle = new THREE.Mesh(remember(new THREE.TorusGeometry(.48, .115, 12, 40, Math.PI * 1.75)), green);
            handle.position.set(.93, 0, 0);
            handle.rotation.z = -Math.PI * .875;
            root.add(handle);
            const coffee = new THREE.Mesh(remember(new THREE.CircleGeometry(.815, 64)), remember(new THREE.MeshStandardMaterial({ color: '#351b0c', roughness: .22 })));
            coffee.rotation.x = -Math.PI / 2;
            coffee.position.y = .56;
            root.add(coffee);
            const saucer = new THREE.Mesh(remember(new THREE.CylinderGeometry(1.4, 1.3, .09, 64)), cream);
            saucer.position.y = -.86;
            root.add(saucer);
            for (let i = 0; i < 3; i++) {
                const points = [];
                for (let j = 0; j < 24; j++)
                    points.push(new THREE.Vector3(Math.sin(j * .3 + i) * .1 + (i - 1) * .24, .8 + j * .055, 0));
                const steam = new THREE.Mesh(remember(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, .012, 5, false)), remember(new THREE.MeshBasicMaterial({ color: '#d3bb97', transparent: true, opacity: .38 })));
                root.add(steam);
            }
            root.rotation.set(.3, -.22, -.08);
            root.scale.setScalar(1.45);
        }
        host.classList.add('world-ready');
        return { host, kind, scene, camera, root, floaters };
    });
    let frame = 0, disposed = false, inView = true, pointerX = 0, pointerY = 0;
    const observer = new IntersectionObserver(entries => { entries.forEach(e => e.target.classList.toggle('world-visible', e.isIntersecting)); inView = states.some(s => s.host.classList.contains('world-visible')); request(); }, { rootMargin: '80px' });
    hosts.forEach(h => observer.observe(h));
    const pointer = (e: PointerEvent) => { if (e.pointerType === 'mouse') {
        pointerX = (e.clientX / innerWidth - .5) * 2;
        pointerY = (e.clientY / innerHeight - .5) * 2;
        request();
    } };
    const resize = () => { renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 768 ? 1.25 : 1.6)); renderer.setSize(innerWidth, innerHeight); request(); };
    const clamp = THREE.MathUtils.clamp;
    function draw(time: number) {
        frame = 0;
        if (disposed || document.hidden)
            return;
        renderer.setScissorTest(false);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.setScissorTest(true);
        const staticMode = motion.matches || document.documentElement.classList.contains('motion-paused');
        const t = staticMode ? 0 : time * .00035;
        for (const s of states) {
            const r = s.host.getBoundingClientRect();
            if (r.bottom < 0 || r.top > innerHeight || r.width === 0)
                continue;
            s.camera.aspect = r.width / r.height;
            s.camera.position.z = 8.7 * Math.max(1, (s.kind === 'origin' ? 1.15 : .82) / s.camera.aspect);
            s.camera.updateProjectionMatrix();
            const chapter = s.host.closest('.hero-chapter')?.getBoundingClientRect();
            const progress = chapter ? clamp(-chapter.top / Math.max(1, chapter.height - innerHeight), 0, 1) : clamp((innerHeight - r.top) / (innerHeight + r.height), 0, 1);
            if (!staticMode) {
                if (s.kind === 'hero') {
                    s.root.rotation.y = progress * .72 + pointerX * .12;
                    s.root.rotation.x = pointerY * .055;
                    s.root.position.y = Math.sin(t) * .08 + progress * .12;
                    s.root.rotation.z = -progress * .08;
                }
                else if (s.kind === 'origin') {
                    s.root.rotation.y = (progress - .5) * .6 + pointerX * .04;
                }
                else {
                    s.root.rotation.y = -.22 + (progress - .5) * .5 + Math.sin(t) * .035;
                }
                s.floaters.forEach((b, i) => { b.rotation.x = t * .6 + i * .7; b.rotation.y = t * .4 + i * .9; });
            }
            const left = Math.max(0, r.left), bottom = Math.max(0, innerHeight - r.bottom);
            const width = Math.min(innerWidth, r.right) - left;
            const height = Math.min(innerHeight, r.bottom) - Math.max(0, r.top);
            if (width <= 0 || height <= 0)
                continue;
            renderer.setViewport(r.left, innerHeight - r.bottom, r.width, r.height);
            renderer.setScissor(left, bottom, width, height);
            renderer.render(s.scene, s.camera);
        }
        if (inView && !staticMode)
            frame = requestAnimationFrame(draw);
    }
    function request() { if (!frame && !disposed && !document.hidden)
        frame = requestAnimationFrame(draw); }
    const visibility = () => { if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
    }
    else
        request(); };
    const contextLost = (event: Event) => { event.preventDefault(); cleanup(); };
    function cleanup() { if (disposed)
        return; disposed = true; cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('scroll', request); window.removeEventListener('codebrew:motion', request); window.removeEventListener('resize', resize); window.removeEventListener('pointermove', pointer); document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', request); hosts.forEach(h => h.classList.remove('world-ready')); resources.forEach(r => r.dispose()); renderer.dispose(); canvas.remove(); }
    window.addEventListener('codebrew:motion', request);
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', pointer, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', request);
    canvas.addEventListener('webglcontextlost', contextLost);
    window.addEventListener('pagehide', cleanup, { once: true });
    request();
    return cleanup;
}
