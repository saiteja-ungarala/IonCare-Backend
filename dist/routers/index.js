"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_routes_1 = __importDefault(require("./auth.routes"));
const catalog_routes_1 = __importDefault(require("./catalog.routes"));
const cart_routes_1 = __importDefault(require("./cart.routes"));
const bookings_routes_1 = __importDefault(require("./bookings.routes"));
const orders_routes_1 = __importDefault(require("./orders.routes"));
const wallet_routes_1 = __importDefault(require("./wallet.routes"));
const profile_routes_1 = __importDefault(require("./profile.routes"));
const store_routes_1 = __importDefault(require("./store.routes"));
const agent_routes_1 = __importDefault(require("./agent.routes"));
const dealer_routes_1 = __importDefault(require("./dealer.routes"));
const payment_routes_1 = __importDefault(require("./payment.routes"));
const admin_routes_1 = __importDefault(require("./admin.routes"));
const banners_routes_1 = __importDefault(require("./banners.routes"));
const utils_routes_1 = __importDefault(require("./utils.routes"));
const router = (0, express_1.Router)();
router.use('/auth', auth_routes_1.default);
router.use('/', catalog_routes_1.default); // legacy customer catalog: /services and lightweight /products
router.use('/cart', cart_routes_1.default);
router.use('/bookings', bookings_routes_1.default);
router.use('/orders', orders_routes_1.default);
router.use('/wallet', wallet_routes_1.default);
router.use('/user', profile_routes_1.default);
router.use('/store', store_routes_1.default); // store commerce domain: categories + advanced product listing/detail
router.use('/agent', agent_routes_1.default);
router.use('/dealer', dealer_routes_1.default);
router.use('/payments', payment_routes_1.default);
router.use('/admin', admin_routes_1.default);
router.use('/banners', banners_routes_1.default);
router.use('/utils', utils_routes_1.default);
exports.default = router;
