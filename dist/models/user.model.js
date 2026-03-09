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
exports.UserModel = void 0;
exports.generateReferralCode = generateReferralCode;
const db_1 = __importDefault(require("../config/db"));
const crypto_1 = __importDefault(require("crypto"));
/** Generate a unique referral code like AQ1X3K7P */
function generateReferralCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
    let code = 'AQ';
    for (let i = 0; i < 6; i++) {
        code += chars[crypto_1.default.randomInt(chars.length)];
    }
    return code;
}
exports.UserModel = {
    create(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const referralCode = user.referral_code || generateReferralCode();
            const [result] = yield db_1.default.query(`INSERT INTO users (role, full_name, email, phone, password_hash, referral_code, referred_by) VALUES (?, ?, ?, ?, ?, ?, ?)`, [user.role, user.full_name, user.email, user.phone, user.password_hash, referralCode, user.referred_by || null]);
            return result.insertId;
        });
    },
    findByEmail(email) {
        return __awaiter(this, void 0, void 0, function* () {
            const [rows] = yield db_1.default.query('SELECT * FROM users WHERE email = ?', [email]);
            return rows[0] || null;
        });
    },
    findById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const [rows] = yield db_1.default.query('SELECT * FROM users WHERE id = ?', [id]);
            return rows[0] || null;
        });
    },
    update(id, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const fields = Object.keys(data).map((key) => `${key} = ?`).join(', ');
            const values = Object.values(data);
            yield db_1.default.query(`UPDATE users SET ${fields} WHERE id = ?`, [...values, id]);
        });
    },
    // Auth Session Methods
    createSession(userId, refreshToken, userAgent, ip, expiresAt) {
        return __awaiter(this, void 0, void 0, function* () {
            yield db_1.default.query(`INSERT INTO auth_sessions (user_id, refresh_token, user_agent, ip_address, expires_at) VALUES (?, ?, ?, ?, ?)`, [userId, refreshToken, userAgent, ip, expiresAt]);
        });
    },
    findSessionByToken(refreshToken) {
        return __awaiter(this, void 0, void 0, function* () {
            const [rows] = yield db_1.default.query('SELECT * FROM auth_sessions WHERE refresh_token = ? AND revoked_at IS NULL AND expires_at > NOW()', [refreshToken]);
            return rows[0] || null;
        });
    },
    revokeSession(refreshToken) {
        return __awaiter(this, void 0, void 0, function* () {
            yield db_1.default.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE refresh_token = ?', [refreshToken]);
        });
    },
    revokeAllUserSessions(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield db_1.default.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = ?', [userId]);
        });
    },
    findByPhone(phone) {
        return __awaiter(this, void 0, void 0, function* () {
            const [rows] = yield db_1.default.query('SELECT * FROM users WHERE phone = ? AND is_active = 1', [phone]);
            return rows[0] || null;
        });
    },
    setResetToken(userId, hashedToken, expires) {
        return __awaiter(this, void 0, void 0, function* () {
            yield db_1.default.query('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?', [hashedToken, expires, userId]);
        });
    },
    findByResetToken(hashedToken) {
        return __awaiter(this, void 0, void 0, function* () {
            const [rows] = yield db_1.default.query('SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > NOW()', [hashedToken]);
            return rows[0] || null;
        });
    },
    clearResetToken(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield db_1.default.query('UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE id = ?', [userId]);
        });
    },
};
