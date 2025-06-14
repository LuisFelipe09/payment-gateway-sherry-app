import { NextRequest, NextResponse } from 'next/server';
import { NextJSPaymentGateway } from '@/lib/paymentGateway';
import { kv } from '@vercel/kv';
import { ethers } from 'ethers';


async function createPaymentHandler(req: NextRequest) {
    try {
        const body = await req.json();
        const { merchantAddress, tokenAddress, amount, metadata, payerAddress } = body;

        // Validaciones
        if (!ethers.isAddress(merchantAddress) || !ethers.isAddress(tokenAddress)) {
            return NextResponse.json({ error: 'Direcciones inválidas' }, { status: 400 });
        }

        if (!amount || BigInt(amount) <= 0) {
            return NextResponse.json({ error: 'Monto inválido' }, { status: 400 });
        }

        const gateway = new NextJSPaymentGateway();

        // Verificar que el token existe
        await gateway.getTokenInfo(tokenAddress);

        // Crear pago
        const rawPayment = await gateway.createPayment(
            merchantAddress,
            tokenAddress,
            amount,
            metadata
        );
        const payment = {
            ...rawPayment,
            payerAddress
        };

        // Almacenar en KV (Redis)
        await kv.set(`payment:${payment.paymentId}`, payment, { ex: 1800 }); // 30 min TTL

        return NextResponse.json({
            success: true,
            payment: {
                paymentId: payment.paymentId,
                amount: payment.amount,
                expiresAt: payment.expiresAt
            }
        });
    } catch (error: any) {
        console.error('Error creando pago:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    return createPaymentHandler(req);
}
