import { NextRequest, NextResponse } from 'next/server';
import { createMetadata, Metadata, ValidatedMetadata, createSelectParam } from '@sherrylinks/sdk';
import { NextJSPaymentGateway } from '@/lib/paymentGateway';
import { kv } from '@vercel/kv';
import { ethers } from 'ethers';

export async function GET(req: NextRequest) {
    try {
        const host = req.headers.get('host') || 'localhost:3000';
        const protocol = req.headers.get('x-forwarded-proto') || 'http';
        const serverUrl = `${protocol}://${host}`;

        /*
                const paymentKeys = await kv.keys('payment:*');
        
                // Obtener los datos de cada pago
                const payments = await Promise.all(
                    paymentKeys.map(key => kv.get(key))
                );
        
                // Filtrar pagos que no sean null (por si alguno expiró)
                const pending_payments = payments.filter(payment => payment !== null);
        
        
        */



        // Simple select parameter
        const prioritySelect = createSelectParam(
            'priority',
            'Priority Level',
            [
                { label: 'Low', value: 1 },
                { label: 'Medium', value: 2 },
                { label: 'High', value: 3 },
            ],
            true, // required
            'Select the priority for this action',
        );


        const metadata: Metadata = {
            url: 'https://sherry.social',
            icon: 'https://avatars.githubusercontent.com/u/117962315',
            title: 'Mensaje con Timestamp',
            baseUrl: serverUrl,
            description:
                'Almacena un mensaje con un timestamp optimizado calculado por nuestro algoritmo',
            actions: [
                {
                    type: 'dynamic',
                    label: 'Almacenar Mensaje',
                    description:
                        'Almacena tu mensaje con un timestamp personalizado calculado para almacenamiento óptimo',
                    chains: { source: 'fuji' },
                    path: `/api/gateway`,
                    params: [
                        {
                            name: 'mensaje',
                            label: '¡Tu Mensaje Hermano!',
                            type: 'text',
                            required: true,
                            description: 'Ingresa el mensaje que quieres almacenar en la blockchain',
                        },
                        {
                            name: 'token',
                            label: 'Select Token',
                            type: 'select',
                            required: true,
                            options: [
                                {
                                    label: 'USDC',
                                    value: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
                                    description: 'USD Coin'
                                },
                                {
                                    label: 'USDT',
                                    value: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
                                    description: 'Tether USD'
                                },
                                {
                                    label: 'DAI',
                                    value: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
                                    description: 'Dai Stablecoin'
                                }
                            ]
                        }
                    ],
                },
            ],
        };

        // Validar metadata usando el SDK
        const validated: ValidatedMetadata = createMetadata(metadata);

        // Retornar con headers CORS para acceso cross-origin
        return NextResponse.json(validated, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            },
        });
    } catch (error) {
        console.error('Error creando metadata:', error);
        return NextResponse.json({ error: 'Error al crear metadata' }, { status: 500 });
    }
}


export async function OPTIONS(request: NextRequest) {
    return new NextResponse(null, {
        status: 204, // Sin Contenido
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers':
                'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version',
        },
    });
}

async function createPaymentHandler(req: NextRequest) {
    try {
        const body = await req.json();
        const { merchantAddress, tokenAddress, amount, metadata } = body;

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
