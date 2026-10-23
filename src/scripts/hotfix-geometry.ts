import * as THREE from 'three';

/** Uniform rows preserve the body below the short, folded shoulder.
 * RoundedBoxGeometry concentrates its rows at the corners, so deforming it
 * stretches a single polygon across the entire body into a triangular wedge.
 */
export function createHotfixGeometry() {
    const width = 2.24, height = 3.674, depth = .762, radius = .035;
    const geometry = new THREE.BoxGeometry(width, height, depth, 64, 100, 24);
    const positions = geometry.attributes.position;
    const point = new THREE.Vector3(), center = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i);
        // Round the edges without redistributing the evenly spaced body rows.
        center.set(
            THREE.MathUtils.clamp(point.x, -width / 2 + radius, width / 2 - radius),
            THREE.MathUtils.clamp(point.y, -height / 2 + radius, height / 2 - radius),
            THREE.MathUtils.clamp(point.z, -depth / 2 + radius, depth / 2 - radius)
        );
        point.sub(center).normalize().multiplyScalar(radius).add(center);
        const v = (point.y + height / 2) / height;
        const shoulder = THREE.MathUtils.smoothstep(v, .76, .94);
        const edge = Math.min(1, Math.abs(point.x) / (width / 2));
        const sideCenter = Math.max(0, 1 - Math.abs(point.z) / (depth / 2));
        const frontFace = 1 - THREE.MathUtils.smoothstep(sideCenter, 0, .2);
        const bottom = 1 - THREE.MathUtils.smoothstep(v, .015, .16);
        const body = Math.sin(Math.PI * v);
        // Filled paper body ends inside a narrow, flatter welded perimeter.
        const seam = Math.exp(-Math.pow((edge - .946) / .024, 2));
        const belly = .105 * body * (1 - THREE.MathUtils.smoothstep(edge, .78, .95));
        const tuck = .19 * sideCenter ** 1.2 * body * edge ** 8;
        // Diagonal folds connect the bottom gusset to the sealed corners.
        const diagonal = Math.exp(-Math.pow((v - (.025 + (1 - edge) * .27)) / .019, 2)) * edge ** 3;
        const bottomSeam = Math.exp(-Math.pow((v - .032) / .012, 2));
        const wrinkles = .012 * Math.sin(v * 63 + edge * 18) * edge ** 7 * body;
        const lip = .045 * frontFace * edge ** 8 * (1 - shoulder * .8);
        const notch = .022 * Math.exp(-Math.pow((v - .947) / .006, 2)) * edge ** 12;
        positions.setXYZ(i,
            point.x * (1 - .025 * shoulder) + Math.sign(point.x) * (lip + .025 * bottom * edge ** 6 - tuck - notch),
            point.y + .018 * bottom * (1 - edge ** 2),
            point.z * (1 - .93 * shoulder) + Math.sign(point.z) *
                (belly - .022 * seam - .038 * diagonal - .018 * bottomSeam + wrinkles) * (1 - shoulder)
        );
    }
    // Keep BoxGeometry UVs: v=1 at the top on all four printed faces.
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return geometry;
}

/** Raised zip tracks below the heat seal, kept clear of the printed logo. */
export function createHotfixZipper() {
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
        for (const y of [1.455, 1.49]) {
            const v = (y + 1.837) / 3.674;
            const shoulder = THREE.MathUtils.smoothstep(v, .76, .94);
            const z = side * (.381 * (1 - .93 * shoulder) + .008);
            const points = Array.from({ length: 33 }, (_, i) => {
                const x = (i / 32 - .5) * 2.08;
                return new THREE.Vector3(x, y + .004 * Math.sin(i * .7), z);
            });
            parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, .009, 6, false));
        }
    }
    return parts;
}

