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
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPushToken = exports.setAddressDefault = exports.deleteAddress = exports.updateAddress = exports.addAddress = exports.getAddresses = exports.updateProfile = exports.getProfile = void 0;
const profile_service_1 = require("../services/profile.service");
const push_token_model_1 = require("../models/push-token.model");
const response_1 = require("../utils/response");
const getProfile = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const result = yield profile_service_1.ProfileService.getProfile(userId);
        return (0, response_1.successResponse)(res, result);
    }
    catch (error) {
        next(error);
    }
});
exports.getProfile = getProfile;
const updateProfile = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const result = yield profile_service_1.ProfileService.updateProfile(userId, req.body);
        return (0, response_1.successResponse)(res, result, 'Profile updated');
    }
    catch (error) {
        next(error);
    }
});
exports.updateProfile = updateProfile;
const getAddresses = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const result = yield profile_service_1.ProfileService.getAddresses(userId);
        return (0, response_1.successResponse)(res, result);
    }
    catch (error) {
        next(error);
    }
});
exports.getAddresses = getAddresses;
const addAddress = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const result = yield profile_service_1.ProfileService.addAddress(userId, req.body);
        return (0, response_1.successResponse)(res, result, 'Address added', 201);
    }
    catch (error) {
        next(error);
    }
});
exports.addAddress = addAddress;
const updateAddress = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const addressId = Number(req.params.id);
        const result = yield profile_service_1.ProfileService.updateAddress(userId, addressId, req.body);
        return (0, response_1.successResponse)(res, result, 'Address updated');
    }
    catch (error) {
        next(error);
    }
});
exports.updateAddress = updateAddress;
const deleteAddress = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const addressId = Number(req.params.id);
        yield profile_service_1.ProfileService.deleteAddress(userId, addressId);
        return (0, response_1.successResponse)(res, null, 'Address deleted');
    }
    catch (error) {
        next(error);
    }
});
exports.deleteAddress = deleteAddress;
const setAddressDefault = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const addressId = Number(req.params.id);
        const result = yield profile_service_1.ProfileService.setAddressDefault(userId, addressId);
        return (0, response_1.successResponse)(res, result, 'Default address updated');
    }
    catch (error) {
        next(error);
    }
});
exports.setAddressDefault = setAddressDefault;
const registerPushToken = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { token, platform } = req.body;
        yield push_token_model_1.PushTokenModel.upsert(userId, token, platform);
        return (0, response_1.successResponse)(res, { success: true });
    }
    catch (error) {
        next(error);
    }
});
exports.registerPushToken = registerPushToken;
