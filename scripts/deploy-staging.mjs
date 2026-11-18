import { pathToFileURL } from 'node:url';

const positive = value => /^\d+$/.test(value ?? '') && Number.isSafeInteger(Number(value)) && Number(value) > 0;
export function deploymentSettings(env) {
  let portainer;
  let site;
  try { portainer = new URL(env.STAGING_PORTAINER_URL); site = new URL(env.STAGING_SITE_URL); }
  catch { throw new Error('Configura las URL HTTPS de Portainer y staging.'); }
  if (portainer.protocol !== 'https:' || portainer.username || portainer.password || portainer.search || portainer.hash) throw new Error('La URL de Portainer debe usar HTTPS sin credenciales ni parámetros.');
  if (site.origin !== 'https://staging.coffeecodebrew.com' || site.pathname !== '/' || site.search || site.hash || site.username || site.password) throw new Error('El destino debe ser https://staging.coffeecodebrew.com.');
  if (!positive(env.STAGING_STACK_ID) || !positive(env.STAGING_ENDPOINT_ID)) throw new Error('Configura los IDs de la stack y del entorno de staging.');
  if (!env.STAGING_PORTAINER_API_KEY?.trim()) throw new Error('Falta STAGING_PORTAINER_API_KEY.');
  if (!/^[a-f0-9]{40}$/.test(env.EXPECTED_SHA ?? '')) throw new Error('Falta el SHA esperado del CI.');
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(env.STAGING_DEPLOYMENT_ID ?? '') || env.STAGING_DEPLOYMENT_ID === 'manual') throw new Error('Configura un identificador único para este despliegue.');
  return { portainer: portainer.href.replace(/\/$/, ''), site: site.origin, stackId: Number(env.STAGING_STACK_ID), endpointId: Number(env.STAGING_ENDPOINT_ID), apiKey: env.STAGING_PORTAINER_API_KEY, sha: env.EXPECTED_SHA, deploymentId: env.STAGING_DEPLOYMENT_ID };
}

export function assertStagingStack(stack, settings) {
  let repo;
  try { repo = new URL(stack.GitConfig?.URL); } catch { throw new Error('La stack debe proceder del repositorio Git de CodeBrew.'); }
  if (stack.Name !== 'codebrew-staging' || stack.EndpointId !== settings.endpointId || repo.hostname !== 'github.com' || repo.pathname.replace(/\.git$/, '').toLowerCase() !== '/cfcamusdev/code-brew' || stack.GitConfig.ReferenceName !== 'refs/heads/develop' || !stack.AdditionalFiles?.includes('docker-compose.staging.yml')) {
    throw new Error('La stack no coincide con codebrew-staging, develop y su archivo de staging; no se modificó.');
  }
  if (!Array.isArray(stack.Env) || stack.Env.some(pair => typeof pair.name !== 'string' || typeof pair.value !== 'string')) throw new Error('Portainer no devolvió las variables completas de la stack.');
}

export function isReady(health, settings) {
  return health?.status === 'ok' && health.database === 'ok' && health.migrations === 'ok' && health.environment === 'staging' && health.deploymentId === settings.deploymentId;
}

export async function deployStaging(env, { fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 90, log = console.log } = {}) {
  const settings = deploymentSettings(env);
  const stackUrl = `${settings.portainer}/api/stacks/${settings.stackId}`;
  const headers = { 'X-API-Key': settings.apiKey, 'Content-Type': 'application/json' };
  async function portainerRequest(url, init = {}) {
    let response;
    try { response = await fetchImpl(url, { ...init, headers, redirect: 'error', signal: AbortSignal.timeout(init.method === 'PUT' ? 300000 : 15000) }); }
    catch { throw new Error('No se pudo conectar con Portainer.'); }
    if (!response.ok) throw new Error(`Portainer devolvió HTTP ${response.status}.`);
    return response;
  }
  async function readStack() {
    try { return await (await portainerRequest(stackUrl)).json(); }
    catch { throw new Error('No se pudo consultar la configuración de la stack de staging.'); }
  }
  const stack = await readStack();
  assertStagingStack(stack, settings);
  const variables = stack.Env.filter(pair => pair.name !== 'STAGING_DEPLOYMENT_ID');
  variables.push({ name: 'STAGING_DEPLOYMENT_ID', value: settings.deploymentId });
  log('[staging] solicitando actualización de la stack de pruebas');
  await portainerRequest(`${stackUrl}/git/redeploy?endpointId=${settings.endpointId}`, {
    method: 'PUT', body: JSON.stringify({ RepositoryReferenceName: 'refs/heads/develop', Env: variables, Prune: false, PullImage: true, RepullImageAndRedeploy: true })
  });
  const deadline = Date.now() + 480000;
  for (let attempt = 0; attempt < attempts && Date.now() < deadline; attempt++) {
    try {
      const response = await fetchImpl(`${settings.site}/api/health`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (response.ok && isReady(await response.json(), settings)) {
        const updated = await readStack();
        assertStagingStack(updated, settings);
        if (updated.GitConfig.ConfigHash !== settings.sha) throw new Error('Portainer desplegó una revisión diferente del CI; comprueba si develop avanzó.');
        log('[staging] nueva instancia, base de datos y migraciones saludables');
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Portainer desplegó')) throw error;
    }
    if (attempt + 1 < attempts) await sleep(5000);
  }
  throw new Error('Staging no confirmó la nueva instancia saludable dentro del plazo.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deployStaging(process.env).catch(error => { console.error(`[staging] ${error.message}`); process.exitCode = 1; });
}
