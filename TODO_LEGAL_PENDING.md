# TODO Legal Pending

## Fiscal / VERI*FACTU

- Validar juridicamente el flujo exacto de anulacion frente a rectificativa en todos los supuestos.
- Implementar firma o sello de registros fiscales si aplica al modelo final.
- Completar adaptador real de remision a AEAT.
- Implementar exportacion oficial en el formato final exacto exigido cuando se cierre el canal tecnico de integracion.
- Incorporar politicas mas finas por serie documental y por tipo de factura.

## Facturacion

- Separar `invoice_lines` en tabla propia en lugar de JSON para analitica y auditoria mas fuerte.
- Incorporar validaciones avanzadas de factura simplificada.
- Incorporar datos completos de regimen fiscal, tipos de IVA especiales, exenciones y claves fiscales.
- Generar almacenamiento persistente de PDF emitido con huella y ruta versionada.

## RGPD / LOPDGDD

- Sustituir los textos legales seed por textos validados por despacho o DPO.
- Completar modulo de derechos con flujo operativo:
  - recepcion
  - verificacion de identidad
  - resolucion
  - cierre
- Anadir registro de brechas de seguridad.
- Completar inventario de medidas de seguridad por actividad.
- Anadir consentimiento granular si se incorporan cookies no tecnicas o marketing.

## Contratacion SaaS

- Integrar aceptacion del contrato de encargado del tratamiento en activacion de plan/pago.
- Integrar aceptacion de condiciones del servicio en checkout o alta de suscripcion.
- Forzar reaceptacion guiada cuando cambien documentos criticos.

## Seguridad

- Endurecer politicas de password y rotacion.
- Anadir rate limiting y proteccion de login.
- Anadir MFA para roles sensibles.
- Completar trazabilidad de accesos con metadata de dispositivo y geolocalizacion aproximada si se decide.

## UX / Frontend

- Mostrar modulo dedicado de estado VERI*FACTU y exportaciones globales.
- Mostrar historial de auditoria de empresa y seguridad en configuracion.
- Mejorar flujo visual de reaceptacion legal pendiente.
- Anadir vista publica de cookies con preferencias si en el futuro se agregan cookies no tecnicas.

## Testing

- Tests end-to-end de flujos fiscales completos.
- Tests de permisos por rol en facturacion, configuracion, informes y asistente IA.
- Tests de exportacion y solicitud de derechos RGPD.
- Tests de regresion visual para landing y configuracion legal.
