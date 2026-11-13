/** IP real del cliente detrás de Cloudflare y nginx. */
export function clientIp(request: Request, fallback: string) {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    fallback
  );
}
