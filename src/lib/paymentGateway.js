// lib/paymentGateway.js
import { ethers } from 'ethers';

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
    "function decimals() view returns (uint8)"
];

export class NextJSPaymentGateway {
    constructor() {
        this.gatewayAddress = process.env.NEXT_PUBLIC_GATEWAY_CONTRACT;
        this.rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
        this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
    }

    // Crear pago pendiente (API route)
    async createPayment(merchantAddress, tokenAddress, amount, metadata) {
        const paymentId = ethers.keccak256(
            ethers.toUtf8Bytes(
                `${merchantAddress}-${tokenAddress}-${amount}-${Date.now()}-${Math.random()}`
            )
        );

        const payment = {
            paymentId,
            merchant: merchantAddress,
            token: tokenAddress,
            amount: amount.toString(),
            metadata,
            status: 'pending',
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min
        };

        return payment;
    }

    // Ejecutar pago con multicall (cliente)
    async executePayment(signer, paymentDetails) {
        const multicall = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, signer);
        const gatewayInterface = new ethers.Interface(PAYMENT_GATEWAY_ABI);
        const erc20Interface = new ethers.Interface(ERC20_ABI);

        const payerAddress = await signer.getAddress();
        const metadataHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(paymentDetails.metadata)));

        // Verificar allowance
        const token = new ethers.Contract(paymentDetails.token, ERC20_ABI, signer);
        const allowance = await token.allowance(payerAddress, this.gatewayAddress);

        const calls = [
            // 1. Crear pago en contrato
            {
                target: this.gatewayAddress,
                allowFailure: false,
                callData: gatewayInterface.encodeFunctionData("createPayment", [
                    paymentDetails.paymentId,
                    paymentDetails.merchant,
                    paymentDetails.token,
                    paymentDetails.amount,
                    metadataHash
                ])
            }
        ];

        // 2. Aprobar si es necesario
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

        // 3. Ejecutar pago
        calls.push({
            target: this.gatewayAddress,
            allowFailure: false,
            callData: gatewayInterface.encodeFunctionData("executePayment", [
                paymentDetails.paymentId,
                payerAddress
            ])
        });

        const tx = await multicall.aggregate3(calls);
        return tx;
    }

    // Verificar información del token
    async getTokenInfo(tokenAddress) {
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
    async checkUserBalance(userAddress, tokenAddress, amount) {
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
        const balance = await token.balanceOf(userAddress);

        return {
            hasBalance: balance >= BigInt(amount),
            balance: balance.toString(),
            required: amount.toString()
        };
    }
}
