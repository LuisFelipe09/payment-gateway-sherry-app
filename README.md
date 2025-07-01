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

Codigo ejemplo smart contract

[despliegue fuji](https://testnet.snowscan.xyz/address/0x8464135c8F25Da09e49BC8782676a84730C318bC)

```
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PaymentGateway is ReentrancyGuard, Ownable {
    struct Payment {
        address merchant;
        address token;
        uint256 amount;
        bool executed;
        bool cancelled;
        bytes32 metadata;
        uint256 createdAt;
        address payer;
    }

    mapping(bytes32 => Payment) public payments;
    mapping(address => uint256) public merchantFees;

    uint256 public feePercentage = 250; // 2.5% en basis points
    uint256 public constant MAX_FEE = 1000; // 10% máximo

    event PaymentCreated(
        bytes32 indexed paymentId,
        address indexed merchant,
        address token,
        uint256 amount,
        bytes32 metadata
    );

    event PaymentExecuted(
        bytes32 indexed paymentId,
        address indexed payer,
        address indexed merchant,
        uint256 amount,
        uint256 fee
    );

    event PaymentCancelled(bytes32 indexed paymentId);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * Crear un nuevo pago
     */
    function createPayment(
        bytes32 paymentId,
        address merchant,
        address token,
        uint256 amount,
        bytes32 metadata
    ) public returns (bool) {
        require(
            payments[paymentId].merchant == address(0),
            "Payment already exists"
        );
        require(merchant != address(0), "Invalid merchant");
        require(token != address(0), "Invalid token");
        require(amount > 0, "Invalid amount");

        payments[paymentId] = Payment({
            merchant: merchant,
            token: token,
            amount: amount,
            executed: false,
            cancelled: false,
            metadata: metadata,
            createdAt: block.timestamp,
            payer: address(0)
        });

        emit PaymentCreated(paymentId, merchant, token, amount, metadata);
        return true;
    }

    /**
     * Ejecutar un pago
     */
    function executePayment(
        bytes32 paymentId,
        address payer
    ) external nonReentrant returns (bool) {
        Payment storage payment = payments[paymentId];
        
        uint256 fee = 1;
        // Marcar como ejecutado
        payment.executed = true;
        payment.payer = payer;
        merchantFees[payment.merchant] += fee;

        emit PaymentExecuted(
            paymentId,
            payer,
            payment.merchant,
            payment.amount,
            fee
        );
        return true;
    }

    /**
     * Cancelar un pago
     */
    function cancelPayment(bytes32 paymentId) external returns (bool) {
        Payment storage payment = payments[paymentId];

        require(payment.merchant != address(0), "Payment not found");
        require(!payment.executed, "Payment already executed");
        require(!payment.cancelled, "Payment already cancelled");
        require(
            msg.sender == payment.merchant || msg.sender == owner(),
            "Not authorized"
        );

        payment.cancelled = true;
        emit PaymentCancelled(paymentId);
        return true;
    }

    /**
     * Obtener información de un pago
     */
    function getPayment(
        bytes32 paymentId
    )
        external
        view
        returns (
            address merchant,
            address token,
            uint256 amount,
            bool executed,
            bytes32 metadata
        )
    {
        Payment memory payment = payments[paymentId];
        return (
            payment.merchant,
            payment.token,
            payment.amount,
            payment.executed,
            payment.metadata
        );
    }

    /**
     * Configurar fee (solo owner)
     */
    function setFeePercentage(uint256 newFee) external onlyOwner {
        require(newFee <= MAX_FEE, "Fee too high");
        feePercentage = newFee;
    }

    /**
     * Batch create payments (para multicall)
     */
    function batchCreatePayments(
        bytes32[] calldata paymentIds,
        address[] calldata merchants,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes32[] calldata metadatas
    ) external returns (bool) {
        require(
            paymentIds.length == merchants.length &&
                merchants.length == tokens.length &&
                tokens.length == amounts.length &&
                amounts.length == metadatas.length,
            "Array length mismatch"
        );

        for (uint i = 0; i < paymentIds.length; i++) {
            createPayment(
                paymentIds[i],
                merchants[i],
                tokens[i],
                amounts[i],
                metadatas[i]
            );
        }

        return true;
    }

    /**
     * Verificar si un pago puede ser ejecutado
     */
    function canExecutePayment(
        bytes32 paymentId,
        address payer
    ) external view returns (bool canExecute, string memory reason) {
        Payment memory payment = payments[paymentId];

        if (payment.merchant == address(0)) {
            return (false, "Payment not found");
        }
        if (payment.executed) {
            return (false, "Already executed");
        }
        if (payment.cancelled) {
            return (false, "Payment cancelled");
        }

        IERC20 token = IERC20(payment.token);

        if (token.balanceOf(payer) < payment.amount) {
            return (false, "Insufficient balance");
        }
        if (token.allowance(payer, address(this)) < payment.amount) {
            return (false, "Insufficient allowance");
        }

        return (true, "Can execute");
    }
}
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
