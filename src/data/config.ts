import type { ImageMetadata } from 'astro';
import { getSetting, SOCIAL_LINKS_KEY, type SocialLinks } from '../lib/server/settings';
import bagLight from '../assets/products/bag-light.png';
import bagDark from '../assets/products/bag-dark.png';
import lifestyleCup from '../assets/lifestyle/cup.png';
import lifestyleBeans from '../assets/lifestyle/beans.png';
import lifestyleLaptop from '../assets/lifestyle/laptop-code.png';
import catalog from './catalog.json';

export const SITE_CONFIG = {
  name: 'CodeBrew',
  tagline: 'Café que despierta ideas.',
  codeComment: '// tu código necesita café',
  phone: '51917712438',
  defaultMessage: '¡Hola CodeBrew! Quiero hacer una consulta sobre su café de especialidad.',
  ga4Id: '', // Espacio reservado para ID de Google Analytics 4 (ej. G-XXXXXXXXXX)
  googleAdsId: '' // Espacio reservado para ID de Google Ads (ej. AW-XXXXXXXXX)
};

/** El número sale de /admin/configuración (redes y contacto); si no hay nada guardado aún, usa SITE_CONFIG.phone. */
export async function getWhatsAppUrl(message?: string): Promise<string> {
  const links = await getSetting<SocialLinks>(SOCIAL_LINKS_KEY, {
    instagram: '',
    tiktok: '',
    facebook: '',
    whatsapp: SITE_CONFIG.phone
  });
  // En configuración se guarda el celular de 9 dígitos (como lo pide el formulario del panel);
  // wa.me necesita el prefijo de país.
  const digits = links.whatsapp || SITE_CONFIG.phone;
  const phone = digits.length === 9 ? `51${digits}` : digits;
  const text = encodeURIComponent(message || SITE_CONFIG.defaultMessage);
  return `https://wa.me/${phone}?text=${text}`;
}

export interface ProductImage {
  src: ImageMetadata;
  alt: string;
}

function bagGallery(bag: ImageMetadata, lifestyle: ImageMetadata, lifestyleAlt: string, productName: string): ProductImage[] {
  return [
    { src: bag, alt: `Bolsa de ${productName}` },
    { src: lifestyle, alt: lifestyleAlt }
  ];
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
  /** Galería de imágenes del producto: bolsa y una escena de uso (taza, granos, laptop). */
  images: ProductImage[];
  /** Cuando es 'duo' se muestran dos imágenes lado a lado (ej. packs con dos presentaciones) en vez de alternarlas en galería. */
  galleryMode?: 'duo';
}

/** Precio en soles de una presentación según el catálogo (fuente única compartida con el seed de la base de datos). */
function priceOf(sku: string): number {
  const variant = catalog.products.flatMap(p => p.variants).find(v => v.sku === sku);
  if (!variant) throw new Error(`SKU sin precio en catalog.json: ${sku}`);
  return variant.price;
}

export const PRODUCTS: ProductItem[] = [
  {
    id: 'monteverde-250',
    name: 'Hotfix',
    format: '250 g',
    grind: 'Grano entero o molido',
    roast: 'Tueste medio-oscuro',
    price: priceOf('monteverde-250'),
    imgSlotId: 'img-producto-monteverde-250',
    imgSlotLabel: '[ IMG: bolsa CodeBrew Monteverde 250 g | 1:1 ]',
    images: bagGallery(bagLight, lifestyleCup, 'Taza de café de especialidad recién preparado', 'Origen Monteverde 250 g')
  },
  {
    id: 'monteverde-500',
    name: 'Hotfix',
    format: '500 g',
    grind: 'Grano entero o molido',
    roast: 'Tueste medio-oscuro',
    price: priceOf('monteverde-500'),
    imgSlotId: 'img-producto-monteverde-500',
    imgSlotLabel: '[ IMG: bolsa CodeBrew Monteverde 500 g | 1:1 ]',
    images: bagGallery(bagLight, lifestyleLaptop, 'Laptop con código junto a café CodeBrew', 'Origen Monteverde 500 g')
  },
  {
    id: 'espresso-250',
    name: 'Espresso Amazonas',
    format: '250 g',
    grind: 'Grano entero o molido para espresso',
    roast: 'Tueste medio-oscuro',
    price: priceOf('espresso-250'),
    imgSlotId: 'img-producto-espresso-250',
    imgSlotLabel: '[ IMG: bolsa CodeBrew Espresso 250 g | 1:1 ]',
    images: bagGallery(bagDark, lifestyleBeans, 'Granos de café de especialidad CodeBrew', 'Espresso Amazonas 250 g')
  },
  {
    id: 'espresso-500',
    name: 'Espresso Amazonas',
    format: '500 g',
    grind: 'Grano entero o molido para espresso',
    roast: 'Tueste medio-oscuro',
    price: priceOf('espresso-500'),
    imgSlotId: 'img-producto-espresso-500',
    imgSlotLabel: '[ IMG: bolsa CodeBrew Espresso 500 g | 1:1 ]',
    images: bagGallery(bagDark, lifestyleCup, 'Taza de café de especialidad recién preparado', 'Espresso Amazonas 500 g')
  },
  {
    id: 'pack-developer',
    name: 'Pack Developer',
    format: '2 × 250 g',
    grind: 'Combinación personalizable',
    roast: 'Tueste medio + medio-oscuro',
    price: priceOf('pack-developer'),
    highlighted: true,
    highlightTag: 'const favorito = true;',
    imgSlotId: 'img-producto-pack-developer',
    imgSlotLabel: '[ IMG: Pack Developer Dúo 2x250 g con packaging exclusivo | 1:1 ]',
    images: [
      { src: bagLight, alt: 'Bolsa Origen Monteverde del Pack Developer' },
      { src: bagDark, alt: 'Bolsa Espresso Amazonas del Pack Developer' }
    ],
    galleryMode: 'duo'
  },
  {
    id: 'microlote-temporada',
    name: 'Microlote de Temporada',
    format: '250 g',
    grind: 'Grano entero o filtrado',
    roast: 'Tueste claro',
    price: priceOf('microlote-temporada'),
    imgSlotId: 'img-producto-microlote',
    imgSlotLabel: '[ IMG: bolsa Microlote Selección Especial 250 g | 1:1 ]',
    images: bagGallery(bagLight, lifestyleBeans, 'Granos de café de especialidad CodeBrew', 'Microlote de Temporada 250 g')
  }
];

export const TRUST_METRICS = [
  { label: 'Puntaje de catación', value: '84+ pts SCA' },
  { label: 'Altitud de cultivo', value: '1 400 – 1 800 msnm' },
  { label: 'Variedad botánica', value: '100 % arábica' },
  { label: 'Proceso de tueste', value: 'Tostado artesanal' }
];
