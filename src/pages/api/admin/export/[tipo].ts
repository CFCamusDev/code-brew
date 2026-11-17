import type { APIRoute } from 'astro';
import { csvResponse } from '../../../../lib/server/csv';
import { exportOrders, exportPurchases, exportReconciliation, exportStockMovements } from '../../../../lib/server/admin/exports';
import { STATUS_LABEL, type OrderStatus } from '../../../../lib/server/admin/orders';

export const prerender = false;

const isDate = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

/** Conciliar consulta la pasarela página por página: el rango se limita para que responda en segundos. */
const MAX_RECONCILIATION_DAYS = 93;
/** Inicio y fin de un día en hora de Lima (UTC−5, sin horario de verano). */
const limaStart = (day: string) => new Date(`${day}T00:00:00-05:00`);
const limaEnd = (day: string) => new Date(`${day}T23:59:59.999-05:00`);
const limaDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(date);

/** GET /api/admin/export/{pedidos|compras|stock|conciliacion}?desde=YYYY-MM-DD&hasta=YYYY-MM-DD[&estado=…&q=…] */
export const GET: APIRoute = async ({ params, url, locals }) => {
  const from = url.searchParams.get('desde');
  const to = url.searchParams.get('hasta');
  if ((from && !isDate(from)) || (to && !isDate(to))) {
    return Response.json({ error: 'Usa fechas con formato AAAA-MM-DD.' }, { status: 400 });
  }
  const range = { from: from ?? undefined, to: to ?? undefined };
  const suffix = [from, to].filter(Boolean).join('_a_') || 'todo';

  let csv: string;
  switch (params.tipo) {
    case 'pedidos': {
      const status = url.searchParams.get('estado');
      csv = await exportOrders({
        ...range,
        status: status && status in STATUS_LABEL ? (status as OrderStatus) : undefined,
        q: url.searchParams.get('q')?.trim().slice(0, 100) || undefined
      });
      break;
    }
    case 'compras':
      csv = await exportPurchases(range.from, range.to);
      break;
    case 'stock':
      csv = await exportStockMovements(range.from, range.to);
      break;
    case 'conciliacion': {
      // Por defecto, los últimos 30 días.
      const fromDate = limaStart(from ?? limaDay(new Date(Date.now() - 29 * 86_400_000)));
      const toDate = limaEnd(to ?? limaDay(new Date()));
      if (toDate < fromDate || toDate.getTime() - fromDate.getTime() > MAX_RECONCILIATION_DAYS * 86_400_000) {
        return Response.json({ error: `Elige un rango de hasta ${MAX_RECONCILIATION_DAYS} días.` }, { status: 400 });
      }
      try {
        csv = await exportReconciliation({ from: fromDate, to: toDate });
      } catch (error) {
        console.error('[export] conciliación: la pasarela no respondió', error);
        return Response.json({ error: 'Culqi no respondió. Inténtalo de nuevo en unos minutos.' }, { status: 502 });
      }
      break;
    }
    default:
      return Response.json({ error: 'Exportación desconocida.' }, { status: 404 });
  }

  // Registro de quién descargó datos (los pedidos incluyen datos personales de clientes).
  console.info(`[export] ${locals.admin!.email} descargó ${params.tipo} (${suffix})`);
  return csvResponse(csv, `codebrew-${params.tipo}-${suffix}.csv`);
};
