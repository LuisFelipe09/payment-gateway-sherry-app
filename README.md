# Sherry Payment Gateway

## Descripción

**Sherry Payment Gateway** es una API y backend para gestionar pagos en blockchain, permitiendo a comercios y servicios aceptar pagos con tokens ERC20 de forma sencilla, segura y eficiente. El sistema está construido sobre Next.js (API Routes), utiliza almacenamiento KV (Redis) para pagos pendientes y ejecuta transacciones sobre Avalanche Fuji (o cualquier EVM compatible).

## Características principales

- **Creación y gestión de pagos**: Los comercios pueden generar solicitudes de pago con metadatos personalizados.
- **Ejecución de pagos**: Los usuarios pueden completar pagos pendientes de forma segura.
- **Almacenamiento temporal**: Los pagos pendientes se almacenan en KV con expiración automática.
- **Soporte para múltiples tokens**: Compatible con cualquier token ERC20.
- **Multicall**: Permite agrupar varias llamadas en una sola transacción para eficiencia y ahorro de gas.

## Ventajas del uso de Multicall

- **Eficiencia**: Permite ejecutar varias operaciones (por ejemplo, aprobar y transferir tokens) en una sola transacción, reduciendo el número de confirmaciones necesarias.
- **Ahorro de gas**: Al agrupar operaciones, se reduce el coste total de gas comparado con ejecutar cada operación por separado.
- **Mejor experiencia de usuario**: Menos interacciones y confirmaciones, lo que simplifica el proceso de pago.
- **Atomicidad**: Todas las operaciones se ejecutan juntas o ninguna, evitando estados intermedios inconsistentes.

## Mejoras propuestas

- **Implementar el patrón Permit (EIP-2612) para ERC20**:  
  Integrar un componente de firmas que permita a los usuarios autorizar transferencias de tokens mediante una firma off-chain (`permit`). Esto elimina la necesidad de una transacción de aprobación previa, haciendo el flujo de pago más eficiente y económico.
    - **Ventajas**:
        - Reduce el número de transacciones on-chain.
        - Menor coste de gas para el usuario.
        - Mejor UX: solo una firma y una transacción para completar el pago.

- **Implementar en la mini app un flujo para filtrar pagos por dirección actual**:  
  Añadir una funcionalidad en la mini app que permita a los usuarios ver y filtrar los pagos asociados a la dirección de wallet actualmente conectada. Esto facilitará a los usuarios revisar únicamente los pagos relevantes para su cuenta, mejorando la experiencia de usuario y la gestión de pagos.
    - **Ventajas**:
        - Visualización personalizada de pagos.
        - Mayor facilidad para encontrar transacciones propias.
        - Mejor UX y control para el usuario.

- **Soporte para más blockchains**:  
  Extender la compatibilidad a otras redes EVM y L2.

- **Panel de administración**:  
  Dashboard para comercios y usuarios para ver el historial y estado de pagos.

## Estructura del proyecto

```
src/
  app/api/gateway/route.ts   # Endpoints para crear y ejecutar pagos
  lib/paymentGateway.ts      # Lógica de integración con contratos y multicall
  ...
```

## Ejemplo de uso

### Crear un pago

```bash
curl --location 'https://payment-gateway-sherry-app.vercel.app/api/payment' \
--header 'Content-Type: application/json' \
--data '{
    "merchantAddress": "0xC8d9aD18f6Ae67d1d945c7053dB80Ed94444f8B8",
    "tokenAddress": "0x2ba69CC12F7CAb1D3ED36339853DE941aaE89Da4",
    "amount": "80000000000000",
    "metadata": { "orderId": "123j" }, 
    "payerAddress": "0x152C6C12e242114b7618d11758dcC517926D74D2"
}'
```

### Ejecutar un pago pendiente

Se ejecuta desde la interface de sherry
[App](https://app.sherry.social/action?url=https://payment-gateway-sherry-app.vercel.app/api/gateway)




This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
