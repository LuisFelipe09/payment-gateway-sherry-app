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

    constructor() {}

    /**
     * Crear un nuevo pago
     */
    function createPayment(
        bytes32 paymentId,
        address merchant,
        address token,
        uint256 amount,
        bytes32 metadata
    ) external returns (bool) {
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

        require(payment.merchant != address(0), "Payment not found");
        require(!payment.executed, "Payment already executed");
        require(!payment.cancelled, "Payment cancelled");
        require(payer != address(0), "Invalid payer");

        IERC20 token = IERC20(payment.token);

        // Verificar balance y allowance
        require(
            token.balanceOf(payer) >= payment.amount,
            "Insufficient balance"
        );
        require(
            token.allowance(payer, address(this)) >= payment.amount,
            "Insufficient allowance"
        );

        // Calcular fee
        uint256 fee = (payment.amount * feePercentage) / 10000;
        uint256 merchantAmount = payment.amount - fee;

        // Transferir tokens
        require(
            token.transferFrom(payer, payment.merchant, merchantAmount),
            "Transfer to merchant failed"
        );

        if (fee > 0) {
            require(
                token.transferFrom(payer, owner(), fee),
                "Fee transfer failed"
            );
        }

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
