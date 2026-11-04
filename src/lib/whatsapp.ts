const messages = {
  general: '¡Hola, CodeBrew! Vengo de su web y quisiera hacer una consulta sobre sus cafés o envíos. ¿Me ayudan, por favor?',
  checkout: '¡Hola, CodeBrew! Estoy completando mi pedido en la web y necesito ayuda para continuar. ¿Me orientan, por favor?',
  order: '¡Hola, CodeBrew! Quisiera ayuda para consultar o dar seguimiento a mi pedido de la web. ¿Me orientan, por favor?'
} as const;

export function whatsAppContextForPath(pathname: string): keyof typeof messages {
  if (/^\/checkout\/?$/.test(pathname)) return 'checkout';
  if (/^\/pedido(?:\/|$)/.test(pathname)) return 'order';
  return 'general';
}

export function whatsAppMessage(context: string | null): string {
  if (context === 'checkout' || context === 'order') return messages[context];
  return messages.general;
}
