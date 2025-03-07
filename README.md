# PYMERA-MS-CHAT-META

Proyecto de gestión de chat con Meta (WhatsApp y Messenger) de AIO Pymera.

## EJECUTAR EN LOCAL

Instalar las dependencias

```bash
pnpm install
```

Levantar el proyecto

```bash
pnpm run start:dev
```

## DESPLIEGUE EN GCP (AMBIENTE "TEST", "PRE-PRODUCCION", Y "PRODUCCION")

Son requeridos los archivos en la raíz del proyecto (al mismo nivel del directorio /src), ref. Notion

- app.yaml (OBLIGATORIO)
- cloudbuild.yaml (SOLO EN CASO DE APLICAR DESPLIEGUE CONTINUO)

En caso de no tener el archivo 'cloudbuild.yaml', ejecutar el siguiente comando; Indicar versión con -v.

```bash
gcloud app deploy -v=20250303
```
