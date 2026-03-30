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
exports.BookingModel = void 0;
const db_1 = __importDefault(require("../config/db"));
const constants_1 = require("../config/constants");
exports.BookingModel = {
    create(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const [result] = yield db_1.default.query(`INSERT INTO bookings (user_id, service_id, address_id, scheduled_date, scheduled_time, status, price, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                data.user_id, data.service_id, data.address_id || null, data.scheduled_date, data.scheduled_time,
                data.status || constants_1.BOOKING_STATUS.PENDING, data.price, data.notes || null
            ]);
            return result.insertId;
        });
    },
    findByUser(userId_1) {
        return __awaiter(this, arguments, void 0, function* (userId, limit = 20, offset = 0, statusList) {
            let where = 'WHERE b.user_id = ?';
            const values = [userId];
            if (statusList && statusList.length > 0) {
                where += ` AND b.status IN (${statusList.map(() => '?').join(',')})`;
                values.push(...statusList);
            }
            const [countRows] = yield db_1.default.query(`SELECT COUNT(*) as total FROM bookings b ${where}`, values);
            const total = countRows[0].total;
            const query = `
      SELECT b.id, b.user_id, b.service_id,
             b.technician_id,
             b.address_id, b.scheduled_date, b.scheduled_time,
             ADDTIME(b.scheduled_time, SEC_TO_TIME(COALESCE(s.duration_minutes, 60) * 60)) AS time_slot_end,
             b.status, b.price, b.notes, b.assigned_at, b.completed_at, b.created_at, b.updated_at,
             s.name as service_name, s.image_url as service_image, s.category as service_category, s.duration_minutes,
             a.line1 as address_line1, a.city as address_city, a.state as address_state, a.postal_code as address_postal_code,
             t.full_name as technician_name,
             t.phone as technician_phone
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      LEFT JOIN addresses a ON b.address_id = a.id
      LEFT JOIN users t ON b.technician_id = t.id
      ${where}
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `;
            const queryValues = [...values, limit, offset];
            const [rows] = yield db_1.default.query(query, queryValues);
            return { bookings: rows, total };
        });
    },
    findById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const [rows] = yield db_1.default.query(`SELECT b.id, b.user_id, b.service_id,
                    b.technician_id,
                    b.address_id, b.scheduled_date, b.scheduled_time,
                    ADDTIME(b.scheduled_time, SEC_TO_TIME(COALESCE(s.duration_minutes, 60) * 60)) AS time_slot_end,
                    b.status, b.price, b.notes, b.assigned_at, b.completed_at, b.created_at, b.updated_at,
                    s.name as service_name, s.duration_minutes, s.image_url as service_image, s.category as service_category,
                    a.line1 as address_line1, a.city as address_city, a.state as address_state, a.postal_code as address_postal_code,
                    t.full_name as technician_name,
                    t.phone as technician_phone
         FROM bookings b
         JOIN services s ON b.service_id = s.id
         LEFT JOIN addresses a ON b.address_id = a.id
         LEFT JOIN users t ON b.technician_id = t.id
         WHERE b.id = ?`, [id]);
            return rows[0] || null;
        });
    },
    updateStatus(id, status) {
        return __awaiter(this, void 0, void 0, function* () {
            yield db_1.default.query('UPDATE bookings SET status = ? WHERE id = ?', [status, id]);
        });
    }
};
