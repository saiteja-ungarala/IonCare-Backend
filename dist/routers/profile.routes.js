"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const validate_middleware_1 = require("../middlewares/validate.middleware");
const address_dto_1 = require("../dto/address.dto");
const ProfileController = __importStar(require("../controllers/profile.controller"));
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate); // Protect all routes
router.get('/profile', ProfileController.getProfile);
router.patch('/profile', ProfileController.updateProfile);
router.post('/push-token', (0, validate_middleware_1.validate)(address_dto_1.PushTokenSchema), ProfileController.registerPushToken);
router.get('/addresses', ProfileController.getAddresses);
router.post('/addresses', (0, validate_middleware_1.validate)(address_dto_1.AddressSchema), ProfileController.addAddress);
router.patch('/addresses/:id/default', ProfileController.setAddressDefault);
router.patch('/addresses/:id', (0, validate_middleware_1.validate)(address_dto_1.UpdateAddressSchema), ProfileController.updateAddress);
router.delete('/addresses/:id', ProfileController.deleteAddress);
exports.default = router;
