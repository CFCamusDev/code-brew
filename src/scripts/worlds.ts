import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
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
    const valveMaterial = remember(new THREE.MeshStandardMaterial({ color: '#b7ae93', roughness: .75, metalness: .04 }));
    const beanMaterials = ['#ffffff', '#d9b89b', '#bda18b'].map(color => remember(
        new THREE.MeshStandardMaterial({ color, vertexColors: true, roughness: .64, metalness: 0 })
    ));
    const beanGeometry = remember(new THREE.SphereGeometry(1, 64, 48));
    const beanPositions = beanGeometry.attributes.position;
    const beanColors = [];
    const roast = new THREE.Color('#60331c');
    const creaseColor = new THREE.Color('#1b0d06');
    for (let i = 0; i < beanPositions.count; i++) {
        const x = beanPositions.getX(i), y = beanPositions.getY(i), z = beanPositions.getZ(i);
        const seam = .075 * Math.sin(y * 3.7) + .025 * Math.sin(y * 9);
        const distance = x - seam;
        const face = THREE.MathUtils.smoothstep(z, 0, .45);
        const end = Math.max(0, 1 - y * y);
        const groove = Math.exp(-Math.pow(distance / .095, 2)) * face * Math.pow(end, .35);
        const grain = Math.sin(x * 61 + y * 47 + z * 29) * Math.sin(y * 83 - z * 53);
        // A carved, curved crease is part of the bean surface, not a raised ring.
        beanPositions.setXYZ(i,
            x * .19 * (1 + .065 * Math.sin(y * 4)) + .008 * end,
            y * .285,
            z * .135 - groove * .055 + grain * .0015 * end
        );
        const shade = roast.clone().lerp(creaseColor, groove * .88);
        shade.multiplyScalar(1 + grain * .09 + Math.sin(y * 21 + x * 13) * .06);
        beanColors.push(shade.r, shade.g, shade.b);
    }
    beanGeometry.setAttribute('color', new THREE.Float32BufferAttribute(beanColors, 3));
    beanGeometry.computeVertexNormals();
    let beanIndex = 0;
    function bean() {
        const group = new THREE.Group();
        const index = beanIndex++;
        const mesh = new THREE.Mesh(beanGeometry, beanMaterials[index % beanMaterials.length]);
        mesh.scale.set(1 + (index % 3) * .045, 1 - (index % 4) * .025, 1);
        group.add(mesh);
        return group;
    }
    function wrapText(x: CanvasRenderingContext2D, text: string, left: number, top: number, maxWidth: number, lineHeight: number) {
        const words = text.split(' ');
        let line = '', y = top;
        for (const word of words) {
            const test = line ? `${line} ${word}` : word;
            if (x.measureText(test).width > maxWidth && line) {
                x.fillText(line, left, y);
                line = word;
                y += lineHeight;
            }
            else {
                line = test;
            }
        }
        if (line) x.fillText(line, left, y);
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
        x.font = '28px Georgia';
        x.fillText('®', 384 + x.measureText('codebrew').width / 2 + 16, 310);
        x.font = '19px sans-serif';
        x.fillText('C O F F E E  F O R  D E V E L O P E R S', 384, 390);
        // Válvula de desgasificación: anillo gris embebido en el papel, con punto central.
        x.save();
        x.fillStyle = '#00000014';
        x.beginPath();
        x.arc(384, 452, 30, 0, Math.PI * 2);
        x.fill();
        x.strokeStyle = '#21302722';
        x.lineWidth = 3;
        x.beginPath();
        x.arc(384, 452, 24, 0, Math.PI * 2);
        x.stroke();
        x.fillStyle = '#21302735';
        x.beginPath();
        x.arc(384, 452, 4.5, 0, Math.PI * 2);
        x.fill();
        x.restore();
        const labelX = 58, labelY = 515, labelW = 652, labelH = 500, labelR = 28;
        x.save();
        x.beginPath();
        x.roundRect(labelX, labelY, labelW, labelH, labelR);
        x.clip();
        x.fillStyle = color;
        x.fillRect(labelX, labelY, labelW, labelH);
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
        x.restore();
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
    function backTexture(label: string, color: string) {
        const c = document.createElement('canvas');
        c.width = 768;
        c.height = 1152;
        const x = c.getContext('2d')!;
        x.fillStyle = '#eee8da';
        x.fillRect(0, 0, c.width, c.height);
        // Printed rear panel, with a cream margin and visible sealed edges.
        x.fillStyle = color;
        x.fillRect(48, 130, 672, 900);
        x.strokeStyle = '#f5efdb20';
        x.lineWidth = 2;
        for (let row = 0; row < 9; row++) {
            x.beginPath();
            for (let i = 0; i <= 672; i += 6)
                x.lineTo(48 + i, 165 + row * 22 + Math.sin(i * .012 + row * .3) * 13);
            x.stroke();
        }
        x.textAlign = 'center';
        x.fillStyle = '#f5efdb';
        x.font = 'bold 68px Georgia';
        x.fillText('codebrew', 384, 245);
        x.font = '18px sans-serif';
        x.fillText('BUEN CAFÉ. MEJOR CÓDIGO.', 384, 290);
        x.font = '46px Georgia';
        x.fillText('Tu pausa tiene origen.', 384, 400);
        x.font = '24px sans-serif';
        x.fillText('Rodríguez de Mendoza', 384, 456);
        x.fillText('Amazonas, Perú', 384, 492);
        x.strokeStyle = '#f5efdb66';
        x.beginPath();
        x.moveTo(112, 540); x.lineTo(656, 540); x.stroke();
        x.font = 'bold 22px sans-serif';
        x.fillText('UN RITUAL SENCILLO', 384, 602);
        x.textAlign = 'left';
        x.font = '25px Georgia';
        x.fillText('01   Muele tu café.', 125, 660);
        x.fillText('02   Prepara tu método favorito.', 125, 712);
        x.fillText('03   Haz una pausa. Disfruta.', 125, 764);
        x.textAlign = 'center';
        x.font = '18px sans-serif';
        x.fillText('Conservar cerrado en un lugar fresco y seco.', 384, 850);
        x.font = 'bold 28px Georgia';
        x.fillText(label + '  /  250 g', 384, 934);
        x.font = '17px sans-serif';
        x.fillText('100% ARÁBICA · TUESTE ARTESANAL', 384, 978);
        x.fillStyle = '#344737';
        x.font = '15px sans-serif';
        x.fillText('EMPAQUE CONCEPTUAL · CODEBREW', 384, 1080);
        x.strokeStyle = '#b6b09d';
        x.lineWidth = 3;
        for (const y of [55, 70, 85, 1110, 1125]) {
            x.beginPath(); x.moveTo(30, y); x.lineTo(738, y); x.stroke();
        }
        const texture = remember(new THREE.CanvasTexture(c));
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        return texture;
    }
    function pillBadge(x: CanvasRenderingContext2D, cx: number, cy: number, text: string) {
        x.save();
        x.font = 'bold 16px sans-serif';
        const w = x.measureText(text).width + 44;
        x.fillStyle = '#d16c401a';
        x.strokeStyle = '#d16c40';
        x.lineWidth = 1.5;
        x.beginPath();
        x.roundRect(cx - w / 2, cy - 20, w, 40, 20);
        x.fill();
        x.stroke();
        x.fillStyle = '#b8552b';
        x.textAlign = 'center';
        x.fillText(text, cx, cy + 6);
        x.restore();
    }
    function hotfixFrontTexture() {
        const c = document.createElement('canvas');
        c.width = 768;
        c.height = 1152;
        const x = c.getContext('2d')!;
        x.fillStyle = '#eee8da';
        x.fillRect(0, 0, 768, 1152);
        for (let i = 0; i < 6000; i++) {
            x.fillStyle = i % 2 ? '#ffffff12' : '#837d690d';
            x.fillRect((i * 127) % 768, (i * 71) % 1152, 2, 2);
        }
        x.textAlign = 'center';
        x.fillStyle = '#213e31';
        x.font = 'bold 86px Georgia';
        x.fillText('codebrew', 384, 340);
        x.font = '28px Georgia';
        x.fillText('®', 384 + x.measureText('codebrew').width / 2 + 16, 310);
        x.font = '19px sans-serif';
        x.fillText('C O F F E E  F O R  D E V E L O P E R S', 384, 390);
        x.save();
        x.fillStyle = '#00000014';
        x.beginPath();
        x.arc(384, 452, 30, 0, Math.PI * 2);
        x.fill();
        x.strokeStyle = '#21302722';
        x.lineWidth = 3;
        x.beginPath();
        x.arc(384, 452, 24, 0, Math.PI * 2);
        x.stroke();
        x.fillStyle = '#21302735';
        x.beginPath();
        x.arc(384, 452, 4.5, 0, Math.PI * 2);
        x.fill();
        x.restore();
        const labelX = 58, labelY = 540, labelW = 652, labelH = 475, labelR = 28;
        x.save();
        x.beginPath();
        x.roundRect(labelX, labelY, labelW, labelH, labelR);
        x.clip();
        x.fillStyle = '#1d3a2b';
        x.fillRect(labelX, labelY, labelW, labelH);
        x.strokeStyle = '#e6e2bc35';
        x.lineWidth = 1.5;
        for (let j = 0; j < 13; j++) {
            x.beginPath();
            for (let i = 0; i < 680; i += 6) {
                const y = 565 + j * 36 + Math.sin(i * .013 + j * .43) * 18;
                x.lineTo(45 + i, y);
            }
            x.stroke();
        }
        x.restore();
        pillBadge(x, 384, labelY - 8, 'PIPELINE · STABLE');
        x.fillStyle = '#f5efdb';
        x.font = '76px Georgia';
        const headline = 'Hotfix';
        const headW = x.measureText(headline).width;
        x.fillText(headline, 384 - 14, 735);
        x.fillStyle = '#d16c40';
        x.fillRect(384 + headW / 2 - 10, 672, 5, 72);
        x.fillStyle = '#f5efdb';
        x.font = '20px sans-serif';
        x.fillText('A M A Z O N A S  ·  P E R Ú', 384, 800);
        x.font = '17px sans-serif';
        x.fillText('ESPRESSO · TUESTE MEDIO-OSCURO', 384, 890);
        x.font = '24px sans-serif';
        x.fillText('250 g', 384, 960);
        x.fillStyle = '#344737';
        x.font = '12px sans-serif';
        x.fillText('B U E N  C A F É .  M E J O R  C Ó D I G O .', 384, 1075);
        const texture = remember(new THREE.CanvasTexture(c));
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        return texture;
    }
    function hotfixBackTexture() {
        const c = document.createElement('canvas');
        c.width = 768;
        c.height = 1152;
        const x = c.getContext('2d')!;
        x.fillStyle = '#eee8da';
        x.fillRect(0, 0, 768, 1152);
        for (let i = 0; i < 6000; i++) {
            x.fillStyle = i % 2 ? '#ffffff12' : '#837d690d';
            x.fillRect((i * 127) % 768, (i * 71) % 1152, 2, 2);
        }
        x.textAlign = 'left';
        x.fillStyle = '#8a8372';
        x.font = '18px monospace';
        x.fillText('// hotfix.js', 60, 90);
        pillBadge(x, 650, 76, 'PIPELINE · STABLE');
        x.fillStyle = '#213e31';
        x.font = '38px Georgia';
        wrapText(x, 'Hay bugs que no esperan al próximo sprint. Para esos, existe un hotfix.', 60, 165, 648, 46);
        x.fillStyle = '#4b564c';
        x.font = '18px sans-serif';
        wrapText(x, 'Cultivado en la ceja de selva de Rodríguez de Mendoza, Amazonas. Lavado, secado con paciencia y tostado medio-oscuro para un espresso de cuerpo alto, dulzor a chancaca y un final limpio de cacao.', 60, 330, 648, 27);
        x.strokeStyle = '#21302730';
        x.lineWidth = 1;
        x.beginPath(); x.moveTo(60, 455); x.lineTo(708, 455); x.stroke();
        x.font = 'bold 15px sans-serif';
        x.fillStyle = '#8a8372';
        x.fillText('FICHA TÉCNICA', 60, 495);
        x.fillText('PERFIL', 440, 495);
        x.font = '17px sans-serif';
        x.fillStyle = '#213e31';
        const specs: [string, string][] = [['Proceso', 'Lavado'], ['Tueste', 'Medio-oscuro'], ['Altitud', '1 500-1 600 m s. n. m.'], ['Variedad', 'Caturra, Catuaí y Geisha']];
        specs.forEach(([k, v], i) => {
            x.fillStyle = '#8a8372';
            x.fillText(k, 60, 530 + i * 34);
            x.fillStyle = '#213e31';
            x.fillText(v, 170, 530 + i * 34);
        });
        const profile: [string, number][] = [['cuerpo', .85], ['dulzor', .7], ['acidez', .35]];
        profile.forEach(([k, v], i) => {
            x.fillStyle = '#8a8372';
            x.font = '15px sans-serif';
            x.fillText(k, 440, 530 + i * 34);
            x.fillStyle = '#e4ded0';
            x.fillRect(520, 518 + i * 34, 150, 10);
            x.fillStyle = '#d16c40';
            x.fillRect(520, 518 + i * 34, 150 * v, 10);
        });
        const codeX = 60, codeY = 660, codeW = 648, codeH = 230;
        x.fillStyle = '#1d3a2b';
        x.beginPath();
        x.roundRect(codeX, codeY, codeW, codeH, 14);
        x.fill();
        x.font = '16px monospace';
        x.fillStyle = '#8fae9c';
        x.fillText('// receta sugerida · espresso', codeX + 24, codeY + 38);
        x.fillStyle = '#f5efdb';
        const code = [
            'const hotfix = brew({',
            '  dosis: "18 g",',
            '  rendimiento: "36 g",',
            '  tiempo: "25-30 s",',
            '  agua: "92-94 °C",',
            '});'
        ];
        code.forEach((line, i) => x.fillText(line, codeX + 24, codeY + 76 + i * 28));
        const qrX = 60, qrY = codeY + codeH + 36, qrSize = 92;
        x.strokeStyle = '#21302755';
        x.lineWidth = 2;
        x.strokeRect(qrX, qrY, qrSize, qrSize);
        x.fillStyle = '#21302740';
        x.font = '11px sans-serif';
        x.textAlign = 'center';
        x.fillText('[QR]', qrX + qrSize / 2, qrY + qrSize / 2 + 4);
        x.textAlign = 'left';
        x.fillStyle = '#213e31';
        x.font = 'bold 16px sans-serif';
        x.fillText('git log --origen', qrX + qrSize + 24, qrY + 28);
        x.fillStyle = '#4b564c';
        x.font = '15px sans-serif';
        wrapText(x, 'Escanea y conoce la finca, el lote y la fecha de tueste.', qrX + qrSize + 24, qrY + 54, 430, 22);
        x.textAlign = 'center';
        x.fillStyle = '#4b564c';
        x.font = '15px sans-serif';
        x.fillText('Conservar en lugar fresco y seco.', 384, 1070);
        x.fillText('Peso neto 250 g · Hecho en Perú', 384, 1096);
        x.fillStyle = '#8a8372';
        x.font = '13px sans-serif';
        x.fillText('coffeecodebrew.com', 384, 1122);
        const texture = remember(new THREE.CanvasTexture(c));
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        return texture;
    }
    function hotfixSideTexture() {
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = 1152;
        const x = c.getContext('2d')!;
        x.fillStyle = '#eee8da';
        x.fillRect(0, 0, 320, 1152);
        for (let i = 0; i < 2600; i++) {
            x.fillStyle = i % 2 ? '#ffffff12' : '#837d690d';
            x.fillRect((i * 97) % 320, (i * 53) % 1152, 2, 2);
        }
        // Traza de circuito vertical tipo PCB, con nodos en los extremos.
        x.strokeStyle = '#21302755';
        x.lineWidth = 2;
        x.beginPath();
        x.moveTo(160, 90);
        x.lineTo(160, 420);
        x.lineTo(190, 460);
        x.lineTo(190, 760);
        x.lineTo(150, 820);
        x.lineTo(150, 1060);
        x.stroke();
        x.fillStyle = '#21302770';
        [[160, 90], [190, 460], [150, 1060]].forEach(([cx, cy]) => {
            x.beginPath();
            x.arc(cx, cy, 5, 0, Math.PI * 2);
            x.fill();
        });
        x.textAlign = 'left';
        x.fillStyle = '#213e31';
        x.font = 'bold 40px sans-serif';
        ['GOOD', 'COFFEE.', 'BETTER', 'IDEAS.'].forEach((line, i) => x.fillText(line, 60, 540 + i * 54));
        // Icono taza + llaves de código
        x.save();
        x.translate(60, 790);
        x.strokeStyle = '#213e31';
        x.lineWidth = 6;
        x.lineCap = 'round';
        x.beginPath();
        x.moveTo(8, 10); x.lineTo(0, 22); x.lineTo(8, 34);
        x.moveTo(44, 10); x.lineTo(52, 22); x.lineTo(44, 34);
        x.stroke();
        x.lineWidth = 5;
        x.strokeRect(2, 46, 48, 34);
        x.beginPath();
        x.arc(55, 58, 10, -Math.PI / 2, Math.PI / 2);
        x.stroke();
        x.restore();
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
    // Bolsa de café con fuelle lateral y sellado superior limpio tipo stand-up pouch
    const hotfixGeometry = remember(new THREE.BoxGeometry(2.32, 3.65, 0.82, 32, 48, 16));
    const hotfixPositions = hotfixGeometry.attributes.position;
    for (let i = 0; i < hotfixPositions.count; i++) {
        let x = hotfixPositions.getX(i);
        let y = hotfixPositions.getY(i);
        let z = hotfixPositions.getZ(i);

        const ny = y / 1.825; // Normalizado de -1 a 1

        // 1. Inflado orgánico del cuerpo con café (belly), que se desvanece cerca de los paneles laterales
        // para no redondear las esquinas: el panel frontal/trasero abomba al centro pero llega plano al borde.
        const absX = Math.abs(x);
        const edgeFactor = 1.0 - THREE.MathUtils.smoothstep(absX, 0.52, 0.92);
        if (ny > -0.85 && ny < 0.60) {
            const belly = Math.cos((ny + 0.1) * Math.PI * 0.58);
            if (belly > 0) {
                z *= 1.0 + belly * 0.22 * edgeFactor;
            }
        }

        // 2. Fuelles laterales (gussets) con pliegue central visible, como en una bolsa stand-up pouch real:
        // el panel lateral se hunde hacia la mitad de su profundidad, dejando una arista/sombra marcada en z=0.
        // La esquina (absX y |z| altos a la vez) se deja casi intacta para que se note como una arista definida.
        if (absX > 0.78 && ny > -0.88 && ny < 0.65) {
            const sideTuck = THREE.MathUtils.smoothstep(absX, 0.78, 1.16);
            const centerZ = 1.0 - Math.min(1.0, Math.abs(z) / 0.41);
            const crease = Math.pow(centerZ, 1.8);
            x -= Math.sign(x) * sideTuck * crease * 0.16;
        }

        // 3. Transición superior hacia el sello (pliegue triangular tipo gable / tin-tie) y la zona plana
        // del propio sello (ny > 0.84): una sola curva continua desde ny = 0.60 hasta la punta, para que
        // el ancho nunca "rebote" hacia afuera justo antes del sello (lo que lo desalineaba del cuerpo).
        if (ny >= 0.60) {
            const t = Math.min(1, (ny - 0.60) / 0.24);
            const smoothT = t * t * (3 - 2 * t);
            z *= (1.0 - smoothT * 0.88);
            if (absX > 0.68) {
                const foldTuck = Math.min(1, (absX - 0.68) / 0.48);
                const centerZ = 1.0 - Math.min(1.0, Math.abs(z) / 0.41);
                x -= Math.sign(x) * foldTuck * centerZ * (0.06 + smoothT * 0.16);
            }
        }

        // 5. Base sólida
        if (ny < -0.88) {
            const b = (ny + 0.88) / -0.12;
            z *= (1.0 + b * 0.06);
        }

        hotfixPositions.setXYZ(i, x, y, z);
    }
    hotfixGeometry.computeVertexNormals();
    const frontGreen = remember(new THREE.MeshStandardMaterial({ map: packageTexture('Monteverde', '#2c523b'), roughness: .88 }));
    const frontOrange = remember(new THREE.MeshStandardMaterial({ map: packageTexture('Espresso', '#9e563c'), roughness: .88 }));
    const backGreen = remember(new THREE.MeshStandardMaterial({ map: backTexture('Monteverde', '#2c523b'), roughness: .88 }));
    const backOrange = remember(new THREE.MeshStandardMaterial({ map: backTexture('Espresso', '#9e563c'), roughness: .88 }));
    // Cuerpo crema (igual que el resto de la línea) en vez del verde oscuro anterior.
    const hotfixBody = remember(new THREE.MeshStandardMaterial({ color: '#e9e2cd', roughness: .85, metalness: .02 }));
    const hotfixFront = remember(new THREE.MeshStandardMaterial({ map: hotfixFrontTexture(), roughness: .85 }));
    const hotfixBack = remember(new THREE.MeshStandardMaterial({ map: hotfixBackTexture(), roughness: .85 }));
    const hotfixSide = remember(new THREE.MeshStandardMaterial({ map: hotfixSideTexture(), roughness: .85 }));
    const sealGeometry = remember(new THREE.BoxGeometry(2.02, .035, .22));
    const valveGeometry = remember(new THREE.CylinderGeometry(.083, .083, .02, 20));
    function pouch(orange = false, hotfix = false) {
        const group = new THREE.Group();
        group.add(new THREE.Mesh(hotfix ? hotfixGeometry : pouchGeometry, hotfix
            ? [hotfixSide, hotfixSide, hotfixBody, hotfixBody, hotfixFront, hotfixBack]
            : [cream, cream, cream, cream, orange ? frontOrange : frontGreen, orange ? backOrange : backGreen]));
        if (hotfix) {
            // Sello superior plano realista (barra de sellado térmico / tin-tie clip)
            // Ancho ajustado al ancho real del cuerpo ya angostado en esa altura (~1.88), para que coincida
            // con el contorno de la bolsa en vez de sobresalir por los costados.
            const sealBarGeom = remember(new THREE.BoxGeometry(1.8, 0.18, 0.1));
            const sealBar = new THREE.Mesh(sealBarGeom, hotfixBody);
            sealBar.position.y = 1.73;
            group.add(sealBar);

            // Relieves de sellado térmico sutiles
            const crimpGeom = remember(new THREE.BoxGeometry(1.78, 0.018, 0.11));
            for (const cy of [1.68, 1.73, 1.78]) {
                const crimp = new THREE.Mesh(crimpGeom, hotfixBody);
                crimp.position.y = cy;
                group.add(crimp);
            }
        }
        for (let i = 0; !hotfix && i < 3; i++) {
            const seal = new THREE.Mesh(sealGeometry, cream);
            seal.position.set(0, 1.49 + i * .055, .17);
            group.add(seal);
        }
        // Alineada con el anillo impreso en la textura frontal (misma posición que el círculo dibujado en el canvas).
        const valve = new THREE.Mesh(valveGeometry, valveMaterial);
        valve.rotation.x = Math.PI / 2;
        valve.position.set(0, hotfix ? .39 : .38, hotfix ? .49 : .345);
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
        let heroBag: THREE.Group | undefined;
        if (kind === 'hero' || kind === 'team') {
            const bag = pouch(false, kind === 'hero');
            if (kind === 'hero') heroBag = bag;
            bag.rotation.set(.06, -.24, -.13);
            if (kind === 'hero') {
                bag.rotation.set(0, -.24, 0);
                bag.scale.setScalar(1.24);
            }
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
                if (kind === 'hero') {
                    // Keep bean centers outside the bag's full rotational envelope,
                    // including their own radius and the wave animation offsets.
                    const x = Math.cos(angle), y = Math.sin(angle);
                    const clearance = Math.min(2.02 / Math.max(Math.abs(x), .0001), 2.78 / Math.max(Math.abs(y), .0001));
                    b.position.set(x * clearance, y * clearance, Math.sin(i * 2) * .35);
                }
                b.rotation.set(i * .7, i * .9, i * .5);
                const s = .65 + (i % 4) * .16;
                b.scale.setScalar(s);
                b.userData.restPosition = b.position.clone();
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
        return { host, kind, scene, camera, root, floaters, heroBag, scrollProgress: 0 };
    });
    let frame = 0, disposed = false, inView = true, pointerX = 0, pointerY = 0;
    let elapsed = 0, lastTime: number | undefined;
    const observer = new IntersectionObserver(entries => { entries.forEach(e => e.target.classList.toggle('world-visible', e.isIntersecting)); inView = states.some(s => s.host.classList.contains('world-visible')); request(); }, { rootMargin: '80px' });
    hosts.forEach(h => observer.observe(h));
    const pointer = (e: PointerEvent) => { if (e.pointerType === 'mouse') {
        pointerX = (e.clientX / innerWidth - .5) * 2;
        pointerY = (e.clientY / innerHeight - .5) * 2;
        request();
    } };
    const resize = () => { renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 768 ? 1.25 : 1.6)); renderer.setSize(innerWidth, innerHeight); request(); };
    const clamp = THREE.MathUtils.clamp;
    const heroBounds = new THREE.Box3();
    function draw(time: number) {
        frame = 0;
        if (disposed || document.hidden)
            return;
        renderer.setScissorTest(false);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.setScissorTest(true);
        const staticMode = motion.matches || document.documentElement.classList.contains('motion-paused');
        // Advance only while playing so pause/resume never jumps to a new pose.
        const delta = lastTime === undefined ? 0 : Math.min(time - lastTime, 50) / 1000;
        if (!staticMode) elapsed += delta;
        lastTime = !staticMode && inView ? time : undefined;
        const t = elapsed * .35;
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
                    s.scrollProgress = THREE.MathUtils.lerp(s.scrollProgress, progress, 1 - Math.exp(-delta * 4));
                    const scroll = s.scrollProgress;
                    s.root.rotation.y = scroll * .3 + pointerX * .12;
                    s.root.rotation.x = pointerY * .025;
                    s.root.position.x = Math.sin(t * .65) * .12;
                    s.root.position.y = Math.sin(t * 1.15) * .2 + scroll * .24;
                    s.root.rotation.z = Math.sin(t * .85) * .015;
                    s.root.scale.setScalar(1 - scroll * .08);
                    if (s.heroBag) {
                        // Giro continuo de 360° para lucir todas las caras de la bolsa, con un leve tilt por mouse/scroll.
                        s.heroBag.rotation.y = t * 0.4 + pointerX * 0.12 + scroll * 0.35;
                        s.heroBag.rotation.x = 0.05 + Math.cos(t * 0.9) * 0.03 + pointerY * 0.04;
                        s.heroBag.rotation.z = Math.sin(t * 0.6) * 0.015;
                    }
                }
                else if (s.kind === 'origin') {
                    s.root.rotation.y = (progress - .5) * .6 + pointerX * .04;
                }
                else {
                    s.root.rotation.y = -.22 + (progress - .5) * .5 + Math.sin(t) * .035;
                }
                s.floaters.forEach((b, i) => {
                    b.rotation.x = t * .6 + i * .7;
                    b.rotation.y = t * .4 + i * .9;
                    if (s.kind === 'hero') {
                        const rest = b.userData.restPosition as THREE.Vector3;
                        b.position.y = rest.y + Math.sin(t * 1.15 + i * .65) * .1;
                        b.position.x = rest.x + Math.sin(t * .85 + i * .65) * .045;
                    }
                });
            }
            if (s.kind === 'hero') {
                s.camera.position.z = 8.5 * Math.max(1, .85 / s.camera.aspect);
            }
            const left = Math.max(0, r.left), bottom = Math.max(0, innerHeight - r.bottom);
            const width = Math.min(innerWidth, r.right) - left;
            const height = Math.min(innerHeight, r.bottom) - Math.max(0, r.top);
            if (width <= 0 || height <= 0)
                continue;
            renderer.setViewport(r.left, innerHeight - r.bottom, r.width, r.height);
            renderer.setScissor(left, bottom, width, height);
            renderer.render(s.scene, s.camera);
            s.host.classList.add('world-ready');
        }
        if (inView && !staticMode)
            frame = requestAnimationFrame(draw);
    }
    function request() { if (!frame && !disposed && !document.hidden)
        frame = requestAnimationFrame(draw); }
    const visibility = () => { if (document.hidden) {
        lastTime = undefined;
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
