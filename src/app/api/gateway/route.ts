import { NextRequest, NextResponse } from 'next/server';
import { createMetadata, Metadata, ValidatedMetadata, ExecutionResponse } from '@sherrylinks/sdk';
import { kv } from '@vercel/kv';
import { avalancheFuji } from 'viem/chains';


export async function GET(req: NextRequest) {
    try {
        const host = req.headers.get('host') || 'localhost:3000';
        const protocol = req.headers.get('x-forwarded-proto') || 'http';
        const serverUrl = `${protocol}://${host}`;


        const now = new Date();

        // Aquí podrías obtener los pagos pendientes desde tu base de datos o almacenamiento
        // Ejemplo de cómo podrías obtener pagos pendientes desde Vercel KV (Redis)
        const paymentKeys = await kv.keys('payment:*');

        // Obtener los datos de cada pago
        const payments = await Promise.all(
            paymentKeys.map(key => kv.get(key))
        );

        console.log('Pagos obtenidos:', payments);

        // Filtrar pagos que no sean null (por si alguno expiró)
        const pending_payments = payments
            .filter(
                (payment): payment is {
                    merchant: string;
                    amount: string;
                    paymentId: string;
                    status: string;
                    expiresAt: string;
                } =>
                    payment !== null &&
                    typeof payment === 'object' &&
                    'merchant' in payment &&
                    'amount' in payment &&
                    'paymentId' in payment
            )
            .map(payment => ({
                label: `${payment.merchant} ${payment.amount}`,
                value: payment.paymentId
            }));


        const metadata: Metadata = {
            url: 'https://sherry.social',
            icon: 'https://avatars.githubusercontent.com/u/117962315',
            title: 'Pagos Sherry',
            baseUrl: serverUrl,
            description:
                'Permite ralizar pagos a comercios y servicios',
            actions: [
                {
                    type: 'dynamic',
                    label: 'Pagos Pendientes',
                    description:
                        'muestra los pagos pendientes.',
                    chains: { source: 'fuji' },
                    path: `/api/gateway`,
                    params: [
                        {
                            name: 'pago',
                            label: 'seleccione el pago',
                            type: 'select',
                            required: true,
                            options: pending_payments,
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

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { paymentId } = body;

        if (!paymentId) {
            return NextResponse.json({ error: 'paymentId is required' }, { status: 400 });
        }

        // Definir el tipo de Payment
        type Payment = {
            payerAddress: string;
            paymentId: string;
            merchant: string;
            token: string;
            amount: string;
            metadata?: any;
            status?: string;
            expiresAt: string;
        };

        // Buscar el pago en KV
        const paymentRaw = await kv.get(`payment:${paymentId}`);
        const payment = paymentRaw as Payment;

        if (
            !payment ||
            typeof payment !== 'object' ||
            //payment.status !== 'pending' ||
            new Date(payment.expiresAt) < new Date()
        ) {
            return NextResponse.json({ error: 'Pago no válido o expirado' }, { status: 400 });
        }

        // Importar el gateway de pagos
        const { NextJSPaymentGateway } = await import('@/lib/paymentGateway');
        const gateway = new NextJSPaymentGateway();


        const result = await gateway.executePayment({
            ...payment,
            metadata: typeof payment.metadata === 'string'
                ? payment.metadata
                : JSON.stringify(payment.metadata ?? {})
        });

        // Actualizar el estado del pago en KVz
        //payment.status = 'completed';
        await kv.set(`payment:${paymentId}`, payment);

        const resp: ExecutionResponse = {
            serializedTransaction: result,
            chainId: avalancheFuji.name,
        };

        return NextResponse.json(resp, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
        });
    } catch (error) {
        console.error('Error ejecutando el pago:', error);
        return NextResponse.json({ error: 'Error al ejecutar el pago' }, { status: 500 });
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
