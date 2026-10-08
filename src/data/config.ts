import type { ImageMetadata } from 'astro';
import bagLight from '../assets/products/bag-light.png';
import bagDark from '../assets/products/bag-dark.png';

export const SITE_CONFIG = {
  name: 'CodeBrew',
  tagline: 'Café que despierta ideas.',
  codeComment: '// tu código necesita café',
  phone: '51917712438',
  defaultMessage: '¡Hola CodeBrew! Quiero hacer una consulta sobre su café de especialidad.',
  ga4Id: '', // Espacio reservado para ID de Google Analytics 4 (ej. G-XXXXXXXXXX)
  googleAdsId: '' // Espacio reservado para ID de Google Ads (ej. AW-XXXXXXXXX)
};

export function getWhatsAppUrl(message?: string): string {
  const text = encodeURIComponent(message || SITE_CONFIG.defaultMessage);
  return `https://wa.me/${SITE_CONFIG.phone}?text=${text}`;
}

export interface ProductItem {
  id: string;
  name: string;
  format: string;
  grind: string;
  roast: string;
  price: number;
  highlighted?: boolean;
  highlightTag?: string;
  imgSlotId: string;
  imgSlotLabel: string;
  image: ImageMetadata;
  /** Segunda imagen opcional, para productos que combinan dos presentaciones (ej. packs dúo). */
  image2?: ImageMetadata;
}

export const PRODUCTS: ProductItem[] = [
  {
    id: 'monteverde-250',
    name: 'Origen Monteverde',
    format: '250 g',
    grind: 'Grano entero o molido',
    roast: 'Tueste medio',
    price: 34,
    imgSlotId: 'img-producto-monteverde-250',
    imgSlotLabel: '[ IMG: bolsa CodeBrew Monteverde 250 g | 1:1 ]',
    image: bagLight
  },
  {
    id: 'monteverde-500',
    name: 'Origen Monteverde',
    format: '500 g',
    grind: 'Grano entero o molido',
    roast: 'Tueste medio',
    price: 60,
    imgSlotId: 'img-producto-monteverde-500',
    imgSlotLabel: '[ IMG: bolsa CodeBrew Monteverde 500 g | 1:1 ]',
    image: bagLight
  },
  {
    id: 'espresso-250',
    name: 'Espresso Amazonas',
    format: '250 g',
    grind: 'Grano entero o molido para espresso',
    roast: 'Tueste medio-oscuro',
    price: 34,
    imgSlotId: 'img-producto-espresso-250',
    imgSlotLabel: '[ IMG: bolsa CodeBrew Espresso 250 g | 1:1 ]',
    image: bagDark
  },
  {
    id: 'espresso-500',
    name: 'Espresso Amazonas',
    format: '500 g',
    grind: 'Grano entero o molido para espresso',
    roast: 'Tueste medio-oscuro',
    price: 60,
    imgSlotId: 'img-producto-espresso-500',
    imgSlotLabel: '[ IMG: bolsa CodeBrew Espresso 500 g | 1:1 ]',
    image: bagDark
  },
  {
    id: 'pack-developer',
    name: 'Pack Developer',
    format: '2 × 250 g',
    grind: 'Combinación personalizable',
    roast: 'Tueste medio + medio-oscuro',
    price: 62,
    highlighted: true,
    highlightTag: 'const favorito = true;',
    imgSlotId: 'img-producto-pack-developer',
    imgSlotLabel: '[ IMG: Pack Developer Dúo 2x250 g con packaging exclusivo | 1:1 ]',
    image: bagLight,
    image2: bagDark
  },
  {
    id: 'microlote-temporada',
    name: 'Microlote de Temporada',
    format: '250 g',
    grind: 'Grano entero o filtrado',
    roast: 'Tueste claro',
    price: 45,
    imgSlotId: 'img-producto-microlote',
    imgSlotLabel: '[ IMG: bolsa Microlote Selección Especial 250 g | 1:1 ]',
    image: bagLight
  }
];

export const TRUST_METRICS = [
  { label: 'Puntaje de catación', value: '84+ pts SCA' },
  { label: 'Altitud de cultivo', value: '1 400 – 1 800 msnm' },
  { label: 'Variedad botánica', value: '100 % arábica' },
  { label: 'Proceso de tueste', value: 'Tostado artesanal' }
];
