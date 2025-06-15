// lib/paymentGateway.js
import { ethers } from 'ethers';
import { serialize } from 'wagmi';
import { avalancheFuji } from 'viem/chains';
import { encodeFunctionData, TransactionSerializable } from 'viem';

const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL3_ABI = [
    {
        "inputs": [
            {
                "components": [
                    { "name": "target", "type": "address" },
                    { "name": "allowFailure", "type": "bool" },
                    { "name": "callData", "type": "bytes" }
                ],
                "name": "calls",
                "type": "tuple[]"
            }
        ],
        "name": "aggregate3",
        "outputs": [
            {
                "components": [
                    { "name": "success", "type": "bool" },
                    { "name": "returnData", "type": "bytes" }
                ],
                "name": "returnData",
                "type": "tuple[]"
            }
        ],
        "stateMutability": "payable",
        "type": "function"
    }
];

const PAYMENT_GATEWAY_ABI = [
    "function createPayment(bytes32 paymentId, address merchant, address token, uint256 amount, bytes32 metadata) returns (bool)",
    "function executePayment(bytes32 paymentId, address payer) returns (bool)",
    "function getPayment(bytes32 paymentId) view returns (address merchant, address token, uint256 amount, bool executed, bytes32 metadata)",
    "function canExecutePayment(bytes32 paymentId, address payer) view returns (bool canExecute, string reason)"
];

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function balanceOf(address owner) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function transfer(address to, uint256 amount) returns (bool)",
];

export class NextJSPaymentGateway {
    gatewayAddress: string | undefined;
    rpcUrl: string | undefined;
    provider: ethers.JsonRpcProvider;

    constructor() {
        this.gatewayAddress = process.env.NEXT_PUBLIC_GATEWAY_CONTRACT;
        this.rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
        this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
    }

    // Crear pago pendiente (API route)
    async createPayment(merchantAddress: string, tokenAddress: string, amount: string, metadata: any) {
        const paymentId = ethers.keccak256(
            ethers.toUtf8Bytes(
                `${merchantAddress}-${tokenAddress}-${amount}-${Date.now()}-${Math.random()}`
            )
        );

        const payment = {
            paymentId,
            merchant: merchantAddress,
            token: tokenAddress,
            amount: amount,
            metadata,
            status: 'pending',
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min
        };

        return payment;
    }

    // Ejecutar pago con multicall (cliente)
    async executePayment(paymentDetails: {
        payerAddress: string;
        paymentId: string;
        merchant: string;
        token: string;
        amount: string;
        metadata: string;
    }) {

        const gatewayInterface = new ethers.Interface(PAYMENT_GATEWAY_ABI);
        const erc20Interface = new ethers.Interface(ERC20_ABI);

        const signer = new ethers.JsonRpcSigner(this.provider, paymentDetails.payerAddress);

        const payerAddress = await paymentDetails.payerAddress;
        const metadataHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(paymentDetails.metadata)));

        // Verificar allowance
        const token = new ethers.Contract(paymentDetails.token, ERC20_ABI, signer);
        const allowance = 0;// await token.allowance(payerAddress, this.gatewayAddress);

        const calls = [];

        // 1. Aprobar si es necesario

        calls.push({
            target: paymentDetails.token,
            allowFailure: false,
            callData: erc20Interface.encodeFunctionData("transfer", [
                paymentDetails.merchant,
                paymentDetails.amount
            ])
        });

        /*
                if (allowance < BigInt(paymentDetails.amount)) {
                    calls.push({
                        target: paymentDetails.token,
                        allowFailure: false,
                        callData: erc20Interface.encodeFunctionData("approve", [
                            this.gatewayAddress,
                            paymentDetails.amount
                        ])
                    });
                }
                    */

        // 2. Ejecutar pago
        calls.push({
            target: this.gatewayAddress,
            allowFailure: false,
            callData: gatewayInterface.encodeFunctionData("executePayment", [
                paymentDetails.paymentId,
                payerAddress
            ])
        });

        const data = encodeFunctionData({
            abi: MULTICALL3_ABI,
            functionName: 'aggregate3',
            args: [calls],
        });

        // Crear transacción de contrato inteligente
        const tx: TransactionSerializable = {
            to: MULTICALL3_ADDRESS,
            data: data,
            chainId: avalancheFuji.id,
            type: 'legacy',
        };

        // Serializar transacción
        const serialized = serialize(tx);



        //const tx = await multicall.aggregate3(calls);
        return serialized;
    }

    // Verificar información del token
    async getTokenInfo(tokenAddress: string) {
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);

        try {
            const [symbol, decimals] = await Promise.all([
                token.symbol(),
                token.decimals()
            ]);

            return { symbol, decimals: Number(decimals) };
        } catch (error) {
            throw new Error('Token inválido');
        }
    }

    // Verificar balance del usuario
    async checkUserBalance(userAddress: string, tokenAddress: string, amount: string) {
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
        const balance = await token.balanceOf(userAddress);

        return {
            hasBalance: balance >= BigInt(amount),
            balance: balance.toString(),
            required: amount.toString()
        };
    }
}
