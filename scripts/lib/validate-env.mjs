export function validateEnvironment(environment) {
  const errors = [];
  const databaseUrl = environment.DATABASE_URL?.trim();
  try {
    const database = new URL(databaseUrl ?? '');
    if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname || database.pathname.length < 2) {
      errors.push('DATABASE_URL debe ser una URL de PostgreSQL con servidor y base de datos.');
    }
    if (decodeURIComponent(database.password) === 'cambia-esta-contrasena') {
      errors.push('La contraseña de PostgreSQL sigue siendo la de ejemplo; configura POSTGRES_PASSWORD.');
    }
  } catch {
    errors.push('DATABASE_URL falta o no es una URL válida.');
  }

  // APP_ENV distingue staging de producción: NODE_ENV=production lo tienen todos los contenedores (CI incluido).
  // Sin APP_ENV, Culqi es opcional como hasta ahora.
  const appEnv = environment.APP_ENV?.trim();
  if (appEnv && !['local', 'staging', 'production'].includes(appEnv)) {
    errors.push('APP_ENV debe ser local, staging o production.');
  }

  const publicKey = environment.CULQI_PUBLIC_KEY?.trim();
  const secretKey = environment.CULQI_SECRET_KEY?.trim();
  const webhookSecret = environment.CULQI_WEBHOOK_SECRET?.trim();
  if (appEnv === 'staging' || appEnv === 'production') {
    const missing = [['CULQI_PUBLIC_KEY', publicKey], ['CULQI_SECRET_KEY', secretKey], ['CULQI_WEBHOOK_SECRET', webhookSecret]]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missing.length) errors.push(`En APP_ENV=${appEnv} faltan ${missing.join(', ')}.`);
  }
  if (Boolean(publicKey) !== Boolean(secretKey)) errors.push('Configura CULQI_PUBLIC_KEY y CULQI_SECRET_KEY juntas.');
  if (publicKey && secretKey) {
    const publicMode = /^pk_(test|live)_[A-Za-z0-9]+$/.exec(publicKey)?.[1];
    const secretMode = /^sk_(test|live)_[A-Za-z0-9]+$/.exec(secretKey)?.[1];
    if (!publicMode || publicMode !== secretMode || /xxxxxxxx/i.test(publicKey + secretKey)) {
      errors.push('Las llaves Culqi deben ser válidas y pertenecer al mismo entorno test o live.');
    } else if (appEnv === 'production' && publicMode !== 'live') {
      errors.push('En APP_ENV=production las llaves Culqi deben ser de producción (pk_live_/sk_live_), no de prueba.');
    } else if (appEnv === 'staging' && publicMode === 'live') {
      errors.push('En APP_ENV=staging las llaves Culqi deben ser de prueba (pk_test_/sk_test_): staging no cobra de verdad.');
    }
    if (!webhookSecret) errors.push('Configura CULQI_WEBHOOK_SECRET antes de habilitar Culqi.');
  }

  for (const name of ['CULQI_WEBHOOK_SECRET', 'CULQI_WEBHOOK_SECRET_PREVIOUS', 'CRON_SECRET']) {
    const value = environment[name];
    if (value && value.trim().length < 32) errors.push(`${name} debe tener al menos 32 caracteres.`);
  }

  const previousWebhook = environment.CULQI_WEBHOOK_SECRET_PREVIOUS?.trim();
  if (previousWebhook && previousWebhook === environment.CULQI_WEBHOOK_SECRET?.trim()) {
    errors.push('CULQI_WEBHOOK_SECRET_PREVIOUS debe ser distinta de CULQI_WEBHOOK_SECRET; retírala al terminar la rotación.');
  }

  const siteUrl = environment.SITE_URL?.trim();
  if ((publicKey || secretKey || environment.RESEND_API_KEY) && !siteUrl) {
    errors.push('Configura SITE_URL para los pagos y correos.');
  }
  if (siteUrl) {
    try {
      const site = new URL(siteUrl);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(site.hostname);
      if (site.username || site.password || site.search || site.hash || site.pathname !== '/' ||
          (site.protocol !== 'https:' && !(local && site.protocol === 'http:'))) {
        errors.push('SITE_URL debe ser el origen HTTPS público, sin rutas ni credenciales; HTTP solo se permite en localhost.');
      }
    } catch {
      errors.push('SITE_URL no es una URL válida.');
    }
  }
  if (environment.RESEND_API_KEY && !environment.EMAIL_FROM?.trim()) errors.push('Configura EMAIL_FROM para habilitar Resend.');

  const cloudinaryVars = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const cloudinarySet = cloudinaryVars.filter(name => environment[name]?.trim());
  if (cloudinarySet.length > 0 && cloudinarySet.length < cloudinaryVars.length) {
    errors.push('Configura CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET juntas.');
  }

  return errors;
}
