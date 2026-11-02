import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, type FieldError } from 'react-hook-form';
import { complaintSchema, type Complaint, type ComplaintForm as ComplaintFormInput } from '../../lib/shop/complaints';
import '../../styles/shop.css';

export default function ComplaintForm() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [number, setNumber] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<ComplaintFormInput, unknown, Complaint>({
    resolver: zodResolver(complaintSchema),
    defaultValues: { type: 'reclamo', isMinor: false }
  });
  const isMinor = watch('isMinor');

  const onSubmit = async (data: Complaint) => {
    setSubmitError(null);
    try {
      const response = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 201) {
        setNumber(body.number);
        return;
      }
      setSubmitError(body.error ?? 'No pudimos registrar tu reclamo. Inténtalo de nuevo.');
    } catch {
      setSubmitError('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
    }
  };

  if (number) {
    return (
      <div className="order-page">
        <p className="cart-code">// reclamo registrado</p>
        <h1>Recibimos tu {watch('type') === 'queja' ? 'queja' : 'reclamo'} {number}</h1>
        <p className="muted">Te enviamos una copia a tu correo. Tienes hasta 30 días calendario para recibir nuestra respuesta.</p>
        <a className="button primary" href="/">
          Volver al inicio <span aria-hidden="true">↗</span>
        </a>
      </div>
    );
  }

  return (
    <form className="order-page" onSubmit={handleSubmit(onSubmit)} noValidate>
      <p className="eyebrow">LIBRO DE RECLAMACIONES</p>
      <h1>Registra tu reclamo o queja</h1>
      <p className="muted">Conforme al Código de Protección y Defensa del Consumidor, puedes presentar un reclamo o queja sobre nuestro producto o servicio.</p>

      <div className="field-grid" style={{ marginTop: 24 }}>
        <Field label="Tipo" error={errors.type} wide>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="radio" value="reclamo" {...register('type')} /> Reclamo
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="radio" value="queja" {...register('type')} /> Queja
            </label>
          </div>
        </Field>

        <Field label="Nombre completo" error={errors.consumerName} wide>
          <input {...register('consumerName')} autoComplete="name" />
        </Field>
        <Field label="Correo" error={errors.consumerEmail}>
          <input {...register('consumerEmail')} type="email" autoComplete="email" inputMode="email" />
        </Field>
        <Field label="Celular (opcional)" error={errors.consumerPhone}>
          <input {...register('consumerPhone')} type="tel" inputMode="tel" placeholder="9XX XXX XXX" />
        </Field>
        <Field label="DNI o CE (opcional)" error={errors.consumerDocument}>
          <input {...register('consumerDocument')} inputMode="numeric" />
        </Field>
        <Field label="Dirección" error={errors.consumerAddress} wide>
          <input {...register('consumerAddress')} autoComplete="street-address" />
        </Field>

        <Field label="" error={undefined} wide>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" {...register('isMinor')} /> El consumidor es menor de edad (lo presenta un apoderado)
          </label>
        </Field>
        {isMinor && (
          <>
            <Field label="Nombre del apoderado" error={errors.guardianName}>
              <input {...register('guardianName')} />
            </Field>
            <Field label="DNI o CE del apoderado" error={errors.guardianDocument}>
              <input {...register('guardianDocument')} inputMode="numeric" />
            </Field>
          </>
        )}

        <Field label="Bien contratado (producto o servicio)" error={errors.productOrService} wide>
          <input {...register('productOrService')} placeholder="Ej. Espresso Amazonas 250 g" />
        </Field>
        <Field label="Monto reclamado en soles (opcional)" error={errors.amount}>
          <input {...register('amount')} inputMode="decimal" placeholder="0.00" />
        </Field>

        <Field label="Detalle" error={errors.detail} wide>
          <textarea {...register('detail')} rows={4} placeholder="Cuéntanos qué pasó." />
        </Field>
        <Field label="Pedido del consumidor" error={errors.consumerRequest} wide>
          <textarea {...register('consumerRequest')} rows={3} placeholder="¿Qué esperas que hagamos?" />
        </Field>
      </div>

      {submitError && (
        <p className="field-error" role="alert">
          {submitError}
        </p>
      )}
      <button type="submit" className="button primary checkout-submit" disabled={isSubmitting} style={{ marginTop: 20 }}>
        {isSubmitting ? 'Enviando…' : 'Registrar reclamo'} <span aria-hidden="true">↗</span>
      </button>
    </form>
  );
}

function Field({ label, error, wide, children }: { label: string; error?: FieldError; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={wide ? 'field wide' : 'field'} data-invalid={error ? '' : undefined}>
      {label && <span>{label}</span>}
      {children}
      {error && <small className="field-error">{error.message}</small>}
    </label>
  );
}
