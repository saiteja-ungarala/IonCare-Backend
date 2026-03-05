"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletModel = void 0;
const db_1 = __importDefault(require("../config/db"));
exports.WalletModel = {
    getBalance(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const [rows] = yield db_1.default.query('SELECT balance FROM wallets WHERE user_id = ?', [userId]);
            return rows.length > 0 ? Number(rows[0].balance) : 0.00;
        });
    },
    createWallet(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield db_1.default.query('INSERT IGNORE INTO wallets (user_id, balance) VALUES (?, 0.00)', [userId]);
        });
    },
    addTransaction(userId, txn) {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = yield db_1.default.getConnection();
            try {
                yield connection.beginTransaction();
                yield connection.query(`INSERT INTO wallet_transactions (user_id, txn_type, source, reference_type, reference_id, amount, description) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`, [userId, txn.txn_type, txn.source, txn.reference_type, txn.reference_id || null, txn.amount, txn.description || null]);
                const balanceChange = txn.txn_type === 'credit' ? txn.amount : -txn.amount;
                yield connection.query(`INSERT INTO wallets (user_id, balance) VALUES (?, ?) ON DUPLICATE KEY UPDATE balance = balance + ?`, [userId, balanceChange, balanceChange]);
                yield connection.commit();
            }
            catch (error) {
                yield connection.rollback();
                throw error;
            }
            finally {
                connection.release();
            }
        });
    },
    getTransactions(userId_1) {
        return __awaiter(this, arguments, void 0, function* (userId, limit = 20, offset = 0) {
            const [rows] = yield db_1.default.query('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', [userId, limit, offset]);
            return rows;
        });
    },
    creditWithIdempotency(userId_1, _a) {
        return __awaiter(this, arguments, void 0, function* (userId, { amount, txn_type, source, idempotency_key, }) {
            const connection = yield db_1.default.getConnection();
            try {
                yield connection.beginTransaction();
                const [insertResult] = yield connection.query(`INSERT IGNORE INTO wallet_transactions
                (user_id, txn_type, source, reference_type, amount, description, idempotency_key)
                VALUES (?, ?, ?, ?, ?, ?, ?)`, [userId, txn_type, source, 'wallet', amount, 'Idempotent wallet transaction', idempotency_key]);
                if (insertResult.affectedRows > 0) {
                    const balanceChange = txn_type === 'credit' ? amount : -amount;
                    yield connection.query('UPDATE wallets SET balance = balance + ? WHERE user_id = ?', [balanceChange, userId]);
                }
                yield connection.commit();
            }
            catch (error) {
                yield connection.rollback();
                throw error;
            }
            finally {
                connection.release();
            }
        });
    }
};
