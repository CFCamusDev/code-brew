export interface SocialLinks {
  instagram: string;
  tiktok: string;
  facebook: string;
  whatsapp: string;
}

export interface PolicyContent {
  title: string;
  body: string;
}

export const SOCIAL_LINKS_KEY = 'social_links';
export const POLICY_KEYS = {
  terminos: 'policy_terms',
  privacidad: 'policy_privacy',
  'envios-devoluciones': 'policy_shipping_returns'
} as const;
export type PolicySlug = keyof typeof POLICY_KEYS;
